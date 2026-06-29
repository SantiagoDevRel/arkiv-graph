"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";
import type { DeleteEntityParams, ExtendEntityParams } from "arkiv-graph/react";
import type { Graph, TablesModel } from "arkiv-graph";
import {
  configureWalletChain,
  connectWallet,
  createPostWithWallet,
  deleteEntityWithWallet,
  extendEntityWithWallet,
  getConnectedAccount,
  hasWallet,
  onAccountsChanged,
  type PublicChainConfig,
} from "@/lib/wallet-client";
import { SettingsMockup } from "./settings-mockup";

interface GraphResponse {
  mode: "demo" | "wallet";
  address: string;
  blockTiming: { currentBlock: number; currentBlockTime: number; blockDuration: number } | null;
  graph: Graph;
  tables: TablesModel;
  truncated?: boolean;
  loaded?: number;
}

const HANDLES = ["alice", "bob", "carol", "dave", "erin", "frank"];
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function Showcase({ project, owner, networkName, chain }: { project: string; owner: string; networkName: string; chain: PublicChainConfig }) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const [view, setView] = useState<"graph" | "tables">("graph");
  const [addressInput, setAddressInput] = useState("");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // connected wallet (the visitor's own — signs all writes; no server key)
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [text, setText] = useState("");
  const [handle, setHandle] = useState("alice");
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; node: React.ReactNode } | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mount-only: point client writes at the server's network, restore an
  // already-authorized account, react to account changes. `mounted` also gates
  // any browser-object reads so the first client render matches the SSR HTML.
  useEffect(() => {
    setMounted(true);
    configureWalletChain(chain);
    void getConnectedAccount().then((a) => a && setAccount(a));
    return onAccountsChanged((a) => setAccount(a));
  }, [chain]);

  // a write needs a block to land (~2s) before it shows in a refetch
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshKey((k) => k + 1), 3500);
  }, []);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setToast(null);
    try {
      setAccount(await connectWallet());
    } catch (e) {
      setToast({ kind: "err", node: e instanceof Error ? e.message : String(e) });
    } finally {
      setConnecting(false);
    }
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const qs = mode === "wallet" && activeAddress ? `?address=${activeAddress}` : "";
        const res = await fetch(`/api/graph${qs}`, { cache: "no-store", signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load graph");
        setData(body as GraphResponse);
      } catch (e) {
        if (signal?.aborted || (e as Error)?.name === "AbortError") return; // superseded request — ignore
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mode, activeAddress],
  );

  // abort the in-flight request when inputs change, so a slower earlier response
  // can't overwrite a newer one (stale-graph paint).
  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const submitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const a = addressInput.trim();
    if (!ADDR_RE.test(a)) {
      setError("That doesn't look like a 0x address.");
      return;
    }
    setActiveAddress(a);
  };

  const post = async () => {
    const t = text.trim();
    if (!t) return;
    setPosting(true);
    setToast(null);
    try {
      let acct = account;
      if (!acct) acct = await connectWallet();
      setAccount(acct);
      const { txUrl } = await createPostWithWallet(acct, t, handle, project);
      setText("");
      setToast({
        kind: "ok",
        node: (
          <>
            Posted on-chain from your wallet <b>{shortAddr(acct)}</b>.{" "}
            {txUrl && (
              <a href={txUrl} target="_blank" rel="noreferrer">
                View tx ↗
              </a>
            )}{" "}
            — showing your entities…
          </>
        ),
      });
      // your post is owned by your wallet → view your entities so it appears
      setMode("wallet");
      setActiveAddress(acct);
      setAddressInput(acct);
      scheduleRefresh();
    } catch (e) {
      setToast({ kind: "err", node: e instanceof Error ? e.message : String(e) });
    } finally {
      setPosting(false);
    }
  };

  // entity write actions from the Tables view. The library renders the buttons +
  // date picker; here we sign with the visitor's OWN wallet (viem + MetaMask) and
  // surface any error (e.g. "you're not the owner") back to the panel by throwing.
  const extendEntity = useCallback(
    async ({ entityKey, targetExpiresAt }: ExtendEntityParams) => {
      let acct = account;
      if (!acct) {
        acct = await connectWallet();
        setAccount(acct);
      }
      return extendEntityWithWallet(acct, entityKey, Math.floor(targetExpiresAt));
    },
    [account],
  );

  const deleteEntity = useCallback(
    async ({ entityKey }: DeleteEntityParams) => {
      let acct = account;
      if (!acct) {
        acct = await connectWallet();
        setAccount(acct);
      }
      return deleteEntityWithWallet(acct, entityKey);
    },
    [account],
  );

  const handleMutated = useCallback(() => scheduleRefresh(), [scheduleRefresh]);

  const g = data?.graph;
  const nodeCount = g?.nodes.length ?? 0;
  const edgeCount = g?.edges.length ?? 0;
  const externalCount = g?.nodes.filter((n) => n.kind === "external").length ?? 0;
  // gate browser-object reads behind `mounted` so the first client render matches
  // the server HTML (no hydration mismatch); wallet is treated as absent until then.
  const walletPresent = mounted && hasWallet();

  return (
    <>
      <div className="controls">
        <div className="seg">
          <button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>
            Demo · Arkiv Social
          </button>
          <button className={mode === "wallet" ? "active" : ""} onClick={() => setMode("wallet")}>
            Any wallet
          </button>
        </div>

        <div className="seg">
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
            ◍ Graph
          </button>
          <button className={view === "tables" ? "active" : ""} onClick={() => setView("tables")}>
            ▦ Tables
          </button>
        </div>

        {mode === "wallet" ? (
          <form className="addr-form" onSubmit={submitAddress}>
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Paste a 0x wallet address to graph its Arkiv entities"
              spellCheck={false}
            />
            <button className="btn primary" type="submit">
              View
            </button>
          </form>
        ) : (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Owned by <code className="inline">{owner.slice(0, 6)}…{owner.slice(-4)}</code>
          </span>
        )}

        {account ? (
          <span style={{ color: "var(--muted)", fontSize: 13 }} title="Connected wallet — signs your writes">
            🔑 <code className="inline">{shortAddr(account)}</code>
            {mode === "wallet" && activeAddress?.toLowerCase() !== account && (
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setActiveAddress(account);
                  setAddressInput(account);
                }}
              >
                View mine
              </button>
            )}
          </span>
        ) : (
          <button className="btn primary" onClick={connect} disabled={connecting || !walletPresent} title={walletPresent ? "Connect a wallet to extend / delete / post" : "No injected wallet detected"}>
            {connecting ? "Connecting…" : walletPresent ? "Connect wallet" : "No wallet found"}
          </button>
        )}

        <button className="btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>

        <button className="btn" onClick={() => setShowSettings(true)} title="Dashboard access (preview)">
          ⚙ Settings
        </button>
      </div>

      {showSettings && <SettingsMockup owner={owner} onClose={() => setShowSettings(false)} />}

      <div className="graph-shell">
        {g && g.nodes.length > 0 ? (
          view === "tables" && data?.tables ? (
            <ArkivTables
              model={data.tables}
              graph={g}
              height={600}
              onExtendEntity={extendEntity}
              onDeleteEntity={deleteEntity}
              signerAddress={account ?? undefined}
              onMutated={handleMutated}
            />
          ) : (
            <ArkivGraph data={g} height={600} />
          )
        ) : (
          <div style={{ height: 600, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", textAlign: "center", padding: 20 }}>
            {loading
              ? "Querying Arkiv…"
              : error
                ? error
                : mode === "wallet" && !activeAddress
                  ? "Paste a wallet address above (or connect yours) to see its Arkiv entities as a graph."
                  : mode === "wallet"
                    ? `This wallet currently owns 0 live entities on ${networkName}. Arkiv entities expire by design — they may have lapsed, or live on a different network.`
                    : "No entities found. Has the demo been seeded? (run `pnpm seed`)"}
          </div>
        )}
      </div>

      <div className="statbar">
        <span>
          <b>{nodeCount}</b> nodes
        </span>
        <span>
          <b>{edgeCount}</b> edges
        </span>
        <span>
          <b>{externalCount}</b> external-chain refs
        </span>
        {data?.blockTiming && (
          <span>
            block <b>{data.blockTiming.currentBlock.toLocaleString()}</b>
          </span>
        )}
      </div>

      {data?.truncated && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#ffb020" }}>
          ⚠ Large dataset — showing the first <b>{data.loaded}</b> entities. Narrow it with a type/wallet filter, raise
          the read limit, or use the Tables view (lighter than the force graph at scale).
        </div>
      )}

      <div className="compose">
        <h3>Write to the graph, live</h3>
        <p className="sub">
          Open the <b>Tables</b> view to <b>extend</b> or <b>delete</b> any entity — signed by your own wallet, never a
          server key. Only the entity&apos;s owner can change it. Or post a new <code className="inline">post</code>{" "}
          entity on {networkName} below (created and owned by your connected wallet).
        </p>
        <div className="compose-row">
          <select value={handle} onChange={(e) => setHandle(e.target.value)} aria-label="author">
            {HANDLES.map((h) => (
              <option key={h} value={h}>
                @{h}
              </option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 240))}
            placeholder="Say something… (max 240 chars)"
          />
          <button className="btn primary" onClick={post} disabled={posting || !text.trim() || !walletPresent}>
            {posting ? "Writing…" : account ? "Post on-chain" : "Connect & post"}
          </button>
        </div>
        {toast && <div className={`toast ${toast.kind}`}>{toast.node}</div>}
      </div>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";
import type { Graph, TablesModel } from "arkiv-graph";

interface GraphResponse {
  mode: "demo" | "wallet";
  address: string;
  blockTiming: { currentBlock: number; currentBlockTime: number; blockDuration: number } | null;
  graph: Graph;
  tables: TablesModel;
}

const HANDLES = ["alice", "bob", "carol", "dave", "erin", "frank"];
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function Showcase({ writesEnabled, owner, networkName }: { writesEnabled: boolean; project: string; owner: string; networkName: string }) {
  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const [view, setView] = useState<"graph" | "tables">("graph");
  const [addressInput, setAddressInput] = useState("");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [text, setText] = useState("");
  const [handle, setHandle] = useState("alice");
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; node: React.ReactNode } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = mode === "wallet" && activeAddress ? `?address=${activeAddress}` : "";
      const res = await fetch(`/api/graph${qs}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load graph");
      setData(body as GraphResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, activeAddress]);

  useEffect(() => {
    void load();
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
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, handle }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Write failed");
      setText("");
      setToast({
        kind: "ok",
        node: (
          <>
            Posted on-chain as <b>@{handle}</b>.{" "}
            {body.explorerUrl && (
              <a href={body.explorerUrl} target="_blank" rel="noreferrer">
                View tx ↗
              </a>
            )}{" "}
            — refreshing the graph…
          </>
        ),
      });
      // entity needs a block to land (~2s); refetch shortly after
      setTimeout(() => setRefreshKey((k) => k + 1), 3500);
    } catch (e) {
      setToast({ kind: "err", node: (e as Error).message });
    } finally {
      setPosting(false);
    }
  };

  const g = data?.graph;
  const nodeCount = g?.nodes.length ?? 0;
  const edgeCount = g?.edges.length ?? 0;
  const externalCount = g?.nodes.filter((n) => n.kind === "external").length ?? 0;

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

        <button className="btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      <div className="graph-shell">
        {g && g.nodes.length > 0 ? (
          view === "tables" && data?.tables ? (
            <ArkivTables model={data.tables} graph={g} height={600} />
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
                  ? "Paste a wallet address above to see its Arkiv entities as a graph."
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

      {mode === "demo" && writesEnabled && (
        <div className="compose">
          <h3>Write to the graph, live</h3>
          <p className="sub">
            This creates a real <code className="inline">post</code> entity on {networkName} signed by the demo wallet,
            then the new node appears in the graph. Pick which user it&apos;s from.
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
            <button className="btn primary" onClick={post} disabled={posting || !text.trim()}>
              {posting ? "Writing…" : "Post on-chain"}
            </button>
          </div>
          {toast && <div className={`toast ${toast.kind}`}>{toast.node}</div>}
        </div>
      )}
    </>
  );
}

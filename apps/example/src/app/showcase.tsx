"use client";
import { useCallback, useEffect, useState } from "react";
import { ArkivGraph, ArkivTables, type ExtendEntityParams } from "arkiv-graph/react";
import type { Graph, TablesModel } from "arkiv-graph";
import { connectWallet, createSocialSampleWithWallet, extendEntityWithWallet, getConnectedAccount, hasWallet, onAccountsChanged, walletErrorMessage } from "@/lib/wallet-client";
import { DEMO_OWNER, PROJECT, PUBLIC_CHAIN, TYPE_ATTRIBUTE } from "@/lib/config";
import { SAMPLE_COUNT, SAMPLE_DAYS } from "@/lib/social-sample";

interface GraphResponse { address: string; project: string; graph: Graph; tables: TablesModel; loaded: number; truncated: boolean; blockTiming: { currentBlock: number } | null }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const INITIAL = { address: DEMO_OWNER, project: PROJECT, projectKey: "project", typeKey: TYPE_ATTRIBUTE };
export function Showcase() {
  const [scope, setScope] = useState(INITIAL);
  const [form, setForm] = useState(INITIAL);
  const [account, setAccount] = useState<string | null>(null);
  const [walletPresent, setWalletPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"tables" | "graph">("tables");
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [txUrl, setTxUrl] = useState("");
  const [revision, setRevision] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const showWallet = useCallback((address: string) => {
    const next = { ...INITIAL, address };
    setScope(next); setForm(next); setData(null); setShowCreate(false);
  }, []);
  useEffect(() => {
    setWalletPresent(hasWallet());
    void getConnectedAccount().then(setAccount);
    return onAccountsChanged(a => { setAccount(a); setShowCreate(false); });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    void fetch(`/api/graph?${new URLSearchParams(scope)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, revision]);
  const connect = async () => {
    setBusy(true); setNotice(""); setNoticeError(false);
    try { const a = await connectWallet(); setAccount(a); }
    catch (e) { setNotice(walletErrorMessage(e)); setNoticeError(true); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (creating) return;
    setCreating(true); setNotice(""); setNoticeError(false); setTxUrl("");
    try {
      const a = account ?? await connectWallet();
      setAccount(a);
      const result = await createSocialSampleWithWallet(a);
      setNotice(result.alreadyCreated ? "The sample already exists. Its entities have been loaded." : "Sample created and confirmed on Tiramisu.");
      setTxUrl(result.txUrl ?? ""); setShowCreate(false); showWallet(a); setRevision(v => v + 1);
    } catch (e) { setNotice(walletErrorMessage(e)); setNoticeError(true); }
    finally { setCreating(false); }
  };
  const extend = async ({ entityKey, targetExpiresAt }: ExtendEntityParams) => {
    if (!account) throw new Error("Connect the owner's wallet before extending this entity.");
    setNotice(""); setNoticeError(false); setTxUrl("");
    try {
      const result = await extendEntityWithWallet(account, entityKey, Math.floor(targetExpiresAt));
      setNotice("Lifetime Extension confirmed. The table is fetching the updated expiration.");
      setTxUrl(result.txUrl ?? "");
      return result;
    } catch (error) {
      const message = walletErrorMessage(error);
      throw Object.assign(new Error(message), { txUrl: (error as { txUrl?: string })?.txUrl });
    }
  };
  const canManageScope = !!account && scope.address.toLowerCase() === account.toLowerCase();
  const isOwnSample = canManageScope && scope.project === PROJECT && scope.projectKey === "project";
  const isPublicExample = scope.address.toLowerCase() === DEMO_OWNER.toLowerCase() && scope.project === PROJECT && scope.projectKey === "project" && scope.typeKey === TYPE_ATTRIBUTE;
  return <>
    <header className="site-header">
      <a className="brand" href="/">[ ARKIV ] <span>GRAPH</span></a>
      <span className="network-badge">Tiramisu testnet</span>
      <div className="wallet-control">
        {account ? <button className="btn" onClick={() => showWallet(account)} disabled={creating}>View my app · {short(account)}</button> :
          <button className="btn primary" onClick={connect} disabled={busy || !walletPresent}>{busy ? "Connecting…" : "Connect wallet"}</button>}
      </div>
    </header>
    <section className="intro"><h1>Your app, in tables and a graph.</h1><p>Query your entities and their relationships. Extend their lifetime with your wallet.</p></section>
    {isPublicExample && <p className="help">Public social example. Explore without a wallet; connect yours to view or create your own app.</p>}
    <form className="dashboard-controls" aria-label="Select app" onSubmit={e => { e.preventDefault(); setScope({ ...form, address: form.address.trim(), project: form.project.trim() }); }}>
      <div className="toolbar">
        <label className="app-field">APP<input aria-label="App" maxLength={128} value={form.project} onChange={e => setForm({ ...form, project: e.target.value })} placeholder="All your apps" /></label>
        <button className="btn" type="submit" disabled={creating}>Load</button>
        <div className="seg" aria-label="View"><button type="button" aria-pressed={view === "tables"} className={view === "tables" ? "active" : ""} onClick={() => setView("tables")}>Table</button><button type="button" aria-pressed={view === "graph"} className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Graph</button></div>
        <button type="button" className="text-button advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>Advanced {advanced ? "−" : "+"}</button>
        <button type="button" className="btn" disabled={loading || creating} onClick={() => setRevision(v => v + 1)}>Refresh</button>
      </div>
      {advanced && <div className="advanced-fields">
        <label className="owner-field">Owner wallet<input required pattern="0x[a-fA-F0-9]{40}" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} spellCheck={false} /></label>
        <label>App attribute<input required pattern="[A-Za-z][A-Za-z0-9_]{0,31}" value={form.projectKey} onChange={e => setForm({ ...form, projectKey: e.target.value })} /></label>
        <label>Type attribute<input required pattern="[A-Za-z][A-Za-z0-9_]{0,31}" value={form.typeKey} onChange={e => setForm({ ...form, typeKey: e.target.value })} /></label>
        <p className="help">Change the owner or attributes, then select Load. Leave the app value empty to show all entities owned by that wallet. Entity-key references are detected; other relationships need link rules in your integration.</p>
      </div>}
    </form>
    <div className="viewbar">
      <div><p className="entity-count">{data ? `${data.loaded} entities · ${data.graph.edges.length} relationships` : loading ? "Querying Tiramisu…" : "Query unavailable"}</p><p className="help scope-summary" title={scope.address}>Owner {short(scope.address)} · {scope.projectKey} = {scope.project || "any value"}</p></div>
      <div className="toolbar">
        {!isPublicExample && <button className="btn" onClick={() => showWallet(DEMO_OWNER)} disabled={creating}>View public example</button>}
        <button className="btn" onClick={() => setShowCreate(v => !v)} disabled={creating}>Create social sample</button>
      </div>
    </div>
    {showCreate && <section className="sample-confirm" aria-label="Confirm sample creation">
      <h3>A social app owned by your wallet</h3>
      <p>You will create {SAMPLE_COUNT} public sample entities: fictional profiles, posts, comments, follows and likes. Their initial lifetime is {SAMPLE_DAYS} days. Your wallet will show the transaction and its cost in test GLM.</p>
      <p className="help">App: <code>{PROJECT}</code> · Owner: <code>{account ?? "your connected wallet"}</code></p>
      <button className="btn primary" onClick={create} disabled={creating || !walletPresent}>{creating ? "Waiting for signature and confirmation…" : "Create and sign with your wallet"}</button>
      <button className="btn" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
    </section>}
    {notice && <div className="notice" role={noticeError ? "alert" : "status"}>{notice} {txUrl && <a href={txUrl} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>}
    <section className="graph-shell" aria-label="App entities" aria-busy={loading}>
      {loading ? <div className="empty-state" role="status">Querying your app's entities…</div> : error ?
        <div className="empty-state" role="alert"><p>{error}</p><button className="btn" onClick={() => setRevision(v => v + 1)}>Retry</button></div> : data?.loaded ?
        view === "tables" ? <ArkivTables model={data.tables} graph={data.graph} height={600} signerAddress={account ?? undefined} onExtendEntity={canManageScope ? extend : undefined} onMutated={() => setRevision(v => v + 1)} /> : <ArkivGraph data={data.graph} height={600} /> :
        <div className="empty-state"><h3>{isOwnSample ? "Create your first sample" : "This app has no active entities"}</h3><p>{isPublicExample ? "The public example has no active entities. Its entities may have expired. You can create your own sample with your wallet." : "No entities match this wallet and these attributes. View the public example, or create your own sample with your wallet."}</p><button className="btn primary" onClick={() => setShowCreate(true)}>Prepare social sample</button></div>}
    </section>
    {data?.truncated && <p className="notice">Partial results: {data.loaded} entities loaded. Filter by app to narrow the query.</p>}
    {!walletPresent && <p className="help">To create or extend entities, open this app with a compatible wallet. You can query without connecting a wallet.</p>}
    <p className="help">Queries return public data. Connect your wallet to sign Lifetime Extension for entities you own. Expiration dates are estimated from block timing.</p>
    <a className="text-button" href={`${PUBLIC_CHAIN.explorerUrl}/data?q=${encodeURIComponent(scope.address)}`} target="_blank" rel="noreferrer">View in Block Explorer ↗</a>
  </>;
}

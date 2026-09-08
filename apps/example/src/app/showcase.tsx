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
    setScope(next); setForm(next); setData(null);
  }, []);
  useEffect(() => {
    setWalletPresent(hasWallet());
    void getConnectedAccount().then(a => { setAccount(a); if (a) showWallet(a); });
    return onAccountsChanged(a => { setAccount(a); setShowCreate(false); if (a) showWallet(a); });
  }, [showWallet]);
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
    try { const a = await connectWallet(); setAccount(a); showWallet(a); }
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
      setNotice(result.alreadyCreated ? "La sample ya existe. Cargamos sus entidades." : "Sample creada y confirmada en Tiramisu.");
      setTxUrl(result.txUrl ?? ""); setShowCreate(false); showWallet(a); setRevision(v => v + 1);
    } catch (e) { setNotice(walletErrorMessage(e)); setNoticeError(true); }
    finally { setCreating(false); }
  };
  const extend = async ({ entityKey, targetExpiresAt }: ExtendEntityParams) => {
    if (!account) throw new Error("Conecta la wallet propietaria antes de extender esta entidad.");
    setNotice(""); setNoticeError(false); setTxUrl("");
    try {
      const result = await extendEntityWithWallet(account, entityKey, Math.floor(targetExpiresAt));
      setNotice("Lifetime Extension confirmada. La tabla consulta la nueva expiración.");
      setTxUrl(result.txUrl ?? "");
      return result;
    } catch (error) {
      const message = walletErrorMessage(error);
      throw Object.assign(new Error(message), { txUrl: (error as { txUrl?: string })?.txUrl });
    }
  };
  const isOwnSample = account && scope.address.toLowerCase() === account && scope.project === PROJECT && scope.projectKey === "project";
  return <>
    <header className="site-header">
      <a className="brand" href="/">[ ARKIV ] <span>GRAPH</span></a>
      <span className="network-badge">Tiramisu testnet</span>
      <div className="wallet-control">
        {account ? <button className="btn" onClick={() => showWallet(account)}>Mi sample · {short(account)}</button> :
          <button className="btn primary" onClick={connect} disabled={busy || !walletPresent}>{busy ? "Conectando…" : "Conectar wallet"}</button>}
      </div>
    </header>
    <section className="intro"><h1>Tu app, en tabla y grafo.</h1><p>Consulta tus entidades y sus relaciones. Extiende su vida firmando con tu wallet.</p></section>
    <form className="dashboard-controls" aria-label="Seleccionar app" onSubmit={e => { e.preventDefault(); setScope({ ...form, address: form.address.trim(), project: form.project.trim() }); }}>
      <div className="toolbar">
        <label className="app-field">APP<input aria-label="App" maxLength={128} value={form.project} onChange={e => setForm({ ...form, project: e.target.value })} placeholder="Todas tus apps" /></label>
        <button className="btn" type="submit" disabled={creating}>Cargar</button>
        <div className="seg" aria-label="Vista"><button type="button" aria-pressed={view === "tables"} className={view === "tables" ? "active" : ""} onClick={() => setView("tables")}>Tabla</button><button type="button" aria-pressed={view === "graph"} className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Grafo</button></div>
        <button type="button" className="text-button advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>Avanzado {advanced ? "−" : "+"}</button>
        <button type="button" className="btn" disabled={loading || creating} onClick={() => setRevision(v => v + 1)}>Actualizar</button>
      </div>
      {advanced && <div className="advanced-fields">
        <label className="owner-field">Wallet propietaria<input required pattern="0x[a-fA-F0-9]{40}" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} spellCheck={false} /></label>
        <label>Atributo de app<input required pattern="[A-Za-z][A-Za-z0-9_]{0,31}" value={form.projectKey} onChange={e => setForm({ ...form, projectKey: e.target.value })} /></label>
        <label>Atributo de tipo<input required pattern="[A-Za-z][A-Za-z0-9_]{0,31}" value={form.typeKey} onChange={e => setForm({ ...form, typeKey: e.target.value })} /></label>
        <p className="help">Cambia el propietario o los atributos y pulsa Cargar. Un valor de app vacío muestra todas las entidades de esa wallet. Las referencias por entity key se detectan; otras relaciones requieren link rules al integrar la librería.</p>
      </div>}
    </form>
    <div className="viewbar">
      <div><p className="entity-count">{data ? `${data.loaded} entidades · ${data.graph.edges.length} relaciones` : loading ? "Consultando Tiramisu…" : "Consulta no disponible"}</p><p className="help scope-summary" title={scope.address}>Propietario {short(scope.address)} · {scope.projectKey} = {scope.project || "cualquier valor"}</p></div>
      <button className="btn" onClick={() => setShowCreate(v => !v)} disabled={creating}>Crear sample social</button>
    </div>
    {showCreate && <section className="sample-confirm" aria-label="Confirmar creación de sample">
      <h3>Una app social en tu wallet</h3>
      <p>Crearás {SAMPLE_COUNT} entidades públicas de ejemplo: perfiles ficticios, publicaciones, comentarios, follows y likes. Su vida inicial es de {SAMPLE_DAYS} días. Tu wallet te mostrará la transacción y su costo en test GLM.</p>
      <p className="help">App: <code>{PROJECT}</code> · Propietario: <code>{account ?? "tu wallet conectada"}</code></p>
      <button className="btn primary" onClick={create} disabled={creating || !walletPresent}>{creating ? "Esperando firma y confirmación…" : "Crear y firmar con tu wallet"}</button>
      <button className="btn" onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</button>
    </section>}
    {notice && <div className="notice" role={noticeError ? "alert" : "status"}>{notice} {txUrl && <a href={txUrl} target="_blank" rel="noreferrer">Ver transacción ↗</a>}</div>}
    <section className="graph-shell" aria-label="Entidades de la app" aria-busy={loading}>
      {loading ? <div className="empty-state" role="status">Consultando las entidades de tu app…</div> : error ?
        <div className="empty-state" role="alert"><p>{error}</p><button className="btn" onClick={() => setRevision(v => v + 1)}>Reintentar</button></div> : data?.loaded ?
        view === "tables" ? <ArkivTables model={data.tables} graph={data.graph} height={600} signerAddress={account ?? undefined} onExtendEntity={account ? extend : undefined} onMutated={() => setRevision(v => v + 1)} /> : <ArkivGraph data={data.graph} height={600} /> :
        <div className="empty-state"><h3>{isOwnSample ? "Crea tu primera sample" : "Esta app no tiene entidades activas"}</h3><p>La consulta no encontró entidades para esta wallet y estos atributos. Si todavía no has creado la sample, conéctate y firma su creación.</p><button className="btn primary" onClick={() => setShowCreate(true)}>Preparar sample social</button></div>}
    </section>
    {data?.truncated && <p className="notice">Vista parcial: se cargaron {data.loaded} entidades. Filtra por app para reducir la consulta.</p>}
    {!walletPresent && <p className="help">Para crear o extender entidades, abre esta app con una wallet compatible. Puedes consultar sin conectar una wallet.</p>}
    <p className="help">Las consultas muestran datos públicos. Conectar la wallet permite firmar Lifetime Extension en las entidades que te pertenecen. La fecha de expiración es una estimación según el tiempo de bloque.</p>
    <a className="text-button" href={`${PUBLIC_CHAIN.explorerUrl}/data?q=${encodeURIComponent(scope.address)}`} target="_blank" rel="noreferrer">Ver en Block Explorer ↗</a>
  </>;
}

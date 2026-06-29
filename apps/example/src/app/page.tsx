import { Showcase } from "./showcase";
import { NETWORK_NAME, PROJECT, PUBLIC_CHAIN, TRUSTED_ADDRESS } from "@/lib/arkiv";

export default function Page() {
  return (
    <main className="wrap">
      <header className="site-header">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-mark" src="/icon.svg" alt="arkiv-graph" width={34} height={34} />
          <span className="brand">
            <span className="bracket">[</span>arkiv-graph<span className="bracket">]</span>
          </span>
        </div>
        <nav className="header-links">
          <a href="https://github.com/SantiagoDevRel/arkiv-graph" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://github.com/SantiagoDevRel/arkiv-graph#readme" target="_blank" rel="noreferrer">
            Docs
          </a>
          <a href="https://docs.arkiv.network" target="_blank" rel="noreferrer">
            Arkiv
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>
          Your Arkiv database, <span className="grad">as a live graph.</span>
        </h1>
        <p>
          <code className="inline">arkiv-graph</code> is a drop-in library that turns your Arkiv entities into an
          interactive graph — nodes are entities, edges are the relationships you define, and references to other chains
          show up as external nodes. Everything below is real: a tiny social app whose users, posts, comments, follows
          and likes live entirely on the <strong>{NETWORK_NAME} testnet</strong>.
        </p>
      </section>

      <Showcase project={PROJECT} owner={TRUSTED_ADDRESS} networkName={NETWORK_NAME} chain={{ ...PUBLIC_CHAIN }} />

      <section className="legend-cols">
        <div className="card">
          <h4>What you're looking at</h4>
          <ul>
            <li>Each dot is an Arkiv entity (a user, post, comment or tip).</li>
            <li>Arrows are relationships — Arkiv has no joins, so the library infers them from attributes you choose.</li>
            <li>Follows &amp; likes are stored as join entities, collapsed into edges.</li>
            <li>Coloured chain dots are references to other chains, drawn without reading them.</li>
          </ul>
        </div>
        <div className="card">
          <h4>It fades as it expires</h4>
          <p>
            Arkiv entities carry a TTL. Nodes dim as their time-to-live runs down — expiry is a feature (cost
            efficiency), not a bug. Click any node to see its payload, owner, TTL and an explorer link.
          </p>
        </div>
        <div className="card">
          <h4>Use it in your app</h4>
          <p>
            <code className="inline">npm i arkiv-graph</code> → <code className="inline">fetchArkivGraph()</code> +{" "}
            <code className="inline">&lt;ArkivGraph /&gt;</code>. Point it at your wallet or your app&apos;s client and
            it draws your data. See the README for the 10-line version.
          </p>
        </div>
      </section>

      <footer className="foot">
        Built by Arkiv DevRel as a dogfooding demo — Arkiv is a queryable database on Ethereum. The signing wallet is a
        throwaway {NETWORK_NAME} testnet burner holding only valueless test gas, and data here expires by design.{" "}
        <code className="inline">arkiv-graph</code> never reads external chains; external nodes come purely from
        references stored in your own entities.
      </footer>
    </main>
  );
}

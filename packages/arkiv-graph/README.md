# arkiv-graph

**Turn your [Arkiv](https://docs.arkiv.network) database into a live, interactive graph.**

Nodes are your entities. Edges are the relationships *you* define (Arkiv has no joins — you declare how records relate). References to other chains show up as **external nodes**, drawn purely from what your entities already store — `arkiv-graph` never reads those chains.

> Live demo: **https://arkiv-graph-example.vercel.app** — a tiny social app stored entirely on the Braga testnet, visualized with this library.

![arkiv-graph](https://raw.githubusercontent.com/SantiagoDevRel/arkiv-graph/main/docs/screenshot.png)

---

## Install

```bash
npm i arkiv-graph
# peer deps for the React component:
npm i react react-dom
# the SDK, only if you use fetchArkivGraph (otherwise optional):
npm i @arkiv-network/sdk
```

## Quick start (the 10-line version)

```tsx
"use client";
import { useEffect, useState } from "react";
import { fetchArkivGraph, type Graph } from "arkiv-graph";
import { ArkivGraph } from "arkiv-graph/react";

export default function MyGraph() {
  const [graph, setGraph] = useState<Graph>();
  useEffect(() => {
    fetchArkivGraph({
      project: "my-app",                          // your `project` attribute
      createdBy: "0xYourWallet",                  // recommended on the shared testnet
      links: [
        { type: "reference", attribute: "authorKey", targetType: "user", label: "by" },
        { type: "join", entityType: "like", sourceAttr: "userKey", targetAttr: "postKey", label: "likes" },
      ],
    }).then((r) => setGraph(r.graph));
  }, []);
  return graph ? <ArkivGraph data={graph} height={600} /> : null;
}
```

That's it: query Arkiv → get a graph → render it. Click any node for its payload, owner, TTL and an explorer link. Filter by type, search, and watch nodes fade as their TTL runs down.

---

## How it works

`arkiv-graph` has two layers:

1. **Core (framework-agnostic, zero UI deps)** — `buildGraph(entities, options)` turns a flat list of Arkiv entities into `{ nodes, edges }`. `buildTables(graph, entities)` turns the same data into relational-style tables. `fetchArkivGraph(options)` queries Arkiv (paginated, with block timing for TTL) and builds the graph in one call.
2. **React (`arkiv-graph/react`)** — `<ArkivGraph data={graph} />` (force-directed canvas) and `<ArkivTables model={tables} graph={graph} />` (a Supabase-like data browser). Both load client-side, so they're safe to import in Next.js / SSR apps.

### Two views of the same data

```tsx
import { fetchArkivGraph, buildTables } from "arkiv-graph";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";

const { graph, entities } = await fetchArkivGraph({ project, createdBy, links });
const tables = buildTables(graph, entities, { links });

// pick one:
<ArkivGraph data={graph} />                       // force-directed graph
<ArkivTables model={tables} graph={graph} />      // tables: one per entityType, with FK chips
```

`<ArkivTables>` renders one **collection table per entityType** (columns = your attributes, plus owner/TTL), a **junction table** for each join relationship (the like/follow rows themselves, for debugging), **foreign-key chips** that link related rows (coloured to match the graph's edges), client-side sort of the loaded rows, and a **schema tab** that lists your link rules and flags issues (unresolved references, zero-match rules, soon-to-expire rows). It's a data browser, not SQL — Arkiv has no joins, foreign keys, or migrations.

### Link rules — you declare the relationships

Arkiv has no foreign keys. A relationship exists only as a **shared attribute value** or an **attribute holding another entity's key/id**. Link rules tell `arkiv-graph` how to read yours:

| Rule | What it does |
| --- | --- |
| `reference` | An attribute points at another entity. By key, or by a **stable business id** via `targetAttribute` (e.g. `authorHandle` → `user.handle`). |
| `join` | A join entity (e.g. a `like` or `follow` row) is **collapsed into an edge** between the two nodes it connects. Resolve endpoints by key or by stable id (`sourceMatchAttr` / `targetMatchAttr`). |
| `shared` | Entities with the same value for an attribute connect — through a hub node by default (avoids hairballs). |
| `tag` | One tag node per distinct value; entities carrying it connect to it. |
| `owner` | Connect each entity to a wallet node for its `owner` (or `creator`). |

```ts
const links = [
  // post.authorHandle → the user whose handle matches
  { type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user", label: "by" },
  // a `like` entity (byHandle → postId) becomes a user→post edge; the like node disappears
  { type: "join", entityType: "like", sourceAttr: "byHandle", targetAttr: "postId",
    sourceMatchAttr: "handle", targetMatchAttr: "postId", label: "likes" },
  // group anything sharing a topic
  { type: "shared", attribute: "topic" },
];
```

### External chains — the dots reaching out

If an entity stores a reference to another chain, `arkiv-graph` draws it as an external node. Detection is by **attribute name** (not by scanning every `0x` value, so your own entity keys and internal references are never mistaken for foreign txs):

- `*ChainId` / `sourceChainId` → a chain node (Ethereum, Base, Optimism, Arbitrum, Scroll, … see `CHAIN_REGISTRY`).
- `*Contract` / `contractAddress` → a contract node under that chain.
- `*Tx` / `txHash` → a tx node, with a link to that chain's explorer.

```ts
// an entity with these attributes…
[{ key: "mintChainId", value: 8453 }, { key: "mintTx", value: "0x…" }]
// …produces a "Base" node + a tx node linked to basescan.org. No RPC to Base is ever made.
```

Customize via the `external` option (`chainIdKeys`, `contractKeys`, `txKeys`, `registry`, `nativeChainIds`).

### Pointing at a different Arkiv network (plug-and-play)

Arkiv testnets rotate. Nothing in `arkiv-graph` is hardcoded to one network — pass the chain you want and RPC, explorer links, and the "native" chain id for external detection all follow:

```ts
import { braga } from "@arkiv-network/sdk/chains";
import { defineArkivNetwork, fetchArkivGraph } from "arkiv-graph";

// today: the SDK's bundled chain
await fetchArkivGraph({ chain: braga, project, createdBy, links });

// next testnet, no code change — build it from config…
const next = defineArkivNetwork(braga, {
  chainId: 12345,
  rpcUrl: "https://<new-testnet>/rpc",
  explorerUrl: "https://explorer.<new-testnet>",
});
await fetchArkivGraph({ chain: next, project, createdBy, links });

// …or, when the SDK ships the new network as its own export, just pass that:
// import { newnet } from "@arkiv-network/sdk/chains";
// await fetchArkivGraph({ chain: newnet, ... });
```

`defineArkivNetwork(base, overrides)` clones the base chain's Arkiv protocol internals (viem `formatters`/`fees`/`serializers`) and overrides only the identity, so writes/reads keep working. If you pass a `client` instead of a `chain`, also pass `explorerUrl` and `nativeChainId` so links and external detection match your network. With no `chain`/`client`, it falls back to the SDK's bundled Braga chain.

---

## API

### `buildGraph(entities, options?) → Graph`

`entities`: an array of Arkiv entities (SDK entities, or any object with `key`, `attributes`, `payload`/`toJson`). `options`:

| option | default | meaning |
| --- | --- | --- |
| `links` | `[]` | the link rules above |
| `external` | enabled | external-chain detection config |
| `typeAttribute` | `"entityType"` | attribute used as the node's type |
| `labelKey` | auto | payload/attribute key to label nodes (falls back to name/title/handle/text) |
| `blockTiming` | — | from `getBlockTiming()`, enables TTL/fade |
| `createPlaceholders` | `true` | draw faint "ghost" nodes for references whose target wasn't fetched (so TTL/expiry doesn't look like a bug) |
| `arkivExplorer` | Braga | explorer base for entity links |

### `fetchArkivGraph(options) → { entities, graph, blockTiming }`

All of `buildGraph`'s options, plus query filters: `project`, `attributes` (eq map), `createdBy`, `ownedBy` (great for "connect wallet → see your graph"), `limit`, and either `client` (your Arkiv public client) or `rpcUrl`. Handles pagination and pulls block timing automatically.

### `<ArkivGraph data={graph} … />`

| prop | default | |
| --- | --- | --- |
| `data` | — | the `Graph` from build/fetch |
| `height` | `560` | px; width fills the container |
| `theme` | `ARKIV_THEME` | colors (see `ArkivGraphTheme`) |
| `onNodeClick` | — | callback |
| `showLegend` / `showFilters` / `showSearch` / `showDetail` | `true` | toggles |
| `fadeExpiring` | `true` | dim nodes as TTL runs down |
| `animate` | `true` | particle flow on join/external edges |
| `nodeColor` | — | `(node) => string` override |

Also exported: `computeTtl`, `formatTtl`, `CHAIN_REGISTRY`, `lookupChain`, `detectGroups`, and all types.

---

## Notes & gotchas (Arkiv-specific)

- **One shared public DB.** Always pass `createdBy` (or `ownedBy`) so you graph *your* data, not entities other wallets injected with your `project` value.
- **TTL is real.** Entities expire; nodes fade and `formatTtl` shows "2d 3h" / "expired". Expiry is cost-efficiency, not a bug.
- **SSR-safe.** The renderer (`react-force-graph-2d`) is loaded client-side; `<ArkivGraph>` ships with the `"use client"` directive and renders a placeholder on the server. In Next.js, import it inside a Client Component.
- **Next.js setup.** `react-force-graph-2d` is ESM-only, so add it (and this package) to `transpilePackages` in `next.config`:
  ```ts
  // next.config.ts
  const nextConfig = { transpilePackages: ["arkiv-graph", "react-force-graph-2d"] };
  ```
- **Node 20–22** for any server-side use of `@arkiv-network/sdk` (Node 24 hangs entity updates).
- `arkiv-graph` **never reads external chains** — external nodes are built only from references your own entities store.

## At scale & edge cases

The library is built to degrade gracefully across dataset sizes and shapes:

| Case | What happens | What to do |
| --- | --- | --- |
| **Giant DB** (thousands of entities) | `fetchArkivGraph` paginates up to `limit` (default 500; Arkiv page cap is 200) and returns `truncated: true` when it hits the cap. | Filter with `attributes` / `createdBy` / `ownedBy`, raise `limit`, and prefer the **Tables view** (`<ArkivTables>`) which is far cheaper than the force simulation. The force graph is comfortable to ~1–2k nodes. Surface `truncated` in your UI. |
| **Tiny / empty DB** | Builds an empty graph; `<ArkivGraph>`/`<ArkivTables>` render an empty state — no crash. | Nothing. |
| **Many external chains** | Each cross-chain reference becomes an external node. `CHAIN_REGISTRY` ships explorer URLs **and a free public RPC** for the common mainnets + testnets (Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, zkSync, Linea, Zora, Blast, Gnosis, + Sepolias). | Unknown chains fall back to `Chain <id>`. External chains are **not read by default**; to opt into reading one, grab its RPC via `lookupChain(id).rpc` and build your own client. |
| **Untyped entities** (no `entityType`) | Grouped under `(untyped)` in tables; still rendered as nodes. | Add an `entityType` attribute for clean grouping. |
| **Expired / missing references** | Rendered as faint **ghost** nodes (not dropped), so TTL/expiry never looks like a rendering bug. | Expected; `NoEntityFoundError` on a stale pointer is normal. |
| **Huge text payloads** | Tables keep every cell on one line (ellipsis + full value on hover); the detail card shows the full payload. | Nothing. |
| **Heterogeneous attributes per row** | Each table column is the union of that type's attributes; missing values render as `—`. | Nothing. |

> Sorting/pagination honesty: the tables sort the **loaded** rows client-side (Arkiv has no server-side ORDER BY). For globally-sorted huge tables, page with `limit` + your own ordering.

## License

MIT © Arkiv DevRel

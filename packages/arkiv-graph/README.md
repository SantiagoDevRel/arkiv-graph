# arkiv-graph

**Turn your [Arkiv](https://docs.arkiv.network) database into an interactive graph.**

**These packages are intended for testnet use.**

**Registry availability:** run `npm view arkiv-graph@0.3.1 version` before installation. If this release has not reached npm yet, use the [published 0.3.0 guide](https://github.com/SantiagoDevRel/arkiv-graph/blob/v0.3.0/packages/arkiv-graph/README.md). A local checkout is not proof of publication.

Version **0.3.1** targets **@arkiv-network/sdk 0.8.0**, **viem 2.56.3**, **Node.js 22.22.3**, and **Tiramisu testnet (7738577)**. SDK 0.6/0.7 clients are not supported by `fetchArkivGraph` in this release. Legacy plain entity arrays remain accepted by `buildGraph`.

Nodes are your entities. Edges are the relationships *you* define (Arkiv has no joins — you declare how entities relate). References to other chains show up as **external nodes**, drawn purely from what your entities already store — `arkiv-graph` never reads those chains.

> The existing hosted sample still uses the retired Braga network; it is not the Tiramisu sample described here. Run the sample locally. Release and verification status are recorded in [verification.md](https://github.com/SantiagoDevRel/arkiv-graph/blob/feat/tiramisu-dashboard/docs/verification.md).



---

## Install

Check the exact release, then install it from the npm registry:

```bash
npm view arkiv-graph@0.3.1 version
npm i arkiv-graph@0.3.1
# peer deps for the React component:
npm i react@19.2.7 react-dom@19.2.7
# required SDK/type peers (network access only occurs in fetchArkivGraph):
npm i @arkiv-network/sdk@0.8.0 viem@2.56.3
```

The core entry does not import React at runtime, but this combined package also
installs the graph renderer's dependencies. A core-only install is not React-free.
For local package development, run `pnpm install --frozen-lockfile` and
`pnpm build:lib` from the repository root. Create an output directory, then run
`npm pack ./packages/arkiv-graph --pack-destination <absolute-existing-output-directory>`.
Installing that tarball tests a local artifact; it does not verify the npm release.

## Minimal example (no network or credentials)

Save as `example.mjs`, then run `node example.mjs`:

```js
import { buildGraph, buildTables } from "arkiv-graph";
const entities = [
  { key: "user-alice", attributes: [{ key: "entityType", value: "user" }, { key: "handle", value: "alice" }] },
  { key: "post-1", attributes: [{ key: "entityType", value: "post" }, { key: "authorHandle", value: "alice" }] },
];
const links = [{ type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user" }];
const graph = buildGraph(entities, { links, arkivExplorer: "" });
const tables = buildTables(graph, entities, { links });
console.log(graph.nodes.length, graph.edges.length, tables.tables.length);
```

Expected: `2 1 2`. These are local example objects, not on-chain entities.
Use the [reproducible read](#reproducible-read-no-wallet-connection-or-access-key)
to query real Tiramisu data. For React:

```tsx
"use client";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";
import type { Graph, TablesModel } from "arkiv-graph";
export function AppData({ graph, tables }: { graph: Graph; tables: TablesModel }) {
  return <><ArkivGraph data={graph} height={400} /><ArkivTables graph={graph} model={tables} /></>;
}
```

Pass the graph and tables built from the same data. The components and the
sample's surrounding workflow use English labels.

---

## How it works

`arkiv-graph` has two layers:

1. **Core (framework-agnostic, no UI imports)** — `buildGraph(entities, options)` turns a flat list of Arkiv entities into `{ nodes, edges }`. `buildTables(graph, entities)` turns the same data into relational-style tables. `fetchArkivGraph(options)` queries Arkiv (paginated, with block timing for Entity Expiration) and builds the graph in one call.
2. **React (`arkiv-graph/react`)** — `<ArkivGraph data={graph} />` (force-directed canvas) and `<ArkivTables model={tables} graph={graph} />` (a Supabase-like data browser). Both load client-side, so they're safe to import in Next.js / SSR apps.

### Two views of the same data

```tsx
import { fetchArkivGraph, buildTables } from "arkiv-graph";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";

const { graph, entities, blockTiming } = await fetchArkivGraph({ project, createdBy, links });
const tables = buildTables(graph, entities, {
  links, ...(blockTiming ? { blockTiming } : {}),
});

// pick one:
<ArkivGraph data={graph} />                       // force-directed graph
<ArkivTables model={tables} graph={graph} />      // tables: one per entityType, with FK chips
```

`<ArkivTables>` renders one **collection table per entityType** (columns = your attributes, plus owner/Entity Expiration), a **junction table** for each join relationship (the like/follow rows themselves, for debugging), **foreign-key chips** that link related rows (coloured to match the graph's edges), client-side sort of the loaded rows, and a **schema tab** that lists your link rules and flags issues (unresolved references, zero-match rules, soon-to-expire rows). It's a data browser, not SQL — Arkiv has no joins, foreign keys, or migrations.

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
import type { LinkRule } from "arkiv-graph";
const links: LinkRule[] = [
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

Arkiv testnets rotate. Tiramisu is the default; the library is not limited to one network — pass the chain you want and RPC, explorer links, and the "native" chain id for external detection all follow:

```ts
import { tiramisu } from "@arkiv-network/sdk/chains";
import { defineArkivNetwork, fetchArkivGraph } from "arkiv-graph";

// today: the SDK's bundled chain
await fetchArkivGraph({ chain: tiramisu, project, createdBy, links });

// next testnet, no code change — build it from config…
const next = defineArkivNetwork(tiramisu, {
  chainId: 12345,
  rpcUrl: "https://<new-testnet>/rpc",
  explorerUrl: "https://explorer.<new-testnet>",
});
await fetchArkivGraph({ chain: next, project, createdBy, links });

// …or, when the SDK ships the new network as its own export, just pass that:
// import { newnet } from "@arkiv-network/sdk/chains";
// await fetchArkivGraph({ chain: newnet, ... });
```

`defineArkivNetwork(base, overrides)` clones the base chain's Arkiv protocol internals (viem `formatters`/`fees`/`serializers`) and overrides only the identity, for networks using the same SDK protocol. This does not migrate between incompatible protocol generations. If you pass a `client` instead of a `chain`, also pass `explorerUrl` and `nativeChainId` so links and external detection match your network. With no `chain`/`client`, it falls back to the SDK's bundled Tiramisu chain.

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
| `blockTiming` | — | from `getBlockTiming()`, enables Entity Expiration/fade |
| `createPlaceholders` | `true` | draw faint "ghost" nodes for references whose target wasn't fetched (so Entity Expiration/expiry doesn't look like a bug) |
| `arkivExplorer` | Tiramisu | explorer base for entity links |

### `fetchArkivGraph(options) → { entities, graph, blockTiming, truncated }`

All of `buildGraph`'s options, plus query filters: `project`, `attributes` (eq map), `createdBy`, `ownedBy` (great for "connect wallet → see your graph"), `limit`, and either `client` (your Arkiv public client) or `rpcUrl`. Handles pagination and pulls block timing automatically.

### `<ArkivGraph data={graph} … />`

| prop | default | |
| --- | --- | --- |
| `data` | — | the `Graph` from build/fetch |
| `height` | `560` | px; width fills the container |
| `theme` | `ARKIV_THEME` | colors (`ArkivGraphTheme` from `arkiv-graph/react`) |
| `onNodeClick` | — | callback |
| `showLegend` / `showFilters` / `showSearch` / `showDetail` | `true` | toggles |
| `fadeExpiring` | `true` | dim nodes as Entity Expiration runs down |
| `animate` | `true` | particle flow on join/external edges |
| `nodeColor` | — | `(node) => string` override |

The core entry also exports `computeTtl`, `formatTtl`, `CHAIN_REGISTRY`,
`lookupChain`, `detectGroups`, and core model/configuration types. React component,
theme and mutation callback types come from `arkiv-graph/react`:

```ts
import type { ArkivGraphTheme } from "arkiv-graph/react";
```

`detectGroups(entity, config?, internalKeys?)` accepts one normalized `NormEntity`,
not a graph. `config` is `ExternalConfig`; `internalKeys` is `Set<string>`.
These control external-reference grouping; prefer `buildGraph`'s automatic
grouping for normal integration.

`computeTtl(expiresAtBlock, createdAtBlock, timing)` takes two block numbers
(`number | undefined`) and `BlockTiming | undefined`, returning
`{ ttlSeconds?, ttlFraction?, expiresAt? }`. `expiresAt` is estimated Unix seconds;
`ttlFraction` is a 0–1 fraction. Missing or invalid timing returns an empty object.
`formatTtl(seconds | undefined)` returns a duration, `expired`, or `—` when unknown.
`formatExpiry(unixSeconds | undefined)` formats an estimated date in the viewer's
locale. Prefer `buildGraph`'s automatic conversion for SDK entities with bigint blocks.

---

## Notes & gotchas (Arkiv-specific)

- **One shared public DB.** Always pass `createdBy` (or `ownedBy`) so you graph *your* data, not entities other wallets injected with your `project` value.
- **Entity Expiration is real.** Entities expire; nodes fade and `formatTtl` shows "2d 3h" / "expired". Expiry is cost-efficiency, not a bug.
- **SSR-safe.** The renderer (`react-force-graph-2d`) is loaded client-side; `<ArkivGraph>` ships with the `"use client"` directive and renders a placeholder on the server. In Next.js, import it inside a Client Component.
- **Next.js setup.** `react-force-graph-2d` is ESM-only, so add it (and this package) to `transpilePackages` in `next.config`:
  ```ts
  // next.config.ts
  const nextConfig = { transpilePackages: ["arkiv-graph", "react-force-graph-2d"] };
  ```
- **Node.js 22.22.3** is the tested runtime; other major versions have not been verified for this release.
- `arkiv-graph` **never reads external chains** — external nodes are built only from references your own entities store.

## At scale & edge cases

The library is built to degrade gracefully across dataset sizes and shapes:

| Case | What happens | What to do |
| --- | --- | --- |
| **Giant DB** (thousands of entities) | `fetchArkivGraph` paginates up to `limit` (default 500; Arkiv page cap is 200) and returns `truncated: true` when it hits the cap. | Filter with `attributes` / `createdBy` / `ownedBy`, raise `limit`, and prefer the **Tables view** (`<ArkivTables>`) which is far cheaper than the force simulation. Large force graphs require browser-specific performance testing. Surface `truncated` in your UI. |
| **Tiny / empty DB** | Builds an empty graph; `<ArkivGraph>`/`<ArkivTables>` render an empty state — no crash. | Nothing. |
| **Many external chains** | Each cross-chain reference becomes an external node. `CHAIN_REGISTRY` ships explorer URLs **and a free public RPC** for the common mainnets + testnets (Ethereum, Base, Optimism, Arbitrum, Polygon, Scroll, zkSync, Linea, Zora, Blast, Gnosis, + Sepolias). | Unknown chains fall back to `Chain <id>`. External chains are **not read by default**; to opt into reading one, grab its RPC via `lookupChain(id).rpc` and build your own client. |
| **Untyped entities** (missing the configured type attribute) | Grouped under `(untyped)` in tables; still rendered as nodes. | Set `typeAttribute` to your app's field; the Tiramisu sample uses `entity_type`. |
| **Expired / missing references** | Rendered as faint **ghost** nodes (not dropped), so Entity Expiration/expiry never looks like a rendering bug. | Expected; `NoEntityFoundError` on a stale pointer is normal. |
| **Huge text payloads** | Tables keep every cell on one line (ellipsis + full value on hover); the detail card shows the full payload. | Nothing. |
| **Heterogeneous attributes per row** | Each table column is the union of that type's attributes; missing values render as `—`. | Nothing. |

> Sorting/pagination honesty: the tables sort the **loaded** rows client-side (Arkiv has no server-side ORDER BY). For globally-sorted huge tables, page with `limit` + your own ordering.

## License

MIT © Arkiv DevRel


## Reproducible read (no wallet connection or access key)

Use Node.js 22. From an empty directory:

```bash
npm init -y
npm install arkiv-graph@0.3.1 @arkiv-network/sdk@0.8.0 viem@2.56.3
```

Save as `read.mjs`:

```js
import { fetchArkivGraph, buildTables } from "arkiv-graph";
const links = [{ type: "reference", attribute: "author_handle", targetAttribute: "handle", targetType: "user" }];
const typeAttribute = "entity_type";
const result = await fetchArkivGraph({
  ownedBy: "0xa618A2736431f24C26F1C8Dac9CA00ECc845a1C6",
  project: "arkiv-graph-social-v2",
  links, typeAttribute,
});
const tables = buildTables(result.graph, result.entities, {
  links, typeAttribute,
  ...(result.blockTiming ? { blockTiming: result.blockTiming } : {}),
});
console.log({ entities: result.entities.length, nodes: result.graph.nodes.length,
  tables: tables.tables.map(table => table.type), truncated: result.truncated });
```

Run `node read.mjs`. Before the sample is created (or after expiration), expect
`{ entities: 0, nodes: 0, tables: [], truncated: false }`. Once it has been created and
while its entities remain active, the types include `user`, `post`, `comment`,
`follow`, and `like`. An empty result is valid if it has not been created or has
expired. Replace the public address and project with your own to inspect your app.

To cross-check the public source independently, use the SDK with the **same owner
and project filters**. Do not use `getEntityCount()` for this comparison: it counts
the whole network. For a small sample:

```js
import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
const client = createPublicClient({ chain: tiramisu, transport: http() });
const query = client.select({ key: true })
  .ownedBy("0xa618A2736431f24C26F1C8Dac9CA00ECc845a1C6")
  .where(eq("project", "arkiv-graph-social-v2"));
let sourceCount = 0;
for await (const _entity of query) sourceCount++;
console.log(sourceCount);
```

Compare that count with `result.entities.length` when `truncated` is false.
Graph node counts can differ because join entities collapse into edges and
missing targets can produce placeholders. This count is not an access-control test.

For React, install `react react-dom` and use the `/react` entry shown above.
In Next.js, place it in a client component and set
`transpilePackages: ["arkiv-graph", "react-force-graph-2d"]` in `next.config`.
The package includes ESM, CommonJS, and TypeScript declarations; the React entry
preserves its `"use client"` directive. The core import is safe on the server.

## Lifetime Extension with your wallet

The library does not hold keys or submit transactions. Pass `onExtendEntity` to
`ArkivTables` to enable the action; omit it for a read-only view. The callback
receives `{ entityKey, targetExpiresAt, row }`, where the target is Unix seconds.
Use the [sample wallet implementation](https://github.com/SantiagoDevRel/arkiv-graph/blob/feat/tiramisu-dashboard/apps/example/src/lib/wallet-client.ts)
as the complete integration reference, including account/chain checks.

With SDK 0.8, an extension **sets a new expiry**, using
`wallet.extendEntity({ entityKey, expires: ExpirationTime.atBlock(targetBlock) })`.
It does **not** add a duration to the previous expiry. Read the entity and block
timing again, verify ownership and a strictly later target, and round up to an
absolute block. The SDK waits for the transaction receipt and returns the expiry
from its event. Return a confirmed `expiresAt` and `txUrl` from your callback;
refetch in `onMutated`. Dates are estimates based on block time, not exact clocks.

The sample restricts extensions to the owner even if another app creates entities
with permissionless extension. The sample also implements the existing optional
`onDeleteEntity` callback for single-entity deletion, restricted to the connected owner.

## Delete an entity with your wallet

Pass `onDeleteEntity` to `ArkivTables`; omit it to hide Delete. Its confirmation
passes `{ entityKey, row }` to your handler. Use the sample's
`deleteEntityWithWallet` implementation as the complete reference: re-read the
entity, check ownership/liveness and active account/network, then call SDK0.8
`wallet.deleteEntity({ entityKey })`. Resolve only after a successful receipt,
return `{ txUrl }` and refetch in `onMutated`. A canceled dialog must not call the
handler; a rejected or uncertain transaction must not report success.

Deletion removes one entity from active queries. Related entities remain and may
show unresolved references. There is no automatic cascade or dashboard undo;
historical copies may remain. Test deletion with a disposable entity you created
for that purpose. The SDK's readonly creation flag protects payload/attributes;
it does not prevent the owner from deleting the entity.

## Prerequisites and troubleshooting

- Reads: public Tiramisu RPC, a public owner/creator address and the app attributes.
  No private key, access key, wallet connection or funds are needed for reads.
- Writes: MetaMask or another injected EIP-1193 wallet, Tiramisu selected, and test
  GLM from the [Arkiv Hub faucet](https://hub.arkiv.network/faucet).
  The visitor reviews and signs each operation. Never paste a key into a web app.
- Optional access keys: use the [Hub](https://hub.arkiv.network/api-keys) when
  your own deployment needs a higher RPC allowance; keep credential-bearing RPC
  URLs server-side. The sample does not require them or accept arbitrary RPC URLs.
- `Set createdBy or ownedBy`: supply a valid public wallet address. Project names
  alone do not identify a tenant on a public DB-Chain.
- Empty result: check the network, owner (not just creator), exact attribute names
  and types, and whether the entities expired. A filter is not access control.
- SDK 0.8 uses typed attribute maps and `createdAt`/`expiresAt` block metadata.
  Do not use removed `buildQuery`, `withMetadata`, or `expiresIn` APIs.
- Tiramisu creation rejects uppercase custom attribute names even though SDK 0.8
  accepts them during encoding. The sample uses `entity_type`, `author_handle`
  and `post_id`; pass `typeAttribute: "entity_type"` to both builders/fetch.
  The legacy `entityType` default and camelCase offline examples remain for
  compatibility with existing in-memory data; they are not creation examples.
- Simulate the exact mutation against the configured RPC before wallet signing.
  Some wallets guess insufficient gas for a custom chain. The sample supplies
  the RPC estimate with a buffer, then rechecks the account and chain.
- `truncated: true`: narrow the scope. The default limit is 500, maximum 5000;
  graph layout can become expensive before that ceiling. Pages use a fixed cursor.
- Rejected signature, wrong owner, changed account or chain: no success should be
  shown. Reconnect/check the wallet and retry only after checking any transaction
  hash already returned. Never retry an uncertain submitted write blindly.
- Rate limit or RPC failure: show an error and a manual retry. Do not poll in a loop.
- Relationships by stable ids need explicit link rules; this is not a SQL engine.
  Public data is visible to everyone; this tool adds no private database or RLS.

## Source, sample, and agent guides

- [Source repository](https://github.com/SantiagoDevRel/arkiv-graph)
- [Runnable sample and setup](https://github.com/SantiagoDevRel/arkiv-graph/tree/feat/tiramisu-dashboard/apps/example)
- [Legacy hosted sample (Braga; not the current Tiramisu demo)](https://arkiv-graph-example.vercel.app)
- [Consumer AGENTS.md](https://github.com/SantiagoDevRel/arkiv-graph/blob/feat/tiramisu-dashboard/packages/arkiv-graph/AGENTS.md)
- [Sample AGENTS.md](https://github.com/SantiagoDevRel/arkiv-graph/blob/feat/tiramisu-dashboard/apps/example/AGENTS.md)

Give your agent the applicable guide explicitly. Installing a package does not
mean an agent will discover instructions inside `node_modules`.

### Join entities with incomplete relationships

A join entity becomes an edge only when its endpoints resolve (or placeholders are enabled). Missing endpoints, self-references, or excluded endpoints leave the entity visible as an isolated node and a junction-table row with empty relationship cells and a warning. Join entities do not participate in owner, reference, shared, tag, or external-detection rules. Their owner, attributes and expiration remain available in the table and detail view. Repeated legacy attribute keys use the first value consistently in graph and table matching.

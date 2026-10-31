# arkiv-graph

Interactive graphs and tables for Arkiv entities. Relationships are application rules, not native joins or foreign-key constraints. **Testnet use only.**

**arkiv-graph 1.1.0**, with `@arkiv-network/sdk@1.0.0` and Rabdi (chain id `7794095`). Since 1.1.0, use `bytes` for binary entity data.

## Install version 1.1.0 from npm:

```sh
npm install arkiv-graph@1.1.0 @arkiv-network/sdk@1.0.0 viem
# For React rendering:
npm install react react-dom
```

Use Node.js 22 or a compatible newer runtime. Core imports are framework-agnostic, although the combined package includes the renderer's dependencies. React exports preserve `"use client"` and load the canvas renderer on the client. For Next.js use `transpilePackages: ["arkiv-graph", "react-force-graph-2d"]`.

## Offline model

```js
import { buildGraph, buildTables } from "arkiv-graph";
const entities = [
  { key: "alice", attributes: [{ key: "entityType", value: "user" }, { key: "handle", value: "alice" }] },
  { key: "post", attributes: [{ key: "entityType", value: "post" }, { key: "author", value: "alice" }] },
];
const links = [{ type: "reference", attribute: "author", targetAttribute: "handle", targetType: "user" }];
const graph = buildGraph(entities, { links, arkivExplorer: "" });
const tables = buildTables(graph, entities, { links });
console.log(graph.nodes.length, graph.edges.length, tables.tables.length); // 2 1 2
```

Legacy plain inputs remain supported. SDK 1.0 rows can be passed directly: `$key`, `$owner`, `$creator`, `$expiresAt`, `$createdAt`, and `$attributes`, or typed columns selected through a schema. Large integers, decimals and booleans are preserved as strings for relationship matching and table display.

## Query Rabdi from a server

Get a free [access key](https://hub.arkiv.network/access-keys). Shared keys must remain on the server; send only the graph/table result to the browser.

```js
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { fetchArkivGraph, buildTables } from "arkiv-graph";
const accessKey = process.env.ARKIV_ACCESS_KEY;
if (!accessKey) throw new Error("Set server-side ARKIV_ACCESS_KEY; get a free key from the Arkiv Hub.");
const chain = rabdi({ accessKey });
const client = createPublicClient({ chain, transport: http(undefined, { fetchOptions: { cache: "no-store" } }) });
const links = [{ type: "reference", attribute: "author_handle", targetAttribute: "handle", targetType: "user" }];
const result = await fetchArkivGraph({ client, chain, ownedBy: process.env.PUBLIC_OWNER, project: "my-app", links, typeAttribute: "entity_type", limit: 500 });
const tables = buildTables(result.graph, result.entities, { links, typeAttribute: "entity_type", blockTiming: result.blockTiming });
```

Always scope by `ownedBy` or `createdBy`. Attributes identify data; they do not make it private. Queries are bounded (1–5000), use ordered offset pages with one lookahead, and mark `truncated`. Rabdi reads the latest head on each page; pages are not an atomic snapshot and concurrent expiration or writes can shift offsets. Refresh manually when needed.

## Schema and indexed relationships

```ts
import { defineSchema, str, key, bytes } from "@arkiv-network/sdk/schema";
const Social = defineSchema("my-social", {
  project: str().indexed(), entity_type: str().indexed(),
  handle: str().indexed().optional(), author_handle: str().indexed().optional(),
  entity_ref: key().indexed().optional(),
  text: str().optional(), document: bytes().optional(),
});
```

Only indexed columns are filterable. `bytes()` stores binary content and cannot be indexed or filtered. Named schemas add an indexed `arkiv.schema` tag. Queries select `$`-prefixed system fields; attributes keep their own names. `client.getEntity(key)` returns the same `$` system metadata and typed attributes.

## Link rules and shared tables

| Rule | Relationship |
| --- | --- |
| `reference` | `attribute` holds a target entity key, or matches `targetAttribute`; optionally restrict `sourceType` / `targetType`. Directed by default. |
| `join` | Collapse an `entityType` into an edge using `sourceAttr` and `targetAttr`; `sourceMatchAttr` / `targetMatchAttr` resolve business ids. Restrict endpoint types when ids overlap. |
| `shared` | Equal attribute values connect through a hub by default. Pairwise mode is bounded by `maxGroup`. |
| `tag` | One tag node per distinct attribute value. |
| `owner` | Connect to owner wallets, or creator wallets with `byCreator`. |

Pass identical `links`, `typeAttribute` and `blockTiming` to graph/table builders. The tables derive relationships from graph edges, preserving direction and duplicate join entities. Missing, expired and out-of-scope endpoints appear as unresolved placeholders by default; the client cannot infer which absence caused them. Setting `createPlaceholders: false` suppresses these edges. Uncollapsible join entities remain as junction rows with warnings. Self-loops are suppressed. Repeated legacy attributes use the first value for matching.

`buildGraph(entities, options)` also accepts `external`, `labelKey`, `arkivExplorer`, and `nativeChainId`. Native defaults are Rabdi. `external` detects chain/contract/transaction references by attribute names, never by treating arbitrary hex values as transactions. No other chain is queried. `buildTables(graph, entities, options)` returns collection/junction tables, relationship summaries and warnings.

`fetchArkivGraph(options)` adds `client`, `chain`, `accessKey`, `rpcUrl`, `explorerUrl`, `project`, `attributes`, `createdBy`, `ownedBy`, and `limit`. Default Rabdi construction requires `accessKey`; missing configuration raises `MissingAccessKeyError` with Hub guidance. A custom client/RPC requires chain identity; supply the matching explorer. `defineArkivNetwork(base, overrides)` copies chain protocol internals while replacing network identity; it cannot bridge incompatible SDK generations.

## React

```tsx
"use client";
import { ArkivGraph, ArkivTables } from "arkiv-graph/react";
import type { Graph, TablesModel } from "arkiv-graph";
export function DataView({ graph, tables }: { graph: Graph; tables: TablesModel }) {
  return <><ArkivGraph data={graph} height={500} /><ArkivTables graph={graph} model={tables} height={500} /></>;
}
```

`ArkivGraph` supports `theme`, `onNodeClick`, legend/filter/search/detail toggles, `fadeExpiring`, `animate` and `nodeColor`. Both views accept the same `ArkivGraphTheme`, including light/dark surface, text and status colors. The library does not set or persist the host page's theme. Graph nodes can be dragged to pin their positions.

`ArkivTables` accepts `signerAddress`, `onExtendEntity`, `onDeleteEntity`, and `onMutated`. Omit callbacks to keep it read-only. Extension supplies `{ entityKey, targetExpiresAt, row }`; deletion supplies `{ entityKey, row }` after explicit confirmation of the exact key. Resolve only after checking a successful receipt, return `{ txUrl }`, and refetch in `onMutated`. Recheck owner, liveness, active account and chain immediately before signing. There is no implicit cascade, undo or erasure of historical copies.

## Signing and troubleshooting

Visitors need their own Rabdi RPC access key configured in an EIP-1193 wallet and test funds from the [Hub faucet](https://hub.arkiv.network/faucet). Never put a private key in application code. The sample has no server signing endpoint.

Core graph/query APIs are read-only; mutation callbacks belong to the host application. At the unsigned transaction boundary, estimate the exact `to`, `data` and `value` at `latest` before opening the wallet or signing. Stop if estimation fails. Every write uses fresh explicit nonce/gas/gasPrice. A 1,000,000 gas floor alone is insufficient for large bytes columns:

```ts
import { estimateGas, getGasPrice } from "viem/actions";
import type { Address, Hex } from "viem";
async function txParams(unsignedTx: { account: Address; to: Address; data: Hex; value?: bigint }, override: { gas?: bigint; gasPrice?: bigint } = {}) {
  const address = unsignedTx.account;
  const estimate = await estimateGas(publicClient, { ...unsignedTx, blockTag: "latest" });
  const floor = estimate * 2n > 1_000_000n ? estimate * 2n : 1_000_000n;
  const gas = override.gas ?? floor;
  const head = await publicClient.getBlock({ blockTag: "latest" });
  if (estimate <= 0n || gas < floor) throw new Error("Insufficient measured headroom");
  if (gas > head.gasLimit / 2n) throw new Error("Split into smaller batches");
  const nonce = await publicClient.getTransactionCount({ address, blockTag: "latest" });
  if (nonce !== await publicClient.getTransactionCount({ address, blockTag: "pending" }))
    throw new Error("Verify the pending transaction first");
  const gasPrice = override.gasPrice ?? await getGasPrice(publicClient);
  if (gasPrice <= 0n) throw new Error("Invalid gas price");
  return { nonce, gas, gasPrice };
}
```

Use these parameters for that exact transaction, then require `receipt.status === "success"` before success/refetch. Never set gas at or near the head block limit. The maintainer seed starts with at most ten entities per batch and splits before signing if `max(1_000_000, 2 × estimate)` exceeds 50% of the head gas limit. Confirm each batch before the next nonce. The [sample's exported wallet write paths](../../apps/example/src/lib/wallet-client.ts) enforce unsigned estimation and the same half-block cap for create, extend and delete, support per-write gas/gasPrice overrides that preserve headroom, and recheck the session after simulation. The core library never loads a signer or private key.

Rabdi caps each target lifetime at 7,884,000 blocks (about 182 days). It does not support permanent/no-expiration entities. Use a margin such as `ExpirationTime.fromBlocks(7_883_970)`, or the sample's shorter 30-day lifetime; use Lifetime Extension for data that needs to remain available longer. The near-maximum create was [verified on Rabdi](https://rabdi.explorer.arkiv.network/tx/0x541255b0a308664af00fa73228208495061979ddfb06ab26a7196095f998503a). Extension is relative to the current head or an absolute future block, not an additive duration; keep its target within the same maximum.

- `arkiv serves state at the chain head only`: old block hashes, `safe` and `finalized` are unsupported for state operations. Use `latest` or `pending`.
- A revert at exactly the gas limit indicates under-estimation. Estimate again at `latest`, use at least twice that estimate and split if it exceeds half the head block limit; at most one explicit retry after an authoritative reverted receipt. Never retry successful or uncertain writes.
- `ExpiryBeyondMaxLifetime`: shorten the create/extension target below the chain maximum; do not use `ExpirationTime.permanent()` or a maximum-uint64 target.
- Empty data: verify chain, owner, exact indexed column names/types, namespace and expiration. Missing references are not proof that a write failed.
- RPC limits: show a manual retry. Never expose credential-bearing request errors or shared RPC URLs in a response.
- `truncated`: narrow scope. Large force layouts can become expensive before the query ceiling.

Expiration dates are block-time estimates. Existing helper exports `computeTtl`, `formatTtl`, `formatExpiry` and lifetime fields remain compatible for plain-input consumers. Give [AGENTS.md](./AGENTS.md) explicitly to your development agent; npm installation does not automatically load it.

Version 1.1.0 adds `bytes` for legacy plain-input binary data and graph nodes; the deprecated aliases still work. SDK 1.0 entities continue to use named typed columns. This additive API change requires a minor release.

Maintainers: run the normal test suite, including the complete-tree vocabulary guard and its mutation cases.

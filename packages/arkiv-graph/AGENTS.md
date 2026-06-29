# AGENTS.md — arkiv-graph

Guidance for an AI assistant integrating `arkiv-graph` into someone's app. Follow this; don't reinvent the decisions the library already makes.

## What it is
A library that turns **Arkiv entities into an interactive graph OR relational-style tables**. Entry points:
- `arkiv-graph` — pure-TS core: `buildGraph(entities, options)`, `buildTables(graph, entities, options)`, `fetchArkivGraph(options)`, `defineArkivNetwork(base, overrides)`.
- `arkiv-graph/react` — `<ArkivGraph data={graph} />` (force-directed) and `<ArkivTables model={tables} graph={graph} />` (Supabase-like data browser). Both are client components.

Arkiv has **no joins / foreign keys**. Relationships exist only as shared attribute values or attributes holding another entity's key/id. The consumer declares them via **link rules** — this is the core concept; get it right.

## Install & wire up (exact)
```bash
npm i arkiv-graph react react-dom
npm i @arkiv-network/sdk   # only if using fetchArkivGraph
```
```tsx
"use client";                                  // <ArkivGraph> is client-only
import { fetchArkivGraph } from "arkiv-graph";
import { ArkivGraph } from "arkiv-graph/react";

const { graph } = await fetchArkivGraph({
  project: "<their project attribute>",
  createdBy: "<their wallet>",                  // ALWAYS scope reads (shared public DB)
  links: [ /* see below */ ],
});
// <ArkivGraph data={graph} height={600} />
```

## Link rules — map THEIR data model
Inspect the user's entities first (what `entityType`s exist, which attributes point at other entities). Then:
- attribute holds another entity's **key** → `{ type:"reference", attribute }`.
- attribute holds a **stable id** (handle, slug) → `{ type:"reference", attribute, targetAttribute:"<the id attr on the target>" }`.
- a join/relation entity (likes, follows, memberships) → `{ type:"join", entityType, sourceAttr, targetAttr, sourceMatchAttr?, targetMatchAttr? }` — it collapses INTO an edge.
- group by a shared value → `{ type:"shared", attribute }` (hub by default).
- show owners → `{ type:"owner" }`. Tags → `{ type:"tag", attribute }`.

## Interactive actions — extend / delete (optional)
`<ArkivTables>` can render a per-row **Extend** (date picker → push the expiry out) and **Delete** action — both **opt-in** and **signing-agnostic**. The library renders the UI and computes the target date; YOU perform the actual on-chain write in the callback (sign it however you like — the visitor's own wallet via `viem`/MetaMask, or a server key). Omit the callbacks and no buttons render (read-only views stay read-only).

```tsx
<ArkivTables
  model={tables}
  graph={graph}
  signerAddress={connectedAddress}          // optional: rows owned by another address show an "only the owner can change this" hint
  onExtendEntity={async ({ entityKey, targetExpiresAt }) => {
    // sign with the user's wallet — Arkiv's extendEntity is ADDITIVE
    // (new expiry = old expiry + duration), so derive the duration from the
    // entity's REAL on-chain expiry, not a client value:
    const wallet = createWalletClient({ account, chain, transport: custom(window.ethereum) });
    const { expiresAtBlock } = await publicClient.getEntity(entityKey);
    const { currentBlock, currentBlockTime, blockDuration } = await publicClient.getBlockTiming();
    const currentExpiry = currentBlockTime + (Number(expiresAtBlock) - Number(currentBlock)) * blockDuration;
    const { txHash } = await wallet.extendEntity({ entityKey, expiresIn: Math.ceil(targetExpiresAt - currentExpiry) });
    return { expiresAt: targetExpiresAt, txUrl: `${explorer}/tx/${txHash}` }; // shown in the panel
  }}
  onDeleteEntity={async ({ entityKey }) => {
    const { txHash } = await wallet.deleteEntity({ entityKey });
    return { txUrl: `${explorer}/tx/${txHash}` };
  }}
  onMutated={() => refetch()}               // called after a successful write — refetch your data
/>
```
- **Ownership is the chain's job.** Only an entity's owner can extend/delete it; a non-owner write reverts. Pre-check with `getEntity(key).owner` and **throw** from the callback (`throw new Error("You're not the owner…")`) — the panel shows whatever you throw, so a non-owner sees a clear message instead of a doomed transaction.
- **Cost, accurately.** Don't show a pre-tx estimate (Arkiv's storage fee isn't reliably estimable up front). Read the real cost from the receipt (`gasUsed × effectiveGasPrice` + the `ArkivEntityBTLExtended` event's `cost`) and return it as `cost` for the panel — or omit it.
- The Extend date picker clamps strictly forward (you can only extend past the current expiry).

## Hard gotchas — do NOT fight these
1. **Scope reads.** Always set `createdBy` or `ownedBy`. Arkiv is one shared public DB; without scoping you'll render strangers' entities that share the `project` value.
2. **SSR.** `<ArkivGraph>` already loads its renderer client-side and guards `window`. Put it in a Client Component (`"use client"`). You do NOT need `dynamic(..., { ssr:false })`, but it's harmless.
3. **TTL fade is intentional.** Arkiv entities expire; faded/"ghost" nodes are correct, not a bug. `fetchArkivGraph` pulls block timing for you.
4. **External chains are inferred, never fetched.** External nodes come from attribute names like `*ChainId` / `*Contract` / `*Tx` in the user's own entities. The library makes zero RPC calls to other chains. Don't add chain-reading code.
5. **Node 20–22** for any server-side `@arkiv-network/sdk` use (Node 24 hangs writes). The library itself is isomorphic.
6. **Network is config-driven — don't hardcode a testnet.** Pass `chain` to `fetchArkivGraph` (the SDK's `braga` export, a future export, or `defineArkivNetwork(braga, {chainId, rpcUrl, explorerUrl})`). When you pass a `client` instead, also pass `explorerUrl` + `nativeChainId` so entity links and external detection follow your network. Arkiv testnets rotate — swapping should be config, never a code edit.
6. `@arkiv-network/sdk`, `react`, `react-dom` are **optional peer deps** — only needed for the paths that use them.

## What to ask the developer
- Their **`project` attribute** value and the **wallet address** that created the data (for `createdBy`).
- The **entity types and the attributes that relate them** (so you can write correct link rules) — or point `fetchArkivGraph` at a sample and inspect `graph.nodes[].attributes`.
- Their **Arkiv RPC** (defaults to Braga public RPC) and which network they're on.
- If they want a **"connect wallet → my graph"** view, use `ownedBy: <connectedAddress>` instead of `createdBy`.

## Don't
- Don't `npm i viem` separately — the SDK re-exports it.
- Don't write `orderBy` (Arkiv ignores server-side ordering; sort client-side).
- Don't claim Arkiv is "decentralized/trustless/permanent". It's a **queryable database on Ethereum**; data expires by design.

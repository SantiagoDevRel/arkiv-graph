# arkiv-graph: consumer guide

Read [README.md](./README.md) for installation, API examples, compatibility,
limitations and troubleshooting. This guide is the integration contract, not a
second copy of the README. These packages are intended for testnet use.

## Mission
Render an app's Arkiv entities as a graph and/or tables. Use `buildGraph`,
`buildTables`, `fetchArkivGraph` from `arkiv-graph`, and `ArkivGraph`/`ArkivTables`
from `arkiv-graph/react`. Reuse these functions; do not implement another renderer
or infer a relational database that Arkiv does not provide.

## Ask the developer
- Public owner/creator wallet address and target DB-Chain. Default: Tiramisu.
- The app namespace attribute and its exact value, plus the entity type attribute
  if it differs from `entityType`. Do not assume every app uses `project`.
- Which attributes relate entities: entity keys, stable business ids, or join
  entities. Ask for representative data/schema; do not invent relationships.
- Read-only, wallet-signed Lifetime Extension, or single-entity deletion? For writes, the developer needs
  an injected wallet and test GLM from the Hub faucet linked in the README.
  Never ask them to put a private key into frontend code or paste it into chat.

## Invariants
- Scope queries with `ownedBy` or `createdBy`. Attribute filters identify data,
  not private access; Arkiv entities are publicly readable.
- Pass the same link rules and `typeAttribute` to both builders, and carry
  `blockTiming` into tables. Follow the README's tested Tiramisu attribute schema.
- SDK compatibility is 0.8.x (tested 0.8.0). Typed attributes and new metadata are
  adapted by the library; do not convert 256-bit values to JavaScript numbers.
- Custom client/RPC requires chain identity; pass explorerUrl for custom entity
  links. Never silently mix RPC, chain id and explorers from different networks.
- React entry is client-only. Core can run server-side. Follow the Next.js
  transpilation setting in the README; test the installed package, not a workspace alias.
- Missing/expired references may produce ghost nodes. External references are
  drawn from entity attributes; no other blockchain is queried.
- Mutations are optional callbacks. Check chain, active account, owner and current
  entity liveness immediately before signing. Extension additionally requires a
  strictly later target. Deletion requires explicit confirmation of the exact
  entity key; no implicit cascade or promise to erase historical copies.
- SDK 0.8 extension sets `expires` to a future block/date; it is not additive.
  Only show success after confirmation. Keep a transaction hash if confirmation
  is uncertain, and refetch after confirmed changes.

## Verify the integration
From a clean directory follow the README read example. Confirm ESM and TypeScript
imports. Use the README's scoped SDK count example to compare the source with
the fetched entities and table output; never compare a wallet query with the
whole-network `getEntityCount()`. Check public scope,
empty/error states, and truncated results. For React inspect rendered narrow,
intermediate and wide layouts. Wallet tests must cover rejection, wrong account,
wrong owner/network, confirmed expiry change and confirmed deletion of a disposable
entity created for the test. Never delete existing developer data as a test. Report mocks separately from
real Tiramisu evidence. Legitimate missing inputs are questions, not assumptions.

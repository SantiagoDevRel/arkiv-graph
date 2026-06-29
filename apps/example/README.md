# @arkiv-graph/example

The live showcase for [`arkiv-graph`](../../packages/arkiv-graph): **https://arkiv-graph-example.vercel.app**

A tiny social app — **Arkiv Social** — whose users, posts, comments, follows and likes live entirely as entities on an **Arkiv testnet** (Braga today). The page reads them back and renders them two ways — a **Graph** view (`<ArkivGraph>`, drag a node to pin it) and a **Tables** view (`<ArkivTables>`, a Supabase-like browser) — toggle between them. From the Tables view you can **extend** an entity's expiry or **delete** it, and **post** new ones — all signed by your **own wallet** (connect MetaMask), and only by the entity's owner. A few entities reference other chains (an NFT pfp on Base, a mint on Ethereum, a tip on Optimism) so you can see external-chain nodes.

**Network is plug-and-play:** Braga is the default; set `ARKIV_CHAIN_ID` + `ARKIV_RPC_URL` + `ARKIV_EXPLORER_URL` together (see [`.env.local.example`](./.env.local.example)) to point at the next testnet — no code change. Partial config fails loudly rather than silently mixing networks.

## Run locally

```bash
# from the repo root
pnpm install
cp apps/example/.env.local.example apps/example/.env.local   # add a Braga burner PRIVATE_KEY
pnpm seed          # one batch tx → ~56 entities on Braga (skips if already seeded)
pnpm dev           # → http://localhost:3012
```

## Data model (the link rules live in `src/lib/arkiv.ts`)

| entityType | key attributes | becomes |
| --- | --- | --- |
| `user` | `handle`, `community`, optional `pfpChainId/pfpContract/pfpTokenId` | a node (+ external Base nodes for pfps) |
| `post` | `postId`, `authorHandle`, optional `topic`, optional `mintChainId/mintTx` | a node, edge → author (+ external Ethereum node for the mint) |
| `comment` | `commentId`, `postId`, `authorHandle` | a node, edges → post + author |
| `tip` | `postId`, `authorHandle`, `tipChainId`, `tipTx` | a node, edge → post (+ external Optimism node) |
| `follow` | `followerHandle`, `followeeHandle` | **collapsed into** a user→user edge |
| `like` | `byHandle`, `postId` | **collapsed into** a user→post edge |

References resolve by **stable business id** (`handle`, `postId`) so the whole dataset seeds in a single `mutateEntities` batch — no need to know on-chain keys first.

## Reads (server) + writes (your wallet)

- `GET /api/graph` — the only API route. Reads the demo (`project` + `createdBy`) server-side and returns the built graph. `?address=0x…` graphs any wallet's entities instead. No signing key needed.
- **Writes are client-side.** From the Tables view you can **extend** or **delete** an entity, and you can **post** a new one — each is signed by the visitor's **own wallet** (viem + injected `window.ethereum`) in `src/lib/wallet-client.ts`. No server key, no write endpoint. Ownership is enforced by the chain (a non-owner is told so before any wallet prompt), and the client writes to the **same network the server reads from** (the resolved chain is passed to the browser via `page.tsx`).

## Deploy notes

- Vercel project `arkiv-graph-example` (team `santiago-hobby`). The deployed app needs only **`TRUSTED_ADDRESS`** (the demo read scope) + optionally `ARKIV_PROJECT` and the `ARKIV_*` network vars. It does **not** need `PRIVATE_KEY` or `ENABLE_WRITES` — those are gone; writes are wallet-signed and seeding is local.
- The data already lives on-chain, so prod reads the same Braga entities as local — no separate prod seed needed.
- `PRIVATE_KEY` (local only) is a throwaway testnet burner for `pnpm seed`. Never a mainnet key.

# @arkiv-graph/example

The live showcase for [`arkiv-graph`](../../packages/arkiv-graph): **https://arkiv-graph-example.vercel.app**

A tiny social app — **Arkiv Social** — whose users, posts, comments, follows and likes live entirely as entities on the **Braga testnet**. The page reads them back and renders them with `<ArkivGraph>`. A few entities reference other chains (an NFT pfp on Base, a mint on Ethereum, a tip on Optimism) so you can see external-chain nodes.

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

## Endpoints

- `GET /api/graph` — reads the demo (`project` + `createdBy`) and returns the built graph. `?address=0x…` graphs any wallet's entities instead.
- `POST /api/post` — creates one `post` entity on Braga, signed by the server burner. **Hardened:** gated by `ENABLE_WRITES`, per-IP + global rate limits, a write mutex (nonce safety), 240-char cap, and a server-set schema (the client controls only `text` + an allowlisted `handle`).

## Deploy notes

- Vercel project `arkiv-graph-example` (team `santiago-hobby`). Env: `PRIVATE_KEY`, `TRUSTED_ADDRESS`, `ARKIV_PROJECT`, `ENABLE_WRITES=1`.
- The data already lives on-chain, so prod reads the same Braga entities as local — no separate prod seed needed.
- Throwaway testnet burner only. Never a mainnet key.

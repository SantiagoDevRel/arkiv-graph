# AGENTS.md — arkiv-graph (repo)

This repo has two things:
1. **`packages/arkiv-graph`** — the publishable library. **Its integration guide for AI assistants is [`packages/arkiv-graph/AGENTS.md`](./packages/arkiv-graph/AGENTS.md)** — read that to help someone *use* the library in their app.
2. **`apps/example`** — the live showcase deployed at https://arkiv-graph-example.vercel.app.

If you're working ON this repo (not just consuming the library), here's what you need.

## Architecture
- The library core (`packages/arkiv-graph/src/*.ts`, no UI deps) builds `{ nodes, edges }` from Arkiv entities via **link rules**. The React layer (`src/react/*`) renders it with `react-force-graph-2d` (loaded client-side). `<ArkivTables>` also renders optional, signing-agnostic **Extend/Delete** actions (see `packages/arkiv-graph/AGENTS.md`).
- The showcase **reads** Arkiv server-side (`apps/example/src/lib/arkiv.ts` is `server-only`; `/api/graph` only) and **writes client-side**: `apps/example/src/lib/wallet-client.ts` signs `extendEntity`/`deleteEntity`/`createEntity` with the **visitor's own wallet** (viem + injected `window.ethereum`). No private key is in the app or the client bundle. The burner `PRIVATE_KEY` is used only by `scripts/seed.mjs` to seed the demo.

## Commands
```bash
pnpm install
pnpm build:lib      # tsup → packages/arkiv-graph/dist (the showcase consumes this)
pnpm test           # vitest (library logic)
pnpm seed           # seed the demo into Braga (needs apps/example/.env.local)
pnpm dev            # showcase on :3012
pnpm build          # build lib + showcase
```

## Hard invariants — don't break these
- **Build the lib before the app.** `apps/example` consumes `arkiv-graph`'s `dist`. `pnpm build` / the app's `prebuild` handle this; if you edit the lib, rebuild it.
- **`server-only`** must stay on `src/lib/arkiv.ts` — the `PRIVATE_KEY` (seed/read scope) must never reach the client bundle. `wallet-client.ts` is client-side and holds **no** key (it signs via the user's injected wallet). Never import `arkiv.ts` into a client component.
- **Writes are client-signed.** Extend/delete/post go through the visitor's own wallet (`wallet-client.ts`). Ownership is the chain's job — pre-check `getEntity(key).owner` and surface a friendly "not the owner" error before prompting the wallet. Don't reintroduce a server signing endpoint.
- **Cost shown must be accurate** — read it from the receipt (`gasUsed × effectiveGasPrice` + the `ArkivEntityBTLExtended` `cost`), never a pre-tx guess.
- **Scope reads** with `createdBy`/`ownedBy` — shared public DB.
- **Node 20–22** for the seed script (SDK hangs writes on Node 24).
- **Messaging:** Arkiv is a *queryable database on Ethereum*. Never "decentralized/trustless/permanent"; frame expiry as cost-efficiency.

## What to ask the maintainer
- The deploy target (Vercel project `arkiv-graph-example`, team `santiago-hobby`) and whether `TRUSTED_ADDRESS` is set there (the demo's read scope). The deployed app no longer needs `PRIVATE_KEY` or `ENABLE_WRITES` — writes are signed by the visitor's wallet; the burner key is only for local seeding.
- Whether to publish a new library version to npm (and the npm auth for it).

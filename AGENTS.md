# AGENTS.md — arkiv-graph (repo)

This repo has two things:
1. **`packages/arkiv-graph`** — the publishable library. **Its integration guide for AI assistants is [`packages/arkiv-graph/AGENTS.md`](./packages/arkiv-graph/AGENTS.md)** — read that to help someone *use* the library in their app.
2. **`apps/example`** — the live showcase deployed at https://arkiv-graph-example.vercel.app.

If you're working ON this repo (not just consuming the library), here's what you need.

## Architecture
- The library core (`packages/arkiv-graph/src/*.ts`, no UI deps) builds `{ nodes, edges }` from Arkiv entities via **link rules**. The React layer (`src/react/*`) renders it with `react-force-graph-2d` (loaded client-side).
- The showcase reads/writes Arkiv **server-side only** (`apps/example/src/lib/arkiv.ts` is `server-only`). The browser never sees the private key. `/api/graph` reads; `/api/post` writes (gated by `ENABLE_WRITES`, rate-limited, schema-locked).

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
- **`server-only`** must stay on `src/lib/arkiv.ts` and the API routes' imports — the `PRIVATE_KEY` must never reach the client bundle. The client (`showcase.tsx`) talks only to `/api/*`.
- **Writes are guarded.** `/api/post` sets all attributes server-side; the client controls only `text` + an allowlisted `handle`. Keep the rate-limit + mutex + `ENABLE_WRITES` gate (`src/lib/guards.ts`). The signing key is a valueless testnet burner.
- **Scope reads** with `createdBy`/`ownedBy` — shared public DB.
- **Node 20–22** (SDK hangs writes on Node 24).
- **Messaging:** Arkiv is a *queryable database on Ethereum*. Never "decentralized/trustless/permanent"; frame expiry as cost-efficiency.

## What to ask the maintainer
- The deploy target (Vercel project `arkiv-graph-example`, team `santiago-hobby`) and whether `PRIVATE_KEY` / `ENABLE_WRITES` / `TRUSTED_ADDRESS` env vars are set there.
- Whether to publish a new library version to npm (and the npm auth for it).

# arkiv-graph

**See your [Arkiv](https://docs.arkiv.network) database as a live graph.** A drop-in library + a real, on-chain showcase.

- 📦 **Library** ([`packages/arkiv-graph`](./packages/arkiv-graph)) — `npm i arkiv-graph`. Turns Arkiv entities into an interactive **force-directed graph** (drag a node to pin it) **or a Supabase-like tables view**. Nodes/rows are entities; edges/foreign-keys are the relationships you define; references to other chains appear as external nodes (drawn without reading those chains).
- 🌐 **Showcase** ([`apps/example`](./apps/example)) — **https://arkiv-graph-example.vercel.app**. A tiny social app (users, posts, comments, follows, likes) stored **entirely on an Arkiv testnet** (Braga today), visualized with the library — Graph **and** Tables views. From the Tables view you can **extend** or **delete** any entity, and **post** new ones — every write is signed by **your own wallet** (viem + MetaMask), never a server key. Only an entity's owner can change it; a non-owner gets a clear "you're not the owner" message.

![arkiv-graph graph view](./docs/screenshot.png)
![arkiv-graph tables view](./docs/tables.png)

> **Network plug-and-play:** Arkiv testnets rotate (Braga is sunset ~mid-2026). Nothing is hardcoded to one network — swapping is an **env/config change**, never a code edit. See [Pointing at a different Arkiv network](./packages/arkiv-graph/README.md#pointing-at-a-different-arkiv-network-plug-and-play) and the [`.env.local.example`](./apps/example/.env.local.example).

## Why

The Arkiv entity explorer is a flat list — you can't *see* how records relate or spot clusters. And because Arkiv has no joins, the data model is invisible until you draw it. `arkiv-graph` makes the relationships you've designed visible, debuggable, and demoable — and shows where your data reaches into other chains.

## Monorepo layout

```
arkiv-graph/
├─ packages/arkiv-graph/   # the published library (core + /react)
│  ├─ src/                 # buildGraph, link rules, external detection, fetch, <ArkivGraph>
│  └─ README.md            # ← library docs (install, API, link-rule cookbook)
├─ apps/example/           # the Next.js showcase (arkiv-graph-example.vercel.app)
│  ├─ src/app/             # page, showcase client, /api/graph (read-only)
│  ├─ src/lib/             # arkiv.ts (server reads) + wallet-client.ts (client-side writes via the user's wallet)
│  └─ scripts/seed.mjs     # seeds the social demo into Braga (one batch tx, burner-signed)
└─ docs/
```

## Develop

```bash
pnpm install
pnpm build:lib                 # build the library (tsup → dist)
pnpm test                      # library unit tests (vitest)

# showcase:
cp apps/example/.env.local.example apps/example/.env.local   # add a Braga burner PRIVATE_KEY
pnpm seed                      # seed the demo into Braga (skips if already seeded; --reseed to rebuild)
pnpm dev                       # → http://localhost:3012
```

The `PRIVATE_KEY` is a **throwaway Braga testnet burner** used only to **seed** the demo and as the read scope — the running app never signs with it. **Live writes (extend / delete / post) are signed by the visitor's own wallet** (viem + MetaMask), so no private key is ever in the app or the browser bundle. Never use a mainnet key. Get test GLM (for the burner to seed, and for your own wallet to write) at the [Braga faucet](https://braga.hoodi.arkiv.network/faucet/).

## Library in 10 lines

```tsx
import { fetchArkivGraph } from "arkiv-graph";
import { ArkivGraph } from "arkiv-graph/react";

const { graph } = await fetchArkivGraph({
  project: "my-app",
  createdBy: "0xYourWallet",
  links: [
    { type: "reference", attribute: "authorKey", targetType: "user", label: "by" },
    { type: "join", entityType: "like", sourceAttr: "userKey", targetAttr: "postKey", label: "likes" },
  ],
});
// <ArkivGraph data={graph} height={600} />
```

Full docs: [`packages/arkiv-graph/README.md`](./packages/arkiv-graph/README.md) · LLM integration guide: [`AGENTS.md`](./AGENTS.md).

## License

MIT © Arkiv DevRel

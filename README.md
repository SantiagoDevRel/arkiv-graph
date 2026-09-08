# arkiv-graph

Interactive graphs and tables for Arkiv entities. Define relationships once,
inspect your app data in either view, and optionally wire wallet-signed Lifetime
Extension. **These packages are intended for testnet use.**

This branch contains the **0.3.0 release candidate**, not a published release.
npm and the hosted sample still serve the older release. See the verification
report below for the remaining publication gates.

- [npm package](https://www.npmjs.com/package/arkiv-graph)
- [Package README: install, API, compatibility, examples](./packages/arkiv-graph/README.md)
- [Sample app: clean checkout and wallet workflow](./apps/example/README.md)
- [Hosted sample](https://arkiv-graph-example.vercel.app)
- [Verification evidence and release status](./docs/verification.md)
- Agent guides: [package consumer](./packages/arkiv-graph/AGENTS.md),
  [sample consumer](./apps/example/AGENTS.md), [repo maintainer](./AGENTS.md).
  Give the relevant guide to your agent explicitly; npm installation does not
  automatically load instructions from node_modules.

## Run the sample

Node.js 22, pnpm 9:

```bash
pnpm install --frozen-lockfile
pnpm build:lib
pnpm dev
```

Open http://localhost:3012. This candidate currently links the workspace package;
switching to the exact published npm version is a required release gate.
No env file or signing key is required to run/read it.
Connect an injected wallet and use test GLM to create your own social sample on Tiramisu.

## Develop the library

```bash
pnpm build:lib
pnpm test
pnpm test:wallet
pnpm typecheck
pnpm build
```

`packages/arkiv-graph` holds the core and React entry; `apps/example` holds the
consumer dapp. For release, verify a tarball in a disposable consumer, publish,
then replace the sample's workspace dependency with the exact npm version.
See the verification document for the actual published status and evidence.

MIT · Arkiv DevRel

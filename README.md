# arkiv-graph

Interactive graphs and tables for Arkiv entities. Define relationships once,
inspect your app data in either view, and optionally wire wallet-signed Lifetime
Extension and single-entity deletion. **These packages are intended for testnet use.**

**arkiv-graph@0.3.0 is published on npm.** The sample pins that registry release.
The hosted sample still serves the older release; use the local sample below.
See the verification report for evidence and the remaining public demo gates.

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
pnpm dev
```

Open http://localhost:3012. The sample consumes `arkiv-graph@0.3.0` from npm.
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
consumer dapp. For a new release, verify a tarball in a disposable consumer,
publish, then update the sample's exact npm version and lockfile.
See the verification document for the actual published status and evidence.

MIT · Arkiv DevRel

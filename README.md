# arkiv-graph

Interactive graphs and tables for Arkiv entities on Rabdi, the DB-Chain testnet for the Web3 database. Declare relationships once and inspect the same model in both views. Optional callbacks support wallet-signed Lifetime Extension and single-entity deletion.

**1.0.0 is a release candidate, not a published npm release.** It targets `@arkiv-network/sdk@1.0.0`. Publication and production promotion require a separate approval. These packages are intended for testnet use.

- [Package API and integration](packages/arkiv-graph/README.md)
- [Social sample and setup](apps/example/README.md)
- [Candidate verification](docs/release-1.0.0.md)
- [Breaking changes](CHANGELOG.md)
- [Official brand asset provenance](docs/brand-assets.md)

## Development

Use Node.js 22 and pnpm 9. Heavy checks run on the DGX in the maintainer environment.

```sh
pnpm install --frozen-lockfile
pnpm build:lib
pnpm test
pnpm test:wallet
```

The versioned sample consumes a pinned published npm release. Before publication, run `scripts/pack-consumer.mjs` and `scripts/verify-sample.mjs` with a managed `TMPDIR`: these install the verified candidate tarball into an isolated staging directory and run the full workspace typecheck/build there. The preview uses that installed artifact, never workspace source imports. After publication, update the sample's exact registry pin and lockfile and verify a clean registry consumer; normal `pnpm typecheck` / `pnpm build:example` then use that registry version.

The sample server requires `ARKIV_ACCESS_KEY`, obtained from [Access Keys](https://hub.arkiv.network/access-keys). Keep it server-side. Visitors configure their own Rabdi RPC in their wallet; test funds come from the [Hub faucet](https://hub.arkiv.network/faucet). No application signing key is needed.

## Seed after a network reset

`scripts/seed-rabdi.mjs` is maintainer-only, idempotent by owner/project/sample identifier, and excluded from deploys and npm. Inject the authorized GRAPH test wallet through the external secret runner. Set `GRAPH_SEED_JOURNAL` to a persistent absolute path outside the repository. Existing entities are queried before signing; uncertain or successful previous submissions are never blindly repeated. See the sample guide for the exact command.

The seed starts with at most ten entities per batch, estimates the exact unsigned transaction at `latest` and uses `max(1_000_000, 2 × estimate)` gas. Split before signing until each batch fits within half the head block gas limit. Never set gas at or near the full block limit; confirm and journal each batch before advancing its nonce.

Agent instructions: [maintainer](AGENTS.md), [package](packages/arkiv-graph/AGENTS.md), [sample](apps/example/AGENTS.md). Historical reports in `docs/` describe their original release only.

MIT · Arkiv DevRel

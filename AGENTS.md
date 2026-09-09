# arkiv-graph: maintainer guide

This repo contains a publishable library (`packages/arkiv-graph`) and a consumer
sample (`apps/example`). Read the [root README](./README.md), the
[package consumer guide](./packages/arkiv-graph/AGENTS.md), and the
[sample guide](./apps/example/AGENTS.md). Commands and compatibility live in the
READMEs; current release evidence lives in `docs/release-0.3.1.md` and historical
checkpoints in `docs/verification.md`.

## Maintainer invariants
- The sample pins the published npm package. Do not ship `workspace:*` or local
  library imports as a substitute for checking a clean consumer.
- SDK 0.8 changed queries, typed attributes, metadata and mutation encoding.
  Inspect the actual installed SDK, not historical 0.6 snippets.
- Server reads are public, scoped, bounded and no-store. There is no server
  signing endpoint. Visitor writes are wallet-signed, checked for active account,
  network and owner; confirmed receipts precede success/refetch.
- Never load a private key in application code. Optional maintainer seed scripts
  require an explicitly authorized wallet and secret file outside the repo.
  Exclude scripts, environment files and credentials from deploys and npm packs.
- Core remains framework-agnostic; React exports preserve use-client. Keep both
  graph and tables based on the same link rules and normalized entity data.
- Preserve public API compatibility for legacy plain entities where possible,
  but do not claim unsupported legacy SDK clients work with fetchArkivGraph.
- Before release: tests, typecheck/build, actual npm tarball consumer imports,
  real Tiramisu reads/writes, wallet rejection/race tests and rendered narrow,
  medium/wide UI. Label mocked evidence separately. Update verification status.
- Brand copy: the Web3 database / Arkiv entities / Entity Expiration / Lifetime
  Extension. Never use retired network claims or prohibited lifetime acronyms.
- No private keys, credentials or secrets in logs, bundles, docs or package files.
- Ask for npm authentication only when missing; never claim a local version is
  published. Demo publication requires the applicable brand review.

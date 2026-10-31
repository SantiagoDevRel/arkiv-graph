# arkiv-graph: maintainer guide

This repo contains a publishable library (`packages/arkiv-graph`) and a consumer
sample (`apps/example`). Read the [root README](./README.md), the
[package consumer guide](./packages/arkiv-graph/AGENTS.md), and the
[sample guide](./apps/example/AGENTS.md). Commands and compatibility live in the
READMEs; current release evidence lives in `docs/release-1.0.0.md` and historical
checkpoints in `docs/verification.md`.

## Maintainer invariants
- The sample pins the published npm package. Do not ship `workspace:*` or local
  library imports as a substitute for checking a clean consumer.
  Before publication, verify the packed candidate in an isolated sample staging
  directory; never commit the staging tarball dependency. After publication,
  update the exact registry pin and lockfile and repeat the registry consumer check.
- SDK 1.0 uses schema columns, $-prefixed row metadata and offset pagination.
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
  real Rabdi reads/writes, wallet rejection/race tests and rendered narrow,
  medium/wide UI. Label mocked evidence separately. Update verification status.
- Brand copy: the Web3 database / Arkiv entities / Entity Expiration / Lifetime
  Extension. Never use retired network claims or prohibited lifetime acronyms.
- No private keys, credentials or secrets in logs, bundles, docs or package files.
- Ask for npm authentication only when missing; never claim a local version is
  published. Demo publication requires the applicable brand review.

Rabdi signing: read latest state; pass explicit nonce, gas (max of 1,000,000 and twice an unsigned latest estimate, never above half the head block limit; split batches before signing) and gasPrice. Check receipt.status === "success"; never retry a successful or uncertain write. Shared RPC keys stay server-side; visitor writes use the RPC configured in their wallet.

Rabdi lifetime targets must stay below 7,884,000 blocks from the head (use a signing margin). No permanent/no-expiration mode; use Lifetime Extension for longer retention.

Release status: arkiv-graph@1.0.0 is published for SDK 1.0.0 / Rabdi. This branch prepares 1.1.0; it has not been published. Samples retain their exact registry pins until the phase-2 release sequence.

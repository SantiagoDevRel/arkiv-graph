# Verification — arkiv-graph 0.3.0

Release candidate, checked on 2026-09-08. **These packages are intended for testnet use.**

## Release status

- Local candidate: `arkiv-graph@0.3.0`, branch `feat/tiramisu-dashboard`.
- npm currently publishes `0.2.0`; `0.3.0` is not published yet. npm login is required.
- The sample currently uses the local candidate during development. Before release,
  replace its workspace dependency with the published, exact `0.3.0` version and
  regenerate the lockfile. A local tarball test is not evidence of npm publication.
- The existing hosted sample still uses the earlier release/network. It has not
  been updated to the candidate. Use localhost:3012 for the current work.
- The candidate branch opts out of automatic Vercel deployment in `vercel.json`,
  so publishing its source does not publish an unverified app. This is scoped
  only to the new `feat/tiramisu-dashboard` branch; other branches retain their
  existing behavior ([Vercel configuration](https://vercel.com/docs/project-configuration/git-configuration)).
- The requested sample owner has no active sample entities yet. Its creation and
  a real Lifetime Extension require the owner's signature. No success is claimed.

## Versions actually exercised locally

| Component | Version |
| --- | --- |
| Node.js | 22.22.3 |
| pnpm | 9.12.3 |
| TypeScript | 5.9.3 |
| Arkiv SDK | 0.8.0 |
| viem | 2.56.3 |
| React / React DOM | 19.2.7 |
| Next.js | 15.5.25 |
| react-force-graph-2d | 1.29.1 |
| Vitest | 2.1.9 |
| Network | Tiramisu testnet, chain ID 7738577 |

Other SDK generations, runtime majors and networks are not verified by this candidate.

## Evidence collected

- `pnpm test`: 26 passing core tests, including SDK 0.8 typed attributes,
  preservation of large integers, expiry conversion, scoped queries, SDK cursor
  pagination and exact-limit versus truncated results.
- `pnpm test:wallet`: 8 passing tests with mocked signing/RPC. They cover absolute
  expiry blocks, ownership, expired/stale targets, changed account/network,
  rejected signing, duplicate seed protection and pending recovery. These are
  not evidence of a real MetaMask transaction.
- `pnpm typecheck`: package and sample pass.
- `pnpm build:lib`: ESM, CommonJS and TypeScript declarations build successfully;
  React entry points retain `"use client"`.
- Public Tiramisu RPC returns the configured chain ID. The requested public owner
  query returns an empty result; the API and empty UI agree.
- Browser checks use isolated Playwright contexts: tables at 390/600/601/768/900/901/1440px, graph at 390/768/1440px; no document overflow or page errors. Loaded data is a controlled fixture built from the sample dataset: 35 entities, 20 graph nodes (join entities collapse to edges), 35 relationships, 5 tables. This is not proof of chain creation.
- Empty/disconnected, loading, RPC error, retry, invalid owner input, connected-wallet extension dialog, focus containment, failed entity read without a send, detail view, 200% zoom and rejected connection were checked. The rendered errors do not claim a confirmed write.
- Sample production build succeeds (Next.js 15.5.25). Development output is isolated in `.next-dev` so builds do not corrupt the preview.
- Hub candidate: typecheck/lint pass; 194 unit tests pass, including candidate gating; 4 existing Tools Playwright tests pass against localhost:3014 in isolated desktop/mobile contexts. Production build succeeds; local auth remains unconfigured and emits Better Auth warnings. No auth or backend changes were made. Card and expanded agent prompt inspected at 390/768/1440px. The final candidate copies only the agent prompt; unpublished npm actions are disabled. The production HTML contains the empty catalog and no candidate install or localhost link.
- npm pack contains both consumer guides and ESM/CJS/type artifacts. A fresh Claude consumer, given only the packed artifact and consumer guides, installed it outside the repository and verified ESM, CommonJS, React SSR, strict TypeScript (`skipLibCheck: false`), the offline `2 1 2` result, scope rejection and a real empty Tiramisu read. This is tarball evidence, not registry publication. Its documentation findings were addressed: helper signatures, an explicit scoped SDK count example and honest empty output. The added SDK count example was executed verbatim and returned `0`.
- Production dependency audits: both the sample/workspace (`pnpm audit --prod --json`) and clean consumer (`npm audit --omit=dev --json`) report zero known vulnerabilities. The sample was updated to Next.js 15.5.25, with patched PostCSS, nanoid and sharp resolutions. This is a dependency advisory check, not a claim that all security risks are eliminated.
- Claude Design produced a reference using the Arkiv Design System. The sample reuses its compact composition and the existing library renderer; fixture data is never returned by the real API.
- The Tiramisu Block Explorer responds at
  `https://indexer.tiramisu.db-chain.testnet.arkiv.network`. Its deployed frontend
  supports `/entity/:key`, `/tx/:hash` and `/data?q=...`. Its separate indexed
  transaction/history data may lag the RPC. The old guessed explorer hostname
  did not resolve and was removed.
- Claude performed an initial technical audit. Corrections include SDK 0.8 expiry
  semantics, typed payload serialization, declared script dependencies, peer type
  dependencies, pending transaction recovery and explorer URLs. Final audit and follow-up results are listed below.

## Remaining release checks

Clean consumer installation/imports from npm, real creation and extension,
hosting request limits and a matching hosted demo must be verified before marking
this candidate complete or publishing its hub card. Brand alignment for a public
frontend release also remains required by the project rules.

The hub worktree inherits Next.js 16.2.6 from its base branch; current security
advisories include fixes in 16.2.11. Updating the shared hub runtime is a separate
follow-up, outside this card change. The graph sample itself uses the patched
15.5.25 release. No hub deployment is included in this candidate.

## Reproduce

Follow the [package README](../packages/arkiv-graph/README.md) for a standalone
consumer and the [sample README](../apps/example/README.md) for the browser flow.
No credentials are included in this repository or this evidence.

## Final Claude audit (2026-09-08)

Claude Code completed a direct technical review, a dedicated security/logic review,
and a UI/UX review of source plus seven rendered screenshots. The initial four
background reviewers did not finish and are not counted as completed. Claude's
completed reviews found no secret-exposure or signing-authorization blocker in the
reviewed paths. They did not perform real wallet transactions.

Corrections: legacy rendered vocabulary and declaration comments; candidate caveats
in every install entry; seed help exits nonzero without claiming a write; one
assertive error message in the action dialog; submitted transaction links retained
there; 44px row actions, pinned action column, wrapped entity-type tabs and a
viewport-wide modal backdrop. Confirmed-but-absent sample queries now fail closed
instead of allowing a second batch. A regression test covers delayed reads.

The hub candidate is excluded from production builds. Locally it links to the
local sample, labels the unpublished install without a copy action, and omits the
nonexistent npm version link. The agent prompt remains copyable and first checks
publication. Source/documentation links use the immutable `v0.3.0-rc.1` source tag.

Accepted scope limits: the reused library's English labels remain unchanged; the
sample workflow is Spanish. No translation API was added. Legacy exported helper
identifiers are retained for compatibility; prose uses Entity Expiration. There is
no cross-device transaction uniqueness guarantee. The public hosting rate-limit
control remains a release requirement; no new auth/infra feature was introduced.

Renderer inspection found no `dangerouslySetInnerHTML`; entity labels, attributes
and payloads render as React text or canvas text. Explorer URLs are built from
configured registries and validated entity/address/hash values. Custom graph URLs
and callback results are developer-controlled integration inputs, not trusted
wallet data. This check does not claim an exhaustive security proof.

Focused Claude rechecks confirmed the authorization controls remained intact and
verified the error, modality, touch-target, sticky-column and candidate-card fixes.
Security review accepted the documented manual recovery requirement after all
sample entities expire. UI review re-opened three corrected screenshots; the main
agent reran isolated browser probes and screenshots at 390/768/1440 plus 639/640
and 1279/1280 for the hub. The final prompt stacks its copy control above the text
on narrow screens. All seven hub widths have no document overflow.

The final rebuilt tarball was installed in another fresh consumer after the UI
corrections: ESM/CJS, SSR (7889 characters), strict TypeScript and the real empty
Tiramisu read pass. The coverage-only Codex wrapper returned a summary but its
requested per-item retry timed out; the main agent completed the literal checklist
manually. This does not replace the completed Claude reviews or executable checks.

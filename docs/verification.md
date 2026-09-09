# Verification — arkiv-graph 0.3.0

> Historical checkpoints below retain their status at the time. **0.3.1 is now
> published and deployed on Tiramisu.** See [current release evidence](./release-0.3.1.md).

Published npm release, checked on 2026-09-08. **These packages are intended for testnet use.**

## Release status

- Published: `arkiv-graph@0.3.0`, source branch `feat/tiramisu-dashboard`.
- npm registry version and artifact integrity were verified after publication.
  SHA1: `e5f5e8929cdbebfc296f264500342214a5e6210c`.
- The sample pins the published `0.3.0` package. Its lockfile contains the registry
  integrity, workspace auto-linking is disabled, and the actual import resolves
  inside `node_modules/arkiv-graph`, not the local library source.
- The existing hosted sample still uses the earlier release/network. It has not
  been updated to the candidate. Use localhost:3012 for the current work.
- The candidate branch opts out of automatic Vercel deployment in `vercel.json`,
  so publishing its source does not publish an unverified app. This is scoped
  only to the new `feat/tiramisu-dashboard` branch; other branches retain their
  existing behavior ([Vercel configuration](https://vercel.com/docs/project-configuration/git-configuration)).
- The requested owner now has 35 active sample entities. Creation and one
  Lifetime Extension were confirmed through the real connected Rabby wallet.
  No private key was configured. See the transaction evidence below.

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
- `pnpm test:wallet`: 10 passing tests with mocked signing/RPC. They cover absolute
  expiry blocks, ownership, expired/stale targets, changed account/network,
  rejected signing, duplicate seed protection, pending recovery, exact-calldata
  simulation, gas estimation and account changes during simulation. These are
  not evidence of a real MetaMask transaction.
- `pnpm typecheck`: package and sample pass.
- `pnpm build:lib`: ESM, CommonJS and TypeScript declarations build successfully;
  React entry points retain `"use client"`.
- Public Tiramisu RPC returns the configured chain ID. The requested public owner
  query initially returned an empty result; after creation the RPC, API and UI
  agree on 35 entities. The changed expiry also matches all three layers.
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

Hosting request limits and a matching hosted demo must be verified before
publishing the Hub card. Brand alignment for a public
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

The Hub card remains excluded from production builds. Locally it links to the
local sample and offers the published npm install command and agent prompt as
copy actions. Source/documentation links use `v0.3.0`. Earlier `rc.1` and `rc.2`
tags are preserved as historical evidence.

Accepted scope limits: the reused library's English labels remain unchanged; the
sample workflow now also uses English, as requested. No translation API was added. Legacy exported helper
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

## Earlier rc.1 source handoff and clean checkout

- Graph/sample source: commit `7487fc1`, immutable tag `v0.3.0-rc.1`, pushed to
  `SantiagoDevRel/arkiv-graph`. Hub candidate: `e73e8f5` on
  `Arkiv-Network/arkiv-hub` branch `feat/tools-arkiv-graph`. No PR or deployment.
- Tag source, package README and consumer AGENTS links return HTTP 200.
- A fresh clone of the public tag passed `pnpm install --frozen-lockfile` and
  `pnpm build:lib`. It contained no `.env.local`. Its Next.js 15.5.25 dev server
  returned HTTP 200 and the real scoped API returned zero entities/nodes/tables;
  an isolated 390px browser confirmed the matching empty DOM, no overflow and no
  page errors. Port 3016 was used only to avoid the existing preview on 3012,
  then the disposable server was stopped.
- Claude's final UI closure opened the updated 390/768 screenshots and confirmed
  the mobile prompt, tag URLs and prior fixes. The review is closed; the release
  remains blocked by the explicit gates above.
- At the rc.1 checkpoint, npm latest was `0.2.0` and `npm whoami` returned
  `ENEEDAUTH`; no transactions had been submitted at that point. Subsequent real
  wallet verification is recorded below. Main review servers remain on
  localhost:3012 and localhost:3014/tools.


## Real wallet and Tiramisu verification (rc.2)

Verified on 2026-09-08 using the connected Rabby EIP-1193 wallet, owner
`0xa618a2736431f24c26f1c8dac9ca00ecc845a1c6`, chain `7738577`, app
`project = arkiv-graph-social-v2`. No private signing key or signing API was used.
MetaMask's actual extension UI was not exercised; mocked EIP-1193 tests cover
its shared interface, network switching and rejection paths.

| Operation | Confirmed transaction | Block | Gas used |
| --- | --- | --- | --- |
| Create social sample | [0x9cb826…2eeaa](https://indexer.tiramisu.db-chain.testnet.arkiv.network/tx/0x9cb8265153434717a45f09accba557bff27dbf714c59bcc8df5b0933b1a2eeaa) | 192148 | 3504560 |
| Lifetime Extension | [0xe8b3e1…d17e0](https://indexer.tiramisu.db-chain.testnet.arkiv.network/tx/0xe8b3e1b99b0e83f194e883db0ad3c930b0fa8171c33c98cde34ac301a0cd17e0) | 192198 | 25240 |

Both receipts have status `success`. The source query returns 6 users, 8 posts,
6 comments, 7 follows and 8 likes. The API and rendered dashboard show 35 entities,
20 graph nodes, 35 relationships and 5 tables, without relationship warnings.
The graph collapses join entities into edges; node count is not entity count.

Entity `0xd4fc7c76c9c48badf8ff70cbacf5c362fa9c3dacff3b6d840ac879a371bc7b3d`
changed from expiration block `1488148` to `2784148` (+1296000 blocks).
The SDK read, API and table agree: October 8 to November 7, 2026, approximately
13:37 Colombia time. These dates remain block-time estimates.

The real pre-sign check found two issues that mocks had not exposed:

- Tiramisu rejects uppercase custom attribute names (`Ident32InvalidByte`), even
  though SDK 0.8 accepts them while encoding. The first unsigned request was
  canceled; it spent no gas. The sample now uses lowercase snake_case attributes
  and explicitly passes `typeAttribute: "entity_type"` to the library.
- The wallet's guessed 2000000 gas limit was below the raw RPC estimate of
  3533541 for the batch. The app now simulates exact calldata before opening
  signing, supplies a buffer and rechecks the wallet session. Both actual
  requests were decoded and checked for account, chain, entity-engine target,
  zero transfer value, operation scope and sufficient gas before signing.

The legacy library default `entityType` remains for API compatibility with
in-memory/older entity data. It is not the new sample's creation schema.
The optional local seed script was not used or tested with a private key.

Real API-backed tables were rendered at 390/600/601/768/900/901/1440px and graphs
at 390/768/1440px, with no document overflow or page errors in isolated contexts.
The wallet profile injects a body attribute and triggers a React hydration warning;
isolated contexts do not reproduce it. No warning suppression was added.
Mocked error/loading/rejection/modal tests remain separate from real-chain evidence.


Claude's focused rc.2 security/logic re-audit completed with `STATUS: OK`: no
blocking regression in the lowercase schema or exact-calldata gas preflight.
Two minor observations were resolved: generic wallet error/help copy, and
independent tests for the target, nonzero value and missing calldata guards.
The reviewer checked source/tests; the main agent independently verified the
actual receipts, entity query and before/after expiry. The final 10 wallet tests
and production build passed after these corrections. Browser checks were rerun
after the build completed: rebuilding a workspace-linked library while testing
the dev server can briefly remove its dist files, so that interrupted first run
was discarded. The rerun passed without an overlay or page errors.

A second Claude consumer, given only the updated README/AGENTS and rc.2 tarball,
installed into another empty directory. After a timed-out initial run, its resumed
check executed the documented examples: offline `2 1 2`, real read of 35 entities
and five types, and independent scoped SDK count `35`. That read example uses
reference rules only, so it has 35 nodes; the full social sample additionally
uses join rules and has 20. Claude reported the README sufficient and `STATUS: OK`.
Its two minor notes are now explicit: the combined package installs renderer
dependencies even for core consumers, and the pack destination must exist.
Strict TypeScript and React SSR were covered by the earlier clean consumer;
they were not rerun by this second agent. No registry-publication claim is made.

The final sample runtime (`763d9da`) was cloned afresh from the public branch:
`pnpm install --frozen-lockfile` and `pnpm build:lib` passed, with no `.env.local`.
Its dev server on the temporary port 3016 returned the real 35-entity query;
an isolated 390px browser matched the loaded DOM, with no overflow/page errors.
The source plus documentation closure is tagged `v0.3.0-rc.2`; the earlier tag
is unchanged. Hub source is `e162165` on `feat/tools-arkiv-graph`, with the
updated candidate copy, tag links, 4 catalog tests, lint/typecheck and clipboard
checks passing. At that earlier rc.2 checkpoint no PR, npm publication or public frontend deployment had been made.

Machine-readable public transaction evidence: [tiramisu-verification.json](./tiramisu-verification.json).

## Published npm and English sample verification

The registry artifact contains 16 files, including `AGENTS.md`, its `CLAUDE.md`
pointer, README, ESM/CJS exports and TypeScript declarations. Every built runtime
file is byte-identical to the audited rc.2 artifact; the release README changed
to published installation instructions. The npm integrity is:

```text
sha512-0fLHkfyZ8OgUQ0BKOBx5SdoLZ9yhT1ksSuuxq6oGIfUdQJUayp+jop3/YAt35c9MQWoXgPEgtDQYSGwWpV8YIw==
```

A new consumer installed `arkiv-graph@0.3.0` from registry.npmjs.org. Verbatim
README examples returned offline `2 1 2`, real Tiramisu read `35` entities across
five types, and scoped SDK count `35`. ESM/CommonJS imports, React SSR (7889
characters), the client directive and strict TypeScript passed. Its production
audit and the sample production dependency audit report zero known advisories.

The sample uses the exact registry package and no prebuild of the workspace
library. A stale development junction from the earlier workspace install was
removed before checking actual resolution. Fresh installations do not contain
that junction. Package and sample typechecks, 26 core tests, 10 wallet tests and
the sample production build passed after the switch.

All sample UI, wallet/API errors, metadata and HTML language are English.
Real registry-backed tables were rechecked at 390/600/601/768/900/901/1440px and
graphs at 390/768/1440px, with no overflow or page errors. English advanced fields,
real empty query, creation confirmation and invalid API validation passed at
390/768/1440px. Mocked loading/error/rejection checks remain separate from real
wallet transaction evidence above. No new transaction was needed for the
registry switch: its package runtime is byte-identical.

Claude's final English review inspected five screenshots and found no blocker.
Its minor observation about an overly broad error assertion was corrected and
the wallet tests rerun. The Hub card's published-package/local-demo state passes
five focused catalog tests; both clipboard actions copy exact text. Layouts at
390/639/640/768/1279/1280/1440px have no document overflow.

Public deployment remains pending. The existing Vercel project's firewall was
inspected in its authenticated dashboard: Hobby plan, system mitigations active,
zero custom rules and no enforced request-limit rule. No billing or firewall
settings were changed. The required public brand alignment is also pending.

The example remains the default public read scope after wallet connection.
Visitors explicitly select **View my app**, and empty personal dashboards offer
**View public example**. Only confirmed sample creation automatically switches
to its creator. This uses the public owner address, never a shared/default signer.
The sample only supplies an extension callback when the connected wallet matches
the queried owner. Foreign-wallet examples therefore have no extension action;
the callback still rechecks the actual chain owner before requesting a signature.

Claude completed the independent registry consumer after two timed-out turns
and a final resumed report. It installed npm0.3.0 into its own clean directory,
ran the documented offline/read/count examples, checked CJS/ESM imports, and
confirmed the shipped guides. Minimal integration passed. Its additional
`exactOptionalPropertyTypes` check identified two documentation gaps: the theme
type belongs to the React entry, and optional block timing must be conditionally
passed with that compiler flag. These require a documentation patch release.
The normal strict TypeScript5.9.3 consumer passed; the agent's additional check
used TypeScript7.0.2. No extra runtime compatibility claim is made from that probe.

Claude's final publication audit independently checked registry SHA1/integrity,
actual npm resolution, and four screenshots; no blocker. Its real-catalog test
coverage observation was fixed, and five catalog tests passed. The public-example
follow-up also passed review after five more screenshots. Its expired-example
copy observation was corrected and verified with a controlled empty demo response.
Public/own/empty wallet switching passed at seven widths with real read requests,
a mocked EIP1193 account, and zero signing requests. A clean tracked-source
snapshot installed from the lockfile and ran with no env file or library dist;
its real API and 390px DOM both showed35 with no overflow or page errors.

## Documentation patch prepared (not yet published)

The earlier documentation-only0.3.1 tarball was never published and has been superseded by the full-repository audit fixes below. It fixes the React theme
type import location, documents the normalized-entity input to `detectGroups`,
and conditionally passes optional block timing in both README snippets.
TypeScript5.9.3 with strict and exactOptionalPropertyTypes passes these patterns.
Claude rechecked the documentation, identified the second snippet, and that
matching correction was applied. All dist files match published0.3.0 byte for
byte. Publication still requires npm security-key confirmation; the sample and
Hub continue to use the actually published0.3.0 until the registry confirms it.

## Full-repository audit follow-up (2026-09-08)

Claude Code and native Grok 1.0.13 (`grok-build`, Grok 4.6 on the grok.com subscription, not Cursor) independently reviewed all authored runtime source and the Tools card. Sessions: `claude-1284f1` and `grok-build-4742a1`. Both initial turns timed out; resumed turns delivered reports with explicit coverage inventories. They did not run builds, browser checks or transactions. The main agent reproduced findings and validated the fixes; the evidence is recorded below. See [full-audit.md](./full-audit.md) for status and evidence.

The local0.3.1 candidate now includes runtime changes and is **not published**. Its earlier documentation-only tarball and byte-identity claims do not describe this candidate. The sample still pins published0.3.0 pending release.

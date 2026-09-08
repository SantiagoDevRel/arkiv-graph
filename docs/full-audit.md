# Full repository audit — 2026-09-08

## Status and scope

The source fixes below have passed local verification. **The patched npm version
0.3.1 is not published yet.** The maintained sample still pins published 0.3.0;
the patched artifact was exercised in a separate consumer on localhost:3016.
No claim of a defect-free system or a verified public deployment is made.

Two independent reviewers inspected the entire authored runtime source,
configuration, tests and consumer guides, plus the Arkiv Graph Tools card:

- Claude Code: session `claude-1284f1`, delivered review and fix recheck.
- Native Grok CLI 1.0.13, Grok 4.6, grok.com subscription: session
  `grok-build-4742a1`, delivered review and fix recheck. This was not Cursor Grok.

Their initial 600-second turns timed out without reports. Resumed turns delivered
actual findings and coverage inventories. Both reviewers explicitly distinguished
source inspection from tests: the main agent ran the executable checks below.
Both reviewers closed their findings after the code and documentation rechecks.
A separate Codex coverage check confirmed all eight requested audit items. Hub auth and unrelated Hub routes were outside scope.

## Confirmed findings and resolution

| Finding | Resolution and evidence |
| --- | --- |
| A seed transaction hash could be lost if storage failed after broadcast, allowing a duplicate attempt | Persist a `submitting` marker before sending, keep the returned hash in memory, disable automatic transport retries, preserve uncertainty across reloads, and attach the explorer link to errors. Wallet tests reproduce storage failure, receipt timeout, duplicate prevention and known rejection. |
| Clicking a relationship selected the containing row instead of its target | Stop event propagation. Browser assertions verify both pointer and Enter open the related entity. |
| Malformed/self-referencing join entities disappeared from both views | Keep every junction entity once in its table; restore uncollapsed joins as isolated graph nodes with a warning. A regression failed before the fix and passes after it. The isolated-node behavior is documented. |
| Graph layout mutated consumer-owned node objects | Copy nodes before passing them to the simulation. A rendered frozen-input fixture remains unchanged without page errors. |
| Duplicate legacy attributes displayed a different value than graph matching used | Use normalized first-wins values in both views; regression coverage includes a custom type attribute. |
| Custom type attributes were repeated as table columns | Hide the configured type attribute, preserving unrelated attributes. |
| Global color/scrollbar state leaked between consumers | Deterministic type colors, own-property dictionary lookups, and per-theme scrollbar styles. Unit and rendered two-theme checks pass. |
| Invalid/reserved attribute names appeared as network failures | Validate against SDK 0.8 names before querying; return 400 with a field-specific message. |
| App input accepted multibyte values beyond the server byte bound | Browser validity and the API both enforce 128 UTF-8 bytes. |
| Invalid extension dates could prompt a wallet network change before failing | Validate fresh owner, expiration and the 365-day sample cap before constructing the wallet writer. |
| Graph renderer import failures stayed on a loading message | Show an explicit error. Browser test blocks the renderer chunk and asserts the error. |
| Explorer paths accepted URL delimiters; success links differed from error links | Encode entity path segments and require HTTP(S) for displayed transaction-result links. |
| Stale network/API comments, unused exports and incomplete deploy configuration | Correct Tiramisu comments, remove unused internal exports, include the reviewed secret-free `.npmrc` in the deploy allowlist. The existing unreferenced settings mockup is excluded from deploy; no user-owned file was deleted. |
| Candidate instructions implied an unpublished npm release and a current hosted demo | Mark the candidate explicitly and distinguish registry 0.3.0 from the retired Braga hosted sample. Publication remains a separate gate. |

## Verification performed

- 31 core tests and 12 wallet tests passed; package/sample TypeScript checks and
  the full Next production build passed.
- Production dependency audit: 114 dependencies, zero known advisories at the
  time of this check. This is not a guarantee against undisclosed vulnerabilities.
- Runtime: Node 22.22.3, pnpm 9.12.3, TypeScript 5.9.3, SDK 0.8.0,
  viem 2.56.3, React/React DOM 19.2.7, Next 15.5.25, Tiramisu 7738577.
- Installed the candidate tarball into an isolated existing clean source
  consumer. The import resolves to `node_modules/arkiv-graph`; the local package
  `dist` directory is absent. ESM/CJS core and React imports, SSR, the client
  directive and strict TypeScript with `skipLibCheck: false` and
  `exactOptionalPropertyTypes: true` passed. The copied README example returned
  `2 1 2` as documented.
- Real Tiramisu reads returned 35 entities, 5 tables and no truncation. With the
  sample's social rules, the actual dataset still yields 20 graph nodes and 35
  edges; those are measured dataset counts, not invariants for arbitrary inputs.
- Rendered and inspected tables at 390, 600, 601, 768, 900, 901 and 1440 px;
  graphs at 390, 768 and 1440 px. No document overflow or unexpected page errors.
  Tables intentionally scroll horizontally where their columns do not fit.
- API probes: invalid owner, reserved app/type names and overlong UTF-8 app
  values return 400; the normal query returns 200 with real entities.
- Additional browser checks: related-entity navigation by pointer/keyboard,
  frozen input preservation, independent themes, byte-limit recovery, and an
  explicit renderer-load failure. Existing controlled loading/empty/error and
  wallet-rejection checks are recorded in [verification.md](./verification.md).

No new wallet transaction was sent for this audit. The previously confirmed
real-wallet creation and Lifetime Extension evidence remains in
[tiramisu-verification.json](./tiramisu-verification.json). Wallet error/race tests
use controlled providers, not the user's funds.

## Remaining boundaries

- Publish 0.3.1 with npm's required authentication, then pin and recheck the sample
  against that registry artifact. The candidate tarball is not a published release.
- The existing hosted demo is still the older Braga app. Public Tiramisu rollout
  requires operational rate control, applicable brand alignment and deployed
  verification. No deployment or billing/firewall setting was changed here.
- A wallet with an unknown submission outcome stays blocked until its activity
  and receipt are verified. Browser-local duplicate protection is not a global
  lock across devices/profiles. See the sample README for recovery instructions.
- Private credentials, third-party service internals, the whole transitive source
  tree, and unrelated Hub authentication were not inspected. Lockfile dependencies
  were covered by installation/build and the dependency audit, not a manual audit
  of every dependency's source. No live MetaMask transaction was repeated.

**These packages are intended for testnet use.**

Candidate publication artifact:16 allowlisted files; SHA1 `4c0e943db5bd2c0f6553f2f3bebe60a5912f4ac0`.
The npm publish attempt requested EOTP; browser security verification is pending.

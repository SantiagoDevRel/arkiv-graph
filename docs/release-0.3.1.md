# arkiv-graph 0.3.1: release evidence

Verified 2026-09-08/09. **These packages are intended for testnet use.**

## Published artifacts

- [npm 0.3.1](https://www.npmjs.com/package/arkiv-graph/v/0.3.1) is published,
  verified with `npm view arkiv-graph@0.3.1 version dist.shasum dist.integrity`.
  SHA1: `efd6935b85536c0d586b00bdf6945840102d3067`.
  Integrity: `sha512-G6UERl7pMU+1PqirtQU+B+aiO27ozHDGmFMdSZCmV/wVOF+3WqRZUf1jBgfj+H5grYqzsa+Z6WR2fOJO3rtBtQ==`.
- The package contains 16 allowlisted files: ESM, CommonJS, TypeScript declarations,
  README and the consumer `AGENTS.md` / `CLAUDE.md` pointer. No credentials.
- The [hosted sample](https://arkiv-graph-example.vercel.app) consumes registry
  `arkiv-graph@0.3.1`, pinned in its manifest and lockfile. Workspace auto-linking
  is disabled. No implementation is copied into the sample.
- Deployment `dpl_A48t25eWzxjs3gkWpPf9U9Fpqsem` completed successfully and was
  aliased to that URL. Its build installed the registry dependency and built
  Next.js 15.5.25. No Vercel resource or environment variable was deleted.
- The npm archive README was captured before deployment and retains a conservative
  warning about the former hosted sample. The repository README and this report
  record the completed publication; the existing link from that archive's README
  to `docs/verification.md` leads here. Runtime artifacts are unchanged by these
  post-publication documentation updates.

## Compatibility exercised

| Component | Tested version |
| --- | --- |
| Node.js | 22.22.3 |
| pnpm | 9.12.3 locally; 9.15.9 in Vercel's build |
| TypeScript | 5.9.3 |
| Arkiv SDK | 0.8.0 |
| viem | 2.56.3 |
| React / React DOM | 19.2.7 |
| Next.js sample | 15.5.25 |
| Network | Tiramisu testnet, chain ID 7738577 |

SDK 0.6/0.7 clients are unsupported by this release's fetch adapter. React 18
is allowed by the peer range but was not exercised in this release check.

## Executable checks

- 31 package tests and 18 wallet tests pass; TypeScript, ESM/CJS/declarations and
  the sample production build pass. Wallet cases cover ownership, liveness,
  network/account changes, rejected signatures, reverted operations and uncertain
  receipts. They are controlled tests, not additional real wallet transactions.
- An isolated consumer installed the actual registry 0.3.1 release. The copied
  README example returned `2 1 2`; ESM, CommonJS, React SSR and strict TypeScript
  with `skipLibCheck: false` and `exactOptionalPropertyTypes: true` passed.
- The sample's production dependency audit reported zero known advisories across
  114 dependencies at the time checked. This does not prove absence of defects.
- The deployed API returned 35 social entities, 20 graph nodes, 35 edges and five
  tables from the public demo owner. An empty owner's real scoped read returned
  zero. Responses use `Cache-Control: no-store`; POST returns 405.
- The edge rule for `/api/graph` allows 60 requests per IP per minute. A bounded
  probe using invalid addresses returned 400 until the allowance was exhausted,
  then 429. A later real query recovered to 200. Shared IPs share this allowance.
- Deployed sensitive-path probes (`/.env`, `/keys.json`, `/config.json`, source
  paths and `/api/seed`) returned 404. The deployment uses a deny-all upload
  allowlist; the web app has no signing endpoint and never reads a private key.

## Rendered checks

The deployed sample was rendered in isolated Playwright contexts with service
workers blocked. Both themes were checked at 390, 600, 601, 768, 900, 901 and
1440 px, including the neighboring widths of the modified breakpoints.

- Dark is the first-visit default even when the operating system prefers light;
  an explicit light choice persists on reload.
- The top-right sun/moon control stays aligned with the header. Connect wallet
  uses Arkiv Orange `#FE7446`. Official light/dark wordmarks load successfully.
- Tables, graph and extension/deletion dialogs use the selected theme. Page
  overflow and runtime errors were absent. Wide tables retain internal scrolling.
- Screenshots were visually inspected at small, medium and large widths. Graph
  and both dialogs were exercised at 390, 768 and 1440 px in both themes.
- Controlled HTTP responses exercised loading, plain-text 429, RPC 503, empty
  results and Retry recovery. Real empty-owner reads were checked separately.
- The visual wallet provider allowed connection only and rejected every signing
  method. These checks made zero transaction-signing requests.
- Remote SVG bytes match the official Drive downloads exactly. Source links and
  SHA256 checksums are in [brand-assets.md](./brand-assets.md).

## Real transactions and consumer-agent checks

Earlier in the same release work, Rabby / Arkiv Wallet created the public social
sample and extended an entity on Tiramisu. A separate disposable entity was then
created and deleted; receipt, decoded single-operation calldata, fresh SDK lookup
and scoped API/UI absence were verified. The social example remained intact.
See [creation/extension evidence](./tiramisu-verification.json) and
[deletion evidence](./delete-verification.json). No signing key was placed in
the app, chat or deployment.

A fresh Claude consumer session, given the package guides and a minimal integration
objective without the authoring chat, verified an independent installation and
identified documentation gaps. Those were corrected and rechecked. A later cold
consumer installed the published 0.3.0 baseline; the main agent repeated registry
installation/import/SSR/strict-type checks against the final 0.3.1 artifact.
See the detailed chronology in [verification.md](./verification.md). Do not
interpret the earlier cold-agent check as an independent 0.3.1 transaction test.

## Independent reviews

The authored package, sample runtime, wallet flow and documentation were reviewed
with Claude Code, native Grok CLI and Muse. Findings and the original fixes are
recorded in [full-audit.md](./full-audit.md).

- Claude Code, `claude-1284f1`: full-source and deletion review, then theme review;
  final theme closure in turn 8 returned `STATUS: OK`.
- Native Grok CLI 1.0.13 / Grok 4.6, `grok-build-4742a1`: full-source and deletion
  review, then theme review; final closure in turn 7 returned `STATUS: OK`.
  This used the grok.com subscription, not Cursor's Grok lane.
- Muse, `muse-0ec4ae`: the first attempt timed out. Resumed turn 2 delivered the
  broad source audit, and turn 3 closed the final theme delta with `STATUS: OK`.

Resolved theme findings included the package's default panel surface, light-mode
contrast, narrow header layout and saved-theme first paint. All three reviewers
checked the static theme bootstrap and official SVG usage. Final review closures
were source reviews: the main agent performed the executed/browser checks above.
Muse could not run Node in its environment; this was not counted as a test pass.

## Practical limits

- Data is public; owner/app filters do not provide privacy or access policies.
- The sample loads at most 500 entities and labels partial results. Refresh is
  manual or follows a confirmed mutation; there is no realtime subscription.
- Expiration dates are estimates. Testnet entities can expire and the network
  can reset. Deletion has no cascade or undo and does not erase chain history.
- Creation duplicate protection is local to one browser profile. For uncertain
  extension/deletion receipts, inspect the retained transaction link and refresh
  before retrying; an unnecessary repeat can waste testnet gas.
- Real wallet interaction was exercised with Rabby. MetaMask compatibility uses
  the same injected interface, but its actual extension UI was not exercised.
- The app does not implement a CSP. Its pre-paint script is static and accepts
  only `light`/`dark`; future CSP deployment must authorize that exact script.
- Legacy Vercel environment entries were preserved. The new app does not use
  them; their secret values were not read or copied during publication.

No audit establishes that software is "100% secure." No unresolved blocking
source findings remain in the reviewed Arkiv Graph changes; the limits above
are part of the release contract.

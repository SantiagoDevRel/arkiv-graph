# arkiv-graph 1.0.0 candidate verification

Target: SDK 1.0.0, Rabdi chain 7794095. Candidate base: `e2fd08e`, which contains registry release 0.3.1. Branch: `rabdi/sdk-1.0-20261030`.

Not published, merged, tagged or promoted to production. The existing production deployment is not evidence for this candidate. Historical reports describe earlier releases only.

DGX ARM64 snapshot `2051fa3650d2b3ad4321a04fff310ac9102b726a`, job `j-739a66b07cdb4a61832f7636e38d7181`, passed library typecheck/build, 36 core tests, 24 mocked browser-wallet tests, one unsigned SDK gas-boundary test, and full isolated sample typecheck/build. The actual 1.0.0 tarball passed clean ESM, CJS, React and TypeScript imports, preserving both React client directives. SHA256: `38a426464e19deee8e16e0f3f4d5b38a9c2a9c079413e38e118d96055b5b585e`.

Runtime: DGX Node 24.22.1/pnpm 9.12.0 (workspace Node 22 engine warning retained); Vercel preview build and API runtime use Node 22.x. No standalone lint script exists; Next completed its configured lint/type stage. Browser-wallet mocks are separate from real local-wallet Rabdi writes and do not certify browser extensions. No new dependency was added beyond the authorized SDK upgrade.

Real Rabdi integration passed at snapshot `3bd2d6dd6a90781d9b9c8c5c1d4847936ad3edb7`, job `j-e80903559a2e41d19cc9defbc43f2cc6`: owner/project-scoped query, directed duplicate edges, shared graph/table totals, missing and actually expired endpoints, Lifetime Extension and deletion of only disposable entities created by the test. A create with `fromBlocks(7_883_970)` succeeded below Rabdi's maximum lifetime and was deleted afterward. Final read-only reseed against the latest source found the complete sample, created zero entities and left nonce 7 unchanged.

The initial full-block-gas seed remained pending. One explicitly authorized same-nonce/exact-calldata replacement [confirmed successfully](https://rabdi.explorer.arkiv.network/tx/0x09556c17b4d1cedb3eefaa3a337dbf9b451223161e9a0f6246a82afe5fea9dba), gasUsed 7,218,437. No other uncertain transaction was retried. Future writes estimate exact unsigned calldata at `latest`, use at least twice the estimate with a 1m floor, and stop/split above half the head block gas limit. The maintainer seed starts with at most ten entities per batch, journals each successful receipt and safely resumes confirmed partial batches.

Preview `dpl_AfGtRzMoDmooPJh62LeKAocT4X6a` is READY at <https://arkiv-graph-example-g3gz2ysc6-santiago-hobby.vercel.app>. The authenticated, hydrated browser verified real Rabdi graph/table rendering at 390/768/1440 px without page overflow: 40 entities, 26 nodes, 41 edges and three unresolved endpoints. API returned 200/no-store. Eight loaded client scripts contained the new gas/lifetime guards and neither shared RPC access key. Four malformed API inputs returned 400/no-store. Production was not promoted. Counts here are verification evidence; UI totals are derived from data.

Earlier failed typecheck, staging and live jobs remain recorded as failures; later corrected gates did not overwrite or relabel them. Secret scan/change-guard must pass on the final index before commit. This report is the only source change after the fully checked snapshot; application/package source matches that snapshot.

The sample currently pins registry 0.3.1. Prepublication verification builds the same application source against the packed 1.0.0 candidate in an isolated staging directory; that temporary tarball dependency is never committed. After publication, pin registry 1.0.0 and repeat a clean registry consumer check.

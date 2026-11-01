# Rabdi social sample

A fictional social network viewed as a graph and tables using the same `arkiv-graph` model. These packages are intended for testnet use. Dated verification evidence: [release evidence](../../docs/release-1.0.0.md).

## Setup

Use Node.js 22 and pnpm 9. The committed sample pins `arkiv-graph@1.1.0` from npm with workspace linking disabled. From the root, `pnpm install --frozen-lockfile`, `pnpm typecheck` and `pnpm build` verify the registry consumer. No vendored tarball or staging substitution is needed for deployment.

Set **server-side** `ARKIV_ACCESS_KEY` to a free key from [Access Keys](https://hub.arkiv.network/access-keys), then run `pnpm dev` from the root and open http://localhost:3012. Public visitors read through `/api/graph`; they need no wallet or private key. Shared access keys are never sent to the browser.

For writes, configure Rabdi in your wallet with your own credential-bearing RPC URL. Use chain id `7794095`, explorer https://rabdi.explorer.arkiv.network and the [Hub faucet](https://hub.arkiv.network/faucet) for test funds. The app can switch to an existing Rabdi configuration; it never installs a keyless or shared-key RPC into your wallet.

1. Explore the public example. Connecting a wallet preserves the public scope; **View my app** explicitly changes the owner.
2. **Create social sample** shows the generated entity count and lifetime before one atomic wallet-signed batch.
3. Confirmation precedes success/refetch. Separate follow entities with the same endpoints remain duplicate directed edges; absent endpoints become unresolved placeholders.
4. Lifetime Extension requires a later expiration; deletion confirms the exact selected key. Only the owner may submit either operation. No related entities are deleted.

All visitor reads used for signing go through the visitor's configured wallet RPC. Public dashboard reads stay on the server, owner-scoped, bounded, no-store and read-only. The app does not make public data private or add SQL constraints. Dates are estimates; testnet data can expire or reset. Theme behavior and official assets are preserved.

## Idempotent maintainer seed

From the repository root in the authorized environment:

```sh
node scripts/seed-rabdi.mjs
```

Set `GRAPH_SEED_JOURNAL` to a persistent absolute path outside the repo before running. The CLI uses only `TEST_GRAPH_ADDRESS` / `TEST_GRAPH_PRIVATE_KEY` and Key A. It queries existing `project = arkiv-graph-social-v3` entities by owner and stable `sample_id`, creates missing entries, and verifies successful receipts and count. A persisted uncertain submission blocks retries. Following an independently verified chain reset, choose a fresh journal path; never clear a pending attempt simply because queries are empty. The CLI is excluded from npm/Vercel and is not needed by visitors.

The seed starts with batches of at most ten entities. Each exact unsigned SDK transaction is estimated at `latest`, with `gas = max(1_000_000, 2 × estimate)`; a batch is split before signing until gas fits within 50% of the head block gas limit. Never use a gas limit at or near the full block limit. Each successful receipt is journaled before the next batch. Confirmed partial batches resume by stable identifiers; an uncertain submission stops the run. The browser's atomic sample operation uses the same estimate/headroom cap and refuses an oversized operation. All exported wallet write functions accept an optional per-write `{ gas, gasPrice }` override; gas cannot reduce measured headroom or exceed the half-block cap.

Browser sample creation retains a persistent history of at most two attempts, including each hash, stable sample identifiers, confirmed status, gas and nonce, plus created entity keys when available. SDK success and its hash are persisted before any follow-up receipt lookup and permanently block another send. A missing or disagreeing follow-up receipt returns a typed `SampleConfirmationError` (`CONFIRMATION_PENDING` / `RECEIPT_DISAGREES`), retaining the hashes and asking the visitor to check the transaction. It authorizes at most one retry, only when the SDK itself reported a confirmed revert, then matching that reverted receipt to the actual transaction and proving `gasUsed === gasLimit`. The retry estimates exact calldata again at `latest`, reads a fresh latest nonce, and uses at least twice the previous transaction's gas while still fitting below half the head block limit. If that budget does not fit, signing stops. Semantic reverts, a second exhausted revert, signature rejection, success and missing/uncertain receipts never authorize another send. History survives reloads and is not cleared when the old single-hash marker is absent. The maintainer seeder is separate and does not automatically retry reverted/uncertain submissions.

Sample creations use 30 days, within Rabdi's maximum lifetime of 7,884,000 blocks (about 182 days). There is no permanent/no-expiration mode. The lifetime integration test successfully created with `fromBlocks(7_883_970)` and deleted that disposable entity afterward. The wallet refuses extension targets beyond this safety margin. Longer-lived data needs periodic Lifetime Extension.

## Troubleshooting

- Missing `ARKIV_ACCESS_KEY`: configure it on the server; no signing credential belongs in the app.
- `arkiv serves state at the chain head only`: use `latest`/`pending` for state calls, never old blocks, `safe` or `finalized`.
- Revert at the gas limit: estimate exact unsigned calldata at `latest`, use at least twice the estimate and split above half the head block limit; never below 1,000,000. Stop on estimate failure. Every write passes explicit gas/gasPrice and checks `receipt.status === "success"`.
- `ExpiryBeyondMaxLifetime`: shorten the target below the maximum; permanent or maximum-uint64 expiration requests are unsupported.
- Wrong account, owner or network: signing is blocked. Reconnect the entity owner's wallet on Rabdi.
- Pending creation: browser transaction history preserves every attempt across reloads. Check wallet activity and receipts; do not clear history to resend successful, rejected or uncertain operations. Only one confirmed gas-exhaustion retry is eligible. Duplicate protection is local to a browser profile.
- Missing/expired/out-of-scope references share the same unresolved display; absence alone cannot identify the cause.
- RPC unavailable or rate limited: manual Retry; no fabricated data or automatic polling loop.

## Checks

From the root: `pnpm test`, `pnpm test:wallet`, `pnpm typecheck`, `pnpm build:lib`, `pnpm build:example`. Live integration runs with the same external secret runner and a persistent seed journal. Linux checks do not certify browser wallet extension behavior; see the evidence report.

Architecture: `config.ts` owns public network identity; `social-sample.ts` owns typed indexed schema/data; `arkiv.ts` owns the server client/link rules; `/api/graph` returns shared graph/tables; `wallet-client.ts` performs visitor signing. Read the [package API](../../packages/arkiv-graph/README.md) and [sample agent guide](AGENTS.md).

The GET graph endpoint rejects foreign Origin hosts and cross-site Fetch Metadata before constructing the public client or querying Rabdi. GET does not require a request content type; unsupported methods retain the framework response. JSON clients without Origin remain supported. These browser boundary checks do not authenticate arbitrary HTTP clients. Run `pnpm exec vitest run --config vitest.proxy.config.mjs` from the repository root for the boundary tests.

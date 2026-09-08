# arkiv-graph social sample

**These packages are intended for testnet use.**

A small social app on Tiramisu, viewed through `arkiv-graph`.
This checkout consumes **arkiv-graph@0.3.0 from npm**, pinned in its manifest
and lockfile. It does not require building the local library.
One dataset powers the graph and tables. Connect your wallet, create
the sample, inspect a user/post/comment or relation, and extend an entity's life.
The fictional social content is public test data; chain ownership belongs to the
wallet that creates it.

## Clean checkout

Prerequisites: Node.js 22 and pnpm 9. No env file, access key or signing key is
needed to run the app or read public entities.

```bash
git clone --branch v0.3.0 https://github.com/SantiagoDevRel/arkiv-graph.git
cd arkiv-graph
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3012. The existing hosted sample still runs the older
release and is not evidence of this version's Tiramisu flow.

1. Explore the public social example without connecting. Select **Connect wallet**
   and authorize your wallet on Tiramisu when you want to write. Connecting keeps
   the example visible; select **View my app** to query your own wallet's sample.
2. Select **Create social sample**. Inspect the count, public-data description,
   app identifier and 30-day lifetime, then sign the batch in your wallet.
3. Wait for confirmation. The app queries the connected owner and
   `project = arkiv-graph-social-v2`; table and graph show the same entities.
4. In the table, select Lifetime Extension/Extend, choose a later date and sign.
   After confirmation the app refetches the entity and its new expiration.

Writes require test GLM from https://hub.arkiv.network/faucet. No mainnet funds or
private key entry are part of this flow. If a wallet is absent, reads still work.
Real creation and extension were tested with Rabby's injected EIP-1193 provider.
MetaMask uses the same interface, but its actual extension UI was not tested.
The default read-only showcase owner is configured publicly in `src/lib/config.ts`.
An empty wallet can always select **View public example** to return to the demo.
Only the connected owner can extend their entities; viewing the demo never uses
its owner's signer or requires their private key. Advanced settings let you inspect
another app by owner, namespace attribute/value and entity type attribute.

## Architecture and limitations

- `src/lib/config.ts`: one public network definition shared by server and wallet.
- `src/lib/social-sample.ts`: social dataset and its creation operations; no secrets.
- `src/lib/arkiv.ts`: server-only read client and social link rules.
- `GET /api/graph`: read-only, owner-scoped and app-filtered, explicit fields,
  bounded result size, no-store responses. No signing API or arbitrary RPC proxy.
- `src/lib/wallet-client.ts`: wallet-signed creation and extension. SDK 0.8 uses
  `executeBatch`, typed attributes and `expires`. It waits for confirmations.
  Before signing, it simulates the exact calldata, supplies a gas buffer and
  rechecks the active account/network. A simulation failure does not open signing.
- `arkiv-graph`: all graph/table construction and rendering comes from the package.

The UI does not make data private or add SQL joins. Social relationships resolve
by handles/post ids; arbitrary app relationships need the link rules documented in
the package. Queries are limited to 500 entities and mark partial results.
Refresh is manual, with an automatic refetch after confirmed mutations. Dates are
block-time estimates. The UI restricts extension to the connected owner and does
not offer deletion. Testnet entities can expire and the network can reset.

Before a public deployment, configure request limits at the hosting edge or RPC
provider. The read-only API is unauthenticated and bounds each query, but does not
provide a distributed rate limiter; abusive traffic can exhaust the RPC allowance.
Do not expose the candidate publicly until that operational control is verified.

## Troubleshooting

- No entities: create the sample first, check exact owner/app attributes, or check
  for expiration. An empty wallet is a valid initial state.
- Custom attribute names in the sample are lowercase snake_case. Tiramisu rejected
  uppercase names in a real pre-sign simulation; use the shared `TYPE_ATTRIBUTE`
  config (`entity_type`) and the matching social link rules.
- RPC unavailable/rate-limited: use Retry after a delay; the app never fabricates data.
- Wallet rejects: no mutation is reported successful. Read the prompt and retry
  only if no transaction was already submitted.
- Wrong owner/account/network: use the wallet that owns the entity and Tiramisu.
  The app checks again at the signing boundary.
- Pending sample: inspect the transaction hash before retrying. Creation checks
  for existing entities and retains submitted transaction state across reloads.
  A confirmed batch whose entities are absent stays blocked; an empty query is not
  proof that it is safe to submit again. Verify its receipt and expiration first.
  Duplicate prevention is local to one browser profile; do not create the same
  sample concurrently from multiple devices/profiles.
  If every entity from a confirmed batch has verifiably expired and you want to
  recreate it, remove only that sample's marker in the browser console on the app
  origin: `localStorage.removeItem("arkiv-graph:seed:7738577:<lowercase-owner>:arkiv-graph-social-v2")`.
  Replace the owner placeholder. Never clear this marker while a transaction is
  pending or merely because a query is empty. There is no automatic reset.

## Checks

From the repo root:

```bash
pnpm test
pnpm test:wallet
pnpm typecheck
pnpm build
```

See [verification.md](../../docs/verification.md) for exact tested versions,
real-chain evidence, browser coverage and remaining limitations.

## Guides and links

- [Consumer guide for this sample](./AGENTS.md) — give it to your agent explicitly.
- [Package README](../../packages/arkiv-graph/README.md)
- [Package consumer guide](../../packages/arkiv-graph/AGENTS.md)
- [npm](https://www.npmjs.com/package/arkiv-graph)
- [Hosted sample](https://arkiv-graph-example.vercel.app)

The optional `scripts/seed-local.mjs` is maintainer-only local automation with an
explicitly authorized testnet wallet and an env file outside the repo. It is not
needed by consumers and is excluded from deployment. The web app never reads it.

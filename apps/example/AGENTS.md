# Social sample: consumer agent guide

Start with [README.md](./README.md) for setup, the end-to-end workflow and errors.
Also read the [package consumer guide](../../packages/arkiv-graph/AGENTS.md)
before changing integration logic. These packages are intended for testnet use.

The release must consume the published arkiv-graph npm package. This candidate
temporarily uses a workspace dependency because publication is pending; do not
report that as a completed npm integration. Never duplicate the library to make
a demo pass. The README documents the current checkout and release status.
Ask the developer which public owner, app namespace, entity type attribute and
link rules identify their app. Connecting MetaMask and funding Tiramisu are only
required for creation/extension; public reads need neither signing nor secrets.

Keep `config.ts` authoritative for read/write network identity. Keep `arkiv.ts`
server-only; do not create a server signing endpoint. All visitor writes use the
selected wallet, rechecked at submission. Only report receipt-confirmed success;
refetch after changes. Never retry a possibly submitted batch blindly, accept a
private key in the browser, or send credential-bearing RPC URLs to the client.

The social dataset is a coherent example, not identity proof: handles and payloads
are fictional and the chain owner is the signing wallet. A project attribute is
not authorization. Default demo owner is public configuration, never a signer.

To verify: follow only the README in a clean checkout, check the npm-resolved
version, create the sample on Tiramisu, compare query counts with table/graph,
extend one owned entity and query its changed expiry. Test empty/error/loading,
rejected signatures and account/chain changes separately. Inspect three viewport
widths. Report any missing wallet signature or unavailable network as unverified,
not successful. Do not request a private key to finish a normal consumer flow.

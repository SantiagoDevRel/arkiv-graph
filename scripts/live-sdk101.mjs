import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { defineSchema, str } from '@arkiv-network/sdk/schema';
import { custom, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getGasPrice } from 'viem/actions';
import { fetchArkivGraph, buildTables } from '../packages/arkiv-graph/dist/index.js';
import { graphWriter } from './graph-writer.mjs';
import { beginLiveRun, PendingLiveRunError } from './live-run-evidence.mjs';

const evidence = { sdk: '1.0.1', queriesKeyA: 0, transactions: [] };
let phase = 'setup';
let run;
const persist = () => run.persist({ ...evidence, phase });
const submitted = hash => {
  if (!evidence.transactions.some(tx => tx.hash === hash)) evidence.transactions.push({ kind: phase, hash, status: 'submitted' });
  persist();
};
try {
  run = beginLiveRun({ initial: evidence });
  const account = privateKeyToAccount(process.env.TEST_GRAPH_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_GRAPH_ADDRESS.toLowerCase());
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  const upstream = http(undefined, { retryCount: 0 })({ chain });
  const transport = () => custom({ request: async request => {
    if (request.method === 'arkiv_query') evidence.queriesKeyA++;
    const sending = request.method === 'eth_sendRawTransaction' || request.method === 'eth_sendTransaction';
    if (sending) { run.assertCanSend(); persist(); }
    const result = await upstream.request(request);
    if (sending) submitted(result);
    return result;
  } }, { retryCount: 0 });
  const pub = createPublicClient({ chain, transport: transport() });
  const local = createWalletClient({ chain, account, transport: transport() });
  assert.equal(await pub.getChainId(), 7794095);
  const confirmed = async (hash, kind) => {
    const receipt = await pub.getTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    const tx = await pub.getTransaction({ hash });
    const head = await pub.getBlock({ blockTag: 'latest' });
    assert(tx.gas >= 1000000n && tx.gas >= 2n * receipt.gasUsed && tx.gas <= head.gasLimit / 2n);
    const item = evidence.transactions.find(t => t.hash === hash) ?? {};
    if (!item.hash) evidence.transactions.push(item);
    Object.assign(item, { kind, hash, status: receipt.status, gas: String(tx.gas), gasUsed: String(receipt.gasUsed), nonce: tx.nonce });
    persist();
  };
  const writer = graphWriter({ chain, account, pub, transport, onSubmitting: parameters => { evidence.lastWrite = parameters; run.assertCanSend(); persist(); }, onSent: submitted });
  const project = 'pkg3b-sdk101-' + Date.now();
  const schema = defineSchema('pkg3b_graph_sdk101', { project: str().indexed(), entity_type: str().indexed() });
  phase = 'sending-create'; Object.assign(evidence, { project, owner: account.address }); persist();
  const created = await writer.wallet.createEntity(schema, { project, entity_type: 'probe' }, { expiration: ExpirationTime.fromHours(1) }, { nonce: await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }), gasPrice: await getGasPrice(pub), gas: 1000000n });
  evidence.owner = account.address; evidence.entityKey = created.entityKey; evidence.project = project;
  await confirmed(created.txHash, 'create');
  const graph = await fetchArkivGraph({ client: pub, chain, ownedBy: account.address, project });
  assert.equal(graph.entities.length, 1);
  assert.equal(buildTables(graph.graph, graph.entities).tables[0].count, 1);
  // Exercise the sample's actual exported extension/deletion adapters with a local EIP-1193 account.
  // This is a real RPC/signature test, not evidence of a browser wallet UI.
  const provider = { request: async request => {
    if (request.method === 'eth_accounts') return [account.address];
    if (request.method === 'eth_sendTransaction') {
      const tx = request.params[0];
      assert.equal(tx.from.toLowerCase(), account.address.toLowerCase());
      assert.equal(tx.to.toLowerCase(), '0x4400000000000000000000000000000000000044');
      const hash = await local.sendTransaction({ chain, account, to: tx.to, data: tx.data, value: 0n, gas: BigInt(tx.gas), gasPrice: BigInt(tx.gasPrice), nonce: Number(BigInt(tx.nonce)) });
      submitted(hash);
      return hash;
    }
    return pub.request(request);
  } };
  Object.defineProperty(globalThis, 'window', { value: { ethereum: provider }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  const bundle = path.resolve('.candidate-artifacts/live-adapter.mjs');
  const built = await build({ entryPoints: ['apps/example/src/lib/wallet-client.ts'], bundle: true, write: false, platform: 'node', format: 'esm', external: ['@arkiv-network/sdk', '@arkiv-network/sdk/*', 'viem', 'viem/*'] });
  fs.writeFileSync(bundle, built.outputFiles[0].text);
  try {
    const app = await import(pathToFileURL(bundle).href);
    const before = await pub.getEntity(created.entityKey);
    phase = 'sending-extension'; persist();
    const extended = await app.extendEntityWithWallet(account.address, created.entityKey, Math.floor(Date.now() / 1000) + 7200);
    await confirmed(extended.txUrl.split('/').at(-1), 'extend-public-sample-api');
    assert((await pub.getEntity(created.entityKey)).$expiresAt > before.$expiresAt);
    phase = 'sending-deletion'; persist();
    const deleted = await app.deleteEntityWithWallet(account.address, created.entityKey);
    await confirmed(deleted.txUrl.split('/').at(-1), 'delete-public-sample-api');
    assert.equal((await fetchArkivGraph({ client: pub, chain, ownedBy: account.address, project })).entities.length, 0);
  } finally { fs.unlinkSync(bundle); }
  evidence.status = 'PASS'; evidence.cleanupConfirmed = true;
  phase = 'complete'; persist();
  console.log(JSON.stringify(evidence));
} catch (error) {
  if (run) {
    try { run.persist({ ...evidence, phase, status: 'FAILED', errorKind: error.name }); }
    catch { console.error(JSON.stringify({ evidenceDirectory: run.directory, hashes: evidence.transactions.map(tx => tx.hash), message: 'Evidence persistence failed; reconcile before another run.' })); }
  }
  console.error(JSON.stringify({ status: 'FAILED', errorKind: error.name, evidencePath: run?.latestPath, message: error instanceof PendingLiveRunError ? error.message : 'Inspect the preserved transaction evidence; no automatic resend.' }));
  process.exitCode = 1;
} finally { run?.release(); }

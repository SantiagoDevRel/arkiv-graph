// Maintainer-only control of the actual exported app flow with a local EIP-1193 signer.
// The private key stays in this Node process; no signer/key is added to app code or a browser.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getGasPrice } from 'viem/actions';
import { graphWriter } from './graph-writer.mjs';

let stage = 'setup', journalPath, bundle;
let journalCreated = false, bundleCreated = false;
const storage = new Map(), sent = [], cleanup = [];
const journal = { stage, createdKeys: [], sent, cleanup };
const persist = () => { if (journalCreated) writeFileSync(journalPath, JSON.stringify({ ...journal, stage, browserHistory: Object.fromEntries(storage) }, null, 2)); };
try {
  assert(process.env.ARKIV_ACCESS_KEY_A && process.env.TEST_GRAPH_PRIVATE_KEY && process.env.GRAPH_SEED_JOURNAL);
  const account = privateKeyToAccount(process.env.TEST_GRAPH_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_GRAPH_ADDRESS.toLowerCase());
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  const transport = () => http(undefined, { retryCount: 0 });
  const pub = createPublicClient({ chain, transport: transport() });
  const local = createWalletClient({ chain, account, transport: transport() });
  assert.equal(await pub.getChainId(), 7794095);
  const stamp = `${Date.now()}-${process.pid}`;
  const project = `graph-wallet-review-${stamp}`;
  journalPath = `${process.env.GRAPH_SEED_JOURNAL}.wallet-turn3-${stamp}.json`;
  Object.assign(journal, { project, owner: account.address, chainId: chain.id, queries: 0 });
  writeFileSync(journalPath, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
  journalCreated = true;
  const config = resolve('apps/example/src/lib/config.ts');
  const built = await build({
    stdin: { contents: 'export { createSocialSampleWithWallet } from "./apps/example/src/lib/wallet-client.ts"; export { socialSample } from "./apps/example/src/lib/social-sample.ts";', resolveDir: resolve('.'), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', external: ['@arkiv-network/sdk', '@arkiv-network/sdk/*', 'viem', 'viem/*'],
    plugins: [{ name: 'isolated-owned-project', setup(builder) {
      builder.onLoad({ filter: /config\.ts$/ }, args => {
        if (resolve(args.path) !== config) return;
        const source = readFileSync(args.path, 'utf8');
        const literal = 'export const PROJECT = "arkiv-graph-social-v3";';
        assert.equal(source.split(literal).length, 2);
        return { contents: source.replace(literal, `export const PROJECT = ${JSON.stringify(project)};`), loader: 'ts' };
      });
    } }],
  });
  bundle = resolve(`.candidate-artifacts/wallet-live-${stamp}.mjs`);
  writeFileSync(bundle, built.outputFiles[0].text, { flag: 'wx' });
  bundleCreated = true;
  const provider = { request: async request => {
    if (request.method === 'eth_accounts' || request.method === 'eth_requestAccounts') return [account.address];
    if (request.method === 'eth_chainId') return `0x${chain.id.toString(16)}`;
    if (request.method === 'eth_sendTransaction') {
      const tx = request.params[0];
      assert.equal(tx.from.toLowerCase(), account.address.toLowerCase());
      assert.equal(tx.to.toLowerCase(), '0x4400000000000000000000000000000000000044');
      assert.equal(BigInt(tx.value ?? 0), 0n);
      const hash = await local.sendTransaction({ account, chain, to: tx.to, data: tx.data, value: 0n, nonce: Number(BigInt(tx.nonce)), gas: BigInt(tx.gas), gasPrice: BigInt(tx.gasPrice) });
      sent.push({ hash, gas: String(BigInt(tx.gas)), nonce: Number(BigInt(tx.nonce)) }); persist();
      return hash;
    }
    if (request.method === 'arkiv_query') journal.queries++;
    return pub.request(request);
  } };
  Object.defineProperty(globalThis, 'window', { value: { ethereum: provider }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, configurable: true });
  const app = await import(pathToFileURL(bundle).href);
  stage = 'actual-app-create';
  const result = await app.createSocialSampleWithWallet(account.address); persist();
  assert.equal(result.alreadyCreated, false); assert.equal(sent.length, 1);
  const historyKey = `arkiv-graph:seed:${chain.id}:${account.address.toLowerCase()}:${project}:history`;
  const history = JSON.parse(storage.get(historyKey));
  assert.equal(history.attempts.length, 1); assert.equal(history.attempts[0].status, 'success');
  assert.equal(history.attempts[0].hash, sent[0].hash);
  assert.equal(history.attempts[0].sampleIds.length, app.socialSample().length);
  const created = history.attempts[0].entityKeys;
  assert.equal(created.length, app.socialSample().length);
  journal.createdKeys = created; persist();
  const rows = async () => { journal.queries++; return (await pub.select({ $key: true, $owner: true }).ownedBy(account.address).where(eq('project', project)).limit(100).fetch()).entities; };
  const loaded = await rows();
  assert.deepEqual(new Set(loaded.map(e => e.$key)), new Set(created));
  assert(loaded.every(e => e.$owner.toLowerCase() === account.address.toLowerCase()));
  assert.equal((await app.createSocialSampleWithWallet(account.address)).alreadyCreated, true);
  assert.equal(sent.length, 1);
  stage = 'delete-only-created-disposable-entities';
  const cleaner = graphWriter({ chain, account, pub, transport, onSent: (hash, params) => { cleanup.push({ hash, ...params }); persist(); } });
  for (let offset = 0; offset < created.length; offset += 10) {
    const tx = await cleaner.wallet.executeBatch({ deletes: created.slice(offset, offset + 10).map(entityKey => ({ entityKey })) }, { nonce: await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }), gas: 1_000_000n, gasPrice: await getGasPrice(pub) });
    const receipt = await pub.getTransactionReceipt({ hash: tx.txHash });
    assert.equal(receipt.status, 'success'); assert(receipt.gasUsed * 2n <= BigInt(cleaner.last().gas));
    Object.assign(cleanup.at(-1), { status: receipt.status, gasUsed: String(receipt.gasUsed) }); persist();
  }
  assert.equal((await rows()).length, 0);
  stage = 'confirmed-success-no-replay-after-absence';
  const nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'latest' });
  await assert.rejects(app.createSocialSampleWithWallet(account.address), /do not sign again/);
  assert.equal(sent.length, 1);
  assert.equal(await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }), nonce);
  stage = 'passed'; persist();
  const evidence = { status: 'passed', project, owner: account.address, created: created.length, removedOwnCreatedEntities: created.length, originalSampleUntouched: true, create: sent[0], confirmedHistoryRetained: true, noReplayAfterAbsence: true, cleanup, queries: journal.queries, journal: journalPath };
  writeFileSync('.candidate-artifacts/wallet-live-turn3.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) { persist(); console.error(JSON.stringify({ status: 'failed', stage, kind: error.name, journal: journalPath })); process.exitCode = 1; }
finally { if (bundleCreated) unlinkSync(bundle); }

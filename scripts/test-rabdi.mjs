import assert from 'node:assert/strict';
import { createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { writeFileSync } from 'node:fs';
import { rabdi } from '@arkiv-network/sdk/chains';
import { defineSchema, str, key } from '@arkiv-network/sdk/schema';
import { http } from 'viem';
import { getGasPrice } from 'viem/actions';
import { privateKeyToAccount } from 'viem/accounts';
import { buildGraph, buildTables, fetchArkivGraph } from '../packages/arkiv-graph/dist/index.js';
import { seedRabdi } from './seed-rabdi.mjs';
import { graphWriter } from './graph-writer.mjs';

// Authorized GRAPH wallet only. Never log SDK errors with credential-bearing URLs.
try {
  const first = await seedRabdi();
  const second = await seedRabdi();
  assert.equal(second.status, 'already-created');
  assert.equal(first.count, second.count);
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  const account = privateKeyToAccount(process.env.TEST_GRAPH_PRIVATE_KEY);
  const pub = createPublicClient({ chain, transport: http(undefined, { retryCount: 0 }) });
  const mutations = [];
  const mutationJournal = `${process.env.GRAPH_SEED_JOURNAL}.integration-${Date.now()}.json`;
  const signer = graphWriter({ chain, account, pub, transport: () => http(undefined, { retryCount: 0 }), onSent: (hash, params) => {
    mutations.push({ hash, ...params });
    writeFileSync(mutationJournal, JSON.stringify(mutations, null, 2));
    console.log(JSON.stringify({ submitted: hash, ...params }));
  } });
  const wallet = signer.wallet;
  const nonceBeforeReseed = await pub.getTransactionCount({ address: account.address, blockTag: 'latest' });
  const third = await seedRabdi();
  assert.equal(third.created, 0);
  assert.equal(await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }), nonceBeforeReseed);
  const links = [
    { type: 'reference', attribute: 'author_handle', targetAttribute: 'handle', targetType: 'user', label: 'by' },
    { type: 'reference', attribute: 'post_id', targetAttribute: 'post_id', sourceType: 'comment', targetType: 'post', label: 'on' },
    { type: 'reference', attribute: 'entity_ref', label: 'references' },
    { type: 'join', entityType: 'follow', sourceAttr: 'follower_handle', targetAttr: 'followee_handle', sourceMatchAttr: 'handle', targetMatchAttr: 'handle', sourceType: 'user', targetType: 'user', label: 'follows' },
    { type: 'join', entityType: 'like', sourceAttr: 'by_handle', targetAttr: 'post_id', sourceMatchAttr: 'handle', targetMatchAttr: 'post_id', sourceType: 'user', targetType: 'post', label: 'likes' },
  ];
  const loaded = await fetchArkivGraph({ client: pub, chain, ownedBy: account.address, project: first.project, typeAttribute: 'entity_type', links, limit: 500 });
  const tables = buildTables(loaded.graph, loaded.entities, { links, typeAttribute: 'entity_type', blockTiming: loaded.blockTiming });
  assert.equal(loaded.entities.length, first.count);
  assert.equal(tables.tables.reduce((n, t) => n + t.count, 0), first.count);
  assert.equal(loaded.truncated, false);
  const follows = loaded.graph.edges.filter(e => e.label === 'follows');
  assert.equal(follows.length, 9);
  const pairs = follows.map(e => `${e.source}->${e.target}`);
  assert.equal(pairs.length - new Set(pairs).size, 1);
  assert(follows.every(e => e.directed));
  assert(loaded.graph.nodes.some(n => n.unresolved));

  const Probe = defineSchema('arkiv-graph-rabdi-probe', { entity_type: str().indexed(), entity_ref: key().indexed().optional() });
  const txParams = async () => ({ nonce: await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }), gas: 1_000_000n, gasPrice: await getGasPrice(pub) });
  const receipts = [];
  const check = async result => {
    const receipt = await pub.getTransactionReceipt({ hash: result.txHash });
    assert.equal(receipt.status, 'success');
    assert(receipt.gasUsed * 2n <= BigInt(signer.last().gas));
    receipts.push({ hash: result.txHash, status: receipt.status, gasUsed: String(receipt.gasUsed), ...signer.last() });
    return result;
  };
  const beforeMaximum = await pub.getBlockNumber({ cacheTime: 0 });
  const maximum = await check(await wallet.createEntity(Probe, { entity_type: 'maximum-lifetime' }, { expiration: ExpirationTime.fromBlocks(7_883_970) }, await txParams()));
  const maximumRow = await pub.getEntity(maximum.entityKey);
  assert(maximumRow.$expiresAt >= beforeMaximum + 7_883_970n);
  assert(maximumRow.$expiresAt <= await pub.getBlockNumber({ cacheTime: 0 }) + 7_883_970n);
  await check(await wallet.deleteEntity({ entityKey: maximum.entityKey }, await txParams()));
  const endpoint = await check(await wallet.createEntity(Probe, { entity_type: 'endpoint' }, { expiration: ExpirationTime.fromSeconds(20) }, await txParams()));
  const source = await check(await wallet.createEntity(Probe, { entity_type: 'source', entity_ref: key(endpoint.entityKey) }, { expiration: ExpirationTime.fromSeconds(300) }, await txParams()));
  const sourceRow = await pub.getEntity(source.entityKey);
  const endpointRow = await pub.getEntity(endpoint.entityKey);
  const ref = [{ type: 'reference', attribute: 'entity_ref' }];
  assert.equal(buildGraph([sourceRow, endpointRow], { links: ref }).nodes.filter(n => n.unresolved).length, 0);
  const deadline = Date.now() + 45000;
  while ((await pub.getBlockTiming()).currentBlock <= endpoint.expiresAt) {
    assert(Date.now() < deadline, 'Expired endpoint deadline exceeded');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  let absent = false;
  try { await pub.getEntity(endpoint.entityKey); } catch (error) { if (error.name === 'NoEntityFoundError') absent = true; else throw error; }
  assert(absent, 'Expired endpoint must be absent from current state');
  const ghost = buildGraph([sourceRow], { links: ref });
  assert(ghost.nodes.some(n => n.id === endpoint.entityKey && n.unresolved));
  assert(buildTables(ghost, [sourceRow], { links: ref }).warnings.some(w => w.includes('expired or out of scope')));
  const extended = await check(await wallet.extendEntity({ entityKey: source.entityKey, expiration: ExpirationTime.fromSeconds(600) }, await txParams()));
  assert.equal((await pub.getEntity(source.entityKey)).$expiresAt, extended.expiresAt);
  assert(extended.expiresAt > source.expiresAt);
  await check(await wallet.deleteEntity({ entityKey: source.entityKey }, await txParams()));
  let deleted = false;
  try { await pub.getEntity(source.entityKey); } catch (error) { if (error.name === 'NoEntityFoundError') deleted = true; else throw error; }
  assert(deleted, 'Own disposable source must be absent after confirmed deletion');
  console.log(JSON.stringify({ status: 'passed', chainId: chain.id, owner: account.address, count: first.count, seed: { ...first, entities: undefined }, idempotent: true, reseedCreated: third.created, nonceUnchangedByReseed: true, maximumLifetimeCreate: { hash: maximum.txHash, expiresAt: String(maximum.expiresAt), requestedBlocks: 7883970 }, duplicateDirectedEdges: true, realExpiredEndpoint: true, extension: true, ownDisposableDeletion: true, mutationJournal, receipts, queries: first.queries + second.queries + third.queries + 1 }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', kind: error.name, assertion: error.code === 'ERR_ASSERTION' ? error.message : undefined }));
  process.exitCode = 1;
}

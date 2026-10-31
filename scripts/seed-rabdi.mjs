// Maintainer CLI only; excluded from npm and Vercel. Inject named secrets externally.
import { build } from 'esbuild';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { getGasPrice } from 'viem/actions';
import { privateKeyToAccount } from 'viem/accounts';
import { graphWriter, GasBudgetError } from './graph-writer.mjs';

export async function seedRabdi({ existingOnly = false } = {}) {
  if (!process.env.ARKIV_ACCESS_KEY_A || !process.env.TEST_GRAPH_PRIVATE_KEY || !process.env.TEST_GRAPH_ADDRESS) throw new Error('Inject Key A and the funded TEST_GRAPH wallet through tools/secrets.mjs run.');
  const journalPath = process.env.GRAPH_SEED_JOURNAL;
  if (!journalPath || !isAbsolute(journalPath)) throw new Error('Set GRAPH_SEED_JOURNAL to an absolute persistent path outside this repository.');
  const account = privateKeyToAccount(process.env.TEST_GRAPH_PRIVATE_KEY);
  if (account.address.toLowerCase() !== process.env.TEST_GRAPH_ADDRESS.toLowerCase()) throw new Error('GRAPH wallet address mismatch.');
  const lockPath = `${journalPath}.lock`;
  const lock = JSON.stringify({ pid: process.pid, started: new Date().toISOString() });
  writeFileSync(lockPath, lock, { flag: 'wx', mode: 0o600 });
  try {
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  let queries = 0;
  const transport = () => http(undefined, { retryCount: 0, timeout: 30000 });
  const pub = createPublicClient({ chain, transport: transport() });
  if (await pub.getChainId() !== 7794095) throw new Error('RPC chain mismatch.');
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../apps/example/src/lib/social-sample.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { socialSample } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  const creates = socialSample();
  const currentBlock = await pub.getBlockNumber({ cacheTime: 0 });
  for (const item of creates) {
    if (item.expiration.minLifetime > 7_883_970n || item.expiration.expiresAt > currentBlock + 7_883_970n) throw new Error('Sample expiration exceeds the Rabdi maximum lifetime safety margin.');
  }
  if (!creates.length || creates.length >= 100) throw new Error('The social seed must fit below its verified 100-entity query bound.');
  if (new Set(creates.map(c => c.values.sample_id)).size !== creates.length) throw new Error('Every sample identifier must be unique.');
  const project = creates[0].values.project;
  const query = async () => { queries++; return pub.select({ $key: true, $owner: true, $expiresAt: true, $attributes: true }).ownedBy(account.address).where(eq('project', project)).limit(100).fetch(); };
  const existing = await query();
  const have = new Map(existing.entities.map(e => [e.$attributes.sample_id?.value, e]));
  if (have.size !== existing.entities.length || [...have.keys()].some(id => !creates.some(c => c.values.sample_id === id))) throw new Error('Sample identifiers are duplicated or unexpected; inspect the owner/project without deleting entities.');
  const missing = creates.filter(c => !have.has(c.values.sample_id));
  if (!missing.length) return { status: 'already-created', owner: account.address, project, count: existing.entities.length, created: 0, receipts: [], queries, entities: existing.entities };
  if (existingOnly) throw new Error('Read-only reseed verification found missing entities; no transaction was signed.');
  let journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : undefined;
  if (journal && (journal.owner !== account.address || journal.project !== project || journal.chainId !== chain.id)) throw new Error('Seed journal identity mismatch.');
  if (journal) {
    if (!journal.txHash) throw new Error('Previous submission is uncertain. Inspect GRAPH wallet activity before any retry.');
    const receipt = await pub.getTransactionReceipt({ hash: journal.txHash });
    if (receipt.status !== 'success') throw new Error('Previous seed reverted. Inspect its receipt before an explicitly authorized retry.');
    if (!journal.sampleIds?.length || journal.sampleIds.some(id => !have.has(id))) throw new Error('Previous seed succeeded but its expected entities are absent. Verify expiration or a Rabdi reset before archiving the journal.');
  }
  const receipts = [...(journal?.receipts ?? [])];
  let created = 0;
  const send = async items => {
    let started, txHash;
    const signer = graphWriter({ chain, account, pub, transport,
      onSubmitting: params => {
        started = { owner: account.address, project, chainId: chain.id, ...params, status: 'submitting', sampleIds: items.map(c => c.values.sample_id), receipts };
        writeFileSync(journalPath, JSON.stringify(started));
      },
      onSent: hash => { txHash = hash; writeFileSync(journalPath, JSON.stringify({ ...started, txHash: hash })); },
    });
    try {
      const nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'latest' });
      const result = await signer.wallet.executeBatch({ creates: items }, { nonce, gas: 1_000_000n, gasPrice: await getGasPrice(pub) });
      const receipt = await pub.getTransactionReceipt({ hash: result.txHash });
      if (receipt.status !== 'success') throw new Error('Seed batch reverted; no automatic retry.');
      if (receipt.gasUsed * 2n > BigInt(signer.last().gas)) throw new Error('Measured gas headroom was insufficient.');
      receipts.push({ hash: result.txHash, status: receipt.status, gasUsed: String(receipt.gasUsed), ...signer.last(), count: items.length });
      created += result.createdEntities.length;
      writeFileSync(journalPath, JSON.stringify({ ...started, txHash: result.txHash, status: 'success', receipts }));
    } catch (error) {
      let cause = error, overBudget = false;
      for (let i = 0; cause && i < 12; i++, cause = cause.cause) if (cause instanceof GasBudgetError) overBudget = true;
      // Splitting is permitted only before the first signature/submission of this batch.
      if (!started && !txHash && overBudget && items.length > 1) {
        const half = Math.ceil(items.length / 2); await send(items.slice(0, half)); await send(items.slice(half));
      } else throw error;
    }
  };
  // Each initial batch has at most ten small entities. Exact calldata is estimated
  // at latest; max(1m, estimate * 2) must fit within 50% of the head gas limit.
  for (let offset = 0; offset < missing.length; offset += 10) await send(missing.slice(offset, offset + 10));
  const after = await query();
  const finalJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const evidence = { ...finalJournal, status: 'success', created, count: after.entities.length, queries, entities: after.entities };
  writeFileSync(journalPath, JSON.stringify(evidence, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2));
  if (after.entities.length !== creates.length || after.entities.some(e => e.$owner.toLowerCase() !== account.address.toLowerCase())) throw new Error('Confirmed seed query did not match the expected owner/count.');
  return evidence;
  } finally {
    // Only this invocation's exclusively-created, unchanged lock may be removed.
    if (existsSync(lockPath) && readFileSync(lockPath, 'utf8') === lock) unlinkSync(lockPath);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const evidence = await seedRabdi(); console.log(JSON.stringify({ ...evidence, entities: undefined }, null, 2)); }
  catch { console.error('Seed stopped. Preserve the journal, inspect the GRAPH wallet receipt and namespace; never retry an uncertain transaction.'); process.exitCode = 1; }
}

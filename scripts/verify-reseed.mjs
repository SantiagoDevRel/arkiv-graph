import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { http } from 'viem';
import { seedRabdi } from './seed-rabdi.mjs';
try {
  const pub = createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A }), transport: http(undefined, { retryCount: 0 }) });
  const address = process.env.TEST_GRAPH_ADDRESS;
  const before = await pub.getTransactionCount({ address, blockTag: 'latest' });
  const seed = await seedRabdi({ existingOnly: true });
  const after = await pub.getTransactionCount({ address, blockTag: 'latest' });
  assert.equal(after, before); assert.equal(seed.created, 0); assert.equal(seed.status, 'already-created');
  const evidence = { status: 'passed', count: seed.count, created: seed.created, beforeNonce: before, afterNonce: after, nonceUnchanged: true, queries: seed.queries };
  writeFileSync('.candidate-artifacts/reseed.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch(error) { console.error(JSON.stringify({ status: 'failed', kind: error.name })); process.exitCode = 1; }

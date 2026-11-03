import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { beginLiveRun, pendingLiveRuns, PendingLiveRunError } from './live-run-evidence.mjs';

const hash = '0x' + 'ab'.repeat(32);
const final = { status: 'PASS', phase: 'complete', cleanupConfirmed: true, transactions: [{ hash, status: 'success' }] };
function fixture(callback) {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-evidence-test-'));
  try { callback(checkout); } finally { fs.rmSync(checkout, { recursive: true }); }
}

test('each persist and completed rerun create new files without changing earlier evidence', () => fixture(checkout => {
  const run = beginLiveRun({ checkout });
  const submitted = run.persist({ phase: 'sending-create', transactions: [{ hash, status: 'submitted' }] });
  const bytes = fs.readFileSync(submitted);
  const completed = run.persist(final);
  assert.notEqual(completed, submitted);
  run.release();
  const next = beginLiveRun({ checkout });
  assert.notEqual(next.directory, run.directory);
  assert.deepEqual(fs.readFileSync(submitted), bytes);
  assert.equal(JSON.parse(fs.readFileSync(completed)).status, 'PASS');
  next.persist(final); next.release();
  console.log(JSON.stringify({ immutableSnapshots: true, uniqueReruns: true, priorBytesUnchanged: true }));
}));

test('legacy sending, submitted, failed and uncertain evidence blocks admission and preserves hashes', () => fixture(checkout => {
  const legacy = path.join(checkout, '.candidate-artifacts/live-sdk101.json');
  fs.mkdirSync(path.dirname(legacy));
  for (const state of [{ phase: 'sending-create' }, { phase: 'sending-extension' }, { phase: 'sending-deletion' }, { status: 'submitted' }, { status: 'FAILED' }, { status: 'uncertain' }]) {
    const bytes = JSON.stringify({ ...state, transactions: [{ hash, status: 'submitted' }] });
    fs.writeFileSync(legacy, bytes);
    assert.throws(() => beginLiveRun({ checkout }), error => error instanceof PendingLiveRunError && error.message.includes(legacy) && error.message.includes(hash));
    assert.equal(fs.readFileSync(legacy, 'utf8'), bytes);
  }
  console.log(JSON.stringify({ legacyNonfinalStatesRejected: 6, pendingPathAndHashReported: true }));
}));

test('a prior new run blocks all sends until a final reconciliation retains every hash', () => fixture(checkout => {
  const run = beginLiveRun({ checkout });
  const submitted = run.persist({ status: 'FAILED', phase: 'sending-create', transactions: [{ hash, status: 'submitted' }] });
  run.release();
  assert.throws(() => beginLiveRun({ checkout }), error => error.message.includes(submitted) && error.message.includes(hash));
  fs.writeFileSync(path.join(run.directory, '999998.json'), JSON.stringify({ status: 'RECONCILED', reconciled: true, cleanupConfirmed: true, transactions: [] }), { flag: 'wx' });
  assert.throws(() => beginLiveRun({ checkout }), /Reconcile/);
  fs.writeFileSync(path.join(run.directory, '999999.json'), JSON.stringify({ status: 'RECONCILED', reconciled: true, cleanupConfirmed: true, transactions: [{ hash, status: 'reverted' }] }), { flag: 'wx' });
  const next = beginLiveRun({ checkout });
  next.persist(final); next.release();
  assert(fs.existsSync(submitted));
}));

test('every send rechecks earlier evidence and refuses a newly discovered pending run', () => fixture(checkout => {
  const run = beginLiveRun({ checkout });
  run.assertCanSend();
  const legacy = path.join(checkout, '.candidate-artifacts/live-sdk101.json');
  fs.writeFileSync(legacy, JSON.stringify({ status: 'FAILED', transactions: [{ hash, status: 'submitted' }] }), { flag: 'wx' });
  let sends = 0;
  assert.throws(() => { run.assertCanSend(); sends++; }, error => error.message.includes(hash) && error.message.includes(legacy));
  assert.equal(sends, 0); run.release();
}));

test('legacy reconciliation is append-only and cannot forget a submitted hash', () => fixture(checkout => {
  const legacy = path.join(checkout, '.candidate-artifacts/live-sdk101.json');
  const companion = path.join(checkout, '.candidate-artifacts/live-sdk101.reconciled.json');
  fs.mkdirSync(path.dirname(legacy));
  const bytes = JSON.stringify({ status: 'FAILED', transactions: [{ hash, status: 'submitted' }] });
  fs.writeFileSync(legacy, bytes);
  fs.writeFileSync(companion, JSON.stringify({ status: 'RECONCILED', reconciled: true, cleanupConfirmed: true, transactions: [{ hash, status: 'reverted' }] }), { flag: 'wx' });
  const run = beginLiveRun({ checkout });
  assert.equal(fs.readFileSync(legacy, 'utf8'), bytes);
  run.persist(final); run.release();
}));

test('exclusive admission prevents concurrent runs even before first send', () => fixture(checkout => {
  const run = beginLiveRun({ checkout });
  assert.throws(() => beginLiveRun({ checkout }), PendingLiveRunError);
  run.persist(final);
  assert.throws(() => beginLiveRun({ checkout }), /admission.lock/);
  run.release();
}));

test('unreadable legacy evidence fails closed without replacing its bytes', () => fixture(checkout => {
  const legacy = path.join(checkout, '.candidate-artifacts/live-sdk101.json');
  fs.mkdirSync(path.dirname(legacy)); fs.writeFileSync(legacy, '{');
  assert.throws(() => beginLiveRun({ checkout }), error => error.message.includes(legacy));
  assert.equal(fs.readFileSync(legacy, 'utf8'), '{');
  assert.equal(pendingLiveRuns(checkout).length, 1);
}));

test('the live script cannot overwrite a fixed earlier evidence record', () => {
  const source = fs.readFileSync(new URL('./live-sdk101.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /writeFileSync\(['"]\.candidate-artifacts\/live-sdk101\.json/, 'fixed earlier evidence must never be overwritten');
  assert.match(source, /beginLiveRun\(/, 'live script must acquire the guarded immutable ledger');
});

test('the live script must guard every RPC submission against unresolved earlier runs', () => {
  const source = fs.readFileSync(new URL('./live-sdk101.mjs', import.meta.url), 'utf8');
  assert.match(source, /run\.assertCanSend\(\)/, 'live transport must guard sends');
  assert(source.indexOf('run.assertCanSend()') < source.indexOf('await upstream.request(request)'));
});

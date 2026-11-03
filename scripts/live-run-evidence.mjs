import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const hashes = record => (record.transactions ?? []).map(tx => tx.hash).filter(hash => /^0x[0-9a-f]{64}$/i.test(hash));
function terminal(record, known) {
  if (/^sending-/i.test(record.phase ?? '') || ['FAILED', 'submitted', 'uncertain'].includes(record.status)) return false;
  const reconciled = record.status === 'RECONCILED' && record.reconciled === true;
  if (!(record.status === 'PASS' || reconciled) || record.cleanupConfirmed !== true) return false;
  return [...known].every(hash => record.transactions?.some(tx => tx.hash === hash && (tx.status === 'success' || reconciled && tx.status === 'reverted')));
}

export class PendingLiveRunError extends Error {
  constructor(records) {
    super('Reconcile earlier GRAPH evidence before sending: ' + records.map(record => record.path + ' hashes=' + (record.hashes.join(',') || 'unknown')).join('; '));
    this.name = 'PendingLiveRunError';
    this.records = records;
  }
}

/** Read legacy evidence and the latest immutable snapshot of every run; retain all known hashes. */
export function pendingLiveRuns(checkout, excludedRun) {
  const artifactRoot = path.resolve(checkout, '.candidate-artifacts');
  const pending = [];
  function inspect(files, directory) {
    const known = new Set();
    let latest;
    for (const file of files) {
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Evidence must be a regular file');
        latest = JSON.parse(fs.readFileSync(file, 'utf8')); hashes(latest).forEach(hash => known.add(hash));
      }
      catch { pending.push({ path: file, hashes: [...known] }); return; }
    }
    if (!latest || !terminal(latest, known)) pending.push({ path: files.at(-1) ?? directory, hashes: [...known] });
  }
  const legacy = path.join(artifactRoot, 'live-sdk101.json');
  const reconciledLegacy = path.join(artifactRoot, 'live-sdk101.reconciled.json');
  if (fs.existsSync(legacy)) inspect([legacy, ...(fs.existsSync(reconciledLegacy) ? [reconciledLegacy] : [])], artifactRoot);
  const runs = path.join(artifactRoot, 'live-sdk101-runs');
  if (fs.existsSync(runs)) for (const entry of fs.readdirSync(runs, { withFileTypes: true })) {
    const directory = path.join(runs, entry.name);
    if (directory === excludedRun || entry.name === 'admission.lock') continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) { pending.push({ path: directory, hashes: [] }); continue; }
    const files = fs.readdirSync(directory).filter(name => /^\d{6}\.json$/.test(name)).sort().map(name => path.join(directory, name));
    inspect(files, directory);
  }
  return pending;
}

function exclusiveJson(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

/**
 * Append-only evidence. After authoritative receipt/entity review, a final
 * RECONCILED snapshot requires reconciled:true, cleanupConfirmed:true and all
 * earlier hashes with success/reverted status. Legacy evidence uses a new
 * live-sdk101.reconciled.json companion; never edit the original legacy file.
 */
export function beginLiveRun({ checkout = process.cwd(), initial = {} } = {}) {
  const blocked = pendingLiveRuns(checkout);
  if (blocked.length) throw new PendingLiveRunError(blocked);
  const runs = path.resolve(checkout, '.candidate-artifacts/live-sdk101-runs');
  fs.mkdirSync(runs, { recursive: true });
  const token = randomUUID(), directory = path.join(runs, token), lock = path.join(runs, 'admission.lock');
  try { exclusiveJson(lock, { token, directory }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new PendingLiveRunError([{ path: lock, hashes: pendingLiveRuns(checkout).flatMap(record => record.hashes) }]);
  }
  let sequence = 0, latestPath;
  const release = () => {
    if (JSON.parse(fs.readFileSync(lock, 'utf8')).token !== token) throw new Error('GRAPH admission ownership changed: ' + lock);
    fs.unlinkSync(lock); // Only the admission file created by this invocation.
  };
  const persist = record => {
    const file = path.join(directory, String(++sequence).padStart(6, '0') + '.json');
    exclusiveJson(file, { ...record, runId: token });
    latestPath = file;
    return file;
  };
  try {
    const pending = pendingLiveRuns(checkout);
    if (pending.length) throw new PendingLiveRunError(pending);
    fs.mkdirSync(directory);
    persist({ ...initial, phase: 'setup' });
  } catch (error) { release(); throw error; }
  return {
    directory, persist, release,
    get latestPath() { return latestPath; },
    assertCanSend() {
      if (JSON.parse(fs.readFileSync(lock, 'utf8')).token !== token) throw new Error('GRAPH admission ownership changed: ' + lock);
      const pending = pendingLiveRuns(checkout, directory);
      if (pending.length) throw new PendingLiveRunError(pending);
    },
  };
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withIsolatedCheckout } from './isolated-checkout.mjs';

const version = [1, 0, 0].join('.');
withIsolatedCheckout(({ root }) => {
  for (const file of ['packages/arkiv-graph/package.json', 'apps/example/package.json']) {
    const target = path.join(root, file);
    const manifest = JSON.parse(fs.readFileSync(target));
    for (const field of ['devDependencies', 'dependencies']) {
      if (manifest[field]?.['@arkiv-network/sdk']) manifest[field]['@arkiv-network/sdk'] = version;
    }
    fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  }
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true', SDK_TEST_VERSION: version },
  });
  run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@arkiv-network/sdk/package.json'))).version, version);
  run('pnpm', ['test']);
  run('pnpm', ['test:wallet']);
  run('pnpm', ['exec', 'vitest', 'run', 'scripts/graph-writer.test.ts']);
  run(process.execPath, ['scripts/sdk-runtime-check.mjs']);
  console.log(JSON.stringify({ status: 'PASS', peerBaseline: version, isolated: true }));
}, { prefix: 'graph-sdk-peer-' });

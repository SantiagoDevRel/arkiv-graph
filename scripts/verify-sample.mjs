// Build an isolated consumer of the exact candidate tarball before registry publication.
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = resolve('.');
const stage = resolve(process.env.TMPDIR, 'graph-preview-stage');
mkdirSync(stage);
const files = execFileSync('git', ['ls-files', '-z', '--cached'], { encoding: 'utf8' }).split('\0')
  .filter(Boolean).filter(name => !/(?:^|\/)\.env(?:\.[^/]*)?\.example$/i.test(name));
for (const name of files) {
  assert(!/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(name), 'Unexpected sensitive file in candidate source');
  const destination = join(stage, name);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, name), destination);
}
const vendor = join(stage, 'vendor');
mkdirSync(vendor);
copyFileSync(join(root, '.candidate-artifacts/arkiv-graph-1.0.0.tgz'), join(vendor, 'arkiv-graph-1.0.0.tgz'));
const manifestPath = join(stage, 'apps/example/package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.dependencies['arkiv-graph'] = 'file:../../vendor/arkiv-graph-1.0.0.tgz';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
appendFileSync(join(stage, '.vercelignore'), '\n!/vendor\n/vendor/*\n!/vendor/arkiv-graph-1.0.0.tgz\n');
execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: stage, stdio: 'inherit' });
const require = createRequire(manifestPath);
const entry = realpathSync(require.resolve('arkiv-graph'));
assert(entry.includes('/node_modules/'), 'The sample must resolve an installed package');
assert(!entry.startsWith(join(stage, 'packages/arkiv-graph/')), 'Workspace source is not a consumer test');
assert.equal(JSON.parse(readFileSync(join(dirname(entry), '../package.json'), 'utf8')).version, '1.0.0');
execFileSync('pnpm', ['typecheck'], { cwd: stage, stdio: 'inherit' });
execFileSync('pnpm', ['build'], { cwd: stage, stdio: 'inherit' });
const archive = join(root, '.candidate-artifacts/preview-stage.tgz');
execFileSync('tar', ['--exclude=node_modules', '--exclude=.next', '--exclude=.next-dev', '--exclude=dist', '--exclude=*.tsbuildinfo', '--exclude=.candidate-artifacts', '-czf', archive, '-C', stage, '.']);
const evidence = { status: 'passed', consumer: 'isolated npm tarball sample', packageVersion: '1.0.0', sourcePin: manifest.dependencies['arkiv-graph'], entry, sourceFiles: files.length, typecheck: true, build: true, stageArchive: archive };
writeFileSync(join(root, '.candidate-artifacts/sample.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

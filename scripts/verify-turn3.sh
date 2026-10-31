#!/usr/bin/env bash
set -euo pipefail
bash scripts/verify-release.sh
node --input-type=module <<'JS'
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const sha256=createHash('sha256').update(readFileSync('.candidate-artifacts/arkiv-graph-1.0.0.tgz')).digest('hex');
if(sha256!=='38a426464e19deee8e16e0f3f4d5b38a9c2a9c079413e38e118d96055b5b585e')throw new Error('The reviewed library tarball changed; preserve and report its new hash before publication.');
writeFileSync('.candidate-artifacts/tarball-sha-turn3.json',JSON.stringify({sha256,unchanged:true},null,2));
JS
node "${GRAPH_SECRET_RUNNER:?}" run --vars arkiv-rabdi.env --vars arkiv-rabdi-test-wallets.env -- node scripts/test-wallet-sample-live.mjs

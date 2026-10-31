#!/usr/bin/env bash
set -euo pipefail
bash scripts/verify-core.sh
node scripts/pack-consumer.mjs
node scripts/verify-sample.mjs
mkdir -p .candidate-artifacts
if node "${GRAPH_SECRET_RUNNER:?Set the external tools/secrets.mjs path}" run --vars arkiv-rabdi.env --vars arkiv-rabdi-test-wallets.env -- node scripts/test-rabdi.mjs > .candidate-artifacts/live.json; then
  cat .candidate-artifacts/live.json
else
  cat .candidate-artifacts/live.json
  exit 1
fi

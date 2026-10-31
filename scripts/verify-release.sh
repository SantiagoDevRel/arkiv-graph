#!/usr/bin/env bash
set -euo pipefail
bash scripts/verify-core.sh
node scripts/pack-consumer.mjs
node scripts/verify-sample.mjs
node "${GRAPH_SECRET_RUNNER:?}" run --vars arkiv-rabdi.env --vars arkiv-rabdi-test-wallets.env -- node scripts/verify-reseed.mjs

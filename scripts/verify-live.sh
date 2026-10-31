#!/usr/bin/env bash
set -euo pipefail
mkdir -p .candidate-artifacts
node "${GRAPH_SECRET_RUNNER:?}" run --vars arkiv-rabdi.env --vars arkiv-rabdi-test-wallets.env -- node scripts/test-rabdi.mjs | tee .candidate-artifacts/live-turn2.log

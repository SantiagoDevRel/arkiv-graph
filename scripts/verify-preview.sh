#!/usr/bin/env bash
set -euo pipefail
pnpm test:wallet
pnpm build:lib
node scripts/pack-consumer.mjs
node scripts/verify-sample.mjs

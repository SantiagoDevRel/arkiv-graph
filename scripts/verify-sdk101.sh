#!/bin/sh
set -eu
export npm_config_store_dir="${TMPDIR:?}/graph-pnpm-store"
pnpm install --frozen-lockfile
pnpm --filter arkiv-graph typecheck
pnpm test
pnpm test:wallet
pnpm exec vitest run scripts/graph-writer.test.ts
pnpm build:lib
pnpm typecheck
node scripts/pack-consumer.mjs
node scripts/verify-sample.mjs
pnpm lint
node --test scripts/isolated-checkout.test.mjs
node scripts/sdk-runtime-check.mjs
node scripts/sdk-peer-check.mjs
node scripts/sdk-guidance-mutation.mjs
node scripts/inspect-pack.mjs
node scripts/vocabulary-build-mutation.mjs

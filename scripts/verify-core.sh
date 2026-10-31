#!/usr/bin/env bash
set -euo pipefail
pnpm --filter arkiv-graph typecheck
pnpm test
pnpm test:wallet
pnpm exec vitest run scripts/graph-writer.test.ts
pnpm build:lib

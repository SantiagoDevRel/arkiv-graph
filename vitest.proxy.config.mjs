import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  resolve: {alias: {'@': fileURLToPath(new URL('./apps/example/src', import.meta.url))}},
  test: {include: ['apps/example/src/app/api/graph/route-origin.test.ts'], environment: 'node'},
});

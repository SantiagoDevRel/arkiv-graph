import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // arkiv-graph ships ESM + a CJS graph renderer (react-force-graph-2d) — let
  // Next transpile them so the bundling is consistent.
  transpilePackages: ["arkiv-graph", "react-force-graph-2d"],
  // Scope file-tracing to this repo (a stray lockfile higher up otherwise
  // confuses Next's monorepo root detection).
  outputFileTracingRoot: join(here, "..", ".."),
};

export default nextConfig;

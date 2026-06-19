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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

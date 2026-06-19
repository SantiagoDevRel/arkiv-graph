import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react-force-graph-2d",
    "@arkiv-network/sdk",
    "@arkiv-network/sdk/accounts",
    "@arkiv-network/sdk/chains",
    "@arkiv-network/sdk/query",
    "@arkiv-network/sdk/utils",
  ],
});

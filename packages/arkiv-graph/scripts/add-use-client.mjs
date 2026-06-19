// Prepend the "use client" directive to the built React entry. esbuild strips
// module-level directives when bundling, so we add it back here — without it,
// importing arkiv-graph/react into a Server Component crashes.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIRECTIVE = '"use client";\n';
const targets = ["dist/react/index.js", "dist/react/index.cjs"];

for (const f of targets) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, "utf8");
  if (src.startsWith('"use client"') || src.startsWith("'use client'")) continue;
  writeFileSync(f, DIRECTIVE + src);
  console.log(`+ use client → ${f}`);
}

import { buildGraph, buildTables, fetchArkivGraph, type LinkRule } from "arkiv-graph";
import { EXPLORER, NATIVE_CHAIN_ID, PROJECT, publicClient, SOCIAL_LINKS, trustedAddress } from "@/lib/arkiv";
import { TYPE_ATTRIBUTE } from "@/lib/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const ATTR_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_k, v) => typeof v === "bigint" ? String(v) : v), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const address = params.get("address") ?? trustedAddress();
  const project = params.get("project") ?? PROJECT;
  const projectKey = params.get("projectKey") ?? "project";
  const typeKey = params.get("typeKey") ?? TYPE_ATTRIBUTE;
  if (!ADDR_RE.test(address) || !ATTR_RE.test(projectKey) || !ATTR_RE.test(typeKey) || new TextEncoder().encode(project).length > 128 || /[\u0000-\u001f\u007f]/.test(project)) return json({ error: "Check the wallet address and your app's attributes." }, 400);
  try {
    const result = await fetchArkivGraph({ client: publicClient(), ownedBy: address,
      attributes: project ? { [projectKey]: project } : {}, explorerUrl: EXPLORER,
      nativeChainId: NATIVE_CHAIN_ID, limit: 500, typeAttribute: typeKey });
    // Only apply the social schema to the social app. Other apps get key references.
    const links: LinkRule[] = projectKey === "project" && project === PROJECT ? SOCIAL_LINKS : [];
    const directKeys = new Set<string>();
    const entityKeys = new Set(result.entities.map(e => e.key));
    for (const entity of result.entities) {
      const attrs = entity.attributes;
      if (Array.isArray(attrs)) {
        for (const attr of attrs) if (entityKeys.has(String(attr.value))) directKeys.add(attr.key);
      } else for (const [name, attr] of Object.entries(attrs ?? {})) {
        // A transaction hash is also 32 bytes. Only infer typed keys or fetched targets.
        if (attr.type === "key" || entityKeys.has(String(attr.value))) directKeys.add(name);
      }
    }
    const resolvedLinks = [...links, ...Array.from(directKeys, attribute => ({ type: "reference" as const, attribute }))];
    const graph = buildGraph(result.entities, { links: resolvedLinks, typeAttribute: typeKey, blockTiming: result.blockTiming, arkivExplorer: EXPLORER, nativeChainId: NATIVE_CHAIN_ID });
    const tables = buildTables(graph, result.entities, { links: resolvedLinks, typeAttribute: typeKey, blockTiming: result.blockTiming });
    return json({ address, project, projectKey, typeKey, graph, tables, loaded: result.entities.length,
      truncated: result.truncated, blockTiming: result.blockTiming ? { ...result.blockTiming, currentBlock: Number(result.blockTiming.currentBlock) } : null });
  } catch {
    return json({ error: "Could not query Tiramisu. Wait a few seconds, then refresh." }, 503);
  }
}

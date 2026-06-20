import { buildTables, fetchArkivGraph } from "arkiv-graph";
import { EXPLORER, EXTERNAL_CONFIG, NATIVE_CHAIN_ID, PROJECT, publicClient, SOCIAL_LINKS, trustedAddress } from "@/lib/arkiv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function json(data: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const address = url.searchParams.get("address")?.trim();

    if (address && !ADDR_RE.test(address)) {
      return json({ error: "Invalid address" }, { status: 400 });
    }

    const common = {
      client: publicClient() as any,
      links: SOCIAL_LINKS,
      external: EXTERNAL_CONFIG,
      labelKey: undefined,
      arkivExplorer: EXPLORER,
      explorerUrl: EXPLORER,
      nativeChainId: NATIVE_CHAIN_ID, // active Arkiv network is "native", not external
      limit: address ? 400 : 600,
    };

    const result = address
      ? await fetchArkivGraph({ ...common, ownedBy: address })
      : await fetchArkivGraph({ ...common, project: PROJECT, createdBy: trustedAddress() });

    const tables = buildTables(result.graph, result.entities, { links: SOCIAL_LINKS, blockTiming: result.blockTiming });

    return json({
      mode: address ? "wallet" : "demo",
      address: address ?? trustedAddress(),
      project: address ? null : PROJECT,
      explorer: EXPLORER,
      truncated: !!result.truncated, // true if we hit the read limit (giant DB)
      loaded: result.entities.length,
      blockTiming: result.blockTiming
        ? {
            currentBlock: Number(result.blockTiming.currentBlock),
            currentBlockTime: result.blockTiming.currentBlockTime,
            blockDuration: result.blockTiming.blockDuration,
          }
        : null,
      graph: result.graph,
      tables,
    });
  } catch (err) {
    console.error("graph route error:", (err as Error)?.message);
    return json({ error: "Failed to load graph from Arkiv." }, { status: 500 });
  }
}

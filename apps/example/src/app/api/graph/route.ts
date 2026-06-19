import { fetchArkivGraph } from "arkiv-graph";
import { EXPLORER, EXTERNAL_CONFIG, PROJECT, publicClient, SOCIAL_LINKS, trustedAddress } from "@/lib/arkiv";

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
      limit: address ? 400 : 600,
    };

    const result = address
      ? await fetchArkivGraph({ ...common, ownedBy: address })
      : await fetchArkivGraph({ ...common, project: PROJECT, createdBy: trustedAddress() });

    return json({
      mode: address ? "wallet" : "demo",
      address: address ?? trustedAddress(),
      project: address ? null : PROJECT,
      explorer: EXPLORER,
      blockTiming: result.blockTiming
        ? {
            currentBlock: Number(result.blockTiming.currentBlock),
            currentBlockTime: result.blockTiming.currentBlockTime,
            blockDuration: result.blockTiming.blockDuration,
          }
        : null,
      graph: result.graph,
    });
  } catch (err) {
    console.error("graph route error:", (err as Error)?.message);
    return json({ error: "Failed to load graph from Arkiv." }, { status: 500 });
  }
}

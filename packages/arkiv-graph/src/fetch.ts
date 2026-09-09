import { buildGraph } from "./buildGraph.js";
import { TIRAMISU_CHAIN_ID, TIRAMISU_EXPLORER } from "./chains.js";
import { type ArkivChainLike, explorerOf, rpcOf } from "./network.js";
import type { ArkivEntityLike, BlockTiming, BuildGraphOptions, Graph } from "./types.js";
import type { PublicArkivClient } from "@arkiv-network/sdk";
import type { AttributeInputs } from "@arkiv-network/sdk/attr";

export type ArkivPublicClientLike = Pick<PublicArkivClient, "select" | "getBlockTiming">;
export interface FetchArkivGraphOptions extends BuildGraphOptions {
  client?: ArkivPublicClientLike;
  /** SDK chain. Defaults to Tiramisu; custom clients require network identity. */
  chain?: ArkivChainLike;
  rpcUrl?: string;
  explorerUrl?: string;
  nativeChainId?: number;
  project?: string;
  attributes?: AttributeInputs;
  createdBy?: string;
  ownedBy?: string;
  /** Maximum entities, 1–5000; partial results are explicitly marked. */
  limit?: number;
}
export interface FetchArkivGraphResult {
  entities: ArkivEntityLike[];
  graph: Graph;
  blockTiming?: BlockTiming;
  truncated: boolean;
}
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTION = { key: true, owner: true, creator: true, createdAt: true, updatedAt: true,
  expiresAt: true, attributes: true, payload: true, contentType: true } as const;

export async function fetchArkivGraph(options: FetchArkivGraphOptions): Promise<FetchArkivGraphResult> {
  for (const field of ["createdBy", "ownedBy"] as const) {
    if (options[field] !== undefined && !ADDR_RE.test(options[field]!)) throw new Error(`Invalid ${field} address.`);
  }
  if (!options.createdBy && !options.ownedBy) throw new Error("Set createdBy or ownedBy to scope this public query.");
  const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error("limit must be an integer from 1 to 5000.");
  if ((options.client || options.rpcUrl) && !options.chain && !options.nativeChainId) {
    throw new Error("A custom client or RPC requires chain or nativeChainId; also supply explorerUrl for entity links.");
  }
  const [{ createPublicClient }, { tiramisu }, { http }, { eq }] = await Promise.all([
    import("@arkiv-network/sdk"), import("@arkiv-network/sdk/chains"), import("viem"), import("@arkiv-network/sdk/query"),
  ]);
  const chain = options.chain ?? tiramisu;
  const nativeChainId = options.nativeChainId ?? chain.id;
  const explorer = options.explorerUrl ?? explorerOf(options.chain) ?? (nativeChainId === TIRAMISU_CHAIN_ID ? TIRAMISU_EXPLORER : undefined);
  const client = options.client ?? createPublicClient({ chain: chain as typeof tiramisu, transport: http(options.rpcUrl ?? rpcOf(chain), { timeout: 15000, retryCount: 1 }) });
  let query = client.select(SELECTION);
  if (options.project !== undefined) query = query.where(eq("project", options.project));
  for (const [key, value] of Object.entries(options.attributes ?? {})) query = query.where(eq(key, value));
  if (options.createdBy) query = query.createdBy(options.createdBy as `0x${string}`);
  if (options.ownedBy) query = query.ownedBy(options.ownedBy as `0x${string}`);
  // One lookahead entity distinguishes an exact limit from a partial final page.
  let page = await query.limit(Math.min(200, limit + 1)).fetch();
  const entities: ArkivEntityLike[] = [];
  while (true) {
    entities.push(...page.entities);
    if (entities.length > limit || !page.hasNextPage()) break;
    page = await page.next();
  }
  const truncated = entities.length > limit || page.hasNextPage();
  entities.length = Math.min(entities.length, limit);
  let blockTiming: BlockTiming | undefined;
  try { blockTiming = await client.getBlockTiming(); } catch { /* Expiry remains unknown. */ }
  return { entities, truncated, blockTiming, graph: buildGraph(entities, {
    ...options, blockTiming, nativeChainId, arkivExplorer: options.arkivExplorer ?? explorer ?? "",
  }) };
}

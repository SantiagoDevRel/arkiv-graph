import { buildGraph } from "./buildGraph.js";
import { RABDI_CHAIN_ID, RABDI_EXPLORER } from "./chains.js";
import { type ArkivChainLike, explorerOf, rpcOf } from "./network.js";
import type { ArkivEntityLike, BlockTiming, BuildGraphOptions, Graph } from "./types.js";
import type { PublicArkivClient } from "@arkiv-network/sdk";
import type { PredicateValue } from "@arkiv-network/sdk/query";
import type { Chain } from "viem";

export type ArkivPublicClientLike = Pick<PublicArkivClient, "select" | "getBlockTiming">;
export interface FetchArkivGraphOptions extends BuildGraphOptions {
  client?: ArkivPublicClientLike;
  /** SDK chain. Defaults to Rabdi; custom clients require network identity. */
  chain?: ArkivChainLike;
  rpcUrl?: string;
  /** Server-side access key for Rabdi. Never pass a shared key to browser code. */
  accessKey?: string;
  explorerUrl?: string;
  nativeChainId?: number;
  project?: string;
  attributes?: Record<string, PredicateValue>;
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
const SELECTION = { $key: true, $owner: true, $creator: true, $createdAt: true, $updatedAt: true,
  $expiresAt: true, $attributes: true } as const;

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
  const [{ createPublicClient, MissingAccessKeyError }, { rabdi }, { http }, { eq, asc }] = await Promise.all([
    import("@arkiv-network/sdk"), import("@arkiv-network/sdk/chains"), import("viem"), import("@arkiv-network/sdk/query"),
  ]);
  if (!options.chain && !options.client && !options.rpcUrl && !options.accessKey) {
    throw new MissingAccessKeyError("Rabdi: set accessKey or supply a configured client. Get a free key at https://hub.arkiv.network/access-keys");
  }
  const chain = options.chain ?? (options.client || options.rpcUrl ? undefined : rabdi({ accessKey: options.accessKey! }));
  const nativeChainId = options.nativeChainId ?? chain!.id;
  const explorer = options.explorerUrl ?? explorerOf(options.chain) ?? (nativeChainId === RABDI_CHAIN_ID ? RABDI_EXPLORER : undefined);
  const client = options.client ?? createPublicClient({ chain: chain as Chain | undefined, transport: http(options.rpcUrl ?? rpcOf(chain), { timeout: 15000, retryCount: 0, fetchOptions: { cache: "no-store" } }) });
  let query = client.select(SELECTION);
  if (options.project !== undefined) query = query.where(eq("project", options.project));
  for (const [key, value] of Object.entries(options.attributes ?? {})) query = query.where(eq(key, value));
  if (options.createdBy) query = query.createdBy(options.createdBy as `0x${string}`);
  if (options.ownedBy) query = query.ownedBy(options.ownedBy as `0x${string}`);
  // Rabdi pages use offset, not cursors. Read at the head; never pin old state.
  query = query.orderBy(asc("$key"));
  const entities: ArkivEntityLike[] = [];
  let offset = 0;
  let truncated = false;
  const seen = new Set<string>();
  while (offset <= limit) {
    const take = Math.min(100, limit + 1 - offset);
    const page = await query.limit(take).offset(offset).fetch();
    for (const row of page.entities) {
      if (typeof row.$key !== "string") throw new Error("The RPC returned an entity without its selected key.");
      if (seen.has(row.$key)) continue;
      seen.add(row.$key);
      // Keep SDK rows directly consumable by both builders and JSON-safe.
      entities.push(JSON.parse(JSON.stringify(row, (_k, v) => typeof v === "bigint" ? String(v) : v)));
    }
    offset += page.entities.length;
    if (entities.length > limit || (offset > limit && page.entities.length === take)) { truncated = true; break; }
    if (page.entities.length < take) break;
  }
  entities.length = Math.min(entities.length, limit);
  let blockTiming: BlockTiming | undefined;
  try { blockTiming = await client.getBlockTiming(); } catch { /* Expiry remains unknown. */ }
  return { entities, truncated, blockTiming, graph: buildGraph(entities, {
    ...options, blockTiming, nativeChainId, arkivExplorer: options.arkivExplorer ?? explorer ?? "",
  }) };
}

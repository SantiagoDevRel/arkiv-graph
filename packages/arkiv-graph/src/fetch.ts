import { buildGraph } from "./buildGraph.js";
import type { ArkivEntityLike, BlockTiming, BuildGraphOptions, Graph } from "./types.js";

export interface FetchArkivGraphOptions extends BuildGraphOptions {
  /**
   * A pre-built Arkiv public client (`createPublicClient({ chain: braga, ... })`).
   * Pass this to avoid a dynamic SDK import (e.g. in the browser).
   */
  client?: ArkivPublicClientLike;
  /** RPC url, when no client is given. Defaults to the Braga public RPC. */
  rpcUrl?: string;
  /** filter: entities tagged with this `project` attribute. */
  project?: string;
  /** filter: extra equality predicates (attribute key → value). */
  attributes?: Record<string, string | number>;
  /** filter: only entities created by this wallet (recommended on the shared testnet). */
  createdBy?: string;
  /** filter: only entities currently owned by this wallet ("connect wallet → your graph"). */
  ownedBy?: string;
  /** max entities to load (paginated under the hood). Default 500. */
  limit?: number;
}

/** Minimal shape of the Arkiv public client we rely on. */
export interface ArkivPublicClientLike {
  buildQuery: () => any;
  getBlockTiming?: () => Promise<BlockTiming>;
}

export interface FetchArkivGraphResult {
  entities: ArkivEntityLike[];
  graph: Graph;
  blockTiming?: BlockTiming;
}

const PAGE = 200; // Arkiv max page size
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const ATTR_KEY_RE = /^[A-Za-z0-9_.:-]+$/;

/** Arkiv does not escape interpolated query strings — strip quotes/backslashes. */
function safeValue(v: string | number): string | number {
  return typeof v === "string" ? v.replace(/["\\]/g, "") : v;
}
function assertAddress(addr: string | undefined, field: string): void {
  if (addr != null && !ADDR_RE.test(addr)) {
    throw new Error(`fetchArkivGraph: ${field} must be a 0x address, got "${addr}"`);
  }
}

async function defaultBragaClient(rpcUrl?: string): Promise<ArkivPublicClientLike> {
  const sdk: any = await import("@arkiv-network/sdk");
  const chains: any = await import("@arkiv-network/sdk/chains");
  return sdk.createPublicClient({
    chain: chains.braga,
    transport: sdk.http(rpcUrl),
  });
}

/**
 * Query Arkiv and build a graph in one call. Handles pagination and pulls block
 * timing so TTL fade works. For full control, fetch entities yourself and call
 * `buildGraph` directly.
 */
export async function fetchArkivGraph(
  options: FetchArkivGraphOptions,
): Promise<FetchArkivGraphResult> {
  // Validate the filters — these are not raw user-input sinks. Wallet filters
  // must be addresses; attribute keys must be identifiers; string values are
  // sanitized because the SDK interpolates them into query strings unescaped.
  assertAddress(options.createdBy, "createdBy");
  assertAddress(options.ownedBy, "ownedBy");

  const client = options.client ?? (await defaultBragaClient(options.rpcUrl));
  const { eq }: any = await import("@arkiv-network/sdk/query");

  const limit = options.limit ?? 500;
  const preds: any[] = [];
  if (options.project) preds.push(eq("project", safeValue(options.project)));
  for (const [k, v] of Object.entries(options.attributes ?? {})) {
    if (!ATTR_KEY_RE.test(k)) throw new Error(`fetchArkivGraph: invalid attribute key "${k}"`);
    preds.push(eq(k, safeValue(v)));
  }

  let q = client.buildQuery();
  if (preds.length) q = q.where(preds);
  if (options.createdBy) q = q.createdBy(options.createdBy);
  if (options.ownedBy) q = q.ownedBy(options.ownedBy);
  q = q.withPayload(true).withAttributes(true).withMetadata(true).limit(Math.min(PAGE, limit));

  const entities: ArkivEntityLike[] = [];
  let page = await q.fetch();
  const collect = () => {
    for (const e of page.entities ?? []) {
      if (entities.length < limit) entities.push(e);
    }
  };
  collect();
  let pages = 0;
  const maxPages = Math.ceil(limit / PAGE) + 2;
  while (entities.length < limit && typeof page.hasNextPage === "function" && page.hasNextPage() && pages < maxPages) {
    const before = entities.length;
    await page.next();
    collect();
    pages++;
    if (entities.length === before) break; // page added nothing new — avoid spinning
  }

  let blockTiming: BlockTiming | undefined;
  try {
    blockTiming = await client.getBlockTiming?.();
  } catch {
    /* TTL fade just won't render */
  }

  const graph = buildGraph(entities, { ...options, blockTiming });
  return { entities, graph, blockTiming };
}

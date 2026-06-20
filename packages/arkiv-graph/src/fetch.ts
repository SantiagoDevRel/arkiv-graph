import { buildGraph } from "./buildGraph.js";
import { BRAGA_CHAIN_ID, BRAGA_EXPLORER } from "./chains.js";
import { type ArkivChainLike, explorerOf, rpcOf } from "./network.js";
import type { ArkivEntityLike, BlockTiming, BuildGraphOptions, Graph } from "./types.js";

export interface FetchArkivGraphOptions extends BuildGraphOptions {
  /**
   * A pre-built Arkiv public client (`createPublicClient({ chain, ... })`).
   * Pass this to avoid a dynamic SDK import (e.g. in the browser).
   */
  client?: ArkivPublicClientLike;
  /**
   * The Arkiv chain to read from (the SDK's `braga` export, a future network
   * export, or one from `defineArkivNetwork`). Drives RPC, the explorer for
   * entity links, and the "native" chain id for external detection. If omitted,
   * falls back to the SDK's bundled Braga chain.
   */
  chain?: ArkivChainLike;
  /** RPC url, when no client/chain is given. Defaults to the Braga public RPC. */
  rpcUrl?: string;
  /** explorer base for Arkiv entity links. Defaults to the chain's explorer, then Braga. */
  explorerUrl?: string;
  /** chain id treated as "native" (not external). Defaults to chain.id, then Braga. */
  nativeChainId?: number;
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
  /** true if the result hit `limit` — you may be seeing a partial view. */
  truncated?: boolean;
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

async function makeClient(chain: ArkivChainLike | undefined, rpcUrl?: string): Promise<ArkivPublicClientLike> {
  const sdk: any = await import("@arkiv-network/sdk");
  let resolved = chain;
  if (!resolved) {
    const chains: any = await import("@arkiv-network/sdk/chains");
    resolved = chains.braga; // default network when none is provided
  }
  return sdk.createPublicClient({
    chain: resolved,
    transport: sdk.http(rpcUrl ?? rpcOf(resolved)),
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

  const client = options.client ?? (await makeClient(options.chain, options.rpcUrl));
  const { eq }: any = await import("@arkiv-network/sdk/query");

  // Network-derived config — nothing here is hardcoded to Braga; it follows the
  // chain you pass (so swapping testnets is a config change, not a code change).
  const explorerUrl = options.explorerUrl ?? explorerOf(options.chain) ?? BRAGA_EXPLORER;
  const nativeChainId = options.nativeChainId ?? options.chain?.id ?? BRAGA_CHAIN_ID;

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
  // collect from the CURRENT page object — works whether the SDK mutates the page
  // in place on next() or returns a fresh one (we reassign below).
  const collect = (p: any) => {
    for (const e of p?.entities ?? []) {
      if (entities.length < limit) entities.push(e);
    }
  };
  collect(page);
  let pages = 0;
  const maxPages = Math.ceil(limit / PAGE) + 2;
  while (entities.length < limit && pages < maxPages) {
    if (typeof page.hasNextPage !== "function" || !page.hasNextPage()) break;
    const before = entities.length;
    const next = await page.next();
    if (next && Array.isArray(next.entities)) page = next; // immutable SDK → new page; mutating SDK → page already updated
    collect(page);
    pages++;
    if (entities.length === before) break; // page added nothing new — avoid spinning
  }
  const moreAvailable = typeof page.hasNextPage === "function" && page.hasNextPage();

  let blockTiming: BlockTiming | undefined;
  try {
    blockTiming = await client.getBlockTiming?.();
  } catch {
    /* TTL fade just won't render */
  }

  const graph = buildGraph(entities, {
    ...options,
    blockTiming,
    arkivExplorer: options.arkivExplorer ?? explorerUrl,
    nativeChainId,
  });
  // true only when we hit the limit AND the server still has more (not a false
  // positive when the dataset happens to be exactly `limit` rows).
  const truncated = entities.length >= limit && moreAvailable;
  return { entities, graph, blockTiming, truncated };
}

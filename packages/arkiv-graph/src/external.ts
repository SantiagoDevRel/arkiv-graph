import { addressExplorerUrl, BRAGA_CHAIN_ID, lookupChain, txExplorerUrl } from "./chains.js";
import type { NormEntity } from "./normalize.js";
import type { ExternalConfig, GraphEdge, GraphNode } from "./types.js";

const DEFAULTS = {
  chainIdKeys: /_?chain_?id$/i,
  contractKeys: /_?contract(_?address)?$/i,
  txKeys: /(_?tx_?hash$|_?txid$|_?tx$)/i,
  addressKeys: /(_?from$|_?to$|_?wallet$|_?address$|_?recipient$)/i,
};

function isHexAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}
function isHexTx(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

interface RefGroup {
  prefix: string;
  chainId?: number | string;
  contract?: string;
  tx?: string;
  address?: string;
}

function stripSuffix(key: string, re: RegExp): string {
  return key.replace(re, "").replace(/[_-]+$/, "").toLowerCase() || "_default";
}

/**
 * Find references to OTHER chains inside an entity's attributes and group them
 * by a shared name prefix (e.g. `pfpChainId` + `pfpContract` + `pfpTokenId`
 * belong together; `mintChainId` + `mintTx` form another group).
 *
 * Detection is by attribute KEY name — never by scanning every 0x value — so an
 * entity key or a same-chain reference attribute is not mistaken for a foreign tx.
 */
export function detectGroups(
  e: NormEntity,
  cfg: ExternalConfig = {},
  internalKeys?: Set<string>,
): RefGroup[] {
  const chainIdKeys = cfg.chainIdKeys ?? DEFAULTS.chainIdKeys;
  const contractKeys = cfg.contractKeys ?? DEFAULTS.contractKeys;
  const txKeys = cfg.txKeys ?? DEFAULTS.txKeys;
  const addressKeys = cfg.addressKeys ?? DEFAULTS.addressKeys;

  const groups = new Map<string, RefGroup>();
  const get = (prefix: string): RefGroup => {
    let g = groups.get(prefix);
    if (!g) {
      g = { prefix };
      groups.set(prefix, g);
    }
    return g;
  };
  // Never classify a value that is one of OUR fetched entity keys (also 0x+64hex)
  // as a foreign tx — that's an internal reference, not a cross-chain link.
  const isInternal = (v: string) => internalKeys?.has(v) ?? false;

  for (const { key, value } of e.attributes) {
    if (chainIdKeys.test(key)) {
      const prefix = stripSuffix(key, chainIdKeys);
      const num = typeof value === "number" ? value : Number(value);
      get(prefix).chainId = Number.isFinite(num) ? num : value;
    } else if (contractKeys.test(key)) {
      if (isHexAddress(value) && !isInternal(value)) get(stripSuffix(key, contractKeys)).contract = value.toLowerCase();
    } else if (txKeys.test(key)) {
      if (isHexTx(value) && !isInternal(value)) get(stripSuffix(key, txKeys)).tx = value.toLowerCase();
    } else if (addressKeys.test(key)) {
      if (isHexAddress(value) && !isInternal(value)) get(stripSuffix(key, addressKeys)).address = value.toLowerCase();
    }
  }

  // A group is external only if it names a chain, a contract, or a tx. A bare
  // address with no chain/contract/tx is most likely a local Braga wallet — drop it.
  return [...groups.values()].filter((g) => g.chainId != null || g.contract || g.tx);
}

/**
 * Add external chain/contract/tx/address nodes (and edges from the entity to
 * them) for one entity. We DO NOT read those chains — nodes are built purely
 * from the references the entity already stores.
 */
export function addExternalForEntity(
  e: NormEntity,
  entityNodeId: string,
  cfg: ExternalConfig | undefined,
  ensureNode: (n: GraphNode) => void,
  addEdge: (edge: GraphEdge) => void,
  internalKeys?: Set<string>,
): void {
  if (cfg?.enabled === false) return;
  const native = new Set<number | string>([
    BRAGA_CHAIN_ID,
    String(BRAGA_CHAIN_ID),
    ...(cfg?.nativeChainIds ?? []),
  ]);
  const groups = detectGroups(e, cfg, internalKeys);

  for (const g of groups) {
    // Skip groups that only reference Arkiv's own chain.
    if (g.chainId != null && native.has(g.chainId)) continue;

    const chainId = g.chainId ?? "unknown";
    const info = g.chainId != null ? lookupChain(g.chainId, cfg?.registry) : undefined;
    const chainName = info?.name ?? (g.chainId != null ? `Chain ${g.chainId}` : "External");
    const color = info?.color ?? "#7a8699";
    const chainNodeId = `ext:chain:${chainId}`;

    ensureNode({
      id: chainNodeId,
      kind: "external",
      label: chainName,
      external: { chainId: g.chainId, chainName, kind: "chain", color, explorerUrl: info?.explorer },
      explorerUrl: info?.explorer,
    });
    addEdge({
      id: `${entityNodeId}->${chainNodeId}`,
      source: entityNodeId,
      target: chainNodeId,
      kind: "external",
      label: `on ${chainName}`,
      directed: true,
    });

    if (g.contract) {
      const id = `ext:contract:${chainId}:${g.contract}`;
      ensureNode({
        id,
        kind: "external",
        label: `${g.contract.slice(0, 6)}…${g.contract.slice(-4)}`,
        external: {
          chainId: g.chainId,
          chainName,
          kind: "contract",
          ref: g.contract,
          color,
          explorerUrl: addressExplorerUrl(info, g.contract),
        },
        explorerUrl: addressExplorerUrl(info, g.contract),
      });
      addEdge({ id: `${chainNodeId}->${id}`, source: chainNodeId, target: id, kind: "external", label: "contract" });
    }
    if (g.tx) {
      const id = `ext:tx:${chainId}:${g.tx}`;
      ensureNode({
        id,
        kind: "external",
        label: `tx ${g.tx.slice(0, 6)}…`,
        external: {
          chainId: g.chainId,
          chainName,
          kind: "tx",
          ref: g.tx,
          color,
          explorerUrl: txExplorerUrl(info, g.tx),
        },
        explorerUrl: txExplorerUrl(info, g.tx),
      });
      addEdge({ id: `${chainNodeId}->${id}`, source: chainNodeId, target: id, kind: "external", label: "tx" });
    }
    if (g.address) {
      const id = `ext:address:${chainId}:${g.address}`;
      ensureNode({
        id,
        kind: "external",
        label: `${g.address.slice(0, 6)}…${g.address.slice(-4)}`,
        external: {
          chainId: g.chainId,
          chainName,
          kind: "address",
          ref: g.address,
          color,
          explorerUrl: addressExplorerUrl(info, g.address),
        },
        explorerUrl: addressExplorerUrl(info, g.address),
      });
      addEdge({ id: `${chainNodeId}->${id}`, source: chainNodeId, target: id, kind: "external", label: "address" });
    }
  }
}

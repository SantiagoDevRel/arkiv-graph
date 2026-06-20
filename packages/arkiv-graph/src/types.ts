// ─────────────────────────────────────────────────────────────────────────────
// arkiv-graph — core types
// ─────────────────────────────────────────────────────────────────────────────

/** An Arkiv attribute. Values are string | number only (the SDK drops bigint/boolean). */
export interface ArkivAttribute {
  key: string;
  value: string | number;
}

/**
 * The shape returned by the Arkiv SDK's read actions, plus anything close enough.
 * `buildGraph` normalizes this, so plain objects (e.g. from tests or your own
 * indexer) work too — only `key` is strictly required.
 */
export interface ArkivEntityLike {
  /** Entity key — the unique id, a 0x + 64 hex string on Braga. */
  key: string;
  owner?: string;
  creator?: string;
  contentType?: string;
  /** TTL anchor. bigint from the SDK; number/string also accepted. */
  expiresAtBlock?: bigint | number | string;
  createdAtBlock?: bigint | number | string;
  lastModifiedAtBlock?: bigint | number | string;
  attributes?: ArkivAttribute[];
  /** Raw payload bytes, an already-parsed object, or absent. */
  payload?: unknown;
  /** SDK entities expose toJson() to parse the payload — used if present. */
  toJson?: () => unknown;
}

/** Block timing, as returned by `publicClient.getBlockTiming()`. */
export interface BlockTiming {
  currentBlock: bigint | number;
  /** Unix seconds of the current block. */
  currentBlockTime: number;
  /** Seconds per block (~2 on Braga). */
  blockDuration: number;
}

export type NodeKind = "entity" | "wallet" | "tag" | "external";
export type ExternalKind = "chain" | "contract" | "address" | "tx";

export interface ExternalRef {
  /** numeric chain id, or a string id (e.g. "stellar"). undefined = unknown chain. */
  chainId?: number | string;
  chainName?: string;
  kind: ExternalKind;
  /** the raw value referenced (address, tx hash, …). */
  ref?: string;
  /** a link out to that chain's explorer, when known. */
  explorerUrl?: string;
  color?: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** entityType attribute value, for kind === "entity". */
  entityType?: string;
  payload?: unknown;
  attributes?: ArkivAttribute[];
  owner?: string;
  creator?: string;
  expiresAtBlock?: number;
  createdAtBlock?: number;
  /** seconds until expiry (negative = already expired); undefined if unknown. */
  ttlSeconds?: number;
  /** unix seconds at which the entity expires (absolute); undefined if unknown. */
  expiresAt?: number;
  /** 0..1 share of lifetime remaining, for the fade effect; undefined if unknown. */
  ttlFraction?: number;
  /** filled for kind === "external". */
  external?: ExternalRef;
  /** a link to view this node on an explorer (entity page / tx / address). */
  explorerUrl?: string;
  /** number of edges touching this node (filled by buildGraph). */
  degree?: number;
  /** the original entity, when this node is an Arkiv entity. */
  raw?: ArkivEntityLike;
  /** true when the node is a placeholder for a referenced-but-not-fetched entity. */
  unresolved?: boolean;
}

export type EdgeKind = "reference" | "shared" | "join" | "tag" | "owner" | "external";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  /** the attribute that produced this edge, when applicable. */
  attribute?: string;
  directed?: boolean;
  /** for join edges: the key of the entity that was collapsed into this edge. */
  viaEntityKey?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Link rules ───────────────────────────────────────────────────────────────
// Arkiv has no native joins/foreign keys. Relationships exist only as shared
// attribute values or attributes holding another entity's key. These rules tell
// arkiv-graph how YOUR data relates — they are a configurable feature, not magic.

export interface ReferenceRule {
  type: "reference";
  /** attribute whose value points at another entity. */
  attribute: string;
  /**
   * how the value resolves to a target:
   *  - undefined (default): the value IS the target entity's key.
   *  - a string: the value matches the target entity's attribute of this name
   *    (reference by a stable business id, not the on-chain key).
   */
  targetAttribute?: string;
  /** optional: only apply to source entities of this entityType. */
  sourceType?: string;
  /** optional: only draw if the target entity is of this entityType. */
  targetType?: string;
  label?: string;
  /** default true (entity → referenced entity). */
  directed?: boolean;
}

export interface SharedRule {
  type: "shared";
  /** entities with the same value for this attribute get connected. */
  attribute: string;
  label?: string;
  /**
   * connect members through a single hub node instead of pairwise. Default true
   * (pairwise on a high-cardinality attribute explodes into a hairball).
   */
  viaHub?: boolean;
  /** skip groups larger than this when pairwise (default 12). */
  maxGroup?: number;
  /** values to ignore (e.g. "", "none"). */
  ignoreValues?: (string | number)[];
}

export interface JoinRule {
  type: "join";
  /** entities of this entityType are removed as nodes and rendered AS edges. */
  entityType: string;
  /** attribute on the join entity pointing at the source node. */
  sourceAttr: string;
  /** attribute on the join entity pointing at the target node. */
  targetAttr: string;
  /**
   * how `sourceAttr` resolves to a node:
   *  - undefined (default): the value IS the source node's key.
   *  - a string: match the value against this attribute on candidate nodes
   *    (e.g. "handle") — i.e. join by a stable business id, not the on-chain key.
   */
  sourceMatchAttr?: string;
  /** likewise for `targetAttr`. */
  targetMatchAttr?: string;
  /** restrict the source endpoint to nodes of this entityType (disambiguates ids). */
  sourceType?: string;
  /** restrict the target endpoint to nodes of this entityType. */
  targetType?: string;
  label?: string;
  /** default true. */
  directed?: boolean;
}

export interface TagRule {
  type: "tag";
  /** make one tag node per distinct value and connect entities that carry it. */
  attribute: string;
}

export interface OwnerRule {
  type: "owner";
  /** connect each entity to a wallet node for its owner. */
  label?: string;
  /** use `creator` instead of `owner`. */
  byCreator?: boolean;
}

export type LinkRule = ReferenceRule | SharedRule | JoinRule | TagRule | OwnerRule;

// ── External-chain detection config ──────────────────────────────────────────

export interface ChainInfo {
  name: string;
  short?: string;
  color: string;
  /** explorer base, no trailing slash. */
  explorer?: string;
  /** a free public RPC for this chain — for OPTIONAL external enrichment (off by default). */
  rpc?: string;
  /** true for Arkiv's own chain — never treated as "external". */
  native?: boolean;
}

export interface ExternalConfig {
  /** disable external detection entirely. */
  enabled?: boolean;
  /** regex matched against attribute KEYS to find a chain id (value parsed as number/string). */
  chainIdKeys?: RegExp;
  /** regex matched against attribute KEYS to find a contract address. */
  contractKeys?: RegExp;
  /** regex matched against attribute KEYS to find a tx hash. */
  txKeys?: RegExp;
  /** regex matched against attribute KEYS to find a plain address. */
  addressKeys?: RegExp;
  /** merge/override the built-in chain registry. */
  registry?: Record<string | number, ChainInfo>;
  /** chain ids to treat as native (never external) — Braga is always native. */
  nativeChainIds?: (number | string)[];
}

// ── buildGraph options ───────────────────────────────────────────────────────

export interface BuildGraphOptions {
  links?: LinkRule[];
  external?: ExternalConfig;
  /** attribute used as the entity's type. Default "entityType". */
  typeAttribute?: string;
  /** payload field (or attribute) to use as a node's display label. */
  labelKey?: string;
  /** block timing, so TTL (fade) can be computed. */
  blockTiming?: BlockTiming;
  /** create faint placeholder nodes for references whose target wasn't fetched. Default true. */
  createPlaceholders?: boolean;
  /** explorer base for Arkiv entity nodes, no trailing slash. */
  arkivExplorer?: string;
  /**
   * The active Arkiv chain id — treated as "native" (never external). Convenience
   * for direct buildGraph consumers; equivalent to setting `external.nativeChainIds`.
   * Defaults to Braga when neither is set.
   */
  nativeChainId?: number;
}

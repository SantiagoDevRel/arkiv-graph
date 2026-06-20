// arkiv-graph — core (framework-agnostic). The React component lives at
// "arkiv-graph/react".

export { buildGraph } from "./buildGraph.js";
export { fetchArkivGraph } from "./fetch.js";
export type {
  ArkivPublicClientLike,
  FetchArkivGraphOptions,
  FetchArkivGraphResult,
} from "./fetch.js";

export { computeTtl, formatTtl, formatExpiry } from "./ttl.js";
export type { Ttl } from "./ttl.js";

export {
  CHAIN_REGISTRY,
  BRAGA_CHAIN_ID,
  BRAGA_EXPLORER,
  lookupChain,
  txExplorerUrl,
  addressExplorerUrl,
} from "./chains.js";

export { defineArkivNetwork, explorerOf, rpcOf, entityExplorerUrl } from "./network.js";
export type { ArkivChainLike, ArkivNetworkOverrides } from "./network.js";

export { detectGroups } from "./external.js";

export { buildTables } from "./tables.js";
export type {
  BuildTablesOptions,
  EntityTable,
  RelRef,
  TableColumn,
  TableColumnKind,
  TableRelationship,
  TableRow,
  TablesModel,
} from "./tables.js";

export type {
  ArkivAttribute,
  ArkivEntityLike,
  BlockTiming,
  BuildGraphOptions,
  ChainInfo,
  ExternalConfig,
  ExternalKind,
  ExternalRef,
  Graph,
  GraphEdge,
  GraphNode,
  EdgeKind,
  JoinRule,
  LinkRule,
  NodeKind,
  OwnerRule,
  ReferenceRule,
  SharedRule,
  TagRule,
} from "./types.js";

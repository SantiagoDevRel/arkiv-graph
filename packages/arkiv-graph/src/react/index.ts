// arkiv-graph/react — the interactive graph + tables components.
export { ArkivGraph } from "./ArkivGraph.js";
export type { ArkivGraphProps } from "./ArkivGraph.js";
export { ArkivTables } from "./ArkivTables.js";
export type { ArkivTablesProps } from "./ArkivTables.js";
export { NodeDetail } from "./NodeDetail.js";
export type { NodeDetailProps, NodeConnection } from "./NodeDetail.js";
export { ARKIV_THEME, buildRelationshipColors, nodeColorFor, nodeRadiusFor } from "./theme.js";
export type { ArkivGraphTheme } from "./theme.js";

// re-export core so consumers can `import { buildGraph, ArkivGraph } from "arkiv-graph/react"`
export * from "../index.js";

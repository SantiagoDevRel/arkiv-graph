import type { GraphNode } from "../types.js";

export interface ArkivGraphTheme {
  background: string;
  text: string;
  muted: string;
  /** colour for Arkiv entity nodes, keyed by entityType (lowercased). */
  entityColors: Record<string, string>;
  /** fallback palette for unknown entity types. */
  palette: string[];
  walletColor: string;
  tagColor: string;
  unresolvedColor: string;
  /** edge colours by kind (fallback when no per-relationship colour applies). */
  edgeColors: Record<string, string>;
  /** vivid, distinct palette used to colour each relationship (edge label). */
  relPalette: string[];
  accent: string;
}

// Arkiv Design System (dark). Blue leads (#4b52c7), orange is the spark (#fe7446),
// ink text (#f0ede8) on page #111111. Brand colours anchor the node/edge palettes.
export const ARKIV_THEME: ArkivGraphTheme = {
  background: "#111111",
  text: "#f0ede8",
  muted: "#a0a0a0",
  accent: "#fe7446",
  entityColors: {
    user: "#4b52c7", // blue — primary leads
    profile: "#4b52c7",
    post: "#14a6ef", // cyan
    comment: "#9b8cff", // violet
    tip: "#fe7446", // orange spark
    message: "#14a6ef",
    note: "#14a6ef",
    session: "#33d6a6",
  },
  palette: ["#4b52c7", "#14a6ef", "#fe7446", "#9b8cff", "#33d6a6", "#ffb020", "#ff5d8f", "#54d6c2"],
  walletColor: "#e0a93f",
  tagColor: "#8a8f9c",
  unresolvedColor: "#4a4a4a",
  edgeColors: {
    reference: "#5a5a5a",
    join: "#3a8f6e",
    shared: "#6a5fb0",
    tag: "#555560",
    owner: "#7a6a30",
    external: "#9aa0a8",
  },
  relPalette: ["#fe7446", "#6f76e6", "#14a6ef", "#4ade80", "#ffb020", "#b388ff", "#ff5d8f", "#54d6c2", "#ff924d", "#5ad1e6"],
};

/** Stable colour per distinct relationship label. Labels are sorted first so the
 *  graph and the tables view assign identical colours regardless of input order. */
export function buildRelationshipColors(
  labels: string[],
  theme: ArkivGraphTheme = ARKIV_THEME,
): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(labels)].sort();
  unique.forEach((label, i) => map.set(label, theme.relPalette[i % theme.relPalette.length]!));
  return map;
}

let paletteCursor = 0;
const assigned = new Map<string, string>();

/** Stable colour for a node — brand colours for known types, chain colours for
 *  external nodes, a rotating palette for everything else. */
export function nodeColorFor(node: GraphNode, theme: ArkivGraphTheme = ARKIV_THEME): string {
  if (node.unresolved) return theme.unresolvedColor;
  if (node.kind === "external") return node.external?.color ?? theme.muted;
  if (node.kind === "wallet") return theme.walletColor;
  if (node.kind === "tag") return theme.tagColor;
  const type = (node.entityType ?? "").toLowerCase();
  if (type && theme.entityColors[type]) return theme.entityColors[type]!;
  if (type) {
    if (!assigned.has(type)) {
      assigned.set(type, theme.palette[paletteCursor % theme.palette.length]!);
      paletteCursor++;
    }
    return assigned.get(type)!;
  }
  return theme.accent;
}

/** Base radius for a node, scaled by degree. */
export function nodeRadiusFor(node: GraphNode): number {
  const base =
    node.kind === "external" && node.external?.kind === "chain"
      ? 7
      : node.kind === "wallet"
        ? 5
        : node.kind === "tag"
          ? 4
          : 5;
  const deg = node.degree ?? 0;
  return base + Math.min(6, Math.sqrt(deg));
}

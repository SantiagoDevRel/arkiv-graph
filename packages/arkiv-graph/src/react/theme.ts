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

export const ARKIV_THEME: ArkivGraphTheme = {
  background: "#0a0c10",
  text: "#e9edf4",
  muted: "#8b95a7",
  accent: "#FF6A00",
  entityColors: {
    user: "#FF6A00",
    profile: "#FF6A00",
    post: "#43b0ff",
    comment: "#9b8cff",
    tip: "#33d6a6",
    message: "#43b0ff",
    note: "#43b0ff",
    session: "#33d6a6",
  },
  palette: ["#FF6A00", "#43b0ff", "#9b8cff", "#33d6a6", "#ffb020", "#ff5d8f", "#5ad1e6", "#c0e060"],
  walletColor: "#f4c542",
  tagColor: "#7d8aa3",
  unresolvedColor: "#4a5363",
  edgeColors: {
    reference: "#5b6577",
    join: "#3a8f6e",
    shared: "#6a5fb0",
    tag: "#4f5a70",
    owner: "#7a6a30",
    external: "#9aa3b2",
  },
  relPalette: ["#ffb020", "#43d6a6", "#ff5d8f", "#7aa2ff", "#c0e060", "#ff924d", "#5ad1e6", "#b388ff", "#f25c54", "#54d6c2"],
};

/** Stable colour per distinct relationship label, assigned from relPalette. */
export function buildRelationshipColors(
  labels: string[],
  theme: ArkivGraphTheme = ARKIV_THEME,
): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const label of labels) {
    if (!map.has(label)) {
      map.set(label, theme.relPalette[i % theme.relPalette.length]!);
      i++;
    }
  }
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

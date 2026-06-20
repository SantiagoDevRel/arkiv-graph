// Tables view model — a "Supabase-like" browser for Arkiv entities. NOT SQL:
// Arkiv has no FK constraints, joins, RLS, or migrations. Tables are built from
// the SAME graph the force view uses (so relationships never drift) plus the raw
// entities (join entities live only as edges in the graph, so we read their rows
// back from `entities`).
import { labelForRule } from "./buildGraph.js";
import { normalizeEntity, type NormEntity } from "./normalize.js";
import { computeTtl } from "./ttl.js";
import type { ArkivEntityLike, BlockTiming, Graph, GraphNode, JoinRule, LinkRule } from "./types.js";

export type TableColumnKind = "meta" | "attribute" | "relationship";
export interface TableColumn {
  id: string;
  label: string;
  kind: TableColumnKind;
}
export interface RelRef {
  relationship: string;
  targetId: string;
  targetLabel: string;
  direction: "in" | "out" | "both";
  unresolved?: boolean;
}
export interface TableRow {
  id: string;
  label: string;
  entityType?: string;
  owner?: string;
  ttlSeconds?: number;
  /** unix seconds at which this row's entity expires; rendered as an absolute date. */
  expiresAt?: number;
  /** colId → a string value (meta/attribute) or relationship refs. */
  cells: Record<string, string | RelRef[]>;
}
export interface EntityTable {
  type: string;
  kind: "collection" | "junction";
  count: number;
  columns: TableColumn[];
  rows: TableRow[];
}
export interface TableRelationship {
  label: string;
  kind: string;
  from?: string;
  to?: string;
  count: number;
}
export interface TablesModel {
  tables: EntityTable[];
  relationships: TableRelationship[];
  warnings: string[];
}

export interface BuildTablesOptions {
  links?: LinkRule[];
  typeAttribute?: string;
  blockTiming?: BlockTiming;
}

const HIDDEN_ATTRS = new Set(["project", "entityType"]);

function shortHex(s: string): string {
  return /^0x[0-9a-fA-F]{8,}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function edgeId(e: { source: unknown }): string {
  return typeof (e as any).source === "string" ? (e as any).source : (e as any).source?.id;
}

export function buildTables(graph: Graph, entities: ArkivEntityLike[], options: BuildTablesOptions = {}): TablesModel {
  const links = options.links ?? [];
  const joinTypes = new Set(links.filter((l): l is JoinRule => l.type === "join").map((l) => l.entityType));

  const nodeById = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  // entity-key → normalized entity (to read join-entity rows back)
  const normByKey = new Map<string, NormEntity>();
  for (const e of entities) if (e?.key) normByKey.set(e.key, normalizeEntity(e));

  // incident edges per node, grouped by relationship label
  const incident = new Map<string, Map<string, RelRef[]>>();
  const addRef = (nodeId: string, label: string, ref: RelRef) => {
    let m = incident.get(nodeId);
    if (!m) incident.set(nodeId, (m = new Map()));
    const arr = m.get(label) ?? [];
    arr.push(ref);
    m.set(label, arr);
  };
  for (const e of graph.edges) {
    const s = edgeId({ source: e.source });
    const t = typeof (e as any).target === "string" ? e.target : (e as any).target?.id;
    const label = e.label ?? e.kind;
    const sN = nodeById.get(s);
    const tN = nodeById.get(t);
    addRef(s, label, { relationship: label, targetId: t, targetLabel: tN?.label ?? shortHex(t), direction: e.directed ? "out" : "both", unresolved: tN?.unresolved });
    addRef(t, label, { relationship: label, targetId: s, targetLabel: sN?.label ?? shortHex(s), direction: e.directed ? "in" : "both", unresolved: sN?.unresolved });
  }

  // ── collection tables (one per entityType among real entity nodes) ──────────
  const byType = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "entity" || n.unresolved) continue;
    const t = n.entityType ?? "(untyped)";
    if (joinTypes.has(t)) continue; // join entities are junction tables, not collections
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(n);
  }

  const tables: EntityTable[] = [];
  for (const [type, nodes] of [...byType.entries()].sort()) {
    const attrKeys = new Set<string>();
    const relLabels = new Set<string>();
    for (const n of nodes) {
      for (const a of n.attributes ?? []) if (!HIDDEN_ATTRS.has(a.key)) attrKeys.add(a.key);
      for (const label of incident.get(n.id)?.keys() ?? []) relLabels.add(label);
    }
    const hasTtl = nodes.some((n) => typeof n.expiresAt === "number");
    const columns: TableColumn[] = [
      { id: "_key", label: "key", kind: "meta" },
      ...[...attrKeys].sort().map((k) => ({ id: `attr:${k}`, label: k, kind: "attribute" as const })),
      ...[...relLabels].sort().map((l) => ({ id: `rel:${l}`, label: l, kind: "relationship" as const })),
      { id: "_owner", label: "owner", kind: "meta" },
      ...(hasTtl ? [{ id: "_ttl", label: "expires", kind: "meta" as const }] : []),
    ];
    const rows: TableRow[] = nodes.map((n) => {
      const cells: Record<string, string | RelRef[]> = {
        _key: shortHex(n.id),
        _owner: n.owner ? shortHex(n.owner) : "",
      };
      const attrMap = new Map((n.attributes ?? []).map((a) => [a.key, String(a.value)]));
      for (const k of attrKeys) cells[`attr:${k}`] = attrMap.get(k) ?? "";
      const inc = incident.get(n.id);
      for (const l of relLabels) cells[`rel:${l}`] = inc?.get(l) ?? [];
      return { id: n.id, label: n.label, entityType: n.entityType, owner: n.owner, ttlSeconds: n.ttlSeconds, expiresAt: n.expiresAt, cells };
    });
    tables.push({ type, kind: "collection", count: rows.length, columns, rows });
  }

  // ── junction tables (one per join entityType) ───────────────────────────────
  const joinRowsByType = new Map<string, { from: RelRef; to: RelRef; norm?: NormEntity; label: string }[]>();
  for (const e of graph.edges) {
    if (e.kind !== "join" || !e.viaEntityKey) continue;
    const norm = normByKey.get(e.viaEntityKey);
    const t = norm ? String(norm.attrMap.get(options.typeAttribute ?? "entityType") ?? "") : "";
    if (!t) continue;
    const s = edgeId({ source: e.source });
    const tgt = typeof (e as any).target === "string" ? e.target : (e as any).target?.id;
    const label = e.label ?? e.kind;
    const from: RelRef = { relationship: label, targetId: s, targetLabel: nodeById.get(s)?.label ?? shortHex(s), direction: "out" };
    const to: RelRef = { relationship: label, targetId: tgt, targetLabel: nodeById.get(tgt)?.label ?? shortHex(tgt), direction: "out" };
    (joinRowsByType.get(t) ?? joinRowsByType.set(t, []).get(t)!).push({ from, to, norm, label });
  }
  for (const [type, jrows] of [...joinRowsByType.entries()].sort()) {
    const attrKeys = new Set<string>();
    for (const r of jrows) for (const a of r.norm?.attributes ?? []) if (!HIDDEN_ATTRS.has(a.key)) attrKeys.add(a.key);
    const rows: TableRow[] = jrows.map((r, i) => {
      const cells: Record<string, string | RelRef[]> = {
        _from: [r.from],
        _to: [r.to],
        _owner: r.norm?.owner ? shortHex(r.norm.owner) : "",
      };
      const attrMap = new Map((r.norm?.attributes ?? []).map((a) => [a.key, String(a.value)]));
      for (const k of attrKeys) cells[`attr:${k}`] = attrMap.get(k) ?? "";
      const ttl = r.norm ? computeTtl(r.norm.expiresAtBlock, r.norm.createdAtBlock, options.blockTiming) : {};
      return { id: r.norm?.key ?? `${type}-${i}`, label: `${r.from.targetLabel} ${r.label} ${r.to.targetLabel}`, entityType: type, owner: r.norm?.owner, ttlSeconds: ttl.ttlSeconds, expiresAt: ttl.expiresAt, cells };
    });
    const hasTtl = rows.some((r) => typeof r.expiresAt === "number");
    const columns: TableColumn[] = [
      { id: "_from", label: "from", kind: "relationship" },
      { id: "_to", label: "to", kind: "relationship" },
      ...[...attrKeys].sort().map((k) => ({ id: `attr:${k}`, label: k, kind: "attribute" as const })),
      { id: "_owner", label: "owner", kind: "meta" },
      ...(hasTtl ? [{ id: "_ttl", label: "expires", kind: "meta" as const }] : []),
    ];
    tables.push({ type, kind: "junction", count: rows.length, columns, rows });
  }

  // ── relationship summary + warnings ─────────────────────────────────────────
  const edgeCountByLabel = new Map<string, number>();
  for (const e of graph.edges) {
    const l = e.label ?? e.kind;
    edgeCountByLabel.set(l, (edgeCountByLabel.get(l) ?? 0) + 1);
  }
  const relationships: TableRelationship[] = links.map((rule) => {
    const label = labelForRule(rule); // SAME label buildGraph puts on the edge — no drift
    const from = rule.type === "join" ? rule.sourceType : rule.type === "reference" ? rule.sourceType : undefined;
    const to = rule.type === "join" ? rule.targetType : rule.type === "reference" ? rule.targetType : undefined;
    return { label, kind: rule.type, from, to, count: edgeCountByLabel.get(label) ?? 0 };
  });

  const warnings: string[] = [];
  const unresolved = graph.nodes.filter((n) => n.unresolved).length;
  if (unresolved > 0) warnings.push(`${unresolved} reference${unresolved > 1 ? "s" : ""} point to entities not loaded (expired or out of scope).`);
  for (const r of relationships) if (r.count === 0) warnings.push(`Link rule "${r.label}" (${r.kind}) matched 0 rows — check the attribute names.`);
  const expiring = graph.nodes.filter((n) => typeof n.ttlSeconds === "number" && n.ttlSeconds! > 0 && n.ttlSeconds! < 86400).length;
  if (expiring > 0) warnings.push(`${expiring} entit${expiring > 1 ? "ies" : "y"} expire within 24h.`);

  return { tables, relationships, warnings };
}

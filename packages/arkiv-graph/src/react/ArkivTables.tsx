import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import type { EntityTable, Graph, GraphEdge, GraphNode, RelRef, TableRow, TablesModel } from "../index.js";
import { ARKIV_THEME, type ArkivGraphTheme, buildRelationshipColors } from "./theme.js";
import { NodeDetail, type NodeConnection } from "./NodeDetail.js";
import { ensureScrollbarStyle } from "./scrollbar.js";
import { formatExpiry } from "../ttl.js";

export interface ArkivTablesProps {
  model: TablesModel;
  /** the graph (for the detail card + cross-linking chips to rows). */
  graph?: Graph;
  theme?: ArkivGraphTheme;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
}

const SANS = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function collectLabels(model: TablesModel): string[] {
  const s = new Set<string>();
  for (const r of model.relationships) s.add(r.label);
  for (const t of model.tables) for (const row of t.rows) {
    for (const v of Object.values(row.cells)) if (Array.isArray(v)) for (const ref of v) s.add(ref.relationship);
  }
  return [...s];
}

function arrow(d: RelRef["direction"]): string {
  return d === "out" ? "→" : d === "in" ? "←" : "·";
}

export function ArkivTables({ model, graph, theme = ARKIV_THEME, height = 600, onNodeClick }: ArkivTablesProps): React.ReactElement {
  const tableCount = model.tables.length;
  const [tab, setTab] = useState(0); // 0..tableCount-1 = tables, tableCount = schema
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const scrollClass = ensureScrollbarStyle(theme);
  const relColors = useMemo(() => buildRelationshipColors(collectLabels(model), theme), [model, theme]);
  const colorOf = useCallback((rel: string) => relColors.get(rel) ?? theme.muted, [relColors, theme.muted]);
  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);

  const connectionsFor = useCallback(
    (node: GraphNode): NodeConnection[] => {
      if (!graph) return [];
      const out: NodeConnection[] = [];
      for (const e of graph.edges as GraphEdge[]) {
        const s = typeof e.source === "string" ? e.source : (e.source as any)?.id;
        const t = typeof e.target === "string" ? e.target : (e.target as any)?.id;
        if (s !== node.id && t !== node.id) continue;
        const outgoing = s === node.id;
        const otherId = outgoing ? t : s;
        const label = e.label ?? e.kind;
        out.push({
          relationship: label,
          color: e.kind === "external" ? nodeById.get(otherId)?.external?.color ?? theme.muted : colorOf(label),
          otherLabel: nodeById.get(otherId)?.label ?? otherId,
          direction: e.directed ? (outgoing ? "out" : "in") : "both",
        });
      }
      return out;
    },
    [graph, nodeById, colorOf, theme.muted],
  );

  const selectNode = useCallback(
    (id: string) => {
      const n = nodeById.get(id);
      if (n) {
        setSelected(n);
        onNodeClick?.(n);
      }
    },
    [nodeById, onNodeClick],
  );

  const active: EntityTable | undefined = model.tables[tab];

  const sortedRows = useMemo(() => {
    if (!active) return [];
    const rows = [...active.rows];
    if (!sort) return rows;
    const { col, dir } = sort;
    rows.sort((a, b) => {
      if (col === "_ttl") return ((a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity)) * dir;
      const av = a.cells[col];
      const bv = b.cells[col];
      const an = Array.isArray(av) ? av.length : (av ?? "");
      const bn = Array.isArray(bv) ? bv.length : (bv ?? "");
      if (typeof an === "number" && typeof bn === "number") return (an - bn) * dir;
      return String(an).localeCompare(String(bn)) * dir;
    });
    return rows;
  }, [active, sort]);

  const toggleSort = (col: string) =>
    setSort((s) => (s?.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }));

  const tabStyle = (on: boolean): React.CSSProperties => ({
    border: "none",
    background: on ? theme.accent : "transparent",
    color: on ? "#160a00" : theme.muted,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 8,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  function Chips({ refs }: { refs: RelRef[] }) {
    if (!refs.length) return <span style={{ color: theme.muted, opacity: 0.4 }}>—</span>;
    return (
      <span style={{ display: "flex", flexWrap: "nowrap", gap: 4, overflow: "hidden", alignItems: "center" }}>
        {refs.slice(0, 3).map((r, i) => {
          const c = colorOf(r.relationship);
          const clickable = nodeById.has(r.targetId);
          return (
            <button
              key={i}
              onClick={clickable ? () => selectNode(r.targetId) : undefined}
              title={`${r.relationship} ${arrow(r.direction)} ${r.targetLabel}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontFamily: SANS,
                color: r.unresolved ? theme.unresolvedColor : theme.text,
                background: `${c}1f`,
                border: `1px solid ${c}66`,
                borderRadius: 20,
                padding: "1px 8px",
                cursor: clickable ? "pointer" : "default",
                maxWidth: 130,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: c }}>{arrow(r.direction)}</span>
              {r.targetLabel.length > 16 ? `${r.targetLabel.slice(0, 15)}…` : r.targetLabel}
            </button>
          );
        })}
        {refs.length > 3 && <span style={{ color: theme.muted, fontSize: 11, flexShrink: 0 }}>+{refs.length - 3}</span>}
      </span>
    );
  }

  return (
    <div
      style={{ position: "relative", width: "100%", height, background: theme.background, borderRadius: 12, border: `1px solid ${theme.muted}22`, overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: SANS }}
    >
      {/* tabs */}
      <div className={scrollClass} style={{ display: "flex", gap: 6, padding: 10, overflowX: "auto", borderBottom: `1px solid ${theme.muted}22`, flexShrink: 0 }}>
        {model.tables.map((t, i) => (
          <button key={t.type} onClick={() => { setTab(i); setSort(null); setSelected(null); }} style={tabStyle(tab === i)}>
            {t.type} <span style={{ opacity: 0.7 }}>{t.count}</span>
            {t.kind === "junction" && <span style={{ opacity: 0.6, fontWeight: 400 }}> ⋈</span>}
          </button>
        ))}
        <button onClick={() => setTab(tableCount)} style={tabStyle(tab === tableCount)}>schema</button>
      </div>

      {/* body */}
      <div className={scrollClass} style={{ flex: 1, overflow: "auto" }}>
        {tab === tableCount ? (
          <SchemaPanel model={model} colorOf={colorOf} theme={theme} />
        ) : active ? (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                {active.columns.map((c) => (
                  <th
                    key={c.id}
                    onClick={() => toggleSort(c.id)}
                    style={{
                      position: "sticky",
                      top: 0,
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "#191919",
                      color: c.kind === "relationship" ? colorOf(c.label) : theme.muted,
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      borderBottom: `1px solid ${theme.muted}33`,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                    {sort?.col === c.id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row: TableRow) => (
                <tr
                  key={row.id}
                  onClick={() => selectNode(row.id)}
                  style={{ borderBottom: `1px solid ${theme.muted}14`, cursor: nodeById.has(row.id) ? "pointer" : "default", background: selected?.id === row.id ? `${theme.accent}14` : "transparent" }}
                >
                  {active.columns.map((c) => {
                    const v = c.id === "_ttl" ? formatExpiry(row.expiresAt) : row.cells[c.id];
                    const isMeta = c.id === "_key" || c.id === "_owner";
                    const isChips = Array.isArray(v);
                    // every cell stays on ONE line; full value shows on hover (title)
                    return (
                      <td
                        key={c.id}
                        title={!isChips && typeof v === "string" && v ? v : undefined}
                        suppressHydrationWarning={c.id === "_ttl"}
                        style={{
                          padding: "8px 12px",
                          color: theme.text,
                          maxWidth: 210,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontFamily: isMeta ? MONO : SANS,
                          fontSize: isMeta ? 11 : 12,
                        }}
                      >
                        {isChips ? <Chips refs={v} /> : v || <span style={{ color: theme.muted, opacity: 0.4 }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {selected && <NodeDetail node={selected} connections={connectionsFor(selected)} theme={theme} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SchemaPanel({ model, colorOf, theme }: { model: TablesModel; colorOf: (r: string) => string; theme: ArkivGraphTheme }) {
  return (
    <div style={{ padding: 16, fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ color: theme.muted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>relationships (your link rules)</div>
      {model.relationships.map((r) => (
        <div key={r.label + r.kind} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <span style={{ width: 16, height: 4, borderRadius: 2, background: colorOf(r.label), flexShrink: 0 }} />
          <span style={{ color: theme.text, fontWeight: 600, minWidth: 70 }}>{r.label}</span>
          <span style={{ color: theme.muted }}>
            {r.kind}
            {r.from || r.to ? ` · ${r.from ?? "?"} → ${r.to ?? "?"}` : ""} · {r.count} edge{r.count === 1 ? "" : "s"}
          </span>
        </div>
      ))}

      {model.warnings.length > 0 && (
        <>
          <div style={{ color: theme.muted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, margin: "16px 0 8px" }}>checks</div>
          {model.warnings.map((w, i) => (
            <div key={i} style={{ color: "#ffb020", padding: "3px 0", display: "flex", gap: 8 }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </>
      )}
      {model.warnings.length === 0 && (
        <div style={{ color: "#43d6a6", marginTop: 14 }}>✓ No schema issues detected in the loaded rows.</div>
      )}
      <p style={{ color: theme.muted, fontSize: 11, marginTop: 18, opacity: 0.8 }}>
        Arkiv has no joins, foreign keys, or migrations — these relationships are inferred from the link rules you
        define. This is a data browser, not SQL.
      </p>
    </div>
  );
}

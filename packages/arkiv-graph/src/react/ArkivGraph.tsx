import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Graph, GraphEdge, GraphNode } from "../types.js";
import { ARKIV_THEME, type ArkivGraphTheme, buildRelationshipColors, nodeColorFor, nodeRadiusFor } from "./theme.js";
import { NodeDetail, type NodeConnection } from "./NodeDetail.js";

/** the relationship name shown to users for an edge. */
function relLabel(edge: GraphEdge): string {
  return edge.label ?? edge.kind;
}

export interface ArkivGraphProps {
  data: Graph;
  /** explicit height in px (default 560). Width fills the container. */
  height?: number;
  theme?: ArkivGraphTheme;
  onNodeClick?: (node: GraphNode) => void;
  showLegend?: boolean;
  showFilters?: boolean;
  showSearch?: boolean;
  /** render the built-in detail panel on click (default true). */
  showDetail?: boolean;
  /** fade entity nodes as their TTL runs down (default true). */
  fadeExpiring?: boolean;
  /** animate particles along join/external edges (default true). */
  animate?: boolean;
  nodeColor?: (node: GraphNode) => string;
  className?: string;
  style?: React.CSSProperties;
}

/** A category chip in the filter bar. */
interface FilterCat {
  key: string;
  label: string;
  color: string;
  test: (n: GraphNode) => boolean;
}

const SANS = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function useContainerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && Math.abs(cw - w) > 1) setW(cw);
    });
    ro.observe(el);
    setW(el.clientWidth || 800);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, w];
}

export function ArkivGraph(props: ArkivGraphProps): React.ReactElement {
  const {
    data,
    height = 560,
    theme = ARKIV_THEME,
    onNodeClick,
    showLegend = true,
    showFilters = true,
    showSearch = true,
    showDetail = true,
    fadeExpiring = true,
    animate = true,
    nodeColor,
    className,
    style,
  } = props;

  // react-force-graph-2d touches `window`, so load it client-side only.
  const [FG, setFG] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    let alive = true;
    import("react-force-graph-2d")
      .then((m) => alive && setFG(() => m.default))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const [containerRef, width] = useContainerWidth();
  const fgRef = useRef<any>(null);

  // Tune the d3 forces once the renderer is ready, for a readable spread.
  useEffect(() => {
    if (!FG) return;
    const id = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg?.d3Force) return;
      try {
        fg.d3Force("charge")?.strength(-150);
        fg.d3Force("link")?.distance((l: any) => (l.kind === "external" ? 75 : 40));
        fg.d3ReheatSimulation?.();
      } catch {
        /* noop */
      }
    }, 60);
    return () => clearTimeout(id);
  }, [FG, data]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const fittedRef = useRef(false);

  const colorOf = useCallback((n: GraphNode) => (nodeColor ? nodeColor(n) : nodeColorFor(n, theme)), [nodeColor, theme]);

  // Stable graph data for the force engine (memoized on data identity).
  const graphData = useMemo(() => {
    const links = data.edges.map((e) => ({ ...e }));
    return { nodes: data.nodes, links };
  }, [data]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  // One colour per distinct relationship (edge label). External edges instead
  // take the colour of the chain they reach, so the cords read at a glance.
  const relColors = useMemo(() => {
    const labels: string[] = [];
    for (const e of data.edges) if (e.kind !== "external") labels.push(relLabel(e));
    return buildRelationshipColors(labels, theme);
  }, [data.edges, theme]);

  const externalColorOf = useCallback(
    (edge: GraphEdge): string => {
      const s = nodeById.get(typeof edge.source === "string" ? edge.source : (edge.source as any)?.id);
      const t = nodeById.get(typeof edge.target === "string" ? edge.target : (edge.target as any)?.id);
      return s?.external?.color ?? t?.external?.color ?? theme.edgeColors.external ?? theme.muted;
    },
    [nodeById, theme],
  );

  const relColorOf = useCallback(
    (edge: GraphEdge): string => {
      if (edge.kind === "external") return externalColorOf(edge);
      return relColors.get(relLabel(edge)) ?? theme.edgeColors[edge.kind] ?? theme.muted;
    },
    [relColors, externalColorOf, theme],
  );

  // The relationship legend (semantic relationships only; external edges follow
  // chain colours, already shown in the filter chips).
  const relationshipLegend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of data.edges) {
      if (e.kind === "external") continue;
      const l = relLabel(e);
      if (!seen.has(l)) seen.set(l, relColorOf(e));
    }
    return [...seen.entries()].map(([label, color]) => ({ label, color }));
  }, [data.edges, relColorOf]);

  // Connections of the selected node (for the detail card + edge highlighting).
  const connections = useMemo<NodeConnection[]>(() => {
    if (!selected) return [];
    const out: NodeConnection[] = [];
    for (const e of data.edges) {
      const sId = typeof e.source === "string" ? e.source : (e.source as any)?.id;
      const tId = typeof e.target === "string" ? e.target : (e.target as any)?.id;
      if (sId !== selected.id && tId !== selected.id) continue;
      const outgoing = sId === selected.id;
      const otherId = outgoing ? tId : sId;
      const other = nodeById.get(otherId);
      out.push({
        relationship: relLabel(e),
        color: relColorOf(e),
        otherLabel: other?.label ?? otherId,
        direction: e.directed ? (outgoing ? "out" : "in") : "both",
      });
    }
    return out;
  }, [selected, data.edges, nodeById, relColorOf]);

  // Node ids adjacent to the selected node (to highlight on selection).
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selected) return s;
    for (const e of data.edges) {
      const sId = typeof e.source === "string" ? e.source : (e.source as any)?.id;
      const tId = typeof e.target === "string" ? e.target : (e.target as any)?.id;
      if (sId === selected.id) s.add(tId);
      else if (tId === selected.id) s.add(sId);
    }
    return s;
  }, [selected, data.edges]);

  // Reset the one-time auto-fit when the dataset changes.
  useEffect(() => {
    fittedRef.current = false;
  }, [data]);

  // Filter categories derived from the data.
  const categories = useMemo<FilterCat[]>(() => {
    const cats: FilterCat[] = [];
    const types = new Set<string>();
    let hasWallet = false;
    let hasTag = false;
    const externalChains = new Map<string, string>();
    for (const n of data.nodes) {
      if (n.kind === "entity" && n.entityType) types.add(n.entityType);
      else if (n.kind === "wallet") hasWallet = true;
      else if (n.kind === "tag") hasTag = true;
      else if (n.kind === "external") {
        const name = n.external?.chainName ?? "External";
        externalChains.set(`ext:${name}`, name);
      }
    }
    for (const t of [...types].sort()) {
      cats.push({
        key: `type:${t}`,
        label: t,
        color: colorOf({ id: "", kind: "entity", label: "", entityType: t }),
        test: (n) => n.kind === "entity" && n.entityType === t,
      });
    }
    if (hasWallet) cats.push({ key: "kind:wallet", label: "wallets", color: theme.walletColor, test: (n) => n.kind === "wallet" });
    if (hasTag) cats.push({ key: "kind:tag", label: "tags", color: theme.tagColor, test: (n) => n.kind === "tag" });
    for (const [key, name] of externalChains) {
      cats.push({
        key,
        label: name,
        color: colorOf({ id: "", kind: "external", label: "", external: { kind: "chain", chainName: name } } as GraphNode),
        test: (n) => n.kind === "external" && (n.external?.chainName ?? "External") === name,
      });
    }
    return cats;
  }, [data.nodes, colorOf, theme]);

  const isHidden = useCallback(
    (n: GraphNode) => {
      for (const c of categories) {
        if (c.test(n) && hidden.has(c.key)) return true;
      }
      return false;
    },
    [categories, hidden],
  );

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (n: GraphNode) => {
      if (!q) return true;
      if (n.label?.toLowerCase().includes(q)) return true;
      if (n.id.toLowerCase().includes(q)) return true;
      if (n.entityType?.toLowerCase().includes(q)) return true;
      if (n.payload && typeof n.payload === "object") {
        return JSON.stringify(n.payload).toLowerCase().includes(q);
      }
      return false;
    },
    [q],
  );

  const nodeVisible = useCallback((n: GraphNode) => !isHidden(n), [isHidden]);
  const linkVisible = useCallback(
    (l: GraphEdge & { source: any; target: any }) => {
      const s = typeof l.source === "object" ? l.source : data.nodes.find((n) => n.id === l.source);
      const t = typeof l.target === "object" ? l.target : data.nodes.find((n) => n.id === l.target);
      return !!s && !!t && nodeVisible(s) && nodeVisible(t);
    },
    [nodeVisible, data.nodes],
  );

  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = nodeRadiusFor(node);
      let alpha = 1;
      if (fadeExpiring && node.kind === "entity" && typeof node.ttlFraction === "number") {
        alpha = 0.4 + 0.6 * node.ttlFraction;
      }
      if (q && !matches(node)) alpha *= 0.18;
      // when a node is selected, dim everything that isn't it or a direct neighbor
      if (selected && node.id !== selected.id && !neighborIds.has(node.id)) alpha *= 0.22;
      const color = colorOf(node);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (node.unresolved) {
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = theme.muted;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (selected && selected.id === node.id) {
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
      if (node.__pinned) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 2.5, 0, 2 * Math.PI);
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = theme.accent;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const showLabel =
        node.kind === "external" ||
        node.kind === "wallet" ||
        node.kind === "tag" ||
        (node.degree ?? 0) >= 4 ||
        scale > 1.6 ||
        (selected && selected.id === node.id) ||
        (!!q && matches(node));
      if (showLabel) {
        const fontSize = Math.max(2.5, 11 / scale);
        ctx.font = `${fontSize}px ${SANS}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.globalAlpha = Math.min(1, alpha + 0.25);
        ctx.fillStyle = theme.text;
        const label = (node.label ?? "").length > 22 ? `${node.label.slice(0, 21)}…` : node.label ?? "";
        ctx.fillText(label, node.x, node.y + r + 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [colorOf, fadeExpiring, matches, q, selected, neighborIds, theme.muted, theme.text, theme.accent],
  );

  const drawPointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const r = nodeRadiusFor(node) + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const lastClickRef = useRef<{ id: string; t: number } | null>(null);

  const linkIncident = useCallback(
    (l: any): boolean => {
      if (!selected) return false;
      const sId = typeof l.source === "string" ? l.source : l.source?.id;
      const tId = typeof l.target === "string" ? l.target : l.target?.id;
      return sId === selected.id || tId === selected.id;
    },
    [selected],
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      // double-click a pinned node to release it back into the simulation
      const last = lastClickRef.current;
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (last && last.id === node.id && now - last.t < 320) {
        node.fx = undefined;
        node.fy = undefined;
        node.__pinned = false;
        try {
          fgRef.current?.d3ReheatSimulation?.();
        } catch {
          /* noop */
        }
      }
      lastClickRef.current = { id: node.id, t: now };
      setSelected(node as GraphNode);
      onNodeClick?.(node as GraphNode);
    },
    [onNodeClick],
  );

  // Pin a node where you drop it (drag to move a node aside; it stays put).
  const handleNodeDragEnd = useCallback((node: any) => {
    node.fx = node.x;
    node.fy = node.y;
    node.__pinned = true;
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg?.zoom) return;
    try {
      fg.zoom(Math.max(0.05, Math.min(60, fg.zoom() * factor)), 250);
    } catch {
      /* noop */
    }
  }, []);
  const fitView = useCallback(() => {
    try {
      fgRef.current?.zoomToFit(400, 50);
    } catch {
      /* noop */
    }
  }, []);

  const toggleCat = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height, background: theme.background, borderRadius: 12, overflow: "hidden", ...style }}
    >
      {showSearch && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 4,
            width: 180,
            padding: "7px 10px",
            fontSize: 12,
            color: theme.text,
            background: "rgba(16,19,26,0.9)",
            border: `1px solid ${theme.muted}44`,
            borderRadius: 8,
            outline: "none",
            fontFamily: SANS,
          }}
        />
      )}

      {showFilters && categories.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: showSearch ? 52 : 12,
            left: 12,
            zIndex: 4,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            maxWidth: "60%",
          }}
        >
          {categories.map((c) => {
            const off = hidden.has(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleCat(c.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontFamily: SANS,
                  color: off ? theme.muted : theme.text,
                  background: "rgba(16,19,26,0.85)",
                  border: `1px solid ${c.color}${off ? "22" : "88"}`,
                  borderRadius: 20,
                  padding: "3px 9px",
                  cursor: "pointer",
                  opacity: off ? 0.5 : 1,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 8, background: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {FG ? (
        <FG
          ref={fgRef}
          graphData={graphData}
          width={width}
          height={height}
          backgroundColor={theme.background}
          nodeId="id"
          nodeRelSize={1}
          nodeVisibility={nodeVisible}
          linkVisibility={linkVisible}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={drawPointerArea}
          linkColor={(l: any) => {
            const base = relColorOf(l);
            if (selected) return linkIncident(l) ? base : `${base}1f`;
            return `${base}cc`;
          }}
          linkWidth={(l: any) => {
            const inc = !!selected && linkIncident(l);
            if (inc) return l.kind === "join" ? 2.8 : 2.4;
            return l.kind === "join" ? 1.6 : 1.1;
          }}
          linkDirectionalArrowLength={(l: any) => (l.directed ? 3.2 : 0)}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={(l: any) => {
            if (!animate) return 0;
            if (selected) return linkIncident(l) ? 2 : 0;
            return l.kind === "join" || l.kind === "external" ? 1 : 0;
          }}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleSpeed={0.006}
          onNodeClick={handleNodeClick}
          onNodeDragEnd={handleNodeDragEnd}
          onBackgroundClick={() => setSelected(null)}
          cooldownTicks={120}
          onEngineStop={() => {
            if (!fittedRef.current && fgRef.current) {
              fittedRef.current = true;
              try {
                fgRef.current.zoomToFit(500, 50);
              } catch {
                /* noop */
              }
            }
          }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height, color: theme.muted, fontFamily: SANS, fontSize: 13 }}>
          Loading graph…
        </div>
      )}

      {showLegend && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            zIndex: 4,
            fontSize: 11,
            color: theme.muted,
            fontFamily: SANS,
            background: "rgba(16,19,26,0.78)",
            borderRadius: 8,
            padding: "7px 10px",
            maxWidth: "56%",
          }}
        >
          <div>
            <span style={{ color: theme.text }}>{data.nodes.length}</span> nodes ·{" "}
            <span style={{ color: theme.text }}>{data.edges.length}</span> edges · click to trace · drag a node to pin it
            (double-click to release)
          </div>
          {relationshipLegend.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
              {relationshipLegend.map((r) => (
                <span key={r.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: r.color, display: "inline-block" }} />
                  <span style={{ color: theme.text }}>{r.label}</span>
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.85 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: theme.edgeColors.external, display: "inline-block" }} />
                other chains
              </span>
            </div>
          )}
        </div>
      )}

      {/* zoom controls (bottom-right, above the detail panel so they stay clickable) */}
      <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 6, display: "flex", flexDirection: "column", gap: 5 }}>
        <ZoomButton theme={theme} title="Zoom in" onClick={() => zoomBy(1.4)}>
          +
        </ZoomButton>
        <ZoomButton theme={theme} title="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          −
        </ZoomButton>
        <ZoomButton theme={theme} title="Fit to view" onClick={fitView} small>
          ⤢
        </ZoomButton>
      </div>

      {showDetail && selected && (
        <NodeDetail node={selected} connections={connections} theme={theme} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ZoomButton({
  children,
  onClick,
  title,
  theme,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  theme: ArkivGraphTheme;
  small?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: small ? 14 : 19,
        lineHeight: 1,
        color: hover ? "#160a00" : theme.text,
        background: hover ? theme.accent : "rgba(16,19,26,0.9)",
        border: `1px solid ${hover ? theme.accent : theme.muted + "44"}`,
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: SANS,
        userSelect: "none",
      }}
    >
      {children}
    </button>
  );
}

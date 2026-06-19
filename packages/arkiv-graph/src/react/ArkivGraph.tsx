import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Graph, GraphEdge, GraphNode } from "../types.js";
import { ARKIV_THEME, type ArkivGraphTheme, nodeColorFor, nodeRadiusFor } from "./theme.js";
import { NodeDetail } from "./NodeDetail.js";

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
    [colorOf, fadeExpiring, matches, q, selected, theme.muted, theme.text],
  );

  const drawPointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const r = nodeRadiusFor(node) + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      setSelected(node as GraphNode);
      onNodeClick?.(node as GraphNode);
    },
    [onNodeClick],
  );

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
          linkColor={(l: any) => `${theme.edgeColors[l.kind] ?? theme.muted}aa`}
          linkWidth={(l: any) => (l.kind === "join" ? 1.6 : 1)}
          linkDirectionalArrowLength={(l: any) => (l.directed ? 3.2 : 0)}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={(l: any) => (animate && (l.kind === "join" || l.kind === "external") ? 1 : 0)}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleSpeed={0.006}
          onNodeClick={handleNodeClick}
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
            background: "rgba(16,19,26,0.7)",
            borderRadius: 8,
            padding: "6px 9px",
            maxWidth: 240,
          }}
        >
          <span style={{ color: theme.text }}>{data.nodes.length}</span> nodes ·{" "}
          <span style={{ color: theme.text }}>{data.edges.length}</span> edges
          <div style={{ marginTop: 2, opacity: 0.8 }}>drag to pan · scroll to zoom · click a node</div>
        </div>
      )}

      {showDetail && selected && <NodeDetail node={selected} theme={theme} onClose={() => setSelected(null)} />}
    </div>
  );
}

import * as React from "react";
import type { GraphNode } from "../types.js";
import { formatTtl } from "../ttl.js";
import { ARKIV_THEME, type ArkivGraphTheme, nodeColorFor } from "./theme.js";

export interface NodeDetailProps {
  node: GraphNode | null;
  onClose?: () => void;
  theme?: ArkivGraphTheme;
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Row({ k, v, theme }: { k: string; v: React.ReactNode; theme: ArkivGraphTheme }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ color: theme.muted, minWidth: 92, flexShrink: 0 }}>{k}</span>
      {/* React escapes text by default — payload/attribute values render as text, never HTML. */}
      <span style={{ color: theme.text, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

export function NodeDetail({ node, onClose, theme = ARKIV_THEME }: NodeDetailProps): React.ReactElement | null {
  if (!node) return null;
  const color = nodeColorFor(node, theme);
  const payload = node.payload && typeof node.payload === "object" ? (node.payload as Record<string, unknown>) : null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 300,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        background: "rgba(16,19,26,0.96)",
        border: `1px solid ${color}55`,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        zIndex: 5,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: color, flexShrink: 0 }} />
        <strong style={{ color: theme.text, fontSize: 13, flex: 1, wordBreak: "break-word" }}>{node.label}</strong>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: theme.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Badge text={node.kind} color={color} />
        {node.entityType && <Badge text={node.entityType} color={theme.muted} />}
        {node.unresolved && <Badge text="unresolved" color={theme.unresolvedColor} />}
        {node.external?.chainName && <Badge text={node.external.chainName} color={color} />}
      </div>

      {node.kind === "external" && node.external && (
        <>
          <Row k="chain" v={node.external.chainName ?? String(node.external.chainId ?? "unknown")} theme={theme} />
          {node.external.chainId != null && <Row k="chainId" v={String(node.external.chainId)} theme={theme} />}
          {node.external.ref && <Row k={node.external.kind} v={<code style={{ fontFamily: mono }}>{node.external.ref}</code>} theme={theme} />}
          <p style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>
            External reference stored in your Arkiv data. arkiv-graph does not read this chain.
          </p>
        </>
      )}

      {node.kind === "entity" && (
        <>
          <Row k="key" v={<code style={{ fontFamily: mono, fontSize: 11 }}>{node.id}</code>} theme={theme} />
          {node.owner && <Row k="owner" v={<code style={{ fontFamily: mono, fontSize: 11 }}>{node.owner}</code>} theme={theme} />}
          {typeof node.ttlSeconds === "number" && <Row k="expires in" v={formatTtl(node.ttlSeconds)} theme={theme} />}
          {payload && Object.keys(payload).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: theme.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                payload
              </div>
              {Object.entries(payload).map(([k, v]) => (
                <Row key={k} k={k} v={typeof v === "object" ? JSON.stringify(v) : String(v)} theme={theme} />
              ))}
            </div>
          )}
          {node.attributes && node.attributes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: theme.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                attributes
              </div>
              {node.attributes.map((a, i) => (
                <Row key={`${a.key}-${i}`} k={a.key} v={String(a.value)} theme={theme} />
              ))}
            </div>
          )}
        </>
      )}

      {node.kind === "wallet" && <Row k="address" v={<code style={{ fontFamily: mono, fontSize: 11 }}>{node.owner ?? node.id}</code>} theme={theme} />}

      {node.explorerUrl && (
        <a
          href={node.explorerUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            display: "inline-block",
            marginTop: 12,
            color: theme.accent,
            fontSize: 12,
            textDecoration: "none",
            border: `1px solid ${theme.accent}55`,
            borderRadius: 8,
            padding: "5px 10px",
          }}
        >
          View on explorer ↗
        </a>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color,
        border: `1px solid ${color}66`,
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {text}
    </span>
  );
}

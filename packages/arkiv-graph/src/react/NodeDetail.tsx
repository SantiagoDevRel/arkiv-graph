import * as React from "react";
import type { GraphNode } from "../types.js";
import { formatTtl } from "../ttl.js";
import { ARKIV_THEME, type ArkivGraphTheme, nodeColorFor } from "./theme.js";

/** One relationship from the selected node to another (used in the detail card). */
export interface NodeConnection {
  relationship: string;
  /** the colour of the cord in the graph — so the card matches what you see. */
  color: string;
  otherLabel: string;
  direction: "in" | "out" | "both";
}

export interface NodeDetailProps {
  node: GraphNode | null;
  /** relationships of this node — rendered with their cord colours. */
  connections?: NodeConnection[];
  onClose?: () => void;
  theme?: ArkivGraphTheme;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function arrowFor(d: NodeConnection["direction"]): string {
  return d === "out" ? "→" : d === "in" ? "←" : "·";
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Section({ title, theme, children }: { title: string; theme: ArkivGraphTheme; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${theme.muted}24` }}>
      <div style={{ color: theme.muted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/** A label → value pair on one aligned grid row; the value wraps under its own column. */
function Field({ label, value, theme, mono }: { label: string; value: React.ReactNode; theme: ArkivGraphTheme; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: "2px 10px", alignItems: "start", padding: "2px 0", fontSize: 12, lineHeight: 1.45 }}>
      <span style={{ color: theme.muted, wordBreak: "break-word" }}>{label}</span>
      {/* React escapes text by default — payload/attribute values render as text, never HTML. */}
      <span style={{ color: theme.text, wordBreak: "break-word", fontFamily: mono ? MONO : SANS, fontSize: mono ? 11 : 12 }}>{value}</span>
    </div>
  );
}

function Relationships({ connections, theme }: { connections: NodeConnection[]; theme: ArkivGraphTheme }) {
  if (!connections.length) return null;
  const groups = new Map<string, { color: string; items: NodeConnection[] }>();
  for (const c of connections) {
    const g = groups.get(c.relationship) ?? { color: c.color, items: [] };
    g.items.push(c);
    groups.set(c.relationship, g);
  }
  return (
    <Section title={`relationships · ${connections.length}`} theme={theme}>
      {[...groups.entries()].map(([rel, g]) => (
        <div key={rel} style={{ marginBottom: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <span style={{ width: 16, height: 4, borderRadius: 2, background: g.color, flexShrink: 0 }} />
            <span style={{ color: theme.text, fontSize: 12, fontWeight: 600 }}>{rel}</span>
            <span style={{ color: theme.muted, fontSize: 11 }}>{g.items.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 23 }}>
            {g.items.slice(0, 6).map((it, i) => (
              <span key={i} style={{ color: theme.muted, fontSize: 12, lineHeight: 1.4, wordBreak: "break-word" }}>
                <span style={{ color: g.color, fontWeight: 600 }}>{arrowFor(it.direction)}</span> {truncate(it.otherLabel, 34)}
              </span>
            ))}
            {g.items.length > 6 && (
              <span style={{ color: theme.muted, fontSize: 11, opacity: 0.7, paddingTop: 1 }}>+{g.items.length - 6} more</span>
            )}
          </div>
        </div>
      ))}
    </Section>
  );
}

export function NodeDetail({ node, connections = [], onClose, theme = ARKIV_THEME }: NodeDetailProps): React.ReactElement | null {
  if (!node) return null;
  const color = nodeColorFor(node, theme);
  const payload = node.payload && typeof node.payload === "object" ? (node.payload as Record<string, unknown>) : null;
  const payloadEntries = payload ? Object.entries(payload) : [];

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 304,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        background: "rgba(16,19,26,0.97)",
        border: `1px solid ${color}55`,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        zIndex: 5,
        fontFamily: SANS,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: color, flexShrink: 0 }} />
        <strong style={{ color: theme.text, fontSize: 13.5, flex: 1, wordBreak: "break-word" }}>{node.label}</strong>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: theme.muted, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <Badge text={node.kind} color={color} />
        {node.entityType && <Badge text={node.entityType} color={theme.muted} />}
        {node.unresolved && <Badge text="unresolved" color={theme.unresolvedColor} />}
        {node.external?.chainName && <Badge text={node.external.chainName} color={color} />}
      </div>

      <Relationships connections={connections} theme={theme} />

      {/* external node details */}
      {node.kind === "external" && node.external && (
        <Section title="reference" theme={theme}>
          <Field label="chain" value={node.external.chainName ?? String(node.external.chainId ?? "unknown")} theme={theme} />
          {node.external.chainId != null && <Field label="chainId" value={String(node.external.chainId)} theme={theme} />}
          {node.external.ref && <Field label={node.external.kind} value={node.external.ref} theme={theme} mono />}
          <p style={{ color: theme.muted, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Reference stored in your Arkiv data — arkiv-graph does not read this chain.
          </p>
        </Section>
      )}

      {/* entity / wallet identity */}
      {(node.kind === "entity" || node.kind === "wallet") && (
        <Section title="details" theme={theme}>
          {node.kind === "wallet" ? (
            <Field label="address" value={node.owner ?? node.id} theme={theme} mono />
          ) : (
            <>
              <Field label="key" value={node.id} theme={theme} mono />
              {node.owner && <Field label="owner" value={node.owner} theme={theme} mono />}
              {typeof node.ttlSeconds === "number" && <Field label="expires in" value={formatTtl(node.ttlSeconds)} theme={theme} />}
            </>
          )}
        </Section>
      )}

      {/* payload */}
      {payloadEntries.length > 0 && (
        <Section title="payload" theme={theme}>
          {payloadEntries.map(([k, v]) => (
            <Field key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} theme={theme} />
          ))}
        </Section>
      )}

      {/* attributes */}
      {node.attributes && node.attributes.length > 0 && (
        <Section title="attributes" theme={theme}>
          {node.attributes.map((a, i) => (
            <Field key={`${a.key}-${i}`} label={a.key} value={String(a.value)} theme={theme} />
          ))}
        </Section>
      )}

      {node.explorerUrl && (
        <a
          href={node.explorerUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            display: "inline-block",
            marginTop: 14,
            color: theme.accent,
            fontSize: 12,
            textDecoration: "none",
            border: `1px solid ${theme.accent}55`,
            borderRadius: 8,
            padding: "6px 11px",
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

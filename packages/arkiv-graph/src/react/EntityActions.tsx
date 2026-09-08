import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { TableRow } from "../index.js";
import { formatExpiry, formatTtl } from "../ttl.js";
import { ARKIV_THEME, type ArkivGraphTheme } from "./theme.js";

const SANS = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const DANGER = "#ff5d6c";

// ── public callback types ────────────────────────────────────────────────────

/** Passed to `onExtendEntity`. The component picks an ABSOLUTE target date.
 * SDK 0.8 sets an absolute expiry with ExpirationTime.atBlock; it is not additive.
 * Re-read ownership, expiry and block timing before signing, validate the target,
 * and resolve only after the transaction is confirmed. */
export interface ExtendEntityParams {
  /** the entity's on-chain key (0x + 64 hex characters). */
  entityKey: string;
  /** absolute unix SECONDS the user wants the entity to live until. */
  targetExpiresAt: number;
  /** the row's current expiry (unix seconds) as the component knew it, if any. */
  currentExpiresAt?: number;
  /** the full table row, for context. */
  row: TableRow;
}

/** What `onExtendEntity` may resolve with, to show an accurate result. All optional. */
export interface ExtendEntityResult {
  /** the new expiry CONFIRMED on-chain (unix seconds). Falls back to the target. */
  expiresAt?: number;
  /** a human cost string, shown verbatim (e.g. "0.0000021 GLM"). Only pass it if
   *  it's accurate — typically read back from the transaction receipt. */
  cost?: string;
  /** a link to the extend transaction on the explorer. */
  txUrl?: string;
}

export interface DeleteEntityParams {
  entityKey: string;
  row: TableRow;
}
export interface DeleteEntityResult {
  cost?: string;
  txUrl?: string;
}

export type ExtendHandler = (params: ExtendEntityParams) => Promise<ExtendEntityResult | void> | ExtendEntityResult | void;
export type DeleteHandler = (params: DeleteEntityParams) => Promise<DeleteEntityResult | void> | DeleteEntityResult | void;

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

const DAY = 86400;

/** Default target when opening the Extend picker: 30 days past the later of the
 *  current expiry or now (you can only extend forward). */
export function defaultExtendTarget(currentExpiresAt: number | undefined, nowSeconds: number): number {
  const base = typeof currentExpiresAt === "number" && currentExpiresAt > nowSeconds ? currentExpiresAt : nowSeconds;
  return base + 30 * DAY;
}

/** The earliest target the user may pick — just after the current expiry (or now). */
export function minExtendTarget(currentExpiresAt: number | undefined, nowSeconds: number): number {
  const base = typeof currentExpiresAt === "number" && currentExpiresAt > nowSeconds ? currentExpiresAt : nowSeconds;
  return base + 60; // at least a minute of additional life
}

/** unix seconds → a value for <input type="datetime-local"> in the viewer's local tz. */
export function secondsToLocalInput(sec: number): string {
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** a <input type="datetime-local"> value (local tz) → unix seconds, or NaN. */
export function localInputToSeconds(value: string): number {
  if (!value) return NaN;
  const ms = new Date(value).getTime(); // datetime-local is parsed in local time
  return Number.isNaN(ms) ? NaN : Math.floor(ms / 1000);
}

// ── the two per-row buttons ──────────────────────────────────────────────────

export function EntityActionsCell({
  canExtend,
  canDelete,
  onExtend,
  onDelete,
  theme,
}: {
  canExtend: boolean;
  canDelete: boolean;
  onExtend: () => void;
  onDelete: () => void;
  theme: ArkivGraphTheme;
}): React.ReactElement {
  const btn = (color: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    minHeight: 44,
    fontFamily: SANS,
    fontWeight: 600,
    color,
    background: `${color}14`,
    border: `1px solid ${color}55`,
    borderRadius: 7,
    padding: "3px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {canExtend && (
        <button
          type="button"
          title="Extend this entity's expiry"
          onClick={(e) => {
            e.stopPropagation();
            onExtend();
          }}
          style={btn(theme.accent)}
        >
          ↻ Extend
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          title="Delete this entity from Arkiv"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={btn(DANGER)}
        >
          ✕ Delete
        </button>
      )}
    </span>
  );
}

// ── the overlay panel (extend date picker / delete confirm) ───────────────────

type Status = "idle" | "pending" | "done" | "error";

export interface EntityActionPanelProps {
  kind: "extend" | "delete";
  row: TableRow;
  /** unix seconds "now" (from the loaded block timing, falls back to wall clock). */
  nowSeconds: number;
  /** the address that will sign the mutation, if known (for the ownership hint). */
  signerAddress?: string;
  onExtend?: ExtendHandler;
  onDelete?: DeleteHandler;
  onClose: () => void;
  /** called once after a successful mutation, so the consumer can refetch. */
  onMutated?: () => void;
  theme?: ArkivGraphTheme;
}

function short(s: string | undefined): string {
  if (!s) return "";
  return /^0x[0-9a-fA-F]{8,}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export function EntityActionPanel({
  kind,
  row,
  nowSeconds,
  signerAddress,
  onExtend,
  onDelete,
  onClose,
  onMutated,
  theme = ARKIV_THEME,
}: EntityActionPanelProps): React.ReactElement {
  const current = row.expiresAt;
  const [target, setTarget] = useState<number>(() => defaultExtendTarget(current, nowSeconds));
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<ExtendEntityResult | DeleteEntityResult | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const inputId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  // Esc closes the panel (except mid-transaction, so a pending sign isn't orphaned)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "pending") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, onClose]);

  // ownership: when the signer is known and differs from the row's owner, the
  // surface the mismatch up front. The callback must recheck live ownership;
  // chain rules remain authoritative, including permissionless extension flags.
  const owner = row.owner?.toLowerCase();
  const signer = signerAddress?.toLowerCase();
  const notOwner = !!owner && !!signer && owner !== signer;

  const minTarget = minExtendTarget(current, nowSeconds);
  const targetTooEarly = kind === "extend" && (!Number.isFinite(target) || target < minTarget);
  const addedSeconds = current != null ? target - current : target - nowSeconds;

  const succeed = (r: ExtendEntityResult | DeleteEntityResult | null) => {
    setResult(r ?? null);
    setStatus("done");
    onMutated?.();
  };
  const fail = (e: unknown) => {
    setStatus("error");
    setMessage(e instanceof Error ? e.message : String(e) || "Something went wrong.");
    const txUrl = (e as { txUrl?: unknown })?.txUrl;
    setResult(typeof txUrl === "string" && /^https?:\/\//i.test(txUrl) ? { txUrl } : null);
  };

  const runExtend = async () => {
    if (!onExtend || targetTooEarly) return;
    setStatus("pending");
    setMessage("");
    try {
      const r = await onExtend({ entityKey: row.id, targetExpiresAt: target, currentExpiresAt: current, row });
      succeed(r ?? null);
    } catch (e) {
      fail(e);
    }
  };
  const runDelete = async () => {
    if (!onDelete) return;
    setStatus("pending");
    setMessage("");
    try {
      const r = await onDelete({ entityKey: row.id, row });
      succeed(r ?? null);
    } catch (e) {
      fail(e);
    }
  };

  const pending = status === "pending";
  const accent = kind === "extend" ? theme.accent : DANGER;

  return (
    <>
      {/* backdrop */}
      <div
        onClick={status === "pending" ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }}
      />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={kind === "extend" ? "Lifetime Extension" : "Delete entity"}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'));
          const first = items[0], last = items[items.length - 1];
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
            event.preventDefault(); first.focus();
          }
        }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(380px, calc(100% - 32px))",
          maxHeight: "calc(100% - 32px)",
          overflowY: "auto",
          background: "rgba(26,26,26,0.98)",
          border: `1px solid ${accent}66`,
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
          zIndex: 1001,
          fontFamily: SANS,
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <strong style={{ color: theme.text, fontSize: 14, flex: 1 }}>
            {kind === "extend" ? "Extend entity" : "Delete entity"}
          </strong>
          {status !== "pending" && (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: "none", border: "none", color: theme.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ color: theme.text, fontSize: 13, marginBottom: 2, wordBreak: "break-word" }}>{row.label}</div>
        <div style={{ color: theme.muted, fontSize: 11, fontFamily: MONO, marginBottom: 10 }}>{short(row.id)}</div>

        {notOwner && status !== "done" && (
          <div style={{ background: `${DANGER}14`, border: `1px solid ${DANGER}55`, borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 12, color: theme.text, lineHeight: 1.45 }}>
            ⚠ This entity is owned by <code style={{ fontFamily: MONO }}>{short(row.owner)}</code>. Only its owner can{" "}
            {kind === "extend" ? "extend" : "delete"} it{signer ? <> — your signer is <code style={{ fontFamily: MONO }}>{short(signerAddress)}</code></> : null}.
          </div>
        )}

        {/* body */}
        {status === "done" ? (
          <ResultView kind={kind} result={result} fallbackExpiry={target} theme={theme} />
        ) : kind === "extend" ? (
          <>
            <Field label="Current expiry" value={current != null ? formatExpiry(current) : "unknown"} theme={theme} />
            <label htmlFor={inputId} style={{ display: "block", color: theme.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 6px" }}>
              Extend until
            </label>
            <input
              id={inputId}
              type="datetime-local"
              value={secondsToLocalInput(target)}
              min={secondsToLocalInput(minTarget)}
              disabled={pending}
              onChange={(e) => {
                const s = localInputToSeconds(e.target.value);
                // clamp forward: never allow a target at/before the current expiry,
                // so the "pick a later date" error can't happen from the picker.
                if (Number.isFinite(s)) setTarget(Math.max(s, minTarget));
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: theme.background,
                color: theme.text,
                border: `1px solid ${theme.muted}55`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: SANS,
                colorScheme: "dark",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: targetTooEarly ? DANGER : theme.muted, lineHeight: 1.5 }}>
              {targetTooEarly ? (
                "Pick a date after the current expiry — you can only extend forward."
              ) : (
                <>
                  New expiry <span style={{ color: theme.text }}>{formatExpiry(target)}</span>
                  <span style={{ opacity: 0.8 }}> · +{formatTtl(Math.max(0, addedSeconds))} of life</span>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: theme.muted, fontSize: 13, lineHeight: 1.5 }}>
            This permanently removes the entity from Arkiv before it expires. This can&apos;t be undone.
          </div>
        )}

        {status === "error" && (
          <div role="alert" style={{ marginTop: 12, background: `${DANGER}14`, border: `1px solid ${DANGER}55`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: theme.text, lineHeight: 1.45 }}>
            ✕ {message}
            {result?.txUrl && <p><a href={result.txUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }}>View transaction ↗</a></p>}
          </div>
        )}

        {/* actions */}
        {status !== "done" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button
              onClick={onClose}
              disabled={pending}
              style={{
                background: "transparent",
                color: theme.muted,
                border: `1px solid ${theme.muted}44`,
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.5 : 1,
                fontFamily: SANS,
              }}
            >
              Cancel
            </button>
            <button
              onClick={kind === "extend" ? runExtend : runDelete}
              disabled={pending || (kind === "extend" && targetTooEarly)}
              style={{
                background: accent,
                color: kind === "extend" ? "#160a00" : "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: pending || (kind === "extend" && targetTooEarly) ? "default" : "pointer",
                opacity: pending || (kind === "extend" && targetTooEarly) ? 0.55 : 1,
                fontFamily: SANS,
              }}
            >
              {pending
                ? kind === "extend"
                  ? "Extending…"
                  : "Deleting…"
                : kind === "extend"
                  ? "Extend expiry"
                  : "Delete entity"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ResultView({
  kind,
  result,
  fallbackExpiry,
  theme,
}: {
  kind: "extend" | "delete";
  result: ExtendEntityResult | DeleteEntityResult | null;
  fallbackExpiry: number;
  theme: ArkivGraphTheme;
}) {
  const extendRes = result as ExtendEntityResult | null;
  return (
    <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6 }}>
      <div style={{ color: "#43d6a6", fontWeight: 700, marginBottom: 8 }}>
        ✓ {kind === "extend" ? "Extended on-chain" : "Deleted on-chain"}
      </div>
      {kind === "extend" && (
        <Field label="New expiry" value={formatExpiry(extendRes?.expiresAt ?? fallbackExpiry)} theme={theme} />
      )}
      {result?.cost && <Field label="Cost" value={result.cost} theme={theme} />}
      {result?.txUrl && /^https?:\/\//i.test(result.txUrl) && (
        <a
          href={result.txUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{ display: "inline-block", marginTop: 8, color: theme.accent, fontSize: 12.5, textDecoration: "none", border: `1px solid ${theme.accent}55`, borderRadius: 8, padding: "5px 10px" }}
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}

function Field({ label, value, theme }: { label: string; value: React.ReactNode; theme: ArkivGraphTheme }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: "2px 10px", alignItems: "baseline", padding: "2px 0", fontSize: 12.5 }}>
      <span style={{ color: theme.muted }}>{label}</span>
      <span style={{ color: theme.text, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

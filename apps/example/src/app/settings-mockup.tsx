"use client";

import { useState } from "react";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Dashboard access control — who can open the admin dashboard. The owner always
 * has access; the owner can also allow other wallet addresses. (Access state is
 * in-session only here; wiring it to Arkiv is tracked separately.)
 */
export function SettingsMockup({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [allow, setAllow] = useState<string[]>([
    "0x1d2c4f6e8a0b2c4d6e8f0a1b2c3d4e5f60718293",
    "0xa7f3c9e1b5d70246813579bdf0e2c4a68d0f1b3e",
  ]);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const add = () => {
    const a = input.trim().toLowerCase();
    if (!ADDR_RE.test(a)) {
      setErr("That doesn't look like a 0x address.");
      return;
    }
    setErr(null);
    setSaved(false);
    setAllow((l) => [...new Set([...l, a])]);
    setInput("");
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: 20,
          fontFamily: "var(--font-mono)",
          color: "var(--text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 15, flex: 1, fontFamily: "var(--font-brutal)" }}>⚙ Dashboard access</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 19, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.55, margin: "6px 0 16px" }}>
          Choose who can open this dashboard. The owner always has access — add any wallet addresses that should be able
          to manage it too.
        </p>

        <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Owner</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 16 }}>
          <code style={{ fontSize: 12.5, color: "var(--text)" }}>{short(owner)}</code>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>· always has access</span>
        </div>

        <div style={{ color: "var(--muted)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Allowed addresses</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {allow.length === 0 && <span style={{ color: "var(--muted)", fontSize: 12, opacity: 0.7 }}>No addresses added yet.</span>}
          {allow.map((a) => (
            <div key={a} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <code style={{ fontSize: 12.5, flex: 1, color: "var(--text)" }}>{short(a)}</code>
              <button
                onClick={() => setAllow((l) => l.filter((x) => x !== a))}
                aria-label={`Remove ${short(a)}`}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: 0 }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="0x… address to allow"
            spellCheck={false}
            style={{ flex: 1, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-muted)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: 13, fontFamily: "var(--font-mono)" }}
          />
          <button className="btn" onClick={add}>
            + Add
          </button>
        </div>
        {err && <div style={{ color: "#ff5d6c", fontSize: 12, marginTop: 8 }}>{err}</div>}

        <button
          className="btn primary"
          onClick={() => setSaved(true)}
          style={{ width: "100%", marginTop: 16 }}
        >
          {saved ? "Saved ✓" : "Save to Arkiv"}
        </button>
      </div>
    </div>
  );
}

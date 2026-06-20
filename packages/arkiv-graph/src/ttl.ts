import type { BlockTiming } from "./types.js";

export interface Ttl {
  /** seconds until expiry (negative = expired). */
  ttlSeconds?: number;
  /** 0..1 share of lifetime remaining. */
  ttlFraction?: number;
  /** unix seconds at which the entity expires. */
  expiresAt?: number;
}

/**
 * Convert Arkiv's block-based TTL into wall-clock seconds + a 0..1 "life
 * remaining" fraction for the fade effect. Needs block timing from
 * `publicClient.getBlockTiming()`.
 */
export function computeTtl(
  expiresAtBlock: number | undefined,
  createdAtBlock: number | undefined,
  timing: BlockTiming | undefined,
): Ttl {
  if (!timing || expiresAtBlock == null) return {};
  const current = Number(timing.currentBlock);
  // Block heights are tiny on Arkiv today, but guard against precision loss so a
  // huge value degrades to "unknown TTL" rather than a wrong number.
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(expiresAtBlock)) return {};
  const dur = timing.blockDuration || 2;
  const blocksLeft = expiresAtBlock - current;
  const ttlSeconds = blocksLeft * dur;
  const expiresAt = timing.currentBlockTime + ttlSeconds;

  let ttlFraction: number | undefined;
  if (createdAtBlock != null && expiresAtBlock > createdAtBlock) {
    const total = expiresAtBlock - createdAtBlock;
    ttlFraction = Math.max(0, Math.min(1, blocksLeft / total));
  } else {
    // No created anchor: approximate against a 30-day window so fade still works.
    const total = (30 * 24 * 3600) / dur;
    ttlFraction = Math.max(0, Math.min(1, blocksLeft / total));
  }
  return { ttlSeconds, ttlFraction, expiresAt };
}

/** Absolute expiry date+time in the viewer's locale/timezone, e.g. "Jul 18, 2026, 2:32 PM".
 *  `expiresAt` is unix SECONDS (from computeTtl). Returns "—" when unknown. */
export function formatExpiry(expiresAt: number | undefined): string {
  if (expiresAt == null || !Number.isFinite(expiresAt)) return "—";
  try {
    return new Date(expiresAt * 1000).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Human "2d 3h", "5m", "expired". */
export function formatTtl(ttlSeconds: number | undefined): string {
  if (ttlSeconds == null) return "—";
  if (ttlSeconds <= 0) return "expired";
  const d = Math.floor(ttlSeconds / 86400);
  const h = Math.floor((ttlSeconds % 86400) / 3600);
  const m = Math.floor((ttlSeconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ttlSeconds)}s`;
}

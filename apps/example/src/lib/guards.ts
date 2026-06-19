import "server-only";

// Best-effort, in-memory guards. Serverless instances don't share memory, so
// these are a speed bump, not a wall — the hard backstop is that the signing
// wallet only holds valueless Braga testnet GLM and writes are disabled unless
// ENABLE_WRITES is set.

const WINDOW_MS = 10 * 60 * 1000; // 10 min
const PER_IP_MAX = 3; // posts per IP per window
const GLOBAL_DAY_MAX = 120; // total writes per UTC day

const ipHits = new Map<string, number[]>();
let dayKey = "";
let dayCount = 0;

export function writesEnabled(): boolean {
  return process.env.ENABLE_WRITES === "1" || process.env.ENABLE_WRITES === "true";
}

function todayKey(nowMs: number): string {
  // UTC day bucket, derived from the request time (no Date.now in shared libs is fine here — this is server runtime)
  return new Date(nowMs).toISOString().slice(0, 10);
}

export interface RateResult {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
}

export function checkRateLimit(ip: string, nowMs: number): RateResult {
  // global daily cap
  const dk = todayKey(nowMs);
  if (dk !== dayKey) {
    dayKey = dk;
    dayCount = 0;
  }
  if (dayCount >= GLOBAL_DAY_MAX) {
    return { ok: false, reason: "Daily demo write limit reached. Try again tomorrow.", retryAfterSec: 3600 };
  }

  // per-IP sliding window
  const hits = (ipHits.get(ip) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  if (hits.length >= PER_IP_MAX) {
    const oldest = hits[0]!;
    return {
      ok: false,
      reason: "You're posting too fast — give the demo wallet a breather.",
      retryAfterSec: Math.ceil((WINDOW_MS - (nowMs - oldest)) / 1000),
    };
  }
  hits.push(nowMs);
  ipHits.set(ip, hits);
  dayCount += 1;
  return { ok: true };
}

// Serialize writes within an instance so concurrent posts don't collide on the
// wallet's nonce.
let chain: Promise<unknown> = Promise.resolve();
export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

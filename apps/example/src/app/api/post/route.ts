import { randomUUID } from "node:crypto";
import { jsonToPayload, ExpirationTime } from "@arkiv-network/sdk/utils";
import { EXPLORER, PROJECT, walletClient } from "@/lib/arkiv";
import { checkRateLimit, withWriteLock, writesEnabled } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The only handles a live post may be attributed to (so the new node attaches to
// a real user in the demo graph). The client never sets any other attribute.
const DEMO_HANDLES = new Set(["alice", "bob", "carol", "dave", "erin", "frank"]);
const MAX_TEXT = 240;
const MAX_BODY = 4096;
const TTL = ExpirationTime.fromDays(30);

/** Client IP from a platform-trusted header (not the spoofable leftmost XFF). */
function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0]!.trim() : "") || "unknown";
}

/** Same-origin guard — blocks cross-site / scripted POSTs to the signing endpoint. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // browsers send Origin on fetch POST; absence = not our UI
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function POST(req: Request) {
  if (!writesEnabled()) return json({ error: "Live writes are disabled on this deployment." }, { status: 403 });
  if (!sameOrigin(req)) return json({ error: "Cross-origin writes are not allowed." }, { status: 403 });

  // reject oversized bodies BEFORE buffering / before spending rate-limit quota
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return json({ error: "Body too large." }, { status: 413 });

  // rate limit (cheap gate, before parse/write)
  const rl = checkRateLimit(clientIp(req), Date.now());
  if (!rl.ok) {
    return json({ error: rl.reason }, { status: 429, headers: rl.retryAfterSec ? { "retry-after": String(rl.retryAfterSec) } : {} });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Body too large." }, { status: 413 });

  let body: { text?: unknown; handle?: unknown };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "Invalid JSON." }, { status: 400 });
  }

  // strict server-side schema — the client controls ONLY text + an allowlisted handle
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ error: "Post text is required." }, { status: 400 });
  if (text.length > MAX_TEXT) return json({ error: `Keep it under ${MAX_TEXT} characters.` }, { status: 400 });

  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "alice";
  if (!DEMO_HANDLES.has(handle)) return json({ error: "Unknown author." }, { status: 400 });

  try {
    const postId = `live-${randomUUID()}`;
    const result = await withWriteLock(async () => {
      const wallet = walletClient();
      return wallet.createEntity({
        payload: jsonToPayload({ text, postId, createdAt: new Date().toISOString(), live: true }),
        contentType: "application/json",
        attributes: [
          { key: "project", value: PROJECT },
          { key: "entityType", value: "post" },
          { key: "postId", value: postId },
          { key: "authorHandle", value: handle },
          { key: "live", value: 1 },
        ],
        expiresIn: TTL,
      });
    });

    const txHash = (result as { txHash?: string }).txHash;
    const entityKey = (result as { entityKey?: string }).entityKey;
    return json({
      ok: true,
      postId,
      entityKey,
      txHash,
      explorerUrl: txHash ? `${EXPLORER}/tx/${txHash}` : null,
    });
  } catch (err) {
    console.error("post route error:", (err as Error)?.message);
    return json({ error: "Write failed on Arkiv. The demo wallet may be out of gas." }, { status: 502 });
  }
}

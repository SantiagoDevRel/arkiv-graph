// Seed the "Arkiv Social" demo into Braga. One batch tx (mutateEntities).
//
//   node scripts/seed.mjs            # seed (skips if already seeded)
//   node scripts/seed.mjs --reseed   # delete this project's entities, then seed
//
// Requires PRIVATE_KEY in apps/example/.env.local (throwaway Braga burner).
import crypto from "node:crypto";
import dotenv from "dotenv";
import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk";
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts";
import { braga } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { jsonToPayload, ExpirationTime } from "@arkiv-network/sdk/utils";
import { defineArkivNetwork, explorerOf, rpcOf } from "arkiv-graph";

dotenv.config({ path: new URL("../.env.local", import.meta.url) });
dotenv.config({ path: new URL("../.env", import.meta.url) });

// Network plug-and-play (same env vars + fail-closed rule as the app): default
// Braga, or a COMPLETE custom set (ARKIV_CHAIN_ID + ARKIV_RPC_URL + ARKIV_EXPLORER_URL).
const e = process.env;
const anyCustom = !!(e.ARKIV_CHAIN_ID || e.ARKIV_RPC_URL || e.ARKIV_EXPLORER_URL || e.ARKIV_WS_URL || e.ARKIV_GAS_TOKEN || e.ARKIV_NETWORK_NAME || e.ARKIV_FAUCET_URL);
let CHAIN, EXPLORER, FAUCET, RPC_URL;
if (!anyCustom) {
  CHAIN = braga;
  EXPLORER = (explorerOf(braga) ?? "").replace(/\/$/, "");
  FAUCET = "https://braga.hoodi.arkiv.network/faucet/";
  RPC_URL = rpcOf(braga);
} else {
  const missing = [!e.ARKIV_CHAIN_ID && "ARKIV_CHAIN_ID", !e.ARKIV_RPC_URL && "ARKIV_RPC_URL", !e.ARKIV_EXPLORER_URL && "ARKIV_EXPLORER_URL"].filter(Boolean);
  if (missing.length) {
    console.error(`✗ Custom Arkiv network is partially configured — missing ${missing.join(", ")}. Set ARKIV_CHAIN_ID, ARKIV_RPC_URL and ARKIV_EXPLORER_URL together, or unset all ARKIV_* network vars to use Braga.`);
    process.exit(1);
  }
  const chainId = Number(e.ARKIV_CHAIN_ID);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    console.error(`✗ ARKIV_CHAIN_ID must be a positive integer, got "${e.ARKIV_CHAIN_ID}".`);
    process.exit(1);
  }
  for (const [k, v] of [["ARKIV_RPC_URL", e.ARKIV_RPC_URL], ["ARKIV_EXPLORER_URL", e.ARKIV_EXPLORER_URL], ...(e.ARKIV_WS_URL ? [["ARKIV_WS_URL", e.ARKIV_WS_URL]] : []), ...(e.ARKIV_FAUCET_URL ? [["ARKIV_FAUCET_URL", e.ARKIV_FAUCET_URL]] : [])]) {
    try { new URL(v); } catch { console.error(`✗ ${k} must be a valid URL, got "${v}".`); process.exit(1); }
  }
  CHAIN = defineArkivNetwork(braga, {
    chainId,
    rpcUrl: e.ARKIV_RPC_URL,
    explorerUrl: e.ARKIV_EXPLORER_URL,
    name: e.ARKIV_NETWORK_NAME,
    wsUrl: e.ARKIV_WS_URL,
    gasToken: e.ARKIV_GAS_TOKEN,
  });
  EXPLORER = e.ARKIV_EXPLORER_URL.replace(/\/$/, "");
  FAUCET = e.ARKIV_FAUCET_URL ?? "";
  RPC_URL = e.ARKIV_RPC_URL;
}

const PROJECT = process.env.ARKIV_PROJECT ?? "arkiv-graph-demo-v1";
const TTL = ExpirationTime.fromDays(30);
const RESEED = process.argv.includes("--reseed");

const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("✗ PRIVATE_KEY is not set (apps/example/.env.local).");
  process.exit(1);
}
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
const wallet = createWalletClient({ chain: CHAIN, transport: http(RPC_URL), account });
console.log(`→ network ${CHAIN.name} (chainId ${CHAIN.id})`);

const hex = (seed, len) =>
  "0x" + crypto.createHash("sha256").update(seed).digest("hex").repeat(Math.ceil(len / 64)).slice(0, len);

// ── dataset ──────────────────────────────────────────────────────────────────
const users = [
  { handle: "alice", name: "Alice Rivera", bio: "building on arkiv ✦", community: "Builders",
    pfp: { chainId: 8453, contract: hex("alice-pfp-base", 40), tokenId: "42" } },
  { handle: "bob", name: "Bob Chen", bio: "indexers & data", community: "Builders" },
  { handle: "carol", name: "Carol Díaz", bio: "devrel · bridges communities", community: "Builders" },
  { handle: "dave", name: "Dave Okoro", bio: "generative voxel art", community: "Creators" },
  { handle: "erin", name: "Erin Park", bio: "pixels & orange cubes", community: "Creators",
    pfp: { chainId: 8453, contract: hex("erin-pfp-base", 40), tokenId: "7" } },
  { handle: "frank", name: "Frank Müller", bio: "collector", community: "Creators" },
];

const posts = [
  { id: "p1", author: "alice", topic: "arkiv", text: "gm — shipped arkiv-graph today. your entities as a live graph 🔥",
    mint: { chainId: 1, tx: hex("p1-mint-eth", 64) } },
  { id: "p2", author: "bob", topic: "data", text: "indexed ~800k Braga entities into a single graph view" },
  { id: "p3", author: "carol", topic: "arkiv", text: "honestly the query API is what sold me — it's a database you can actually ask questions" },
  { id: "p4", author: "dave", text: "new voxel drop dropping friday 👀" },
  { id: "p5", author: "erin", text: "wip: orange cubes everywhere" },
  { id: "p6", author: "frank", text: "collecting dave's latest piece" },
  { id: "p7", author: "alice", text: "TTL means your graph fades as data expires — feature, not bug" },
  { id: "p8", author: "bob", text: "the follow graph is just join entities collapsed into edges" },
  { id: "p9", author: "dave", text: "render test passed, ship it" },
  { id: "p10", author: "erin", text: "anyone else obsessed with force-directed layouts?" },
  { id: "p11", author: "carol", text: "queryable database on ethereum. that's the pitch." },
];

const comments = [
  { id: "c1", post: "p1", author: "bob", text: "🔥🔥" },
  { id: "c2", post: "p1", author: "carol", text: "this is the demo we needed" },
  { id: "c3", post: "p1", author: "dave", text: "so clean" },
  { id: "c4", post: "p1", author: "frank", text: "wen mainnet" },
  { id: "c5", post: "p1", author: "erin", text: "love the fade effect" },
  { id: "c6", post: "p2", author: "alice", text: "800k!! 🤯" },
  { id: "c7", post: "p2", author: "carol", text: "graph or it didn't happen" },
  { id: "c8", post: "p3", author: "bob", text: "+1 queryability" },
  { id: "c9", post: "p4", author: "frank", text: "take my GLM" },
  { id: "c10", post: "p4", author: "erin", text: "🛒🛒" },
  { id: "c11", post: "p5", author: "dave", text: "voxels > everything" },
  { id: "c12", post: "p8", author: "alice", text: "exactly — no native joins, you infer them" },
  { id: "c13", post: "p7", author: "carol", text: "love that old entities just expire — keeps storage cheap" },
  { id: "c14", post: "p11", author: "dave", text: "framing on point" },
];

const follows = [
  ["alice", "bob"], ["bob", "alice"], ["alice", "carol"], ["bob", "carol"],
  ["dave", "erin"], ["erin", "frank"], ["frank", "dave"], ["carol", "dave"], // carol = the bridge
];

const likes = [
  ["bob", "p1"], ["carol", "p1"], ["dave", "p1"], ["erin", "p1"], ["frank", "p1"],
  ["alice", "p2"], ["carol", "p2"], ["bob", "p3"], ["alice", "p3"],
  ["frank", "p4"], ["erin", "p4"], ["dave", "p5"], ["carol", "p7"], ["bob", "p7"],
  ["alice", "p8"], ["dave", "p11"],
];

const tips = [
  { id: "t1", tipper: "frank", post: "p4", amount: "5 GLM", chainId: 10, tx: hex("tip-op", 64) },
];

// ── build creates ────────────────────────────────────────────────────────────
const base = (type) => [{ key: "project", value: PROJECT }, { key: "entityType", value: type }];
const make = (type, payload, extra) => ({
  payload: jsonToPayload(payload),
  contentType: "application/json",
  attributes: [...base(type), ...extra],
  expiresIn: TTL,
});

const creates = [
  ...users.map((u) =>
    make("user", { handle: u.handle, name: u.name, bio: u.bio, community: u.community }, [
      { key: "handle", value: u.handle },
      { key: "community", value: u.community },
      ...(u.pfp ? [
        { key: "pfpChainId", value: u.pfp.chainId },
        { key: "pfpContract", value: u.pfp.contract },
        { key: "pfpTokenId", value: u.pfp.tokenId },
      ] : []),
    ]),
  ),
  ...posts.map((p) =>
    make("post", { text: p.text, postId: p.id, createdAt: new Date().toISOString(), ...(p.topic ? { topic: p.topic } : {}) }, [
      { key: "postId", value: p.id },
      { key: "authorHandle", value: p.author },
      ...(p.topic ? [{ key: "topic", value: p.topic }] : []),
      ...(p.mint ? [{ key: "mintChainId", value: p.mint.chainId }, { key: "mintTx", value: p.mint.tx }] : []),
    ]),
  ),
  ...comments.map((c) =>
    make("comment", { text: c.text, commentId: c.id }, [
      { key: "commentId", value: c.id },
      { key: "postId", value: c.post },
      { key: "authorHandle", value: c.author },
    ]),
  ),
  ...follows.map(([f, t], i) =>
    make("follow", { followId: `f${i}` }, [
      { key: "followerHandle", value: f },
      { key: "followeeHandle", value: t },
    ]),
  ),
  ...likes.map(([by, post], i) =>
    make("like", { likeId: `l${i}` }, [
      { key: "byHandle", value: by },
      { key: "postId", value: post },
    ]),
  ),
  ...tips.map((t) =>
    make("tip", { amount: t.amount, postId: t.post, tipId: t.id }, [
      { key: "tipId", value: t.id },
      { key: "postId", value: t.post },
      { key: "authorHandle", value: t.tipper },
      { key: "tipChainId", value: t.chainId },
      { key: "tipTx", value: t.tx },
    ]),
  ),
];

async function existingKeys() {
  const keys = [];
  let page = await pub
    .buildQuery()
    .where(eq("project", PROJECT))
    .createdBy(account.address)
    .limit(200)
    .fetch();
  const collect = () => page.entities.forEach((e) => keys.push(e.key));
  collect();
  while (typeof page.hasNextPage === "function" && page.hasNextPage()) {
    await page.next();
    collect();
  }
  return keys;
}

async function main() {
  console.log(`→ wallet ${account.address}`);
  const bal = await pub.getBalance({ address: account.address });
  console.log(`→ balance ${Number(bal) / 1e18} GLM`);
  if (bal === 0n) {
    console.error(`✗ wallet has 0 balance. Fund it at the faucet: ${FAUCET}`);
    process.exit(1);
  }

  const existing = await existingKeys();
  if (existing.length > 0) {
    if (!RESEED) {
      console.log(`✓ already seeded: ${existing.length} entities for project "${PROJECT}". Use --reseed to rebuild.`);
      return;
    }
    console.log(`→ --reseed: deleting ${existing.length} existing entities…`);
    for (let i = 0; i < existing.length; i += 1000) {
      const slice = existing.slice(i, i + 1000).map((entityKey) => ({ entityKey }));
      const r = await wallet.mutateEntities({ deletes: slice });
      console.log(`  deleted ${r.deletedEntities.length} (tx ${r.txHash})`);
    }
  }

  console.log(`→ creating ${creates.length} entities in one batch…`);
  const res = await wallet.mutateEntities({ creates });
  console.log(`✓ created ${res.createdEntities.length} entities`);
  console.log(`  tx: ${EXPLORER}/tx/${res.txHash}`);
  console.log(
    `  breakdown: ${users.length} users · ${posts.length} posts · ${comments.length} comments · ${follows.length} follows · ${likes.length} likes · ${tips.length} tip`,
  );
}

main().catch((e) => {
  console.error("✗ seed failed:", e?.message ?? e);
  process.exit(1);
});

import "server-only";
import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk";
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts";
import { braga } from "@arkiv-network/sdk/chains";
import type { ExternalConfig, LinkRule } from "arkiv-graph";

/** Project namespace stamped on every entity (Arkiv is one shared public DB). */
export const PROJECT = process.env.ARKIV_PROJECT ?? "arkiv-graph-demo-v1";

export const EXPLORER = "https://explorer.braga.hoodi.arkiv.network";

/** The wallet that owns this demo's data. Public address — safe to expose. */
export const TRUSTED_ADDRESS = (
  process.env.TRUSTED_ADDRESS ??
  (process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`).address : "") ??
  ""
).toLowerCase();

export function publicClient() {
  return createPublicClient({ chain: braga, transport: http(process.env.ARKIV_RPC_URL) });
}

/** Server-only: signs writes. Throws if no key is configured. */
export function walletClient() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY is not set (writes are disabled on this deployment).");
  return createWalletClient({
    chain: braga,
    transport: http(process.env.ARKIV_RPC_URL),
    account: privateKeyToAccount(pk as `0x${string}`),
  });
}

export function trustedAddress(): string {
  const a = TRUSTED_ADDRESS;
  if (!a) throw new Error("TRUSTED_ADDRESS / PRIVATE_KEY not configured");
  return a;
}

/**
 * How the social entities relate. Arkiv has no joins — these rules ARE the
 * schema. References resolve by stable business ids (handle / postId), and
 * follow/like join entities collapse into edges.
 */
export const SOCIAL_LINKS: LinkRule[] = [
  // a post / comment / tip is authored by a user (match authorHandle → user.handle)
  { type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user", label: "by" },
  // a comment is on a post (match postId → post.postId), only for comments
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "comment", targetType: "post", label: "on" },
  // a tip points at a post
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "tip", targetType: "post", label: "tips" },
  // follows: user → user (collapse the follow entity into an edge)
  {
    type: "join",
    entityType: "follow",
    sourceAttr: "followerHandle",
    targetAttr: "followeeHandle",
    sourceMatchAttr: "handle",
    targetMatchAttr: "handle",
    sourceType: "user",
    targetType: "user",
    label: "follows",
  },
  // likes: user → post (collapse the like entity into an edge)
  {
    type: "join",
    entityType: "like",
    sourceAttr: "byHandle",
    targetAttr: "postId",
    sourceMatchAttr: "handle",
    targetMatchAttr: "postId",
    sourceType: "user",
    targetType: "post",
    label: "likes",
  },
];

/** Default external-chain detection is enough; this just documents intent. */
export const EXTERNAL_CONFIG: ExternalConfig = { enabled: true };

/** Fixed TTL for demo entities: 30 days, in seconds. */
export const TTL_SECONDS = 30 * 24 * 60 * 60;

import "server-only";
import { createPublicClient } from "@arkiv-network/sdk";
import { http } from "viem";
import type { LinkRule } from "arkiv-graph";
import { CHAIN, PUBLIC_CHAIN, PROJECT, DEMO_OWNER } from "./config";
export { PROJECT };
export const NATIVE_CHAIN_ID = CHAIN.id;
export const EXPLORER = PUBLIC_CHAIN.explorerUrl;
export function publicClient() {
  return createPublicClient({ chain: CHAIN, transport: http(PUBLIC_CHAIN.rpcUrl, { timeout: 15000, retryCount: 1 }) });
}
export function trustedAddress() { return DEMO_OWNER; }
export const SOCIAL_LINKS: LinkRule[] = [
  { type: "reference", attribute: "author_handle", targetAttribute: "handle", targetType: "user", label: "by" },
  { type: "reference", attribute: "post_id", targetAttribute: "post_id", sourceType: "comment", targetType: "post", label: "on" },
  {
    type: "join",
    entityType: "follow",
    sourceAttr: "follower_handle",
    targetAttr: "followee_handle",
    sourceMatchAttr: "handle",
    targetMatchAttr: "handle",
    sourceType: "user",
    targetType: "user",
    label: "follows",
  },
  {
    type: "join",
    entityType: "like",
    sourceAttr: "by_handle",
    targetAttr: "post_id",
    sourceMatchAttr: "handle",
    targetMatchAttr: "post_id",
    sourceType: "user",
    targetType: "post",
    label: "likes",
  },
];

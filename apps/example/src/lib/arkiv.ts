import "server-only";
import { createPublicClient } from "@arkiv-network/sdk";
import { http } from "viem";
import type { LinkRule } from "arkiv-graph";
import { CHAIN, PUBLIC_CHAIN, PROJECT, DEMO_OWNER } from "./config";
export { PUBLIC_CHAIN, PROJECT };
export const TRUSTED_ADDRESS = DEMO_OWNER;
export const NETWORK_NAME = CHAIN.name;
export const NATIVE_CHAIN_ID = CHAIN.id;
export const EXPLORER = PUBLIC_CHAIN.explorerUrl;
export function publicClient() {
  return createPublicClient({ chain: CHAIN, transport: http(PUBLIC_CHAIN.rpcUrl, { timeout: 15000, retryCount: 1 }) });
}
export function trustedAddress() { return DEMO_OWNER; }
export const SOCIAL_LINKS: LinkRule[] = [
  { type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user", label: "by" },
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "comment", targetType: "post", label: "on" },
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


export const EXTERNAL_CONFIG = { enabled: true };

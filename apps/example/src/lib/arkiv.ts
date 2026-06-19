import "server-only";
import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk";
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts";
import { braga } from "@arkiv-network/sdk/chains";
import { defineArkivNetwork, explorerOf, rpcOf, type ExternalConfig, type LinkRule } from "arkiv-graph";

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK — plug-and-play. Braga is the default, but everything below follows
// ARKIV_CHAIN, so when Braga is sunset you point at the next testnet by setting
// env vars only (no code change):
//   ARKIV_CHAIN_ID, ARKIV_RPC_URL, ARKIV_EXPLORER_URL, ARKIV_WS_URL,
//   ARKIV_GAS_TOKEN, ARKIV_NETWORK_NAME, ARKIV_FAUCET_URL
// If the SDK ships the next network as its own chain export, swap `braga` for it
// here (one line) instead.
// ─────────────────────────────────────────────────────────────────────────────

const BRAGA_FAUCET = "https://braga.hoodi.arkiv.network/faucet/";

/**
 * Resolve the network FAIL-CLOSED: either no ARKIV_* network vars (→ default
 * Braga), or a complete custom set. A partial set throws instead of silently
 * mixing a new RPC with Braga's chain id / explorer / faucet.
 */
function resolveNetwork() {
  const { ARKIV_CHAIN_ID, ARKIV_RPC_URL, ARKIV_EXPLORER_URL, ARKIV_WS_URL, ARKIV_GAS_TOKEN, ARKIV_NETWORK_NAME, ARKIV_FAUCET_URL } = process.env;
  const anyCustom = !!(ARKIV_CHAIN_ID || ARKIV_RPC_URL || ARKIV_EXPLORER_URL || ARKIV_WS_URL || ARKIV_GAS_TOKEN || ARKIV_NETWORK_NAME || ARKIV_FAUCET_URL);
  if (!anyCustom) {
    return { chain: braga, explorer: (explorerOf(braga) ?? "").replace(/\/$/, ""), faucet: BRAGA_FAUCET, rpc: rpcOf(braga) };
  }
  const missing = [
    !ARKIV_CHAIN_ID && "ARKIV_CHAIN_ID",
    !ARKIV_RPC_URL && "ARKIV_RPC_URL",
    !ARKIV_EXPLORER_URL && "ARKIV_EXPLORER_URL",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Custom Arkiv network is partially configured — missing ${missing.join(", ")}. ` +
        `Set ARKIV_CHAIN_ID, ARKIV_RPC_URL and ARKIV_EXPLORER_URL together, or unset all ARKIV_* network vars to use the default Braga network.`,
    );
  }
  const chain = defineArkivNetwork(braga, {
    chainId: Number(ARKIV_CHAIN_ID),
    rpcUrl: ARKIV_RPC_URL as string,
    explorerUrl: ARKIV_EXPLORER_URL as string,
    name: ARKIV_NETWORK_NAME,
    wsUrl: ARKIV_WS_URL,
    gasToken: ARKIV_GAS_TOKEN,
  });
  // No Braga fallback for explorer/faucet once a custom chain is selected.
  return { chain, explorer: (ARKIV_EXPLORER_URL as string).replace(/\/$/, ""), faucet: ARKIV_FAUCET_URL ?? "", rpc: ARKIV_RPC_URL as string };
}

const NET = resolveNetwork();
export const ARKIV_CHAIN = NET.chain;
export const NATIVE_CHAIN_ID = ARKIV_CHAIN.id;
export const EXPLORER = NET.explorer;
export const NETWORK_NAME = ARKIV_CHAIN.name;
export const GAS_TOKEN = ARKIV_CHAIN.nativeCurrency?.symbol ?? "GLM";
export const FAUCET_URL = NET.faucet;
const RPC_URL = NET.rpc;

/** Project namespace stamped on every entity (Arkiv is one shared public DB). */
export const PROJECT = process.env.ARKIV_PROJECT ?? "arkiv-graph-demo-v1";

/** The wallet that owns this demo's data. Public address — safe to expose. */
export const TRUSTED_ADDRESS = (
  process.env.TRUSTED_ADDRESS ??
  (process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`).address : "") ??
  ""
).toLowerCase();

export function publicClient() {
  return createPublicClient({ chain: ARKIV_CHAIN, transport: http(RPC_URL) });
}

/** Server-only: signs writes. Throws if no key is configured. */
export function walletClient() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY is not set (writes are disabled on this deployment).");
  return createWalletClient({
    chain: ARKIV_CHAIN,
    transport: http(RPC_URL),
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
  { type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user", label: "by" },
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "comment", targetType: "post", label: "on" },
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "tip", targetType: "post", label: "tips" },
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

export const EXTERNAL_CONFIG: ExternalConfig = { enabled: true };

/** Fixed TTL for demo entities: 30 days, in seconds. */
export const TTL_SECONDS = 30 * 24 * 60 * 60;

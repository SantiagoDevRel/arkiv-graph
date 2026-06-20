import type { ChainInfo } from "./types.js";

/** Arkiv's Braga testnet chain id. Entities pointing here are NEVER external. */
export const BRAGA_CHAIN_ID = 60138453102;
export const BRAGA_EXPLORER = "https://explorer.braga.hoodi.arkiv.network";

/**
 * Built-in chain registry: chainId → display info. Used to label and colour
 * external nodes and to build explorer links. Override/extend via
 * `external.registry`. Colours are each chain's brand colour.
 */
export const CHAIN_REGISTRY: Record<string | number, ChainInfo> = {
  [BRAGA_CHAIN_ID]: {
    name: "Arkiv (Braga)",
    short: "Arkiv",
    color: "#FF6A00",
    explorer: BRAGA_EXPLORER,
    native: true,
  },
  1: { name: "Ethereum", short: "ETH", color: "#627EEA", explorer: "https://etherscan.io", rpc: "https://ethereum-rpc.publicnode.com" },
  11155111: { name: "Sepolia", short: "Sep", color: "#9a86e8", explorer: "https://sepolia.etherscan.io", rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  17000: { name: "Holesky", short: "Hol", color: "#b39ddb", explorer: "https://holesky.etherscan.io", rpc: "https://holesky.drpc.org" },
  8453: { name: "Base", short: "Base", color: "#0052FF", explorer: "https://basescan.org", rpc: "https://base-rpc.publicnode.com" },
  84532: { name: "Base Sepolia", short: "BaseSep", color: "#4d7cff", explorer: "https://sepolia.basescan.org", rpc: "https://base-sepolia-rpc.publicnode.com" },
  10: { name: "Optimism", short: "OP", color: "#FF0420", explorer: "https://optimistic.etherscan.io", rpc: "https://optimism-rpc.publicnode.com" },
  11155420: { name: "OP Sepolia", short: "OPSep", color: "#ff5566", explorer: "https://sepolia-optimism.etherscan.io", rpc: "https://optimism-sepolia-rpc.publicnode.com" },
  42161: { name: "Arbitrum", short: "ARB", color: "#28A0F0", explorer: "https://arbiscan.io", rpc: "https://arbitrum-one-rpc.publicnode.com" },
  421614: { name: "Arbitrum Sepolia", short: "ArbSep", color: "#5cc0ff", explorer: "https://sepolia.arbiscan.io", rpc: "https://arbitrum-sepolia-rpc.publicnode.com" },
  137: { name: "Polygon", short: "MATIC", color: "#8247E5", explorer: "https://polygonscan.com", rpc: "https://polygon-bor-rpc.publicnode.com" },
  534352: { name: "Scroll", short: "Scroll", color: "#EBC28E", explorer: "https://scrollscan.com", rpc: "https://scroll-rpc.publicnode.com" },
  534351: { name: "Scroll Sepolia", short: "ScrollSep", color: "#e0b178", explorer: "https://sepolia.scrollscan.com", rpc: "https://scroll-sepolia-rpc.publicnode.com" },
  324: { name: "zkSync Era", short: "zkSync", color: "#8C8DFC", explorer: "https://explorer.zksync.io", rpc: "https://mainnet.era.zksync.io" },
  59144: { name: "Linea", short: "Linea", color: "#61dfff", explorer: "https://lineascan.build", rpc: "https://linea-rpc.publicnode.com" },
  7777777: { name: "Zora", short: "Zora", color: "#d0d0d0", explorer: "https://explorer.zora.energy", rpc: "https://rpc.zora.energy" },
  81457: { name: "Blast", short: "Blast", color: "#fcfc03", explorer: "https://blastscan.io", rpc: "https://rpc.blast.io" },
  100: { name: "Gnosis", short: "GNO", color: "#3e6957", explorer: "https://gnosisscan.io", rpc: "https://gnosis-rpc.publicnode.com" },
  stellar: { name: "Stellar", short: "XLM", color: "#08b5e5", explorer: "https://stellar.expert/explorer/public" },
};

export function lookupChain(
  chainId: number | string | undefined,
  registry?: Record<string | number, ChainInfo>,
): ChainInfo | undefined {
  if (chainId === undefined || chainId === null || chainId === "") return undefined;
  const merged = registry ? { ...CHAIN_REGISTRY, ...registry } : CHAIN_REGISTRY;
  return merged[chainId] ?? merged[String(chainId)] ?? merged[Number(chainId)];
}

export function txExplorerUrl(chain: ChainInfo | undefined, txHash: string): string | undefined {
  if (!chain?.explorer) return undefined;
  // Stellar's explorer uses /tx/<hash> too on stellar.expert
  return `${chain.explorer.replace(/\/$/, "")}/tx/${txHash}`;
}

export function addressExplorerUrl(chain: ChainInfo | undefined, address: string): string | undefined {
  if (!chain?.explorer) return undefined;
  return `${chain.explorer.replace(/\/$/, "")}/address/${address}`;
}

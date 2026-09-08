import { tiramisu } from "@arkiv-network/sdk/chains";

// Public network identity, shared by reads and wallet writes. No credentials.
export const CHAIN = tiramisu;
export const PUBLIC_CHAIN = {
  id: tiramisu.id,
  name: tiramisu.name,
  rpcUrl: tiramisu.rpcUrls.default.http[0],
  explorerUrl: "https://indexer.tiramisu.db-chain.testnet.arkiv.network",
  transactionExplorerUrl: "https://indexer.tiramisu.db-chain.testnet.arkiv.network",
  gasToken: tiramisu.nativeCurrency.symbol,
};
export const PROJECT = "arkiv-graph-social-v2";
export const DEMO_OWNER = "0xa618A2736431f24C26F1C8Dac9CA00ECc845a1C6";

import { rabdi } from "@arkiv-network/sdk/chains";

// Public network identity, shared by reads and wallet writes. No credentials.
export const CHAIN = rabdi({ accessKey: "" });
// Keyless public RPC: the only URL the browser reads from and the only URL the app may
// add to a wallet. It carries no path, so no access key. Shared keys stay server-side.
export const PUBLIC_RPC_URL = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const PUBLIC_CHAIN = {
  id: CHAIN.id,
  name: CHAIN.name,
  explorerUrl: "https://rabdi.explorer.arkiv.network",
  transactionExplorerUrl: "https://rabdi.explorer.arkiv.network",
  gasToken: CHAIN.nativeCurrency.symbol,
};
export const PROJECT = "arkiv-graph-social-v3";
// Public address only. The funded GRAPH wallet is used solely by the seed CLI.
export const DEMO_OWNER = "0x6ee47C18eAE66fCDdA891eFaDAf19B0cfDbB65cE";

export const TYPE_ATTRIBUTE = "entity_type";

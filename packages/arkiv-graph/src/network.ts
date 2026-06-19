// Network plug-and-play. Arkiv testnets rotate (Kaolin → Braga → next). Nothing
// here hardcodes a network: you pass an Arkiv chain object (the SDK's export, or
// one built with `defineArkivNetwork`) and everything — RPC, explorer links, the
// "native" chain id for external detection — follows from it.

/** Minimal shape of a viem/Arkiv chain object we rely on (readonly-friendly so
 *  the SDK's `as const` chain exports satisfy it). */
export interface ArkivChainLike {
  id: number;
  name?: string;
  rpcUrls?: { default?: { http?: readonly string[]; webSocket?: readonly string[] } };
  blockExplorers?: { default?: { name?: string; url?: string; apiUrl?: string } };
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  [k: string]: unknown;
}

export interface ArkivNetworkOverrides {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  name?: string;
  network?: string;
  wsUrl?: string;
  /** gas token symbol (Braga = "GLM"). */
  gasToken?: string;
  explorerApiUrl?: string;
}

/**
 * Build an Arkiv chain for ANY Arkiv network by cloning a known Arkiv chain's
 * protocol internals (viem `formatters`/`fees`/`serializers` that encode Arkiv's
 * calldata) and overriding only the network identity. Point arkiv-graph at the
 * next testnet without touching code:
 *
 * ```ts
 * import { braga } from "@arkiv-network/sdk/chains";
 * import { defineArkivNetwork } from "arkiv-graph";
 * const net = defineArkivNetwork(braga, {
 *   chainId: 12345, rpcUrl: "https://new.rpc/...", explorerUrl: "https://explorer...",
 * });
 * ```
 *
 * When the SDK ships the next network as its own chain export, pass THAT as the
 * base (or directly as `chain`) — same one-line swap, no library change.
 */
export function defineArkivNetwork<T extends ArkivChainLike>(base: T, o: ArkivNetworkOverrides): T {
  const explorer = o.explorerUrl.replace(/\/$/, "");
  const gas = o.gasToken ?? base.nativeCurrency?.symbol ?? "GLM";
  return {
    ...base,
    id: o.chainId,
    name: o.name ?? `Arkiv ${o.chainId}`,
    network: o.network ?? "arkiv",
    nativeCurrency: { name: gas, symbol: gas, decimals: 18 },
    rpcUrls: { default: { http: [o.rpcUrl], ...(o.wsUrl ? { webSocket: [o.wsUrl] } : {}) } },
    blockExplorers: {
      default: { name: `${o.name ?? "Arkiv"} Explorer`, url: explorer, apiUrl: o.explorerApiUrl ?? `${explorer}/api` },
    },
    testnet: true,
  } as T;
}

/** The configured explorer base URL of a chain (no trailing slash). */
export function explorerOf(chain: ArkivChainLike | undefined): string | undefined {
  const u = chain?.blockExplorers?.default?.url;
  return u ? u.replace(/\/$/, "") : undefined;
}

export function rpcOf(chain: ArkivChainLike | undefined): string | undefined {
  return chain?.rpcUrls?.default?.http?.[0];
}

/** Explorer URL for an Arkiv entity (the only Arkiv-specific path; tx/address come from `chains.ts`). */
export function entityExplorerUrl(explorer: string | undefined, key: string): string | undefined {
  return explorer ? `${explorer.replace(/\/$/, "")}/entity/${key}` : undefined;
}

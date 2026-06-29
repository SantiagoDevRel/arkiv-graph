"use client";
// Client-side Arkiv writes signed by the visitor's OWN wallet (MetaMask / any
// injected EIP-1193 provider) via viem's `custom()` transport — NO private key
// is ever held by this app. The SDK sends Arkiv mutations with
// `walletClient.sendTransaction`, which an injected wallet signs in a popup.
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  http,
  parseAbi,
} from "@arkiv-network/sdk";
import { braga } from "@arkiv-network/sdk/chains";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { type ArkivNetworkOverrides, defineArkivNetwork } from "arkiv-graph";

// The active chain. Defaults to Braga, but `configureWalletChain` points it at
// whatever network the SERVER resolved (env-driven) so reads and writes never
// split across chains when a testnet is rotated. Plug-and-play, never hardcoded.
let CHAIN: Chain = braga;
let GAS_TOKEN = CHAIN.nativeCurrency?.symbol ?? "GLM";
let EXPLORER = (CHAIN.blockExplorers?.default?.url ?? "").replace(/\/$/, "");
let CHAIN_HEX = `0x${CHAIN.id.toString(16)}`;

const MAX_EXTEND_SECONDS = 365 * 24 * 60 * 60;
const POST_TTL = ExpirationTime.fromDays(30);

const BTL_ABI = parseAbi([
  "event ArkivEntityBTLExtended(uint256 indexed entityKey, address indexed ownerAddress, uint256 oldExpirationBlock, uint256 newExpirationBlock, uint256 cost)",
]);

export interface PublicChainConfig {
  id: number;
  name?: string;
  rpcUrl: string;
  explorerUrl: string;
  gasToken?: string;
}

/** Point client writes at the SAME network the server reads from. Call once with
 *  the server-resolved config (from `page.tsx`); a no-op when omitted (keeps Braga). */
export function configureWalletChain(cfg?: PublicChainConfig | null): void {
  if (!cfg || cfg.id === CHAIN.id) return;
  // set only defined optional keys (the base tsconfig is strict about `| undefined`)
  const overrides: ArkivNetworkOverrides = { chainId: cfg.id, rpcUrl: cfg.rpcUrl, explorerUrl: cfg.explorerUrl };
  if (cfg.name) overrides.name = cfg.name;
  if (cfg.gasToken) overrides.gasToken = cfg.gasToken;
  CHAIN = defineArkivNetwork(braga, overrides) as unknown as Chain;
  GAS_TOKEN = cfg.gasToken ?? CHAIN.nativeCurrency?.symbol ?? "GLM";
  EXPLORER = cfg.explorerUrl.replace(/\/$/, "");
  CHAIN_HEX = `0x${cfg.id.toString(16)}`;
  _pub = null; // rebuild the read client against the new chain
}

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function injected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum) ?? null;
}
export function hasWallet(): boolean {
  return !!injected();
}
function short(a: string): string {
  return /^0x[0-9a-fA-F]{8,}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

let _pub: ReturnType<typeof createPublicClient> | null = null;
function pub() {
  return (_pub ??= createPublicClient({ chain: CHAIN, transport: http() }));
}
function wallet(account: string) {
  const eth = injected();
  if (!eth) throw new Error("No wallet found.");
  return createWalletClient({ account: account as `0x${string}`, chain: CHAIN, transport: custom(eth) });
}

export function onAccountsChanged(cb: (account: string | null) => void): () => void {
  const eth = injected();
  if (!eth?.on || !eth.removeListener) return () => {};
  const handler = (...args: unknown[]) => {
    const accounts = args[0] as string[] | undefined;
    cb(accounts?.[0]?.toLowerCase() ?? null);
  };
  eth.on("accountsChanged", handler);
  return () => eth.removeListener?.("accountsChanged", handler);
}

export async function getConnectedAccount(): Promise<string | null> {
  const eth = injected();
  if (!eth) return null;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Ensure the wallet is on the active Arkiv chain. Switches (adds first if the
 *  wallet doesn't know it), then VERIFIES `eth_chainId` actually changed — adding
 *  a chain is not a guaranteed switch. */
async function ensureChain(): Promise<void> {
  const eth = injected();
  if (!eth) throw new Error("No wallet found. Install MetaMask (or another injected wallet) to extend or delete entities.");
  const isActive = async () => ((await eth.request({ method: "eth_chainId" })) as string)?.toLowerCase() === CHAIN_HEX.toLowerCase();
  if (await isActive()) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4902 || /unrecognized chain|not been added|add this network/i.test(err?.message ?? "")) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.nativeCurrency,
            rpcUrls: [CHAIN.rpcUrls.default.http[0]],
            blockExplorerUrls: EXPLORER ? [EXPLORER] : [],
          },
        ],
      });
      // adding doesn't guarantee an active switch — switch explicitly afterwards
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }).catch(() => {});
    } else {
      throw e;
    }
  }
  if (!(await isActive())) {
    throw new Error(`Please switch your wallet to ${CHAIN.name} (chain ${CHAIN.id}) and try again.`);
  }
}

export async function connectWallet(): Promise<string> {
  const eth = injected();
  if (!eth) throw new Error("No wallet found. Install MetaMask (or another injected wallet) to extend or delete entities.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts?.[0];
  if (!account) throw new Error("No account returned from the wallet.");
  await ensureChain();
  return account.toLowerCase();
}

interface ReadEntity {
  owner?: string;
  expiresAtBlock?: bigint | number | null;
}

/** Read the entity and assert the connected wallet owns it — BEFORE prompting the
 *  wallet, so a non-owner (or an unverifiable entity) gets a clear message instead
 *  of signing a transaction that would just revert and cost gas. Returns the entity
 *  so callers don't read it twice. */
async function assertOwner(entityKey: string, account: string, verb: "extend" | "delete"): Promise<ReadEntity> {
  let entity: ReadEntity | null;
  try {
    entity = (await pub().getEntity(entityKey as `0x${string}`)) as ReadEntity;
  } catch {
    throw new Error("Couldn't reach Arkiv to verify this entity. Check your connection and try again.");
  }
  if (!entity || !entity.owner) {
    throw new Error("This entity couldn't be found on Arkiv — it may have already expired.");
  }
  if (entity.owner.toLowerCase() !== account.toLowerCase()) {
    throw new Error(`You're not the owner of this entity — only ${short(entity.owner)} can ${verb} it.`);
  }
  return entity;
}

async function costFromReceipt(txHash: `0x${string}`): Promise<{ cost?: string; newExpirationBlock?: number }> {
  try {
    const r = await pub().getTransactionReceipt({ hash: txHash });
    const gasFeeWei = (r.gasUsed ?? 0n) * (r.effectiveGasPrice ?? 0n);
    let storageWei: bigint | undefined;
    let newExpirationBlock: number | undefined;
    for (const log of r.logs) {
      try {
        const ev = decodeEventLog({ abi: BTL_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "ArkivEntityBTLExtended") {
          storageWei = ev.args.cost;
          newExpirationBlock = Number(ev.args.newExpirationBlock);
          break;
        }
      } catch {
        /* not our event */
      }
    }
    const total = (storageWei ?? 0n) + gasFeeWei;
    return { cost: total > 0n ? `${formatEther(total)} ${GAS_TOKEN}` : undefined, newExpirationBlock };
  } catch {
    return {};
  }
}

export interface WriteResult {
  expiresAt?: number;
  cost?: string;
  txUrl?: string;
}

export async function extendEntityWithWallet(account: string, entityKey: string, targetExpiresAt: number): Promise<WriteResult> {
  await ensureChain();
  const entity = await assertOwner(entityKey, account, "extend"); // single on-chain read, ownership-checked
  // additive: extendEntity ADDS expiresIn on top of the current expiry. Derive it
  // from the entity's real on-chain expiry, not a (possibly stale) client value.
  const timing = await pub().getBlockTiming();
  const dur = timing.blockDuration || 2;
  const curBlock = Number(timing.currentBlock);
  const curExpBlock = entity.expiresAtBlock != null ? Number(entity.expiresAtBlock) : curBlock;
  const currentExpiry = timing.currentBlockTime + (curExpBlock - curBlock) * dur;
  let expiresIn = Math.ceil(targetExpiresAt - currentExpiry);
  if (expiresIn > MAX_EXTEND_SECONDS) throw new Error("You can extend by at most 365 days at a time.");
  if (expiresIn < dur) expiresIn = dur;

  const { txHash } = await wallet(account).extendEntity({ entityKey: entityKey as `0x${string}`, expiresIn });
  const { cost, newExpirationBlock } = await costFromReceipt(txHash);
  const expiresAt = newExpirationBlock != null ? timing.currentBlockTime + (newExpirationBlock - curBlock) * dur : currentExpiry + expiresIn;
  return { expiresAt, cost, txUrl: txHash ? `${EXPLORER}/tx/${txHash}` : undefined };
}

export async function deleteEntityWithWallet(account: string, entityKey: string): Promise<WriteResult> {
  await ensureChain();
  await assertOwner(entityKey, account, "delete"); // fails (no wallet prompt) if not owner / unverifiable
  const { txHash } = await wallet(account).deleteEntity({ entityKey: entityKey as `0x${string}` });
  const { cost } = await costFromReceipt(txHash); // delete emits no BTL event → cost = gas only
  return { cost, txUrl: txHash ? `${EXPLORER}/tx/${txHash}` : undefined };
}

export interface PostResult {
  entityKey?: string;
  txUrl?: string;
}

export async function createPostWithWallet(account: string, text: string, handle: string, project: string): Promise<PostResult> {
  await ensureChain();
  const postId = `live-${crypto.randomUUID()}`;
  const { txHash, entityKey } = await wallet(account).createEntity({
    payload: jsonToPayload({ text, postId, createdAt: new Date().toISOString(), live: true }),
    contentType: "application/json",
    attributes: [
      { key: "project", value: project },
      { key: "entityType", value: "post" },
      { key: "postId", value: postId },
      { key: "authorHandle", value: handle },
      { key: "live", value: 1 },
    ],
    expiresIn: POST_TTL,
  });
  return { entityKey, txUrl: txHash ? `${EXPLORER}/tx/${txHash}` : undefined };
}

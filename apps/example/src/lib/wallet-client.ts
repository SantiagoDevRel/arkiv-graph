"use client";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { custom, http, type Hex } from "viem";
import { estimateGas } from "viem/actions";
import { CHAIN, PUBLIC_CHAIN, PROJECT } from "./config";
import { socialSample } from "./social-sample";

export type PublicChainConfig = typeof PUBLIC_CHAIN;
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEY = /^0x[0-9a-fA-F]{64}$/;
const CHAIN_HEX = `0x${CHAIN.id.toString(16)}`;
const pub = createPublicClient({ chain: CHAIN, transport: http(PUBLIC_CHAIN.rpcUrl, { timeout: 15000, retryCount: 1 }) });
function injected(): Eip1193 | null {
  return typeof window === "undefined" ? null : (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}
export function hasWallet() { return !!injected(); }
export async function getConnectedAccount(): Promise<string | null> {
  const accounts = await injected()?.request({ method: "eth_accounts" }).catch(() => []) as string[] | undefined;
  return accounts?.[0] && ADDRESS.test(accounts[0]) ? accounts[0].toLowerCase() : null;
}
export function onAccountsChanged(cb: (account: string | null) => void) {
  const provider = injected();
  const handler = () => { void getConnectedAccount().then(cb); };
  provider?.on?.("accountsChanged", handler);
  provider?.on?.("chainChanged", handler);
  const disconnected = () => cb(null);
  provider?.on?.("disconnect", disconnected);
  return () => { provider?.removeListener?.("accountsChanged", handler); provider?.removeListener?.("chainChanged", handler); provider?.removeListener?.("disconnect", disconnected); };
}
export async function ensureChain() {
  const provider = injected();
  if (!provider) throw new Error("Open this app with an EIP-1193 compatible wallet.");
  const active = async () => Number(await provider.request({ method: "eth_chainId" })) === CHAIN.id;
  if (await active()) return;
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name,
      rpcUrls: [PUBLIC_CHAIN.rpcUrl], nativeCurrency: CHAIN.nativeCurrency, blockExplorerUrls: [PUBLIC_CHAIN.transactionExplorerUrl] }] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  }
  if (!await active()) throw new Error("Select Tiramisu in your wallet and try again.");
}
export async function connectWallet(): Promise<string> {
  const provider = injected();
  if (!provider) throw new Error("No compatible wallet found. Install one to sign transactions.");
  await provider.request({ method: "eth_requestAccounts" });
  await ensureChain();
  const account = await getConnectedAccount();
  if (!account) throw new Error("The wallet did not authorize an account.");
  return account;
}
async function assertSession(account: string) {
  const provider = injected();
  if (!ADDRESS.test(account) || !provider || await getConnectedAccount() !== account.toLowerCase()) throw new Error("The account changed. Connect again before signing.");
  if (Number(await provider.request({ method: "eth_chainId" })) !== CHAIN.id) throw new Error("The network changed. Select Tiramisu before signing.");
}
async function writer(account: string, onSent?: (hash: Hex) => void, beforeSend?: () => void) {
  await ensureChain();
  await assertSession(account);
  if (await pub.getChainId() !== CHAIN.id) throw new Error("The RPC does not match Tiramisu.");
  const provider = injected()!;
  const transport = custom({ request: async (request) => {
    let forwarded = request as { method: string; params?: unknown[] | object };
    if (request.method === "eth_sendTransaction") {
      await assertSession(account);
      const tx = (request.params as [{ from?: string; to?: Hex; data?: Hex; value?: Hex; gas?: Hex }])[0];
      if (tx?.from?.toLowerCase() !== account.toLowerCase() || tx.to?.toLowerCase() !== "0x4400000000000000000000000000000000000044" || !tx.data || BigInt(tx.value ?? 0) !== 0n) throw new Error("The transaction does not match an entity operation from this app.");
      // Simulate the exact calldata on the configured public RPC before opening
      // the wallet. Some injected wallets guess an insufficient custom-chain gas limit.
      const estimated = await estimateGas(pub, { account: account as Hex, to: tx.to, data: tx.data, value: 0n });
      if (estimated <= 0n) throw new Error("Could not estimate gas for this operation.");
      await assertSession(account);
      forwarded = { ...request, params: [{ ...tx, gas: `0x${((estimated * 120n + 99n) / 100n).toString(16)}` }] };
      beforeSend?.();
    }
    const result = await provider.request(forwarded);
    if (request.method === "eth_sendTransaction" && typeof result === "string" && KEY.test(result)) onSent?.(result as Hex);
    return result;
  } }, { retryCount: 0 });
  return createWalletClient({ account: account as Hex, chain: CHAIN, transport });
}
export interface WriteResult { expiresAt?: number; txUrl?: string; cost?: string }
export function walletErrorMessage(error: unknown): string {
  let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
  for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
    if (cause.code === 4001 || cause.name === "UserRejectedRequestError") return "You rejected the wallet request. No change was confirmed.";
    if (cause.code === -32000) return "Could not verify the operation on Tiramisu. Refresh the data and check your wallet before signing again.";
  }
  const message = error instanceof Error ? error.message : "Could not complete the request. Check your wallet before signing again.";
  return message.split("\n")[0]!.slice(0,400);
}
export async function extendEntityWithWallet(account: string, entityKey: string, targetExpiresAt: number): Promise<WriteResult> {
  if (!KEY.test(entityKey) || !Number.isSafeInteger(targetExpiresAt)) throw new Error("Invalid entity or date.");
  let submittedHash: Hex | undefined;
  const entity = await pub.getEntity(entityKey as Hex);
  if (entity.owner.toLowerCase() !== account.toLowerCase()) throw new Error("You can only extend entities owned by your wallet.");
  const timing = await pub.getBlockTiming();
  if (!Number.isFinite(timing.blockDuration) || timing.blockDuration <= 0) throw new Error("Could not verify block timing.");
  const currentExpiry = timing.currentBlockTime + Number(entity.expiresAt - timing.currentBlock) * timing.blockDuration;
  if (entity.expiresAt <= timing.currentBlock || targetExpiresAt <= currentExpiry) throw new Error("Select a date later than the current expiration.");
  if (targetExpiresAt - currentExpiry > 365 * 86400) throw new Error("You can add up to 365 days per operation.");
  const targetBlock = timing.currentBlock + BigInt(Math.ceil((targetExpiresAt - timing.currentBlockTime) / timing.blockDuration));
  const client = await writer(account, hash => { submittedHash = hash; });
  await assertSession(account);
  let result;
  try { result = await client.extendEntity({ entityKey: entityKey as Hex, expires: ExpirationTime.atBlock(targetBlock) }); }
  catch (error) {
    if (submittedHash) throw Object.assign(new Error("The transaction was submitted, but its confirmation could not be verified. Check the link and refresh before signing again."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
    throw error;
  }
  const { txHash, expiresAt } = result;
  // SDK 0.8 reads the confirmed ExpiryExtended event; dates remain block-time estimates.
  return { expiresAt: timing.currentBlockTime + Number(expiresAt - timing.currentBlock) * timing.blockDuration,
    txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${txHash}` };
}
export async function createSocialSampleWithWallet(account: string) {
  const run = async () => {
    await assertSession(account);
    const pendingKey = `arkiv-graph:seed:${CHAIN.id}:${account.toLowerCase()}:${PROJECT}`;
    // Check storage BEFORE signing; unavailable storage must not lose a sent hash.
    localStorage.setItem(`${pendingKey}:available`, "1");
    localStorage.removeItem(`${pendingKey}:available`);
    const pendingHash = localStorage.getItem(pendingKey);
    // A successful query can recover a confirmed seed even while receipt lookup fails.
    const existing = await pub.select({ key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
    if (existing.entities.length) return { alreadyCreated: true, ...(pendingHash && KEY.test(pendingHash) ? { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}` } : {}) };
    if (pendingHash && !KEY.test(pendingHash)) throw new Error("A previous sample submission has no verified transaction hash. Check your wallet activity before retrying; automatic resubmission is blocked.");
    if (pendingHash && KEY.test(pendingHash)) {
      let receipt;
      try { receipt = await pub.getTransactionReceipt({ hash: pendingHash as Hex }); }
      catch { throw new Error(`A sample creation is pending. Check ${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash} before signing again.`); }
      if (receipt.status === "success") {
        // Confirm absence at a head that includes the receipt before allowing a new seed.
        const timing = await pub.getBlockTiming();
        if (timing.currentBlock <= receipt.blockNumber) throw new Error("Creation was confirmed. Wait one block, then select Refresh before trying again.");
        const confirmed = await pub.select({ key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
        if (confirmed.entities.length) return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}`, alreadyCreated: true };
        throw new Error(`Creation was confirmed, but its entities are not visible. Query results may be delayed or the entities may have expired. Check ${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}; do not sign again without verifying it.`);
      }
      localStorage.removeItem(pendingKey);
    }
    let submittedHash: Hex | undefined;
    let started = false;
    const client = await writer(account, hash => {
      submittedHash = hash;
      localStorage.setItem(pendingKey, hash);
    }, () => {
      if (localStorage.getItem(pendingKey)) throw new Error("Sample creation is already pending. Check your wallet activity before retrying.");
      // Persist uncertainty BEFORE sending. If storage fails after the wallet
      // returns a hash, the marker still prevents an accidental duplicate.
      localStorage.setItem(pendingKey, "submitting");
      started = true;
    });
    await assertSession(account);
    try {
      const result = await client.executeBatch({ creates: socialSample() });
      return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${result.txHash}`, alreadyCreated: false };
    } catch (error) {
      if (submittedHash) throw Object.assign(new Error("The sample transaction was submitted, but its confirmation could not be verified. Check the transaction and refresh before signing again."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
      if (started) {
        let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
        for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
          if (cause.code === 4001 || cause.name === "UserRejectedRequestError") {
            localStorage.removeItem(pendingKey);
            throw error;
          }
        }
        throw new Error("The wallet did not return a transaction hash. Check your wallet activity; automatic resubmission is blocked until the result is verified.");
      }
      throw error;
    }
  };
  if (navigator.locks) return navigator.locks.request(`arkiv-graph-seed-${account.toLowerCase()}`, { ifAvailable: true }, lock => {
    if (!lock) throw new Error("Sample creation is already in progress in another tab.");
    return run();
  });
  return run();
}

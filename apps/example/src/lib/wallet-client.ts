"use client";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { custom, type Hex } from "viem";
import { estimateGas, getGasPrice } from "viem/actions";
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
const MAX_LIFETIME_BLOCKS = 7_883_970n; // Rabdi maximum minus a small signing margin.
export interface WriteTxOptions { gas?: bigint; gasPrice?: bigint }
// Reads for wallet operations use the visitor's configured Rabdi RPC.
const pub = createPublicClient({ chain: CHAIN, transport: custom({ request: async request => {
  const provider = injected();
  if (!provider) throw new Error("Open this app with an EIP-1193 compatible wallet.");
  return provider.request(request);
} }, { retryCount: 0 }) });
async function txParams(account: string, options: WriteTxOptions = {}) {
  const [nonce, pendingNonce, gasPrice] = await Promise.all([
    pub.getTransactionCount({ address: account as Hex, blockTag: "latest" }),
    pub.getTransactionCount({ address: account as Hex, blockTag: "pending" }), getGasPrice(pub),
  ]);
  if (pendingNonce !== nonce) throw new Error("Your wallet has a pending transaction. Verify its receipt before signing another entity operation.");
  if (options.gas !== undefined && options.gas < 1_000_000n || options.gasPrice !== undefined && options.gasPrice <= 0n) throw new Error("Invalid transaction gas override.");
  return { nonce, gas: options.gas ?? 1_000_000n, gasPrice: options.gasPrice ?? gasPrice };
}
async function confirmed(hash: Hex) {
  const receipt = await pub.getTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted. No change was confirmed; check the gas limit before retrying.");
  return receipt;
}
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
    throw new Error("Add Rabdi to your wallet using your own RPC access key from https://hub.arkiv.network/access-keys, then connect again.");
  }
  if (!await active()) throw new Error("Select Rabdi in your wallet and try again.");
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
  if (Number(await provider.request({ method: "eth_chainId" })) !== CHAIN.id) throw new Error("The network changed. Select Rabdi before signing.");
}
async function writer(account: string, onSent?: (hash: Hex) => void, beforeSend?: () => void, options: WriteTxOptions = {}) {
  await ensureChain();
  await assertSession(account);
  if (await pub.getChainId() !== CHAIN.id) throw new Error("The RPC does not match Rabdi.");
  const provider = injected()!;
  const transport = custom({ request: async (request) => {
    let forwarded = request as { method: string; params?: unknown[] | object };
    if (request.method === "eth_sendTransaction") {
      await assertSession(account);
      const tx = (request.params as [{ from?: string; to?: Hex; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex }])[0];
      if (tx?.from?.toLowerCase() !== account.toLowerCase() || tx.to?.toLowerCase() !== "0x4400000000000000000000000000000000000044" || !tx.data || BigInt(tx.value ?? 0) !== 0n) throw new Error("The transaction does not match an entity operation from this app.");
      // Simulate the exact calldata on the configured public RPC before opening
      // the wallet. Some injected wallets guess an insufficient custom-chain gas limit.
      const estimated = await estimateGas(pub, { account: account as Hex, to: tx.to, data: tx.data, value: 0n, blockTag: "latest" });
      if (estimated <= 0n) throw new Error("Could not estimate gas for this operation.");
      await assertSession(account);
      const minimum = estimated * 2n > 1_000_000n ? estimated * 2n : 1_000_000n;
      if (options.gas !== undefined && options.gas < minimum) throw new Error("Your gas override must preserve twice the unsigned estimate.");
      const safeGas = options.gas ?? minimum;
      const head = await pub.getBlock({ blockTag: "latest" });
      if (safeGas > head.gasLimit / 2n) throw new Error("Split this operation into smaller batches: gas must fit within half the head block limit.");
      const gasPrice = options.gasPrice ?? await getGasPrice(pub);
      const nonce = await pub.getTransactionCount({ address: account as Hex, blockTag: "latest" });
      const pending = await pub.getTransactionCount({ address: account as Hex, blockTag: "pending" });
      if (pending !== nonce || tx.nonce !== undefined && BigInt(tx.nonce) !== BigInt(nonce)) throw new Error("The wallet nonce changed or another transaction is pending. Verify its receipt before signing.");
      await assertSession(account);
      forwarded = { ...request, params: [{ ...tx, nonce: `0x${nonce.toString(16)}`, gas: `0x${safeGas.toString(16)}`, gasPrice: `0x${gasPrice.toString(16)}` }] };
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
    if (cause.code === -32000) return "Could not verify the operation on Rabdi. Refresh the data and check your wallet before signing again.";
  }
  const message = error instanceof Error ? error.message : "Could not complete the request. Check your wallet before signing again.";
  return message.split("\n")[0]!.replace(/(?:https?|wss?):\/\/[^\s)]+/g, url => {
    try { const parsed = new URL(url); return ["hub.arkiv.network", "rabdi.explorer.arkiv.network"].includes(parsed.hostname) ? `${parsed.origin}${parsed.pathname}` : "[RPC endpoint]"; }
    catch { return "[RPC endpoint]"; }
  }).slice(0,400);
}
async function extendEntity(account: string, entityKey: string, targetExpiresAt: number, options: WriteTxOptions = {}): Promise<WriteResult> {
  if (!KEY.test(entityKey) || !Number.isSafeInteger(targetExpiresAt)) throw new Error("Invalid entity or date.");
  await assertSession(account);
  let submittedHash: Hex | undefined;
  const entity = await pub.getEntity(entityKey as Hex);
  if (entity.$owner.toLowerCase() !== account.toLowerCase()) throw new Error("You can only extend entities owned by your wallet.");
  const timing = await pub.getBlockTiming();
  if (!Number.isFinite(timing.blockDuration) || timing.blockDuration <= 0) throw new Error("Could not verify block timing.");
  const currentExpiry = timing.currentBlockTime + Number(entity.$expiresAt - timing.currentBlock) * timing.blockDuration;
  if (entity.$expiresAt <= timing.currentBlock || targetExpiresAt <= currentExpiry) throw new Error("Select a date later than the current expiration.");
  const targetBlock = timing.currentBlock + BigInt(Math.ceil((targetExpiresAt - timing.currentBlockTime) / timing.blockDuration));
  if (targetBlock - timing.currentBlock > MAX_LIFETIME_BLOCKS) throw new Error("Select a date within Rabdi's maximum lifetime (about 182 days from the chain head).");
  const client = await writer(account, hash => { submittedHash = hash; }, undefined, options);
  await assertSession(account);
  let result;
  try { result = await client.extendEntity({ entityKey: entityKey as Hex, expiration: ExpirationTime.atBlock(targetBlock) }, await txParams(account, options)); await confirmed(result.txHash); }
  catch (error) {
    if (submittedHash) throw Object.assign(new Error("The transaction was submitted, but its confirmation could not be verified. Check the link and refresh before signing again."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
    throw error;
  }
  const { txHash, expiresAt } = result;
  // SDK 1.0 reads the confirmed ExpiryExtended event; dates remain block-time estimates.
  return { expiresAt: timing.currentBlockTime + Number(expiresAt - timing.currentBlock) * timing.blockDuration,
    txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${txHash}` };
}
async function createSocialSample(account: string, options: WriteTxOptions = {}) {
  const run = async () => {
    await assertSession(account);
    const pendingKey = `arkiv-graph:seed:${CHAIN.id}:${account.toLowerCase()}:${PROJECT}`;
    // Check storage BEFORE signing; unavailable storage must not lose a sent hash.
    localStorage.setItem(`${pendingKey}:available`, "1");
    localStorage.removeItem(`${pendingKey}:available`);
    const pendingHash = localStorage.getItem(pendingKey);
    // A successful query can recover a confirmed seed even while receipt lookup fails.
    const existing = await pub.select({ $key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
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
        const loaded = await pub.select({ $key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
        if (loaded.entities.length) return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}`, alreadyCreated: true };
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
    }, options);
    await assertSession(account);
    try {
      const result = await client.executeBatch({ creates: socialSample() }, await txParams(account, options));
      await confirmed(result.txHash);
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

async function deleteEntity(account: string, entityKey: string, options: WriteTxOptions = {}): Promise<WriteResult> {
  if (!KEY.test(entityKey)) throw new Error("Invalid entity key.");
  await assertSession(account);
  const entity = await pub.getEntity(entityKey as Hex);
  if (entity.$owner.toLowerCase() !== account.toLowerCase()) throw new Error("You can only delete entities owned by your wallet.");
  const timing = await pub.getBlockTiming();
  if (entity.$expiresAt <= timing.currentBlock) throw new Error("This entity has already expired. Refresh the table.");
  let submittedHash: Hex | undefined;
  const client = await writer(account, hash => { submittedHash = hash; }, undefined, options);
  await assertSession(account);
  try {
    // SDK 1.0 waits for a successful receipt. No related entities are deleted.
    const result = await client.deleteEntity({ entityKey: entityKey as Hex }, await txParams(account, options));
    await confirmed(result.txHash);
    return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${result.txHash}` };
  } catch (error) {
    if (submittedHash) throw Object.assign(new Error("The deletion transaction was submitted, but its confirmation could not be verified. Check the transaction and refresh before signing again."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
    throw error;
  }
}

let activeWrite = false;
async function withWriteLock<T>(account: string, action: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (activeWrite) throw new Error("An entity operation is already in progress. Wait for its receipt.");
    activeWrite = true;
    try { return await action(); } finally { activeWrite = false; }
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`arkiv-graph-write-${CHAIN.id}-${account.toLowerCase()}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("An entity operation is already in progress in another tab. Wait for its receipt.");
      return run();
    });
  }
  return run();
}
export function extendEntityWithWallet(account: string, entityKey: string, targetExpiresAt: number, options: WriteTxOptions = {}) {
  return withWriteLock(account, () => extendEntity(account, entityKey, targetExpiresAt, options));
}
export function createSocialSampleWithWallet(account: string, options: WriteTxOptions = {}) {
  return withWriteLock(account, () => createSocialSample(account, options));
}
export function deleteEntityWithWallet(account: string, entityKey: string, options: WriteTxOptions = {}) {
  return withWriteLock(account, () => deleteEntity(account, entityKey, options));
}

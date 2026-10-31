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
async function writer(account: string, onSent?: (hash: Hex) => void, beforeSend?: (params: { gas: bigint; nonce: number }) => void, options: WriteTxOptions = {}, retryGasFloor = 0n) {
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
      const minimum = [estimated * 2n, 1_000_000n, retryGasFloor].reduce((a, b) => a > b ? a : b);
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
      beforeSend?.({ gas: safeGas, nonce });
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
interface SeedAttempt {
  hash?: Hex;
  status: "submitting" | "pending" | "success" | "reverted" | "rejected";
  sampleIds: string[];
  entityKeys?: string[];
  gas?: string;
  nonce?: number;
  gasUsed?: string;
  blockNumber?: string;
}
async function createSocialSample(account: string, options: WriteTxOptions = {}) {
  const run = async () => {
    await assertSession(account);
    const pendingKey = `arkiv-graph:seed:${CHAIN.id}:${account.toLowerCase()}:${PROJECT}`;
    const historyKey = `${pendingKey}:history`;
    localStorage.setItem(`${pendingKey}:available`, "1");
    localStorage.removeItem(`${pendingKey}:available`);
    let pendingValue = localStorage.getItem(pendingKey);
    const existing = await pub.select({ $key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
    if (existing.entities.length) return { alreadyCreated: true, ...(pendingValue && KEY.test(pendingValue) ? { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingValue}` } : {}) };
    const creates = socialSample();
    const sampleIds = creates.map(item => String(item.values.sample_id));
    let storedHistory = localStorage.getItem(historyKey);
    let attempts: SeedAttempt[] = [];
    if (storedHistory) {
      const journal = JSON.parse(storedHistory) as { version: number; attempts: SeedAttempt[] };
      if (journal.version !== 1 || !Array.isArray(journal.attempts) || journal.attempts.length > 2 || journal.attempts.some(a =>
        !["submitting", "pending", "success", "reverted", "rejected"].includes(a.status) ||
        !Array.isArray(a.sampleIds) || !a.sampleIds.every(id => typeof id === "string") ||
        (a.hash !== undefined && !KEY.test(a.hash)))) throw new Error("Invalid sample transaction history. Automatic resubmission is blocked.");
      attempts = journal.attempts;
    }
    const persist = () => {
      const value = JSON.stringify({ version: 1, attempts });
      localStorage.setItem(historyKey, value);
      storedHistory = value;
    };
    const markPending = (value: string) => { localStorage.setItem(pendingKey, value); pendingValue = value; };
    if (!attempts.length && pendingValue) {
      if (!KEY.test(pendingValue)) throw new Error("A previous sample submission is uncertain. Automatic resubmission is blocked.");
      attempts.push({ hash: pendingValue as Hex, status: "pending", sampleIds });
      persist(); // Import the old hash guard without discarding its transaction identity.
    }
    const stopped = (message: string) => Object.assign(new Error(message), {
      txUrl: attempts.at(-1)?.hash ? `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${attempts.at(-1)!.hash}` : undefined,
      txUrls: attempts.flatMap(a => a.hash ? [`${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${a.hash}`] : []),
    });
    const reconcile = async (attempt: SeedAttempt): Promise<"success" | "exhausted" | "semantic"> => {
      if (!attempt.hash) throw stopped("A previous sample submission has no verified transaction hash. Automatic resubmission is blocked.");
      let receipt;
      try { receipt = await pub.getTransactionReceipt({ hash: attempt.hash }); }
      catch { throw stopped("A sample creation is pending or its receipt is uncertain. Check the transaction before signing again."); }
      if (!receipt || receipt.blockNumber == null || receipt.transactionHash !== attempt.hash || !["success", "reverted"].includes(receipt.status))
        throw stopped("A sample creation is pending or its receipt is uncertain. Automatic resubmission is blocked.");
      attempt.status = receipt.status;
      attempt.blockNumber = String(receipt.blockNumber);
      attempt.gasUsed = String(receipt.gasUsed);
      persist();
      if (receipt.status === "success") return "success";
      let tx;
      try { tx = await pub.getTransaction({ hash: attempt.hash }); }
      catch { throw stopped("The reverted transaction's gas limit could not be verified. Automatic resubmission is blocked."); }
      if (tx.hash !== attempt.hash || tx.blockNumber !== receipt.blockNumber || tx.from.toLowerCase() !== account.toLowerCase() ||
        tx.to?.toLowerCase() !== "0x4400000000000000000000000000000000000044" || tx.value !== 0n || tx.gas <= 0n || receipt.gasUsed <= 0n)
        throw stopped("The reverted transaction identity could not be verified. Automatic resubmission is blocked.");
      attempt.gas = String(tx.gas);
      attempt.nonce = tx.nonce;
      persist();
      return receipt.gasUsed === tx.gas ? "exhausted" : "semantic";
    };
    const retryFloor = async () => {
      const last = attempts.at(-1)!;
      if (last.status === "rejected") throw stopped("The sample signature was rejected. Automatic resubmission is blocked.");
      if (last.status === "success") throw stopped("Creation was confirmed, but its entities are not visible. Refresh and do not sign again.");
      const outcome = await reconcile(last);
      if (outcome === "success") throw stopped("Creation was confirmed, but its entities are not visible. Refresh and do not sign again.");
      if (outcome !== "exhausted") throw stopped("The sample transaction reverted without gas exhaustion. No retry is authorized.");
      if (attempts.length !== 1) throw stopped("The single gas-exhaustion retry was already used. No further sample transaction is authorized.");
      return BigInt(last.gas!) * 2n;
    };
    let minimumRetryGas = attempts.length ? await retryFloor() : 0n;
    while (attempts.length < 2) {
      const attempt: SeedAttempt = { status: "submitting", sampleIds };
      let started = false;
      const register = () => {
        if (started) return;
        if (localStorage.getItem(historyKey) !== storedHistory || localStorage.getItem(pendingKey) !== pendingValue)
          throw stopped("Sample creation changed in another tab. Automatic resubmission is blocked.");
        attempts.push(attempt); started = true;
      };
      const client = await writer(account, hash => {
        attempt.hash = hash; attempt.status = "pending";
        persist(); markPending(hash);
      }, params => {
        register(); attempt.gas = String(params.gas); attempt.nonce = params.nonce;
        persist(); markPending("submitting"); // Save uncertainty before the wallet can send.
      }, options, minimumRetryGas);
      await assertSession(account);
      let sdkError: unknown;
      try {
        const result = await client.executeBatch({ creates }, await txParams(account, options));
        // Also retain hashes returned by an SDK wrapper that did not expose the transport callback.
        register(); attempt.hash ??= result.txHash; attempt.entityKeys = result.createdEntities;
        persist(); markPending(attempt.hash);
      } catch (error) {
        sdkError = error;
        if (!attempt.hash) {
          let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
          let rejected = false;
          for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause)
            if (cause.code === 4001 || cause.name === "UserRejectedRequestError") rejected = true;
          if (rejected) {
            register(); attempt.status = "rejected"; persist(); markPending("rejected");
            throw error;
          }
          if (started) throw stopped("The wallet did not return a transaction hash. Automatic resubmission is blocked until the result is verified.");
          throw error; // Unsigned estimation/validation failed before the send boundary.
        }
      }
      const outcome = await reconcile(attempt);
      if (outcome === "success") {
        if (sdkError) throw stopped("The sample transaction was confirmed. Refresh and do not sign again.");
        return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${attempt.hash}`, alreadyCreated: false };
      }
      minimumRetryGas = await retryFloor(); // Exactly one confirmed gas-exhausted revert may reach the next iteration.
    }
    throw stopped("The single gas-exhaustion retry was already used. No further sample transaction is authorized.");
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

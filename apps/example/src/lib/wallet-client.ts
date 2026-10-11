"use client";
import { createPublicClient, createWalletClient, ENTITY_EVENTS_ABI, ExpirationTime, OperationType } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { custom, decodeAbiParameters, decodeEventLog, decodeFunctionData, encodeAbiParameters, encodeFunctionData, http, keccak256, parseAbi, parseAbiParameters, parseTransaction, recoverTransactionAddress, serializeTransaction, type Hex, type TransactionSerialized } from "viem";
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
const pub = createPublicClient({ chain: CHAIN, transport: http(PUBLIC_CHAIN.rpcUrl, { timeout: 10000, retryCount: 0 }) });
const pendingPub = createPublicClient({ chain: CHAIN, transport: http(PUBLIC_CHAIN.rpcUrl, { timeout: 1500, retryCount: 0 }) });
const CONFIRMATION_TIMEOUT = 30000;
const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044";
const transactionUrl = (hash: Hex) => `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${hash}`;
function confirmationPending(hash: Hex, nonce?: number, nextNonce?: number, recoverable = false) {
  const detail = nonce !== undefined && nextNonce !== undefined && nonce > nextNonce
    ? `This transaction uses nonce ${nonce}; Tiramisu's next nonce is ${nextNonce}.`
    : "The submitted transaction is still pending. Check it in your wallet before signing again.";
  const next = recoverable
    ? `Select Extend expiry again to open your wallet for the same date. In Rabby, set nonce ${nextNonce} in Advanced Settings before signing. The earlier transaction remains unconfirmed.`
    : "Retry checks the same transaction; the selected date remains a requested target.";
  return Object.assign(new Error(`The requested expiration has not been confirmed. ${detail} ${next}`), { txUrl: transactionUrl(hash), ...(recoverable ? { recoverPendingHash: hash } : {}) });
}
// SDK 0.8's exact public wire format; require canonical single-operation calldata.
const EXECUTE_ABI = parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]);
const EXTENSION_ABI = parseAbiParameters("(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)");
function extensionFromInput(input: Hex, entityKey: string) {
  const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: input });
  const operations = decoded.args[0];
  if (operations.length !== 1 || operations[0]!.operation !== OperationType.ExtendExpiry) return null;
  const [extension] = decodeAbiParameters(EXTENSION_ABI, operations[0]!.operationData);
  if (extension.entityKey.toLowerCase() !== entityKey.toLowerCase() || extension.minLifetime !== 0n || extension.expiresAt <= 0n) return null;
  const canonical = encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [[{ operation: OperationType.ExtendExpiry, operationData: encodeAbiParameters(EXTENSION_ABI, [extension]) }]] });
  return canonical.toLowerCase() === input.toLowerCase() ? extension : null;
}
// Cache only public signed bytes. Verify the signature and hash again on every read;
// localStorage metadata alone can never authorize recovery or prove confirmation.
async function signedExtension(serializedTransaction: Hex, hash: Hex, account: string, entityKey: string) {
  if (!/^0x[0-9a-f]+$/i.test(serializedTransaction) || serializedTransaction.length > 8192 || keccak256(serializedTransaction).toLowerCase() !== hash.toLowerCase()) return null;
  const tx = parseTransaction(serializedTransaction);
  if (tx.type !== "legacy" || tx.chainId !== CHAIN.id || !Number.isSafeInteger(tx.nonce) || tx.nonce! < 0 || tx.to?.toLowerCase() !== ARKIV_ADDRESS || (tx.value ?? 0n) !== 0n || !tx.data || !tx.r || !tx.s || tx.v === undefined || tx.v < 35n || (tx.v - 35n) / 2n !== BigInt(CHAIN.id)) return null;
  if ((await recoverTransactionAddress({ serializedTransaction: serializedTransaction as TransactionSerialized })).toLowerCase() !== account.toLowerCase()) return null;
  const extension = extensionFromInput(tx.data, entityKey);
  return extension ? { expiresAt: extension.expiresAt, nonce: tx.nonce! } : null;
}
async function pendingExtension(hash: Hex, account: string, entityKey: string) {
  const nextNonce = pendingPub.getTransactionCount({ address: account as Hex, blockTag: "pending" }).catch(() => undefined);
  const cacheKey = `arkiv-graph:extend:${CHAIN.id}:${account.toLowerCase()}:${entityKey.toLowerCase()}:transaction:${hash}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw && raw.length <= 8300) {
      const cache = JSON.parse(raw);
      if (cache.version === 1 && typeof cache.serializedTransaction === "string") {
        const extension = await signedExtension(cache.serializedTransaction, hash, account, entityKey);
        if (extension) return { ...extension, nextNonce: await nextNonce };
      }
    }
  } catch { /* Invalid or unavailable evidence does not authorize recovery. */ }
  // Viem deduplicates concurrent identical reads. Separate bounded requests are
  // necessary because this public endpoint does not consistently expose queued txs.
  for (let attempt = 0; attempt < 6; attempt++) {
    const tx = await pendingPub.getTransaction({ hash }).catch(() => null);
    if (!tx) continue;
    if (tx.hash.toLowerCase() !== hash.toLowerCase() || tx.from.toLowerCase() !== account.toLowerCase() || tx.to?.toLowerCase() !== ARKIV_ADDRESS || tx.value !== 0n || ("chainId" in tx && tx.chainId !== undefined && tx.chainId !== CHAIN.id)) continue;
    try {
      const extension = extensionFromInput(tx.input, entityKey);
      if (!extension) continue;
      if (tx.type === "legacy" && tx.chainId === CHAIN.id && tx.r && tx.s && tx.v !== undefined) {
        try {
          const serializedTransaction = serializeTransaction({ type: "legacy", chainId: tx.chainId, nonce: tx.nonce, gas: tx.gas, gasPrice: tx.gasPrice, to: tx.to, value: tx.value, data: tx.input }, { r: tx.r, s: tx.s, v: tx.v });
          if (await signedExtension(serializedTransaction, hash, account, entityKey)) localStorage.setItem(cacheKey, JSON.stringify({ version: 1, serializedTransaction }));
        } catch { /* A cache failure must preserve the active pending hash. */ }
      }
      return { expiresAt: extension.expiresAt, nonce: tx.nonce, nextNonce: await nextNonce };
    } catch { /* Unknown calldata must never authorize a new write. */ }
  }
  return null;
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
async function writer(account: string, onSent?: (hash: Hex) => void, beforeSend?: (nonce?: number) => void, boundedConfirmation = false) {
  await ensureChain();
  await assertSession(account);
  if (await pub.getChainId() !== CHAIN.id) throw new Error("The RPC does not match Tiramisu.");
  const provider = injected()!;
  const confirmedReceipts = new Map<string, unknown>();
  const transport = custom({ request: async (request) => {
    if (request.method !== "eth_sendTransaction") {
      const hash = (request.params as unknown[])?.[0];
      if (request.method === "eth_getTransactionReceipt" && typeof hash === "string" && confirmedReceipts.has(hash)) return confirmedReceipts.get(hash);
      // Confirmation reads use the configured DB-Chain, independently of the wallet.
      return pub.request(request as Parameters<typeof pub.request>[0]);
    }
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
      const nonce = boundedConfirmation ? await pub.getTransactionCount({ address: account as Hex, blockTag: "pending" }) : undefined;
      await assertSession(account);
      forwarded = { ...request, params: [{ ...tx, ...(nonce !== undefined ? { nonce: `0x${nonce.toString(16)}` } : {}), gas: `0x${((estimated * 120n + 99n) / 100n).toString(16)}` }] };
      beforeSend?.(nonce);
    }
    const result = await provider.request(forwarded);
    if (typeof result === "string" && KEY.test(result)) {
      const hash = result as Hex;
      onSent?.(hash);
      if (boundedConfirmation) {
        // SDK 0.8 otherwise starts an unconfigured three-minute receipt wait.
        // Hold its hash until this bounded wait has a verified receipt. Transport
        // retries stay disabled: a confirmation timeout must never resend a write.
        await pub.waitForTransactionReceipt({ hash, timeout: CONFIRMATION_TIMEOUT, pollingInterval: 1000 });
        // SDK's raw RPC schema lists Arkiv methods; its public actions also use
        // Ethereum receipt reads on the same transport.
        const receipt = await pub.request({ method: "eth_getTransactionReceipt", params: [hash] } as unknown as Parameters<typeof pub.request>[0]);
        if (!receipt) throw confirmationPending(hash);
        confirmedReceipts.set(hash, receipt);
      }
    }
    return result;
  } }, { retryCount: 0 });
  return createWalletClient({ account: account as Hex, chain: CHAIN, transport, pollingInterval: 1000 });
}
export interface WriteResult { expiresAt?: number; txUrl?: string; cost?: string; alreadyApplied?: boolean }
export function walletErrorMessage(error: unknown): string {
  let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
  for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
    if (cause.code === 4001 || cause.name === "UserRejectedRequestError") return "You rejected the wallet request. No change was confirmed.";
    if (cause.code === -32000) return "Could not verify the operation on Tiramisu. Refresh the data and check your wallet before signing again.";
  }
  const message = error instanceof Error ? error.message : "Could not complete the request. Check your wallet before signing again.";
  return message.split("\n")[0]!.slice(0,400);
}
export async function extendEntityWithWallet(account: string, entityKey: string, targetExpiresAt: number, onSubmitted?: (txUrl: string) => void, onSigning?: (nonce: number) => void, options?: { recoverPendingHash?: Hex }): Promise<WriteResult> {
  if (!KEY.test(entityKey) || !Number.isSafeInteger(targetExpiresAt)) throw new Error("Invalid entity or date.");
  const run = async (): Promise<WriteResult> => {
  const pendingKey = `arkiv-graph:extend:${CHAIN.id}:${account.toLowerCase()}:${entityKey.toLowerCase()}`;
  // Check persistence before signing so a submitted extension can survive reloads.
  localStorage.setItem(`${pendingKey}:available`, "1");
  localStorage.removeItem(`${pendingKey}:available`);
  const pendingHash = localStorage.getItem(pendingKey);
  let observedPendingHash: Hex | undefined;
  let recoveringPendingHash: Hex | undefined;
  let recoveryNonce: number | undefined;
  let submittedHash: Hex | undefined;
  const [entity, timing] = await Promise.all([pub.getEntity(entityKey as Hex), pub.getBlockTiming()]);
  if (entity.owner.toLowerCase() !== account.toLowerCase()) throw new Error("You can only extend entities owned by your wallet.");
  if (!Number.isFinite(timing.blockDuration) || timing.blockDuration <= 0) throw new Error("Could not verify block timing.");
  const targetBlock = timing.currentBlock + BigInt(Math.ceil((targetExpiresAt - timing.currentBlockTime) / timing.blockDuration));
  if (pendingHash) {
    if (!KEY.test(pendingHash)) throw new Error("A previous extension has no verified transaction hash. Check your wallet activity before signing again; automatic resubmission is blocked.");
    const hash = pendingHash as Hex;
    onSubmitted?.(transactionUrl(hash));
    try {
      const receipt = await pub.getTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        localStorage.removeItem(pendingKey);
        throw Object.assign(new Error("The extension transaction reverted. No change was confirmed. Check the transaction before trying again."), { txUrl: transactionUrl(hash) });
      }
      const event = receipt.logs.filter(log => log.address.toLowerCase() === ARKIV_ADDRESS).map(log => {
        try { return decodeEventLog({ abi: ENTITY_EVENTS_ABI, data: log.data, topics: log.topics }); } catch { return null; }
      }).find(event => event?.eventName === "ExpiryExtended" && event.args.entityKey.toLowerCase() === entityKey.toLowerCase() && event.args.owner.toLowerCase() === account.toLowerCase());
      if (!event || event.eventName !== "ExpiryExtended") throw confirmationPending(hash);
      const [updated, timing] = await Promise.all([pub.getEntity(entityKey as Hex), pub.getBlockTiming()]);
      if (updated.expiresAt < event.args.expiresAt || timing.blockDuration <= 0) throw confirmationPending(hash);
      localStorage.removeItem(pendingKey);
      const expiresAt = timing.currentBlockTime + Number(updated.expiresAt - timing.currentBlock) * timing.blockDuration;
      if (expiresAt < targetExpiresAt) throw Object.assign(new Error("The previous extension was confirmed, but the requested date has not been applied. Check the current expiration, then select Extend again to sign the new date."), { txUrl: transactionUrl(hash) });
      return { expiresAt, txUrl: transactionUrl(hash) };
    } catch (error) {
      if ((error as { txUrl?: string })?.txUrl) throw error;
      const pending = await pendingExtension(hash, account, entityKey);
      if (!pending) throw confirmationPending(hash);
      if (entity.expiresAt < pending.expiresAt) {
        const recoverable = pending.expiresAt === targetBlock && pending.nextNonce !== undefined && pending.nonce > pending.nextNonce;
        if (!recoverable || options?.recoverPendingHash !== hash) throw confirmationPending(hash, pending.nonce, pending.nextNonce, recoverable);
        // The visitor explicitly repeats this exact, zero-value absolute extension.
        // A future-nonce transaction cannot be included at the current next nonce.
        // Preserve it; this recovery neither confirms nor cancels the original.
        localStorage.setItem(`${pendingKey}:recovery:${hash}`, JSON.stringify({ version: 1, hash, expiresAtBlock: pending.expiresAt.toString(), originalNonce: pending.nonce, recoveryNonce: pending.nextNonce }));
        recoveringPendingHash = hash;
        recoveryNonce = pending.nextNonce;
      } else {
        localStorage.setItem(`${pendingKey}:observed:${hash}`, JSON.stringify({ version: 1, hash, expiresAtBlock: pending.expiresAt.toString(), nonce: pending.nonce, state: "target-observed" }));
        observedPendingHash = hash;
      }
    }
  }
  const currentExpiry = timing.currentBlockTime + Number(entity.expiresAt - timing.currentBlock) * timing.blockDuration;
  if (observedPendingHash && targetExpiresAt <= currentExpiry) return { expiresAt: currentExpiry, alreadyApplied: true, txUrl: transactionUrl(observedPendingHash) };
  if (entity.expiresAt <= timing.currentBlock || targetExpiresAt <= currentExpiry) throw new Error("Select a date later than the current expiration.");
  if (targetExpiresAt - currentExpiry > 365 * 86400) throw new Error("You can add up to 365 days per operation.");
  let started = false;
  const client = await writer(account, hash => {
    submittedHash = hash;
    localStorage.setItem(pendingKey, hash);
    onSubmitted?.(transactionUrl(hash));
  }, nonce => {
    const activeHash = localStorage.getItem(pendingKey);
    if (activeHash && activeHash !== observedPendingHash && activeHash !== recoveringPendingHash) throw new Error("An extension is already pending. Check your wallet activity before trying again.");
    if (recoveryNonce !== undefined && nonce !== recoveryNonce) throw new Error("The network nonce changed. Check the pending transaction again before recovering it.");
    if (nonce !== undefined) onSigning?.(nonce);
    localStorage.setItem(pendingKey, "submitting");
    started = true;
  }, true);
  await assertSession(account);
  let result;
  try { result = await client.extendEntity({ entityKey: entityKey as Hex, expires: ExpirationTime.atBlock(targetBlock) }); }
  catch (error) {
    if (submittedHash) {
      const pending = await pendingExtension(submittedHash, account, entityKey);
      throw confirmationPending(submittedHash, pending?.nonce, pending?.nextNonce);
    }
    if (started) {
      let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
      for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
        if (cause.code === 4001 || cause.name === "UserRejectedRequestError") {
          const previous = recoveringPendingHash ?? observedPendingHash;
          if (previous) localStorage.setItem(pendingKey, previous); else localStorage.removeItem(pendingKey);
          throw error;
        }
      }
      throw new Error("The wallet did not return a transaction hash. Check your wallet activity before trying again; automatic resubmission is blocked.");
    }
    throw error;
  }
  const { txHash, expiresAt } = result;
  if (expiresAt < targetBlock) throw Object.assign(new Error("The receipt does not confirm the requested date. Check the transaction and refresh before signing again."), { txUrl: transactionUrl(txHash) });
  localStorage.removeItem(pendingKey);
  // SDK 0.8 reads the confirmed ExpiryExtended event; dates remain block-time estimates.
  return { expiresAt: timing.currentBlockTime + Number(expiresAt - timing.currentBlock) * timing.blockDuration,
    txUrl: transactionUrl(txHash) };
  };
  if (navigator.locks) return navigator.locks.request(`arkiv-graph-extend-${account.toLowerCase()}-${entityKey.toLowerCase()}`, { ifAvailable: true }, lock => {
    if (!lock) throw new Error("This entity already has an extension in progress in another tab.");
    return run();
  });
  return run();
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

export async function deleteEntityWithWallet(account: string, entityKey: string): Promise<WriteResult> {
  if (!KEY.test(entityKey)) throw new Error("Invalid entity key.");
  await assertSession(account);
  const entity = await pub.getEntity(entityKey as Hex);
  if (entity.owner.toLowerCase() !== account.toLowerCase()) throw new Error("You can only delete entities owned by your wallet.");
  const timing = await pub.getBlockTiming();
  if (entity.expiresAt <= timing.currentBlock) throw new Error("This entity has already expired. Refresh the table.");
  let submittedHash: Hex | undefined;
  const client = await writer(account, hash => { submittedHash = hash; });
  await assertSession(account);
  try {
    // SDK 0.8 waits for a successful receipt. No related entities are deleted.
    const result = await client.deleteEntity({ entityKey: entityKey as Hex });
    return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${result.txHash}` };
  } catch (error) {
    if (submittedHash) throw Object.assign(new Error("The deletion transaction was submitted, but its confirmation could not be verified. Check the transaction and refresh before signing again."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
    throw error;
  }
}

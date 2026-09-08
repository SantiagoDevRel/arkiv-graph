"use client";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { custom, http, type Hex } from "viem";
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
  if (!provider) throw new Error("Abre esta app con MetaMask o instala una wallet compatible.");
  const active = async () => Number(await provider.request({ method: "eth_chainId" })) === CHAIN.id;
  if (await active()) return;
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name,
      rpcUrls: [PUBLIC_CHAIN.rpcUrl], nativeCurrency: CHAIN.nativeCurrency, blockExplorerUrls: [PUBLIC_CHAIN.transactionExplorerUrl] }] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  }
  if (!await active()) throw new Error("Selecciona Tiramisu en tu wallet y vuelve a intentar.");
}
export async function connectWallet(): Promise<string> {
  const provider = injected();
  if (!provider) throw new Error("No se encontró MetaMask. Instala una wallet compatible para firmar.");
  await provider.request({ method: "eth_requestAccounts" });
  await ensureChain();
  const account = await getConnectedAccount();
  if (!account) throw new Error("La wallet no autorizó una cuenta.");
  return account;
}
async function assertSession(account: string) {
  const provider = injected();
  if (!ADDRESS.test(account) || !provider || await getConnectedAccount() !== account.toLowerCase()) throw new Error("La cuenta cambió. Conecta de nuevo antes de firmar.");
  if (Number(await provider.request({ method: "eth_chainId" })) !== CHAIN.id) throw new Error("La red cambió. Selecciona Tiramisu antes de firmar.");
}
async function writer(account: string, onSent?: (hash: Hex) => void) {
  await ensureChain();
  await assertSession(account);
  if (await pub.getChainId() !== CHAIN.id) throw new Error("El RPC no corresponde a Tiramisu.");
  const provider = injected()!;
  const transport = custom({ request: async (request) => {
    if (request.method === "eth_sendTransaction") await assertSession(account);
    const result = await provider.request(request);
    if (request.method === "eth_sendTransaction" && typeof result === "string" && KEY.test(result)) onSent?.(result as Hex);
    return result;
  } });
  return createWalletClient({ account: account as Hex, chain: CHAIN, transport });
}
export interface WriteResult { expiresAt?: number; txUrl?: string; cost?: string }
export function walletErrorMessage(error: unknown): string {
  let cause = error as { code?: number; name?: string; cause?: unknown } | undefined;
  for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
    if (cause.code === 4001 || cause.name === "UserRejectedRequestError") return "Cancelaste la solicitud en la wallet. No se confirmó ningún cambio.";
    if (cause.code === -32000) return "No se pudo verificar la operación en Tiramisu. Actualiza los datos y revisa tu wallet antes de volver a firmar.";
  }
  const message = error instanceof Error ? error.message : "No se pudo completar la solicitud. Revisa tu wallet antes de volver a firmar.";
  return message.split("\n")[0]!.slice(0,400);
}
export async function extendEntityWithWallet(account: string, entityKey: string, targetExpiresAt: number): Promise<WriteResult> {
  if (!KEY.test(entityKey) || !Number.isSafeInteger(targetExpiresAt)) throw new Error("Entidad o fecha inválida.");
  let submittedHash: Hex | undefined;
  const client = await writer(account, hash => { submittedHash = hash; });
  const entity = await pub.getEntity(entityKey as Hex);
  if (entity.owner.toLowerCase() !== account.toLowerCase()) throw new Error("Solo puedes extender las entidades que pertenecen a tu wallet.");
  const timing = await pub.getBlockTiming();
  if (!Number.isFinite(timing.blockDuration) || timing.blockDuration <= 0) throw new Error("No se pudo verificar el tiempo de bloque.");
  const currentExpiry = timing.currentBlockTime + Number(entity.expiresAt - timing.currentBlock) * timing.blockDuration;
  if (entity.expiresAt <= timing.currentBlock || targetExpiresAt <= currentExpiry) throw new Error("Selecciona una fecha posterior a la expiración actual.");
  if (targetExpiresAt - currentExpiry > 365 * 86400) throw new Error("Puedes agregar hasta 365 días por operación.");
  const targetBlock = timing.currentBlock + BigInt(Math.ceil((targetExpiresAt - timing.currentBlockTime) / timing.blockDuration));
  await assertSession(account);
  let result;
  try { result = await client.extendEntity({ entityKey: entityKey as Hex, expires: ExpirationTime.atBlock(targetBlock) }); }
  catch (error) {
    if (submittedHash) throw Object.assign(new Error("La transacción fue enviada, pero no se pudo verificar su confirmación. Revisa el enlace y actualiza antes de volver a firmar."), { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${submittedHash}` });
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
    if (pendingHash && KEY.test(pendingHash)) {
      let receipt;
      try { receipt = await pub.getTransactionReceipt({ hash: pendingHash as Hex }); }
      catch { throw new Error(`Hay una creación pendiente. Revisa ${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash} antes de volver a firmar.`); }
      if (receipt.status === "success") {
        // Confirm absence at a head that includes the receipt before allowing a new seed.
        const timing = await pub.getBlockTiming();
        if (timing.currentBlock <= receipt.blockNumber) throw new Error("La creación se confirmó. Espera un bloque y pulsa Actualizar antes de volver a intentar.");
        const confirmed = await pub.select({ key: true }).ownedBy(account as Hex).where(eq("project", PROJECT)).limit(1).fetch();
        if (confirmed.entities.length) return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}`, alreadyCreated: true };
        throw new Error(`La creación está confirmada pero sus entidades no aparecen. Pueden estar pendientes de consulta o haber expirado. Revisa ${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${pendingHash}; no vuelvas a firmar sin verificarlo.`);
      }
      localStorage.removeItem(pendingKey);
    }
    const client = await writer(account, hash => localStorage.setItem(pendingKey, hash));
    await assertSession(account);
    const result = await client.executeBatch({ creates: socialSample() });
    return { txUrl: `${PUBLIC_CHAIN.transactionExplorerUrl}/tx/${result.txHash}`, alreadyCreated: false };
  };
  if (navigator.locks) return navigator.locks.request(`arkiv-graph-seed-${account.toLowerCase()}`, { ifAvailable: true }, lock => {
    if (!lock) throw new Error("Ya hay una creación en curso en otra pestaña.");
    return run();
  });
  return run();
}

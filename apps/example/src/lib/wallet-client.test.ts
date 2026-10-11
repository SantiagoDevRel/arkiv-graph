import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ estimateGas: vi.fn(), getEntity: vi.fn(), getBlockTiming: vi.fn(), extendEntity: vi.fn(), deleteEntity: vi.fn(), executeBatch: vi.fn(), createEntity: vi.fn(), getChainId: vi.fn(), getTransaction: vi.fn(), getTransactionCount: vi.fn(), getTransactionReceipt: vi.fn(), waitForTransactionReceipt: vi.fn(), rpcRequest: vi.fn(), selected: vi.fn(), request: vi.fn(), walletConfig: null as any }));
vi.mock("@arkiv-network/sdk", async () => {
  const actual = await vi.importActual<typeof import("@arkiv-network/sdk")>("@arkiv-network/sdk");
  return { ...actual, createPublicClient: () => ({ ...mocks, request: mocks.rpcRequest, select: () => ({ ownedBy() { return this; }, where() { return this; }, limit() { return this; }, fetch: mocks.selected }) }), createWalletClient: (config: any) => { mocks.walletConfig = config; return mocks; } };
});
vi.mock("viem/actions", async () => ({ ...await vi.importActual("viem/actions"), estimateGas: mocks.estimateGas }));
import { deleteEntityWithWallet, extendEntityWithWallet, createSocialSampleWithWallet, ensureChain } from "./wallet-client";
import { socialSample } from "./social-sample";
import { ENTITY_EVENTS_ABI, OperationType } from "@arkiv-network/sdk";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, parseAbi, parseAbiParameters, parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const account: `0x${string}` = `0x${"a".repeat(40)}`;
const entityKey: `0x${string}` = `0x${"b".repeat(64)}`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { ethereum: { request: mocks.request } });
  vi.stubGlobal("navigator", {});
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : null);
  mocks.getChainId.mockResolvedValue(7738577);
  mocks.getTransactionCount.mockResolvedValue(29);
  mocks.getTransaction.mockRejectedValue(new Error("Transaction not found"));
  mocks.estimateGas.mockResolvedValue(3533541n);
  mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 200n });
  mocks.getBlockTiming.mockResolvedValue({ currentBlock: 100n, currentBlockTime: 1000, blockDuration: 2 });
  mocks.extendEntity.mockResolvedValue({ txHash: entityKey, expiresAt: 251n });
  mocks.deleteEntity.mockResolvedValue({ txHash: entityKey, entityKey });
  mocks.executeBatch.mockResolvedValue({ txHash: entityKey });
  mocks.selected.mockResolvedValue({ entities: [] });
  mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  mocks.rpcRequest.mockResolvedValue({ status: "0x1" });
  mocks.getTransactionReceipt.mockRejectedValue(new Error("Still pending"));
});
describe("wallet writes", () => {
  it("sets an absolute future block, rounded up, using SDK 0.8 expires", async () => {
    const result = await extendEntityWithWallet(account, entityKey, 1301);
    expect(mocks.extendEntity).toHaveBeenCalledWith({ entityKey, expires: { minLifetime: 0n, expiresAt: 251n } });
    expect(result.expiresAt).toBe(1302);
  });
  it("does not sign for another owner, an expired entity or a stale target", async () => {
    mocks.getEntity.mockResolvedValueOnce({ owner: `0x${"c".repeat(40)}`, expiresAt: 200n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("owned by");
    mocks.getEntity.mockResolvedValueOnce({ owner: account, expiresAt: 90n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("later than");
    await expect(extendEntityWithWallet(account, entityKey, 1199)).rejects.toThrow("later than");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("rejects invalid dates and account changes", async () => {
    await expect(extendEntityWithWallet(account, entityKey, NaN)).rejects.toThrow("Invalid");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [`0x${"d".repeat(40)}`] : "0x7614d1");
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("account changed");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("propagates wallet rejection and never reports success", async () => {
    mocks.extendEntity.mockRejectedValue(new Error("User rejected"));
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("User rejected");
  });
  it("checks account and chain again at the transaction transport boundary", async () => {
    await extendEntityWithWallet(account, entityKey, 1300);
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : "0x1");
    const transport = mocks.walletConfig.transport({});
    await expect(transport.request({ method: "eth_sendTransaction", params: [] })).rejects.toThrow("network changed");
    expect(mocks.request.mock.calls.some(([arg]) => arg.method === "eth_sendTransaction")).toBe(false);
  });
  it("simulates exact calldata and supplies a sufficient gas limit before asking the wallet", async () => {
    await extendEntityWithWallet(account, entityKey, 1300);
    const transport = mocks.walletConfig.transport({});
    const tx = { from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234", value: "0x0", gas: "0x1e8480" };
    await transport.request({ method: "eth_sendTransaction", params: [tx] });
    expect(mocks.estimateGas).toHaveBeenCalledWith(expect.anything(), { account, to: tx.to, data: tx.data, value: 0n });
    const sent = mocks.request.mock.calls.find(([arg]) => arg.method === "eth_sendTransaction")![0];
    expect(BigInt(sent.params[0].gas)).toBe(4240250n);
    expect(sent.params[0].nonce).toBe("0x1d");
    mocks.request.mockClear();
    mocks.estimateGas.mockRejectedValue(new Error("Execution reverted"));
    await expect(transport.request({ method: "eth_sendTransaction", params: [tx] })).rejects.toThrow("reverted");
    expect(mocks.request.mock.calls.some(([arg]) => arg.method === "eth_sendTransaction")).toBe(false);
  });
  it("checks the account again after simulation and rejects non-entity transfers", async () => {
    await extendEntityWithWallet(account, entityKey, 1300);
    const transport = mocks.walletConfig.transport({});
    const allowed = { from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234", value: "0x0" };
    for (const tx of [{ ...allowed, to: account }, { ...allowed, value: "0x1" }, { ...allowed, data: undefined }]) {
      await expect(transport.request({ method: "eth_sendTransaction", params: [tx] })).rejects.toThrow("does not match an entity operation");
    }
    expect(mocks.estimateGas).not.toHaveBeenCalled();
    mocks.estimateGas.mockImplementation(async () => { mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [] : "0x7614d1"); return 100000n; });
    await expect(transport.request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] })).rejects.toThrow("account changed");
    expect(mocks.request.mock.calls.some(([arg]) => arg.method === "eth_sendTransaction")).toBe(false);
  });
  it("never reseeds an existing sample and creates only the intended batch", async () => {
    mocks.selected.mockResolvedValueOnce({ entities: [{ key: entityKey }] });
    expect(await createSocialSampleWithWallet(account)).toEqual({ alreadyCreated: true });
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    await createSocialSampleWithWallet(account);
    const batch = mocks.executeBatch.mock.calls[0]![0];
    expect(Object.keys(batch)).toEqual(["creates"]);
    expect(batch.creates).toHaveLength(socialSample().length);
    expect(batch.creates.every((e: any) => e.attributes.project === "arkiv-graph-social-v2" && e.flags.permissionlessExtension === false)).toBe(true);
  });
  it("recovers existing entities before a failing receipt lookup, and blocks an uncertain write", async () => {
    const pendingKey = `arkiv-graph:seed:7738577:${account}:arkiv-graph-social-v2`;
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockRejectedValue(new Error("RPC unavailable"));
    mocks.selected.mockResolvedValueOnce({ entities: [{ key: entityKey }] });
    expect((await createSocialSampleWithWallet(account)).alreadyCreated).toBe(true);
    expect(mocks.getTransactionReceipt).not.toHaveBeenCalled();
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("pending");
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
  });
  it("does not reseed a confirmed transaction when its entities are absent or reads lag", async () => {
    const pendingKey = `arkiv-graph:seed:7738577:${account}:arkiv-graph-social-v2`;
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 90n });
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("do not sign again");
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
  });
  it("retains a submitted seed hash after confirmation fails and blocks duplicate submission", async () => {
    const pendingKey = `arkiv-graph:seed:7738577:${account}:arkiv-graph-social-v2`;
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : entityKey);
    mocks.executeBatch.mockImplementation(async () => {
      await mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] });
      throw new Error("Receipt timeout");
    });
    await expect(createSocialSampleWithWallet(account)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    mocks.getTransactionReceipt.mockRejectedValue(new Error("Still pending"));
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("pending");
    expect(mocks.executeBatch).toHaveBeenCalledTimes(1);
  });
  it("preserves uncertainty when storage fails after sending, and recovers a known wallet rejection", async () => {
    const pendingKey = `arkiv-graph:seed:7738577:${account}:arkiv-graph-social-v2`;
    const original = localStorage.setItem;
    localStorage.setItem = (key, value) => { if (value === entityKey) throw new Error("Quota exceeded"); original(key, value); };
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : entityKey);
    mocks.executeBatch.mockImplementation(async () => mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] }));
    await expect(createSocialSampleWithWallet(account)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(localStorage.getItem(pendingKey)).toBe("submitting");
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("automatic resubmission is blocked");
    expect(mocks.executeBatch).toHaveBeenCalledTimes(1);
    // Simulate the developer verifying the wallet history, then testing a rejection.
    localStorage.removeItem(pendingKey);
    mocks.request.mockImplementation(async ({ method }) => { if (method === "eth_sendTransaction") throw Object.assign(new Error("Rejected"), { code: 4001 }); return method === "eth_accounts" ? [account] : "0x7614d1"; });
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("Rejected");
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });
});

describe("extension confirmation recovery", () => {
  const pendingKey = `arkiv-graph:extend:7738577:${account}:${entityKey}`;
  const tx = { from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" };
  const submit = async () => mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [tx] });
  it("publishes the sent hash before the bounded public confirmation wait", async () => {
    const onSubmitted = vi.fn();
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : entityKey);
    mocks.waitForTransactionReceipt.mockImplementationOnce(async () => {
      expect(onSubmitted).toHaveBeenCalledWith(expect.stringContaining(entityKey));
      expect(localStorage.getItem(pendingKey)).toBe(entityKey);
      throw new Error("Receipt timeout");
    });
    mocks.extendEntity.mockImplementationOnce(async () => { await submit(); throw new Error("unreachable"); });
    await expect(extendEntityWithWallet(account, entityKey, 1300, onSubmitted)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: entityKey, timeout: 30000, pollingInterval: 1000 });
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    mocks.getTransactionReceipt.mockRejectedValueOnce(new Error("Still pending"));
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("requested expiration has not been confirmed");
    expect(mocks.request.mock.calls.filter(([args]) => args.method === "eth_sendTransaction")).toHaveLength(1);
  });
  it("uses the public RPC and cached verified receipt rather than the injected wallet", async () => {
    await extendEntityWithWallet(account, entityKey, 1300);
    const transport = mocks.walletConfig.transport({});
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : entityKey);
    await submit();
    mocks.request.mockClear(); mocks.rpcRequest.mockClear();
    expect(await transport.request({ method: "eth_getTransactionReceipt", params: [entityKey] })).toEqual({ status: "0x1" });
    expect(mocks.rpcRequest).not.toHaveBeenCalled();
    await transport.request({ method: "eth_blockNumber" });
    expect(mocks.rpcRequest).toHaveBeenCalledWith({ method: "eth_blockNumber" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("blocks a hashless uncertain attempt and clears only a known rejection", async () => {
    mocks.request.mockImplementation(async ({ method }) => {
      if (method === "eth_sendTransaction") throw Object.assign(new Error("Rejected"), { code: 4001 });
      return method === "eth_accounts" ? [account] : "0x7614d1";
    });
    mocks.extendEntity.mockImplementationOnce(submit);
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("Rejected");
    expect(localStorage.getItem(pendingKey)).toBeNull();
    localStorage.setItem(pendingKey, "submitting");
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("automatic resubmission is blocked");
    expect(mocks.extendEntity).toHaveBeenCalledTimes(1);
  });
  it("recovers the same confirmed hash and fresh expiry without signing a stale date again", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: "success", logs: [{
      address: tx.to,
      topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: "ExpiryExtended", args: { entityKey, owner: account } }),
      data: encodeAbiParameters([{ type: "uint64" }], [251n]),
    }] });
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 260n });
    const result = await extendEntityWithWallet(account, entityKey, 1100);
    expect(result).toEqual({ expiresAt: 1320, txUrl: expect.stringContaining(entityKey) });
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(mocks.extendEntity).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });
  it("retains pending state when a receipt has no matching extension event", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: "success", logs: [] });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("does not confirm a new requested date by recovering an older extension", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: "success", logs: [{
      address: tx.to,
      topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: "ExpiryExtended", args: { entityKey, owner: account } }),
      data: encodeAbiParameters([{ type: "uint64" }], [251n]),
    }] });
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 251n });
    await expect(extendEntityWithWallet(account, entityKey, 1400)).rejects.toThrow("requested date");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });
  const pendingTransaction = (expiresAt: bigint, key = entityKey) => ({
    hash: entityKey, from: account, to: tx.to, value: 0n, chainId: 7738577, nonce: 68,
    input: encodeFunctionData({ abi: parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]), functionName: "execute", args: [[{
      operation: OperationType.ExtendExpiry,
      operationData: encodeAbiParameters(parseAbiParameters("(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)"), [{ entityKey: key, expiresAt, minLifetime: 0n }]),
    }]] }),
  });
  it("reports the actual nonce gap while retaining an unfulfilled request without signing", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(300n));
    await expect(extendEntityWithWallet(account, entityKey, 1400)).rejects.toThrow("nonce 68; Tiramisu's next nonce is 29");
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("offers an explicit recovery for the exact queued target and opens the wallet only on that second request", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(300n));
    await expect(extendEntityWithWallet(account, entityKey, 1400)).rejects.toMatchObject({ recoverPendingHash: entityKey });
    expect(mocks.extendEntity).not.toHaveBeenCalled();
    const newHash = `0x${"c".repeat(64)}`;
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : newHash);
    mocks.extendEntity.mockImplementationOnce(async () => {
      await mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ ...tx, data: pendingTransaction(300n).input }] });
      return { txHash: newHash, expiresAt: 300n };
    });
    const onSigning = vi.fn();
    await expect(extendEntityWithWallet(account, entityKey, 1400, undefined, onSigning, { recoverPendingHash: entityKey })).resolves.toMatchObject({ expiresAt: 1400 });
    expect(onSigning).toHaveBeenCalledWith(29);
    const calls = mocks.request.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].params[0]).toMatchObject({ nonce: "0x1d", data: pendingTransaction(300n).input });
    expect(JSON.parse(localStorage.getItem(`${pendingKey}:recovery:${entityKey}`)!)).toMatchObject({ version: 1, hash: entityKey, originalNonce: 68, recoveryNonce: 29 });
  });
  it("does not recover a different target, another hash, or a queue with no nonce gap", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(300n));
    for (const [target, hash] of [[1402, entityKey], [1400, `0x${"c".repeat(64)}`]] as const) {
      await expect(extendEntityWithWallet(account, entityKey, target, undefined, undefined, { recoverPendingHash: hash })).rejects.toThrow("requested expiration has not been confirmed");
    }
    mocks.getTransactionCount.mockResolvedValue(68);
    await expect(extendEntityWithWallet(account, entityKey, 1400, undefined, undefined, { recoverPendingHash: entityKey })).rejects.toThrow("requested expiration has not been confirmed");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("rechecks the recovery nonce at the signing boundary and never sends if it changed", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(300n));
    mocks.getTransactionCount.mockResolvedValueOnce(29).mockResolvedValueOnce(30);
    mocks.extendEntity.mockImplementationOnce(submit);
    await expect(extendEntityWithWallet(account, entityKey, 1400, undefined, undefined, { recoverPendingHash: entityKey })).rejects.toThrow("nonce changed");
    expect(mocks.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
  });
  it("restores the original pending hash when the recovery signature is rejected", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(300n));
    mocks.request.mockImplementation(async ({ method }) => {
      if (method === "eth_sendTransaction") throw Object.assign(new Error("Rejected"), { code: 4001 });
      return method === "eth_accounts" ? [account] : "0x7614d1";
    });
    mocks.extendEntity.mockImplementationOnce(submit);
    await expect(extendEntityWithWallet(account, entityKey, 1400, undefined, undefined, { recoverPendingHash: entityKey })).rejects.toThrow("Rejected");
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    expect(localStorage.getItem(`${pendingKey}:recovery:${entityKey}`)).toContain(entityKey);
  });
  it("preserves an unconfirmed hash whose exact target is already on-chain, without claiming its receipt confirmed", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(251n));
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 260n });
    const result = await extendEntityWithWallet(account, entityKey, 1300);
    expect(result).toMatchObject({ expiresAt: 1320, alreadyApplied: true });
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    expect(JSON.parse(localStorage.getItem(`${pendingKey}:observed:${entityKey}`)!)).toMatchObject({ hash: entityKey, state: "target-observed" });
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("allows a distinct later request after observing the old target, preserving the old hash", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(251n));
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 260n });
    mocks.extendEntity.mockResolvedValue({ txHash: `0x${"c".repeat(64)}`, expiresAt: 300n });
    expect(await extendEntityWithWallet(account, entityKey, 1400)).toMatchObject({ expiresAt: 1400 });
    expect(mocks.extendEntity).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`${pendingKey}:observed:${entityKey}`)).toContain(entityKey);
  });
  it("does not unblock using another entity's operation even when this entity has a later expiry", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransaction.mockResolvedValue(pendingTransaction(251n, `0x${"c".repeat(64)}`));
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 260n });
    await expect(extendEntityWithWallet(account, entityKey, 1400)).rejects.toThrow("requested expiration has not been confirmed");
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("rejects an SDK result whose confirmed expiration is before the requested block", async () => {
    mocks.extendEntity.mockResolvedValue({ txHash: entityKey, expiresAt: 220n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("does not confirm the requested date");
  });
  it("reports a confirmed revert without automatically signing again", async () => {
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: "reverted" });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("transaction reverted");
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
});

describe("public signed pending evidence", () => {
  const fixture = async (overrides: Record<string, unknown> = {}) => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const input = encodeFunctionData({ abi: parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]), functionName: "execute", args: [[{
      operation: OperationType.ExtendExpiry,
      operationData: encodeAbiParameters(parseAbiParameters("(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)"), [{ entityKey, expiresAt: 251n, minLifetime: 0n }]),
    }]] });
    const serializedTransaction = await signer.signTransaction({ type: "legacy", chainId: 7738577, nonce: 68, gas: 150000n, gasPrice: 1000000000n, to: "0x4400000000000000000000000000000000000044", value: 0n, data: input, ...overrides });
    const hash = keccak256(serializedTransaction);
    const owner = signer.address.toLowerCase();
    const pendingKey = `arkiv-graph:extend:7738577:${owner}:${entityKey}`;
    mocks.getEntity.mockResolvedValue({ owner, expiresAt: 260n });
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [owner] : "0x7614d1");
    localStorage.setItem(pendingKey, hash);
    return { serializedTransaction, hash, owner, pendingKey, cacheKey: `${pendingKey}:transaction:${hash}`, input };
  };
  it("verifies cached signed bytes when the RPC no longer exposes an old queued transaction", async () => {
    const f = await fixture();
    localStorage.setItem(f.cacheKey, JSON.stringify({ version: 1, serializedTransaction: f.serializedTransaction }));
    expect(await extendEntityWithWallet(f.owner, entityKey, 1300)).toMatchObject({ alreadyApplied: true, expiresAt: 1320 });
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.extendEntity).not.toHaveBeenCalled();
    expect(localStorage.getItem(f.pendingKey)).toBe(f.hash);
  });
  it("does not trust altered signed bytes or a forged sender in browser storage", async () => {
    const f = await fixture();
    localStorage.setItem(f.cacheKey, JSON.stringify({ version: 1, serializedTransaction: `${f.serializedTransaction}00` }));
    await expect(extendEntityWithWallet(f.owner, entityKey, 1300)).rejects.toThrow("not been confirmed");
    const wrongKey = `arkiv-graph:extend:7738577:${account}:${entityKey}`;
    localStorage.setItem(wrongKey, f.hash);
    localStorage.setItem(`${wrongKey}:transaction:${f.hash}`, JSON.stringify({ version: 1, serializedTransaction: f.serializedTransaction }));
    mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 260n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("not been confirmed");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("rejects signed evidence for another chain or a value transfer", async () => {
    for (const overrides of [{ chainId: 1 }, { value: 1n }]) {
      const f = await fixture(overrides);
      localStorage.setItem(f.cacheKey, JSON.stringify({ version: 1, serializedTransaction: f.serializedTransaction }));
      await expect(extendEntityWithWallet(f.owner, entityKey, 1300)).rejects.toThrow("not been confirmed");
    }
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("caches only the verified public signed transaction returned by the RPC", async () => {
    const f = await fixture();
    const parsed = parseTransaction(f.serializedTransaction);
    mocks.getTransaction.mockResolvedValue({ ...parsed, hash: f.hash, from: f.owner, input: f.input, value: parsed.value ?? 0n });
    expect(await extendEntityWithWallet(f.owner, entityKey, 1300)).toMatchObject({ alreadyApplied: true });
    expect(JSON.parse(localStorage.getItem(f.cacheKey)!)).toEqual({ version: 1, serializedTransaction: f.serializedTransaction });
  });
});

describe("wallet deletion", () => {
  it("deletes only the selected owned entity through the confirmed SDK action", async () => {
    const result = await deleteEntityWithWallet(account, entityKey);
    expect(mocks.deleteEntity).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEntity).toHaveBeenCalledWith({ entityKey });
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    expect(result.txUrl).toContain(`/tx/${entityKey}`);
  });
  it("rejects malformed keys, other owners, missing and expired entities before signing", async () => {
    await expect(deleteEntityWithWallet(account, "0x1234")).rejects.toThrow("Invalid entity");
    mocks.getEntity.mockResolvedValueOnce({ owner: `0x${"c".repeat(40)}`, expiresAt: 200n });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("owned by your wallet");
    mocks.getEntity.mockRejectedValueOnce(new Error("Entity not found"));
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("not found");
    mocks.getEntity.mockResolvedValueOnce({ owner: account, expiresAt: 100n });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("already expired");
    expect(mocks.deleteEntity).not.toHaveBeenCalled();
  });
  it("rejects account or chain changes and a mismatched RPC", async () => {
    mocks.request.mockImplementationOnce(async () => []);
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("account changed");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : "0x1");
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("network changed");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : "0x7614d1");
    mocks.getChainId.mockResolvedValueOnce(1);
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("RPC does not match");
    expect(mocks.deleteEntity).not.toHaveBeenCalled();
  });
  it("never reports success when the wallet rejects or the SDK reports a revert", async () => {
    mocks.deleteEntity.mockRejectedValueOnce(Object.assign(new Error("User rejected"), { code: 4001 }));
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("User rejected");
    mocks.deleteEntity.mockRejectedValueOnce(new Error("Transaction reverted"));
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("reverted");
  });
  it("keeps the submitted hash on a confirmation error and never automatically resends", async () => {
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : entityKey);
    mocks.deleteEntity.mockImplementation(async () => {
      await mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] });
      throw new Error("Receipt timeout");
    });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(mocks.request.mock.calls.filter(([q]) => q.method === "eth_sendTransaction")).toHaveLength(1);
  });
  it("rechecks the session after the fresh ownership read", async () => {
    mocks.getEntity.mockImplementationOnce(async () => {
      mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [] : "0x7614d1");
      return { owner: account, expiresAt: 200n };
    });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("account changed");
    expect(mocks.deleteEntity).not.toHaveBeenCalled();
  });
});

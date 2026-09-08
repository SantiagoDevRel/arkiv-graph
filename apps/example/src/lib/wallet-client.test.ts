import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ estimateGas: vi.fn(), getEntity: vi.fn(), getBlockTiming: vi.fn(), extendEntity: vi.fn(), executeBatch: vi.fn(), createEntity: vi.fn(), getChainId: vi.fn(), getTransactionReceipt: vi.fn(), selected: vi.fn(), request: vi.fn(), walletConfig: null as any }));
vi.mock("@arkiv-network/sdk", async () => {
  const actual = await vi.importActual<typeof import("@arkiv-network/sdk")>("@arkiv-network/sdk");
  return { ...actual, createPublicClient: () => ({ ...mocks, select: () => ({ ownedBy() { return this; }, where() { return this; }, limit() { return this; }, fetch: mocks.selected }) }), createWalletClient: (config: any) => { mocks.walletConfig = config; return mocks; } };
});
vi.mock("viem/actions", async () => ({ ...await vi.importActual("viem/actions"), estimateGas: mocks.estimateGas }));
import { extendEntityWithWallet, createSocialSampleWithWallet, ensureChain } from "./wallet-client";
import { socialSample } from "./social-sample";
const account = `0x${"a".repeat(40)}`;
const entityKey = `0x${"b".repeat(64)}`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { ethereum: { request: mocks.request } });
  vi.stubGlobal("navigator", {});
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x7614d1" : null);
  mocks.getChainId.mockResolvedValue(7738577);
  mocks.estimateGas.mockResolvedValue(3533541n);
  mocks.getEntity.mockResolvedValue({ owner: account, expiresAt: 200n });
  mocks.getBlockTiming.mockResolvedValue({ currentBlock: 100n, currentBlockTime: 1000, blockDuration: 2 });
  mocks.extendEntity.mockResolvedValue({ txHash: entityKey, expiresAt: 251n });
  mocks.executeBatch.mockResolvedValue({ txHash: entityKey });
  mocks.selected.mockResolvedValue({ entities: [] });
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

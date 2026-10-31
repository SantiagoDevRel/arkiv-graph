import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ estimateGas: vi.fn(), getTransactionCount: vi.fn(), getGasPrice: vi.fn(), getBlock: vi.fn(), getEntity: vi.fn(), getBlockTiming: vi.fn(), extendEntity: vi.fn(), deleteEntity: vi.fn(), executeBatch: vi.fn(), createEntity: vi.fn(), getChainId: vi.fn(), getTransactionReceipt: vi.fn(), getTransaction: vi.fn(), selected: vi.fn(), request: vi.fn(), walletConfig: null as any }));
vi.mock("@arkiv-network/sdk", async () => {
  const actual = await vi.importActual<typeof import("@arkiv-network/sdk")>("@arkiv-network/sdk");
  return { ...actual, createPublicClient: () => ({ ...mocks, select: () => ({ ownedBy() { return this; }, where() { return this; }, limit() { return this; }, fetch: mocks.selected }) }), createWalletClient: (config: any) => { mocks.walletConfig = config; return mocks; } };
});
vi.mock("viem/actions", async () => ({ ...await vi.importActual("viem/actions"), estimateGas: mocks.estimateGas, getGasPrice: mocks.getGasPrice }));
import { deleteEntityWithWallet, extendEntityWithWallet, createSocialSampleWithWallet, ensureChain, walletErrorMessage } from "./wallet-client";
import { socialSample } from "./social-sample";
const account = `0x${"a".repeat(40)}`;
const entityKey = `0x${"b".repeat(64)}`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { ethereum: { request: mocks.request } });
  vi.stubGlobal("navigator", {});
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x76edaf" : null);
  mocks.getChainId.mockResolvedValue(7794095);
  mocks.getTransactionCount.mockResolvedValue(0);
  mocks.getGasPrice.mockResolvedValue(1n);
  mocks.getBlock.mockResolvedValue({ gasLimit: 30_000_000n });
  mocks.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 90n, transactionHash: entityKey, gasUsed: 100000n });
  mocks.getTransaction.mockResolvedValue({ hash: entityKey, blockNumber: 90n, from: account, to: "0x4400000000000000000000000000000000000044", value: 0n, gas: 2_000_000n, nonce: 0 });
  mocks.estimateGas.mockResolvedValue(3533541n);
  mocks.getEntity.mockResolvedValue({ $owner: account, $expiresAt: 200n });
  mocks.getBlockTiming.mockResolvedValue({ currentBlock: 100n, currentBlockTime: 1000, blockDuration: 2 });
  mocks.extendEntity.mockResolvedValue({ txHash: entityKey, expiresAt: 251n });
  mocks.deleteEntity.mockResolvedValue({ txHash: entityKey, entityKey });
  mocks.executeBatch.mockResolvedValue({ txHash: entityKey });
  mocks.selected.mockResolvedValue({ entities: [] });
});
describe("wallet writes", () => {
  it("blocks a nonce race at the unsigned transport boundary", async () => {
    await deleteEntityWithWallet(account, entityKey);
    const request = { method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234", nonce: "0x0" }] };
    mocks.getTransactionCount.mockResolvedValue(1);
    await expect(mocks.walletConfig.transport({}).request(request)).rejects.toThrow("nonce changed");
    expect(mocks.request.mock.calls.some(([q]) => q.method === "eth_sendTransaction")).toBe(false);
  });
  it("rejects lifetimes beyond Rabdi's cap before signing", async () => {
    await expect(extendEntityWithWallet(account, entityKey, 1000 + 7_884_000 * 2)).rejects.toThrow("maximum lifetime");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("estimates large writes and blocks gas above half the head limit or unsafe overrides", async () => {
    await deleteEntityWithWallet(account, entityKey);
    const request = { method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] };
    mocks.estimateGas.mockResolvedValue(4_904_531n);
    await mocks.walletConfig.transport({}).request(request);
    const sent = mocks.request.mock.calls.find(([arg]) => arg.method === "eth_sendTransaction")![0];
    expect(BigInt(sent.params[0].gas)).toBe(9_809_062n);
    mocks.request.mockClear();
    mocks.estimateGas.mockResolvedValue(8_000_000n);
    await expect(mocks.walletConfig.transport({}).request(request)).rejects.toThrow("smaller batches");
    expect(mocks.request.mock.calls.some(([arg]) => arg.method === "eth_sendTransaction")).toBe(false);
    mocks.estimateGas.mockResolvedValue(2_000_000n);
    await deleteEntityWithWallet(account, entityKey, { gas: 1_000_000n });
    await expect(mocks.walletConfig.transport({}).request(request)).rejects.toThrow("preserve twice");
  });
  it("redacts credential-bearing RPC URLs from displayed provider errors", () => {
    const message = walletErrorMessage(new Error("RPC failed at https://rpc.rabdi.db-chain.testnet.arkiv.network/unit-test-access-key?token=unit-test-token"));
    expect(message).not.toContain("unit-test-access-key");
    expect(message).not.toContain("unit-test-token");
  });
  it("never installs a keyless or shared RPC when Rabdi is missing from the wallet", async () => {
    mocks.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw Object.assign(new Error("Unknown chain"), { code: 4902 });
      return [];
    });
    await expect(ensureChain()).rejects.toThrow("your own RPC access key");
    expect(mocks.request.mock.calls.some(([r]) => r.method === "wallet_addEthereumChain")).toBe(false);
  });
  it("checks the receipt even when the SDK resolves and refuses a pending nonce", async () => {
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: "reverted" });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("reverted");
    mocks.getTransactionCount.mockImplementation(async ({ blockTag }) => blockTag === "pending" ? 1 : 0);
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("pending transaction");
  });
  it("sets an absolute future block, rounded up, using SDK 1.0 expiration", async () => {
    const result = await extendEntityWithWallet(account, entityKey, 1301);
    expect(mocks.extendEntity).toHaveBeenCalledWith({ entityKey, expiration: { minLifetime: 0n, expiresAt: 251n } }, { nonce: 0, gas: 1_000_000n, gasPrice: 1n });
    expect(result.expiresAt).toBe(1302);
  });
  it("does not sign for another owner, an expired entity or a stale target", async () => {
    mocks.getEntity.mockResolvedValueOnce({ $owner: `0x${"c".repeat(40)}`, $expiresAt: 200n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("owned by");
    mocks.getEntity.mockResolvedValueOnce({ $owner: account, $expiresAt: 90n });
    await expect(extendEntityWithWallet(account, entityKey, 1300)).rejects.toThrow("later than");
    await expect(extendEntityWithWallet(account, entityKey, 1199)).rejects.toThrow("later than");
    expect(mocks.extendEntity).not.toHaveBeenCalled();
  });
  it("rejects invalid dates and account changes", async () => {
    await expect(extendEntityWithWallet(account, entityKey, NaN)).rejects.toThrow("Invalid");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [`0x${"d".repeat(40)}`] : "0x76edaf");
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
    expect(mocks.estimateGas).toHaveBeenCalledWith(expect.anything(), { account, to: tx.to, data: tx.data, value: 0n, blockTag: "latest" });
    const sent = mocks.request.mock.calls.find(([arg]) => arg.method === "eth_sendTransaction")![0];
    expect(BigInt(sent.params[0].gas)).toBe(7067082n);
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
    mocks.estimateGas.mockImplementation(async () => { mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [] : "0x76edaf"); return 100000n; });
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
    expect(batch.creates.every((e: any) => e.values.project === "arkiv-graph-social-v3" && e.flags.permissionlessExtension === false)).toBe(true);
  });
  it("recovers existing entities before a failing receipt lookup, and blocks an uncertain write", async () => {
    const pendingKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3`;
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
    const pendingKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3`;
    localStorage.setItem(pendingKey, entityKey);
    mocks.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 90n, transactionHash: entityKey, gasUsed: 100000n });
  mocks.getTransaction.mockResolvedValue({ hash: entityKey, blockNumber: 90n, from: account, to: "0x4400000000000000000000000000000000000044", value: 0n, gas: 2_000_000n, nonce: 0 });
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("do not sign again");
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBe(entityKey);
  });
  it("retains a submitted seed hash after confirmation fails and blocks duplicate submission", async () => {
    const pendingKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3`;
    mocks.getTransactionReceipt.mockRejectedValue(new Error("Receipt timeout"));
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x76edaf" : entityKey);
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
  it("keeps transaction history when the legacy hash write fails after sending", async () => {
    const pendingKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3`;
    const original = localStorage.setItem;
    localStorage.setItem = (key, value) => { if (value === entityKey) throw new Error("Quota exceeded"); original(key, value); };
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x76edaf" : entityKey);
    mocks.executeBatch.mockImplementation(async () => mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] }));
    await expect(createSocialSampleWithWallet(account)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(localStorage.getItem(pendingKey)).toBe("submitting");
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("do not sign again");
    expect(mocks.executeBatch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(`${pendingKey}:history`)!).attempts[0].hash).toBe(entityKey);
  });
  it("never turns a rejected signature into permission for another send", async () => {
    const pendingKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3`;
    mocks.request.mockImplementation(async ({ method }) => { if (method === "eth_sendTransaction") throw Object.assign(new Error("Rejected"), { code: 4001 }); return method === "eth_accounts" ? [account] : "0x76edaf"; });
    mocks.executeBatch.mockImplementation(async () => mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] }));
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("Rejected");
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("signature was rejected");
    expect(mocks.executeBatch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(pendingKey)).toBe("rejected");
  });
});

describe("sample gas-exhaustion retry", () => {
  const historyKey = `arkiv-graph:seed:7794095:${account}:arkiv-graph-social-v3:history`;
  function flow(outcomes: ("exhausted" | "semantic" | "null" | "success")[]) {
    const sent: { hash: string; gas: bigint; nonce: number }[] = [];
    let nonce = 0;
    mocks.estimateGas.mockResolvedValue(1_000_000n);
    mocks.getTransactionCount.mockImplementation(async () => nonce);
    mocks.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x76edaf";
      if (method === "eth_sendTransaction") {
        const hash = `0x${(sent.length + 11).toString(16).padStart(64, "0")}`;
        sent.push({ hash, gas: BigInt(params[0].gas), nonce: Number(BigInt(params[0].nonce)) });
        return hash;
      }
      throw new Error("Unexpected wallet request");
    });
    mocks.getTransactionReceipt.mockImplementation(async ({ hash }) => {
      const i = sent.findIndex(tx => tx.hash === hash), tx = sent[i]!;
      const outcome = outcomes[i] ?? "success";
      if (outcome === "null") return null;
      nonce = tx.nonce + 1;
      return { status: outcome === "success" ? "success" : "reverted", transactionHash: hash, blockNumber: BigInt(90 + i), gasUsed: outcome === "exhausted" ? tx.gas : tx.gas / 2n };
    });
    mocks.getTransaction.mockImplementation(async ({ hash }) => {
      const i = sent.findIndex(tx => tx.hash === hash), tx = sent[i]!;
      return { hash, from: account, to: "0x4400000000000000000000000000000000000044", value: 0n, gas: tx.gas, nonce: tx.nonce, blockNumber: BigInt(90 + i) };
    });
    mocks.executeBatch.mockImplementation(async () => {
      const hash = await mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234", nonce: `0x${nonce.toString(16)}` }] });
      const outcome = outcomes[sent.length - 1] ?? "success";
      if (outcome !== "success") throw new Error("SDK confirmation failed");
      return { txHash: hash, createdEntities: [entityKey] };
    });
    return sent;
  }
  it("retries a confirmed exhausted receipt exactly once with fresh nonce and doubled gas", async () => {
    const sent = flow(["exhausted", "success"]);
    await expect(createSocialSampleWithWallet(account)).resolves.toMatchObject({ alreadyCreated: false });
    expect(sent).toHaveLength(2);
    expect(sent.map(tx => tx.nonce)).toEqual([0, 1]);
    expect(sent.map(tx => tx.gas)).toEqual([2_000_000n, 4_000_000n]);
    expect(mocks.estimateGas).toHaveBeenCalledTimes(2);
    expect(mocks.estimateGas.mock.calls.every(([, params]) => params.blockTag === "latest")).toBe(true);
    const history = JSON.parse(localStorage.getItem(historyKey)!).attempts;
    expect(history.map((tx: any) => tx.hash)).toEqual(sent.map(tx => tx.hash));
    expect(history.map((tx: any) => tx.status)).toEqual(["reverted", "success"]);
    expect(history.every((tx: any) => tx.sampleIds.length === socialSample().length)).toBe(true);
    expect(history[1].entityKeys).toEqual([entityKey]);
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("do not sign again");
    expect(sent).toHaveLength(2);
  });
  it("stops after the second exhausted revert across repeated calls and cleared legacy guard", async () => {
    const sent = flow(["exhausted", "exhausted"]);
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("single gas-exhaustion retry");
    localStorage.removeItem(historyKey.replace(":history", ""));
    for (let i = 0; i < 3; i++) await expect(createSocialSampleWithWallet(account)).rejects.toThrow("single gas-exhaustion retry");
    expect(sent).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(historyKey)!).attempts.map((a: any) => a.hash)).toEqual(sent.map(a => a.hash));
  });
  it("never retries a semantic revert", async () => {
    const sent = flow(["semantic"]);
    for (let i = 0; i < 3; i++) await expect(createSocialSampleWithWallet(account)).rejects.toThrow("without gas exhaustion");
    expect(sent).toHaveLength(1);
  });
  it("never retries a null receipt", async () => {
    const sent = flow(["null"]);
    for (let i = 0; i < 3; i++) await expect(createSocialSampleWithWallet(account)).rejects.toThrow("receipt is uncertain");
    expect(sent).toHaveLength(1);
  });
  it("never retries a success, including after entities disappear from queries", async () => {
    const sent = flow(["success"]);
    await createSocialSampleWithWallet(account);
    for (let i = 0; i < 3; i++) await expect(createSocialSampleWithWallet(account)).rejects.toThrow("do not sign again");
    expect(sent).toHaveLength(1);
  });
  it("does not send a retry when doubled gas exceeds half the head limit", async () => {
    const sent = flow(["exhausted"]);
    mocks.getBlock.mockResolvedValue({ gasLimit: 7_000_000n });
    await expect(createSocialSampleWithWallet(account)).rejects.toThrow("half the head block limit");
    expect(sent).toHaveLength(1);
  });
});

describe("wallet deletion", () => {
  it("deletes only the selected owned entity through the confirmed SDK action", async () => {
    const result = await deleteEntityWithWallet(account, entityKey);
    expect(mocks.deleteEntity).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEntity).toHaveBeenCalledWith({ entityKey }, { nonce: 0, gas: 1_000_000n, gasPrice: 1n });
    expect(mocks.executeBatch).not.toHaveBeenCalled();
    expect(result.txUrl).toContain(`/tx/${entityKey}`);
  });
  it("rejects malformed keys, other owners, missing and expired entities before signing", async () => {
    await expect(deleteEntityWithWallet(account, "0x1234")).rejects.toThrow("Invalid entity");
    mocks.getEntity.mockResolvedValueOnce({ $owner: `0x${"c".repeat(40)}`, $expiresAt: 200n });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("owned by your wallet");
    mocks.getEntity.mockRejectedValueOnce(new Error("Entity not found"));
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("not found");
    mocks.getEntity.mockResolvedValueOnce({ $owner: account, $expiresAt: 100n });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("already expired");
    expect(mocks.deleteEntity).not.toHaveBeenCalled();
  });
  it("rejects account or chain changes and a mismatched RPC", async () => {
    mocks.request.mockImplementationOnce(async () => []);
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("account changed");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : "0x1");
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("network changed");
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : "0x76edaf");
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
    mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [account] : method === "eth_chainId" ? "0x76edaf" : entityKey);
    mocks.deleteEntity.mockImplementation(async () => {
      await mocks.walletConfig.transport({}).request({ method: "eth_sendTransaction", params: [{ from: account, to: "0x4400000000000000000000000000000000000044", data: "0x1234" }] });
      throw new Error("Receipt timeout");
    });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toMatchObject({ txUrl: expect.stringContaining(entityKey) });
    expect(mocks.request.mock.calls.filter(([q]) => q.method === "eth_sendTransaction")).toHaveLength(1);
  });
  it("rechecks the session after the fresh ownership read", async () => {
    mocks.getEntity.mockImplementationOnce(async () => {
      mocks.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [] : "0x76edaf");
      return { $owner: account, $expiresAt: 200n };
    });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toThrow("account changed");
    expect(mocks.deleteEntity).not.toHaveBeenCalled();
  });
});

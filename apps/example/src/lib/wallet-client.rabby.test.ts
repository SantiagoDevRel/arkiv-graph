// Real SDK and viem clients against a wallet stub that behaves like Rabby: it forwards
// only standard eth_*/wallet_* methods and answers anything else with -32601. Arkiv reads
// must travel over HTTP to the keyless public RPC; the wallet only signs and sends.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex } from "viem";
import { createSocialSampleWithWallet, deleteEntityWithWallet, extendEntityWithWallet } from "./wallet-client";
import { socialSample } from "./social-sample";

const KEYLESS_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
const ARKIV = "0x4400000000000000000000000000000000000044";
const RABDI = "0x76edaf";
const account = `0x${"a".repeat(40)}`;
const entityKey = `0x${"b".repeat(64)}` as Hex;
const txHash = `0x${"c".repeat(64)}` as Hex;
const EVENTS = parseAbi([
  "event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)",
  "event ExpiryExtended(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt)",
]);
const WALLET_ALLOWED = new Set(["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_sendTransaction"]);

let walletChain: string;
let walletKnowsRabdi: boolean;
let walletCalls: { method: string; params?: any }[];
let httpCalls: { url: string; method: string }[];
let sent: any[];
let estimate: bigint;
let receiptLogs: { topics: Hex[]; data: Hex }[];

function log(entry: { topics: readonly Hex[] | Hex[]; data: Hex }, index: number) {
  return { address: ARKIV, topics: entry.topics, data: entry.data, blockNumber: "0x64", blockHash: `0x${"d".repeat(64)}`,
    transactionHash: txHash, transactionIndex: "0x0", logIndex: `0x${index.toString(16)}`, removed: false };
}
// Fake Rabdi node state, answered identically over HTTP and (for standard methods) through the wallet.
function node(method: string, params: any[] = []): unknown {
  switch (method) {
    case "eth_chainId": return RABDI;
    case "eth_blockNumber": return "0x64";
    case "eth_gasPrice": return "0x3b9aca00";
    case "eth_getTransactionCount": return "0x5";
    case "eth_estimateGas": return `0x${estimate.toString(16)}`;
    case "eth_getBlockByNumber": return { number: "0x64", hash: `0x${"d".repeat(64)}`, parentHash: `0x${"e".repeat(64)}`, timestamp: "0x3e8",
      gasLimit: "0x1c9c380", gasUsed: "0x0", baseFeePerGas: null, transactions: [], uncles: [], miner: ARKIV, difficulty: "0x0", nonce: "0x0000000000000000",
      extraData: "0x", logsBloom: `0x${"0".repeat(512)}`, sha3Uncles: `0x${"0".repeat(64)}`, size: "0x0", stateRoot: `0x${"0".repeat(64)}`,
      receiptsRoot: `0x${"0".repeat(64)}`, transactionsRoot: `0x${"0".repeat(64)}`, mixHash: `0x${"0".repeat(64)}`, totalDifficulty: "0x0" };
    case "arkiv_getBlockTiming": return { current_block: 100, current_block_time: 1000, duration: 2 };
    case "arkiv_getEntity": return { key: params[0], owner: account, creator: account, createdAt: "0x1", updatedAt: "0x1", expiresAt: "0xc8", creationFlags: 0, attributes: [] };
    case "arkiv_query": return { data: [], blockNumber: "0x64" };
    case "eth_getTransactionReceipt":
      return sent.length && params[0] === txHash ? { transactionHash: txHash, blockNumber: "0x64", blockHash: `0x${"d".repeat(64)}`, transactionIndex: "0x0",
        from: account, to: ARKIV, status: "0x1", gasUsed: "0x30d40", cumulativeGasUsed: "0x30d40", effectiveGasPrice: "0x3b9aca00", type: "0x0",
        contractAddress: null, logsBloom: `0x${"0".repeat(512)}`, logs: receiptLogs.map(log) } : null;
    default: throw Object.assign(new Error(`unexpected node method ${method}`), { code: -32601 });
  }
}
const rabby = { request: async ({ method, params }: { method: string; params?: any }) => {
  walletCalls.push({ method, params });
  // Rabby: "method [arkiv_getEntity] doesn't has corresponding handler".
  if (!/^(eth|wallet|net|web3|personal)_/.test(method)) throw Object.assign(new Error(`method [${method}] doesn't has corresponding handler`), { code: -32601 });
  if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
  if (method === "eth_chainId") return walletChain;
  if (method === "wallet_switchEthereumChain") {
    if (params[0].chainId === RABDI && !walletKnowsRabdi) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
    walletChain = params[0].chainId; return null;
  }
  if (method === "wallet_addEthereumChain") { walletKnowsRabdi = true; walletChain = params[0].chainId; return null; }
  if (method === "eth_sendTransaction") { sent.push(params[0]); return txHash; }
  return node(method, params);
} };

beforeEach(() => {
  walletChain = RABDI; walletKnowsRabdi = true; walletCalls = []; httpCalls = []; sent = []; estimate = 200_000n; receiptLogs = [];
  vi.stubGlobal("window", { ethereum: rabby });
  vi.stubGlobal("navigator", {});
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body));
    const one = (call: { id: number; method: string; params?: any[] }) => {
      httpCalls.push({ url, method: call.method });
      try { return { jsonrpc: "2.0", id: call.id, result: node(call.method, call.params) }; }
      catch (error) { return { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: (error as Error).message } }; }
    };
    return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { headers: { "content-type": "application/json" } });
  });
});

function expectWalletOnlySigns() {
  // The wallet sees account/chain checks and exactly one send; never an arkiv_* or other read.
  expect(walletCalls.map(c => c.method).filter(m => !WALLET_ALLOWED.has(m))).toEqual([]);
  expect(walletCalls.filter(c => c.method === "eth_sendTransaction")).toHaveLength(1);
  // Reads go only to the keyless public RPC, and no send or signature goes over HTTP.
  // viem may normalize the base URL to a trailing "/": still the keyless host with no path (no key).
  expect([...new Set(httpCalls.map(c => { const u = new URL(c.url); return `${u.origin}${u.pathname}${u.search}`; }))]).toEqual([`${KEYLESS_RPC}/`]);
  expect(httpCalls.filter(c => /^(eth_send|eth_sign|personal_|wallet_)/.test(c.method))).toEqual([]);
}
function expectExplicitGas(minimumGas: bigint) {
  const tx = sent[0];
  expect(tx.to.toLowerCase()).toBe(ARKIV);
  expect(BigInt(tx.nonce)).toBe(5n); // eth_getTransactionCount(latest)
  expect(BigInt(tx.gasPrice)).toBe(1_000_000_000n); // eth_gasPrice
  expect(BigInt(tx.gas)).toBe(minimumGas);
}

describe("wallet writes with a Rabby-like provider", () => {
  it("deletes: switches/adds Rabdi with the keyless RPC, reads over HTTP and only sends through the wallet", async () => {
    walletChain = "0x1"; walletKnowsRabdi = false;
    await expect(deleteEntityWithWallet(account, entityKey)).resolves.toMatchObject({ txUrl: expect.stringContaining(txHash) });
    const added = walletCalls.filter(c => c.method === "wallet_addEthereumChain");
    expect(added).toHaveLength(1);
    expect(added[0]!.params[0].rpcUrls).toEqual([KEYLESS_RPC]);
    expect(httpCalls.map(c => c.method)).toEqual(expect.arrayContaining(["arkiv_getEntity", "arkiv_getBlockTiming", "eth_estimateGas", "eth_getTransactionReceipt"]));
    expectWalletOnlySigns();
    expectExplicitGas(1_000_000n); // max(1,000,000, 2 x 200,000)
  });

  it("extends: Lifetime Extension reads the entity over HTTP and sends one transaction with explicit gas", async () => {
    estimate = 700_000n;
    receiptLogs = [{ topics: encodeEventTopics({ abi: EVENTS, eventName: "ExpiryExtended", args: { entityKey, owner: account as Hex } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint64" }], [250n]) }];
    await expect(extendEntityWithWallet(account, entityKey, 1400)).resolves.toMatchObject({ txUrl: expect.stringContaining(txHash) });
    expect(httpCalls.map(c => c.method)).toEqual(expect.arrayContaining(["arkiv_getEntity", "arkiv_getBlockTiming"]));
    expectWalletOnlySigns();
    expectExplicitGas(1_400_000n); // 2 x estimate
  });

  it("creates the social sample: the existence query runs over HTTP and the batch is sent once through the wallet", async () => {
    estimate = 3_000_000n;
    receiptLogs = socialSample().map((_, i) => ({ topics: encodeEventTopics({ abi: EVENTS, eventName: "EntityCreated",
      args: { entityKey: `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex, owner: account as Hex } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint64" }, { type: "uint8" }], [1000n, 0]) }));
    await expect(createSocialSampleWithWallet(account)).resolves.toMatchObject({ alreadyCreated: false, txUrl: expect.stringContaining(txHash) });
    expect(httpCalls.map(c => c.method)).toContain("arkiv_query");
    expectWalletOnlySigns();
    expectExplicitGas(6_000_000n);
    // Retry safety: a second click after the confirmed write never resends.
    await createSocialSampleWithWallet(account).catch(() => undefined);
    expect(walletCalls.filter(c => c.method === "eth_sendTransaction")).toHaveLength(1);
  });

  it("never sends again when the receipt cannot be read after the wallet returned a hash", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      httpCalls.push({ url: String(input), method: body.method });
      if (body.method === "eth_getTransactionReceipt") return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: node(body.method, body.params) }), { headers: { "content-type": "application/json" } });
    });
    await expect(deleteEntityWithWallet(account, entityKey)).rejects.toMatchObject({ txUrl: expect.stringContaining(txHash) });
    expect(walletCalls.filter(c => c.method === "eth_sendTransaction")).toHaveLength(1);
    expect(walletCalls.map(c => c.method).filter(m => !WALLET_ALLOWED.has(m))).toEqual([]);
  }, 30_000);
});

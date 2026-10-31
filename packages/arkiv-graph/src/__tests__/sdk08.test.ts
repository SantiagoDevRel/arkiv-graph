import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom } from "viem";
import { buildGraph, buildTables, fetchArkivGraph, computeTtl, formatTtl } from "../index.js";
const owner = `0x${"a".repeat(40)}` as const;
const key = `0x${"b".repeat(64)}`;
const chain = rabdi({ accessKey: "unit-test" });
const jsonToBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("legacy plain inputs and SDK 1.0 reads", () => {
  it("does not fabricate expiration dates from unavailable block timing", () => {
    for (const blockDuration of [0, -1, NaN, Infinity]) expect(computeTtl(200, 100, { currentBlock: 150, currentBlockTime: 1000, blockDuration })).toEqual({});
    expect(formatTtl(NaN)).toBe("—");
  });
  it("preserves typed attribute values, bytes, relationships and expiry", () => {
    const entities = [{ key, owner, attributes: { entityType: { type: "str", value: "user" }, handle: { type: "str", value: "alice" }, balance: { type: "u256", value: 123456789012345678901234n }, enabled: { type: "bool", value: true } }, bytes: jsonToBytes({ name: "Alice" }), createdAt: 10n, expiresAt: 100n },
      { key: `0x${"c".repeat(64)}`, attributes: { entityType: { type: "str", value: "post" }, author: { type: "str", value: "alice" } }, bytes: jsonToBytes({ text: "Hello" }) }];
    const links = [{ type: "reference" as const, attribute: "author", targetAttribute: "handle" }];
    const graph = buildGraph(entities, { links, blockTiming: { currentBlock: 50n, currentBlockTime: 1000, blockDuration: 2 } });
    expect(graph.edges).toHaveLength(1);
    const user = graph.nodes.find(n => n.id === key)!;
    expect(user.bytes).toEqual({ name: "Alice" });
    expect(user.expiresAt).toBe(1100);
    expect(user.attributes?.find(a => a.key === "balance")?.value).toBe("123456789012345678901234");
    const tables = buildTables(graph, entities, { links });
    expect(tables.tables.some(t => t.rows.some(row => row.id === key))).toBe(true);
    expect(() => JSON.stringify(graph)).not.toThrow();
  });
  it("requires a wallet scope and bounded positive limit", async () => {
    await expect(fetchArkivGraph({ project: "sample" })).rejects.toThrow("scope");
    for (const limit of [0, -1, 0.5, NaN, 5001]) await expect(fetchArkivGraph({ ownedBy: owner, limit })).rejects.toThrow("limit");
  });
  it("requires identity for a custom RPC", async () => {
    await expect(fetchArkivGraph({ ownedBy: owner, rpcUrl: "https://example.com" })).rejects.toThrow("requires chain");
  });
  it.each([false, true])("uses bounded offset pages and a lookahead (extra=%s)", async (extra) => {
    const pages = [
      { blockNumber: "0x10", data: [{ key }, { key: `0x${"c".repeat(64)}` }, ...(extra ? [{ key: `0x${"d".repeat(64)}` }] : [])] },
    ];
    let i = 0;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method !== "arkiv_query") throw new Error("Timing unavailable");
      return pages[i++];
    });
    const client = createPublicClient({ chain, transport: custom({ request }, { retryCount: 0 }) });
    const result = await fetchArkivGraph({ client, chain, ownedBy: owner, project: "social", limit: 2 });
    expect(result.entities).toHaveLength(2);
    expect(result.truncated).toBe(extra);
    expect(result.blockTiming).toBeUndefined();
    const calls = request.mock.calls.map(([call]) => call as { method: string; params?: [string, unknown] }).filter(c => c.method === "arkiv_query");
    expect(calls[0]?.params?.[0]).toContain("project = str('social')");
    expect(calls[0]?.params?.[0]).toContain("$owner = addr(");
    expect(calls[0]?.params?.[0]).toContain("$key");
    expect(calls).toHaveLength(1);
  });
  it.each([false, true])("advances the SDK 1.0 offset beyond its 100-row page cap (extra=%s)", async extra => {
    const all = Array.from({ length: extra ? 101 : 100 }, (_, i) => ({ key: `0x${(i + 1).toString(16).padStart(64, '0')}` }));
    const requests: { offset: string; limit: string; select: Record<string, unknown> }[] = [];
    const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method !== 'arkiv_query') throw new Error('Timing unavailable');
      const options = params![1] as typeof requests[number];
      requests.push(options);
      const offset = Number(BigInt(options.offset));
      return { blockNumber: '0x10', data: all.slice(offset, offset + Number(BigInt(options.limit))) };
    };
    const client = createPublicClient({ chain, transport: custom({ request }, { retryCount: 0 }) });
    const result = await fetchArkivGraph({ client, chain, ownedBy: owner, limit: 100 });
    expect(result.entities).toHaveLength(100);
    expect(result.truncated).toBe(extra);
    expect(requests.map(r => [r.offset, r.limit])).toEqual([['0x0', '0x64'], ['0x64', '0x1']]);
    expect(requests[0].select).not.toHaveProperty('pay' + 'load');
  });
});

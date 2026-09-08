import { describe, expect, it, vi } from "vitest";
import { createPublicClient, jsonToPayload } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { custom } from "viem";
import { buildGraph, buildTables, fetchArkivGraph, computeTtl, formatTtl } from "../index.js";
const owner = `0x${"a".repeat(40)}` as const;
const key = `0x${"b".repeat(64)}`;

describe("SDK 0.8 entity adapter", () => {
  it("does not fabricate expiration dates from unavailable block timing", () => {
    for (const blockDuration of [0, -1, NaN, Infinity]) expect(computeTtl(200, 100, { currentBlock: 150, currentBlockTime: 1000, blockDuration })).toEqual({});
    expect(formatTtl(NaN)).toBe("—");
  });
  it("preserves typed attribute values, payload, relationships and expiry", () => {
    const entities = [{ key, owner, attributes: { entityType: { type: "str", value: "user" }, handle: { type: "str", value: "alice" }, balance: { type: "u256", value: 123456789012345678901234n }, enabled: { type: "bool", value: true } }, payload: jsonToPayload({ name: "Alice" }), createdAt: 10n, expiresAt: 100n },
      { key: `0x${"c".repeat(64)}`, attributes: { entityType: { type: "str", value: "post" }, author: { type: "str", value: "alice" } }, payload: jsonToPayload({ text: "Hello" }) }];
    const links = [{ type: "reference" as const, attribute: "author", targetAttribute: "handle" }];
    const graph = buildGraph(entities, { links, blockTiming: { currentBlock: 50n, currentBlockTime: 1000, blockDuration: 2 } });
    expect(graph.edges).toHaveLength(1);
    const user = graph.nodes.find(n => n.id === key)!;
    expect(user.payload).toEqual({ name: "Alice" });
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
  it.each([false, true])("paginates the SDK cursor and marks a capped result (extra=%s)", async (extra) => {
    const pages = [
      { blockNumber: "0x10", data: [{ key }], cursor: "page2" },
      { blockNumber: "0x10", data: [{ key: `0x${"c".repeat(64)}` }], ...(extra ? { cursor: "page3" } : {}) },
      { blockNumber: "0x10", data: [{ key: `0x${"d".repeat(64)}` }] },
    ];
    let i = 0;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method !== "arkiv_query") throw new Error("Timing unavailable");
      return pages[i++];
    });
    const client = createPublicClient({ chain: tiramisu, transport: custom({ request }, { retryCount: 0 }) });
    const result = await fetchArkivGraph({ client, chain: tiramisu, ownedBy: owner, project: "social", limit: 2 });
    expect(result.entities).toHaveLength(2);
    expect(result.truncated).toBe(extra);
    expect(result.blockTiming).toBeUndefined();
    const calls = request.mock.calls.map(([call]) => call as { method: string; params?: [string, { cursor?: string }] }).filter(c => c.method === "arkiv_query");
    expect(calls[0]?.params?.[0]).toContain("project = str('social')");
    expect(calls[0]?.params?.[0]).toContain("$owner = addr(");
    expect(calls[1]?.params?.[1].cursor).toBe("page2");
    expect(calls).toHaveLength(extra ? 3 : 2);
  });
});

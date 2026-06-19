import { describe, expect, it } from "vitest";
import { buildGraph } from "../buildGraph.js";
import { detectGroups } from "../external.js";
import { normalizeEntity } from "../normalize.js";
import type { ArkivEntityLike, LinkRule } from "../types.js";

const hex64 = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const hex40 = (n: number) => "0x" + n.toString(16).padStart(40, "0");

const USER_A = hex64(1);
const USER_B = hex64(2);
const POST_1 = hex64(10);
const LIKE_1 = hex64(20);
const COMMENT_1 = hex64(30);

function entity(key: string, type: string, payload: Record<string, unknown>, attrs: Record<string, string | number> = {}): ArkivEntityLike {
  return {
    key,
    owner: "0xowner1111111111111111111111111111111111",
    creator: "0xowner1111111111111111111111111111111111",
    attributes: [
      { key: "project", value: "test" },
      { key: "entityType", value: type },
      ...Object.entries(attrs).map(([k, v]) => ({ key: k, value: v })),
    ],
    payload,
  };
}

const SOCIAL_LINKS: LinkRule[] = [
  { type: "reference", attribute: "authorKey", targetType: "user", label: "by" },
  { type: "reference", attribute: "postKey", targetType: "post", label: "on" },
  { type: "join", entityType: "like", sourceAttr: "userKey", targetAttr: "postKey", label: "likes" },
  { type: "join", entityType: "follow", sourceAttr: "followerKey", targetAttr: "followeeKey", label: "follows" },
];

describe("buildGraph", () => {
  it("creates entity nodes and reference edges", () => {
    const entities = [
      entity(USER_A, "user", { handle: "alice" }),
      entity(POST_1, "post", { text: "hello world" }, { authorKey: USER_A }),
    ];
    const g = buildGraph(entities, { links: SOCIAL_LINKS });
    expect(g.nodes.map((n) => n.id).sort()).toEqual([POST_1, USER_A].sort());
    const ref = g.edges.find((e) => e.kind === "reference");
    expect(ref).toBeTruthy();
    expect(ref!.source).toBe(POST_1);
    expect(ref!.target).toBe(USER_A);
    expect(ref!.directed).toBe(true);
  });

  it("collapses join entities into edges (no node for the join)", () => {
    const entities = [
      entity(USER_A, "user", { handle: "alice" }),
      entity(POST_1, "post", { text: "hi" }, { authorKey: USER_A }),
      entity(LIKE_1, "like", {}, { userKey: USER_B, postKey: POST_1 }),
      entity(USER_B, "user", { handle: "bob" }),
    ];
    const g = buildGraph(entities, { links: SOCIAL_LINKS });
    // like is NOT a node
    expect(g.nodes.find((n) => n.id === LIKE_1)).toBeUndefined();
    const joinEdge = g.edges.find((e) => e.kind === "join");
    expect(joinEdge).toBeTruthy();
    expect(joinEdge!.source).toBe(USER_B);
    expect(joinEdge!.target).toBe(POST_1);
    expect(joinEdge!.viaEntityKey).toBe(LIKE_1);
  });

  it("collapses join entities that reference endpoints by a stable id (handle)", () => {
    const entities = [
      { key: hex64(301), attributes: [{ key: "entityType", value: "user" }, { key: "handle", value: "alice" }], payload: { handle: "alice" } },
      { key: hex64(302), attributes: [{ key: "entityType", value: "user" }, { key: "handle", value: "bob" }], payload: { handle: "bob" } },
      { key: hex64(303), attributes: [{ key: "entityType", value: "follow" }, { key: "followerHandle", value: "alice" }, { key: "followeeHandle", value: "bob" }], payload: {} },
    ] as ArkivEntityLike[];
    const g = buildGraph(entities, {
      links: [
        {
          type: "join",
          entityType: "follow",
          sourceAttr: "followerHandle",
          targetAttr: "followeeHandle",
          sourceMatchAttr: "handle",
          targetMatchAttr: "handle",
          label: "follows",
        },
      ],
    });
    expect(g.nodes.find((n) => n.id === hex64(303))).toBeUndefined(); // follow collapsed
    const edge = g.edges.find((e) => e.kind === "join");
    expect(edge!.source).toBe(hex64(301));
    expect(edge!.target).toBe(hex64(302));
  });

  it("creates owner wallet nodes", () => {
    const entities = [entity(USER_A, "user", { handle: "alice" })];
    const g = buildGraph(entities, { links: [{ type: "owner" }] });
    const wallet = g.nodes.find((n) => n.kind === "wallet");
    expect(wallet).toBeTruthy();
    expect(g.edges.some((e) => e.kind === "owner")).toBe(true);
  });

  it("connects shared-attribute entities via a hub by default", () => {
    const entities = [
      entity(hex64(101), "post", { text: "a" }, { topic: "arkiv" }),
      entity(hex64(102), "post", { text: "b" }, { topic: "arkiv" }),
      entity(hex64(103), "post", { text: "c" }, { topic: "arkiv" }),
    ];
    const g = buildGraph(entities, { links: [{ type: "shared", attribute: "topic" }] });
    const hub = g.nodes.find((n) => n.kind === "tag");
    expect(hub).toBeTruthy();
    expect(g.edges.filter((e) => e.kind === "shared").length).toBe(3);
  });

  it("resolves references by a stable business id (targetAttribute)", () => {
    const entities = [
      { key: hex64(201), attributes: [{ key: "entityType", value: "user" }, { key: "handle", value: "alice" }], payload: {} },
      { key: hex64(202), attributes: [{ key: "entityType", value: "post" }, { key: "authorHandle", value: "alice" }], payload: { text: "x" } },
    ] as ArkivEntityLike[];
    const g = buildGraph(entities, {
      links: [{ type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user" }],
    });
    const ref = g.edges.find((e) => e.kind === "reference");
    expect(ref).toBeTruthy();
    expect(ref!.source).toBe(hex64(202));
    expect(ref!.target).toBe(hex64(201));
  });

  it("computes TTL fraction from block timing", () => {
    const e: ArkivEntityLike = {
      key: USER_A,
      attributes: [{ key: "entityType", value: "user" }],
      payload: {},
      createdAtBlock: 1000n,
      expiresAtBlock: 2000n,
    };
    const g = buildGraph([e], { blockTiming: { currentBlock: 1500, currentBlockTime: 1_700_000_000, blockDuration: 2 } });
    const node = g.nodes[0]!;
    expect(node.ttlSeconds).toBe((2000 - 1500) * 2);
    expect(node.ttlFraction).toBeCloseTo(0.5, 5);
  });

  it("counts node degree", () => {
    const entities = [
      entity(USER_A, "user", { handle: "alice" }),
      entity(POST_1, "post", { text: "hi" }, { authorKey: USER_A }),
      entity(COMMENT_1, "comment", { text: "nice" }, { postKey: POST_1, authorKey: USER_A }),
    ];
    const g = buildGraph(entities, { links: SOCIAL_LINKS });
    const user = g.nodes.find((n) => n.id === USER_A)!;
    expect(user.degree).toBe(2); // post.authorKey + comment.authorKey
  });
});

describe("external chain detection", () => {
  it("detects a chainId + contract group (Base pfp) and a chainId + tx group (Eth mint)", () => {
    const e = entity(
      POST_1,
      "post",
      { text: "minted" },
      {
        pfpChainId: 8453,
        pfpContract: hex40(0xabc),
        mintChainId: 1,
        mintTx: hex64(0xdef),
      },
    );
    const groups = detectGroups(normalizeEntity(e));
    const base = groups.find((g) => g.chainId === 8453);
    const eth = groups.find((g) => g.chainId === 1);
    expect(base?.contract).toBe(hex40(0xabc));
    expect(eth?.tx).toBe(hex64(0xdef));
  });

  it("builds external chain + contract/tx nodes and edges", () => {
    const entities = [
      entity(POST_1, "post", { text: "minted" }, { mintChainId: 8453, mintTx: hex64(0xfeed) }),
    ];
    const g = buildGraph(entities);
    const chain = g.nodes.find((n) => n.kind === "external" && n.external?.kind === "chain");
    const tx = g.nodes.find((n) => n.kind === "external" && n.external?.kind === "tx");
    expect(chain?.external?.chainName).toBe("Base");
    expect(tx?.explorerUrl).toContain("basescan.org/tx/");
    expect(g.edges.some((e) => e.kind === "external" && e.source === POST_1)).toBe(true);
  });

  it("does NOT treat Braga's own chainId as external", () => {
    const entities = [entity(POST_1, "post", { text: "x" }, { sourceChainId: 60138453102 })];
    const g = buildGraph(entities);
    expect(g.nodes.some((n) => n.kind === "external")).toBe(false);
  });

  it("does NOT classify an internal entity-key reference as a foreign tx", () => {
    // authorKey holds USER_A's key (0x+64hex). With a tx-like name it could be
    // mistaken for a tx — but USER_A is a fetched entity, so it must stay internal.
    const entities = [
      entity(USER_A, "user", { handle: "alice" }),
      entity(POST_1, "post", { text: "x" }, { authorTx: USER_A }),
    ];
    const g = buildGraph(entities, { links: [{ type: "reference", attribute: "authorTx" }] });
    expect(g.nodes.some((n) => n.kind === "external")).toBe(false);
  });

  it("drops a bare address with no chain/contract/tx", () => {
    const entities = [entity(POST_1, "post", { text: "x" }, { from: hex40(0x1) })];
    const g = buildGraph(entities);
    expect(g.nodes.some((n) => n.kind === "external")).toBe(false);
  });
});

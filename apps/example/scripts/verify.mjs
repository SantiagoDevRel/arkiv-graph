import dotenv from "dotenv";
import { fetchArkivGraph } from "arkiv-graph";

dotenv.config({ path: new URL("../.env.local", import.meta.url) });

const PROJECT = process.env.ARKIV_PROJECT ?? "arkiv-graph-demo-v1";
const TRUSTED = process.env.TRUSTED_ADDRESS;

const SOCIAL_LINKS = [
  { type: "reference", attribute: "authorHandle", targetAttribute: "handle", targetType: "user", label: "by" },
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "comment", targetType: "post", label: "on" },
  { type: "reference", attribute: "postId", targetAttribute: "postId", sourceType: "tip", targetType: "post", label: "tips" },
  { type: "join", entityType: "follow", sourceAttr: "followerHandle", targetAttr: "followeeHandle", sourceMatchAttr: "handle", targetMatchAttr: "handle", label: "follows" },
  { type: "join", entityType: "like", sourceAttr: "byHandle", targetAttr: "postId", sourceMatchAttr: "handle", targetMatchAttr: "postId", label: "likes" },
];

const { graph, blockTiming } = await fetchArkivGraph({
  project: PROJECT,
  createdBy: TRUSTED,
  links: SOCIAL_LINKS,
  arkivExplorer: "https://explorer.braga.hoodi.arkiv.network",
});

const byKind = {};
for (const n of graph.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
const byType = {};
for (const n of graph.nodes) if (n.entityType) byType[n.entityType] = (byType[n.entityType] ?? 0) + 1;
const byEdge = {};
for (const e of graph.edges) byEdge[e.kind] = (byEdge[e.kind] ?? 0) + 1;

console.log("blockTiming:", blockTiming ? `block ${blockTiming.currentBlock}` : "none");
console.log("nodes:", graph.nodes.length, byKind);
console.log("entity types:", byType);
console.log("edges:", graph.edges.length, byEdge);
console.log("external nodes:", graph.nodes.filter((n) => n.kind === "external").map((n) => `${n.external?.kind}:${n.external?.chainName ?? n.label}`));
const alice = graph.nodes.find((n) => n.label?.toLowerCase().includes("alice"));
console.log("sample (alice):", alice ? { label: alice.label, degree: alice.degree, ttl: alice.ttlSeconds, explorer: alice.explorerUrl } : "not found");
const unresolved = graph.nodes.filter((n) => n.unresolved);
console.log("unresolved (should be 0):", unresolved.length, unresolved.map((n) => n.label));

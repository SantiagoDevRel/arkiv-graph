import { ExpirationTime, jsonToPayload, type CreateEntityParameters } from "@arkiv-network/sdk";
import { PROJECT, TYPE_ATTRIBUTE } from "./config";

export const SAMPLE_DAYS = 30;
const people = [
  ["alice", "Alice Rivera", "Frontend"], ["bob", "Bob Chen", "Data"],
  ["carol", "Carol Kim", "Design"], ["dave", "Dave Silva", "Art"],
  ["erin", "Erin Patel", "Frontend"], ["frank", "Frank Okafor", "Data"],
] as const;
const posts = [
  ["p1", "alice", "A table helps me inspect entities; the graph shows how they relate."],
  ["p2", "bob", "My app queries by owner and project, then filters by entity type."],
  ["p3", "carol", "Entity Expiration gives each entity a lifetime we can extend."],
  ["p4", "dave", "Working on a new piece with the community."],
  ["p5", "erin", "The same data model powers both views."],
  ["p6", "frank", "I can inspect the payload and verify the entity on the explorer."],
  ["p7", "alice", "Lifetime Extension asks my wallet to sign the change."],
  ["p8", "bob", "Relationships here are application rules, resolved in the client."],
] as const;
const follows = [["alice", "bob"], ["bob", "carol"], ["carol", "alice"], ["dave", "erin"], ["erin", "frank"], ["frank", "dave"], ["carol", "dave"]] as const;

export function socialSample(): CreateEntityParameters[] {
  const make = (entityType: string, attributes: Record<string, string>, payload: object): CreateEntityParameters => ({
    attributes: { project: PROJECT, [TYPE_ATTRIBUTE]: entityType, ...attributes },
    payload: jsonToPayload(payload), contentType: "application/json",
    expires: ExpirationTime.fromDays(SAMPLE_DAYS),
    flags: { permissionlessExtension: false, readonly: false },
  });
  const creates = [
    ...people.map(([handle, name, team]) => make("user", { handle }, { name, team, fictional: true })),
    ...posts.map(([post_id, author_handle, text]) => make("post", { post_id, author_handle }, { text, fictional: true })),
    ...follows.map(([follower_handle, followee_handle], i) => make("follow", { follower_handle, followee_handle }, { followId: `f${i}` })),
    ...posts.slice(0, 6).map(([post_id], i) => make("comment", { post_id, author_handle: people[(i + 1) % people.length]![0] }, { text: "Thanks for sharing this example.", commentId: `c${i}` })),
    ...posts.map(([post_id], i) => make("like", { post_id, by_handle: people[(i + 2) % people.length]![0] }, { likeId: `l${i}` })),
  ];
  if (creates.some(item => Object.keys(item.attributes ?? {}).some(name => !/^[a-z][a-z0-9_]{0,31}$/.test(name)))) throw new Error("Sample attribute names must use lowercase identifiers on Tiramisu.");
  const copy = creates.map(item => JSON.stringify(item.attributes) + new TextDecoder().decode(item.payload)).join(" ");
  if (/\bTTL\b|\bBTL\b|time-to-live|on Ethereum/i.test(copy)) throw new Error("Sample contains unsupported brand terminology.");
  return creates;
}
export const SAMPLE_COUNT = socialSample().length;

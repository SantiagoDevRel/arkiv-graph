import { ExpirationTime, type CreateEntityParameters } from "@arkiv-network/sdk";
import { bytes, defineSchema, key, str } from "@arkiv-network/sdk/schema";
import { PROJECT, TYPE_ATTRIBUTE } from "./config";

export const SAMPLE_DAYS = 30;
export const SocialSchema = defineSchema("arkiv-graph-social-v3", {
  project: str().indexed(), entity_type: str().indexed(), sample_id: str().indexed(),
  handle: str().indexed().optional(), post_id: str().indexed().optional(),
  author_handle: str().indexed().optional(), follower_handle: str().indexed().optional(),
  followee_handle: str().indexed().optional(), by_handle: str().indexed().optional(),
  entity_ref: key().indexed().optional(), name: str().optional(), team: str().optional(),
  text: str().optional(), document: bytes().optional(),
});
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
  ["p6", "frank", "I can inspect typed columns and verify the entity on the explorer."],
  ["p7", "alice", "Lifetime Extension asks my wallet to sign the change."],
  ["p8", "bob", "Relationships here are application rules, resolved in the client."],
] as const;
const follows = [["alice", "bob"], ["bob", "carol"], ["carol", "alice"], ["dave", "erin"], ["erin", "frank"], ["frank", "dave"], ["carol", "dave"]] as const;

export function socialSample(): CreateEntityParameters<typeof SocialSchema>[] {
  const make = (entityType: string, id: string, values: Record<string, string>): CreateEntityParameters<typeof SocialSchema> => ({
    schema: SocialSchema,
    values: { project: PROJECT, [TYPE_ATTRIBUTE]: entityType, sample_id: id, ...values },
    expiration: ExpirationTime.fromDays(SAMPLE_DAYS),
    flags: { permissionlessExtension: false, readonly: false },
  });
  const creates = [
    ...people.map(([handle, name, team]) => make("user", `user-${handle}`, { handle, name, team })),
    ...posts.map(([post_id, author_handle, text]) => make("post", post_id, { post_id, author_handle, text })),
    ...follows.map(([follower_handle, followee_handle], i) => make("follow", `f${i}`, { follower_handle, followee_handle })),
    ...posts.slice(0, 6).map(([post_id], i) => make("comment", `c${i}`, { post_id, author_handle: people[(i + 1) % people.length]![0], text: "Thanks for sharing this example." })),
    ...posts.map(([post_id], i) => make("like", `l${i}`, { post_id, by_handle: people[(i + 2) % people.length]![0] })),
    // Separate join entities with equal endpoints remain separate directed edges.
    make("follow", "duplicate-follow", { follower_handle: "alice", followee_handle: "bob" }),
    make("follow", "missing-follow", { follower_handle: "alice", followee_handle: "missing-profile" }),
    make("comment", "expired-post-ref", { author_handle: "alice", post_id: "expired-post", text: "The referenced post is no longer loaded." }),
    { schema: SocialSchema, expiration: ExpirationTime.fromDays(SAMPLE_DAYS), flags: { permissionlessExtension: false, readonly: false }, values: { project: PROJECT, entity_type: "reference", sample_id: "missing-entity-ref", entity_ref: key(`0x${"fe".repeat(32)}`), text: "A weak entity-key reference can point outside the loaded scope." } },
    { ...make("post", "bytes-example", { post_id: "p-bytes", author_handle: "alice", text: "A document is stored in a bytes column." }), values: { project: PROJECT, entity_type: "post", sample_id: "bytes-example", post_id: "p-bytes", author_handle: "alice", text: "A document is stored in a bytes column.", document: new TextEncoder().encode("Fictional social sample on Rabdi.") } },
  ];
  const copy = creates.map(item => JSON.stringify(item.values)).join(" ");
  if (/\bTTL\b|\bBTL\b|time-to-live|\brecords\b|on Ethereum/i.test(copy)) throw new Error("Sample contains unsupported brand terminology.");
  return creates;
}
export const SAMPLE_COUNT = socialSample().length;

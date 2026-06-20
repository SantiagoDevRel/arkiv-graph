import { addExternalForEntity } from "./external.js";
import { attrValues, normalizeEntity, type NormEntity } from "./normalize.js";
import { computeTtl } from "./ttl.js";
import { BRAGA_EXPLORER } from "./chains.js";
import type {
  ArkivEntityLike,
  BuildGraphOptions,
  Graph,
  GraphEdge,
  GraphNode,
  JoinRule,
  LinkRule,
} from "./types.js";

function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;
}

function pickLabel(e: NormEntity, entityType: string | undefined, labelKey?: string): string {
  const p = e.payload;
  if (labelKey) {
    if (p && typeof p === "object" && labelKey in p) return String((p as Record<string, unknown>)[labelKey]);
    if (e.attrMap.has(labelKey)) return String(e.attrMap.get(labelKey));
  }
  for (const k of ["name", "title", "handle", "label", "text", "message", "body"]) {
    const v = (p as Record<string, unknown>)?.[k];
    if (typeof v === "string" && v.trim()) return v.length > 40 ? `${v.slice(0, 38)}…` : v;
  }
  if (entityType) return `${entityType} ${shortKey(e.key)}`;
  return shortKey(e.key);
}

function walletLabel(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** The display label an edge gets for a rule. Shared by buildGraph (edge labels)
 *  and buildTables (relationship summary) so the two views never disagree. */
export function labelForRule(rule: LinkRule): string {
  switch (rule.type) {
    case "reference":
      return rule.label ?? rule.attribute;
    case "shared":
      return rule.label ?? rule.attribute;
    case "join":
      return rule.label ?? rule.entityType;
    case "tag":
      return rule.attribute;
    case "owner":
      return rule.label ?? (rule.byCreator ? "created by" : "owned by");
  }
}

/**
 * Turn a flat list of Arkiv entities into a graph. Nodes are entities; edges are
 * derived from the `links` you supply (Arkiv has no native joins, so YOU declare
 * how records relate). References to other chains become external nodes.
 */
export function buildGraph(entities: ArkivEntityLike[], options: BuildGraphOptions = {}): Graph {
  const typeAttr = options.typeAttribute ?? "entityType";
  const links = options.links ?? [];
  const createPlaceholders = options.createPlaceholders !== false;
  const arkivExplorer = (options.arkivExplorer ?? BRAGA_EXPLORER).replace(/\/$/, "");

  const joinTypes = new Set(
    links.filter((l): l is JoinRule => l.type === "join").map((l) => l.entityType),
  );

  const norms = entities.filter((e) => e && e.key).map(normalizeEntity);
  const byKey = new Map<string, NormEntity>();
  for (const n of norms) byKey.set(n.key, n);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();

  const ensureNode = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdge = (edge: GraphEdge) => {
    if (edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  };

  // ── 1. entity nodes (skip join-entity types — they become edges) ────────────
  const entityNodeKeys: string[] = [];
  for (const e of norms) {
    const entityType = e.attrMap.get(typeAttr);
    const typeStr = entityType != null ? String(entityType) : undefined;
    if (typeStr && joinTypes.has(typeStr)) continue; // collapsed into an edge later

    const ttl = computeTtl(e.expiresAtBlock, e.createdAtBlock, options.blockTiming);
    nodes.set(e.key, {
      id: e.key,
      kind: "entity",
      label: pickLabel(e, typeStr, options.labelKey),
      entityType: typeStr,
      payload: e.payload,
      attributes: e.attributes,
      owner: e.owner,
      creator: e.creator,
      expiresAtBlock: e.expiresAtBlock,
      createdAtBlock: e.createdAtBlock,
      ttlSeconds: ttl.ttlSeconds,
      expiresAt: ttl.expiresAt,
      ttlFraction: ttl.ttlFraction,
      explorerUrl: `${arkivExplorer}/entity/${e.key}`,
    });
    entityNodeKeys.push(e.key);
  }

  // ── 2. external chain nodes (from references the entities already store) ─────
  if (options.external?.enabled !== false) {
    const internalKeys = new Set(byKey.keys());
    // a top-level nativeChainId is folded into external.nativeChainIds
    const externalCfg = {
      ...options.external,
      nativeChainIds: [
        ...(options.external?.nativeChainIds ?? []),
        ...(options.nativeChainId != null ? [options.nativeChainId] : []),
      ],
    };
    for (const key of entityNodeKeys) {
      const e = byKey.get(key);
      if (e) addExternalForEntity(e, key, externalCfg, ensureNode, addEdge, internalKeys);
    }
  }

  // ── 3. link rules ───────────────────────────────────────────────────────────
  for (const rule of links) applyRule(rule);

  // ── 4. degree ───────────────────────────────────────────────────────────────
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes.values()) n.degree = degree.get(n.id) ?? 0;

  return { nodes: [...nodes.values()], edges };

  // ── rule application (closure over the accumulators above) ──────────────────
  function applyRule(rule: LinkRule): void {
    switch (rule.type) {
      case "owner": {
        for (const key of entityNodeKeys) {
          const e = byKey.get(key)!;
          const addr = rule.byCreator ? e.creator : e.owner;
          if (!addr) continue;
          const id = `wallet:${addr}`;
          ensureNode({ id, kind: "wallet", label: walletLabel(addr), owner: addr });
          addEdge({
            id: `${key}->${id}:owner`,
            source: key,
            target: id,
            kind: "owner",
            label: labelForRule(rule),
            directed: true,
          });
        }
        return;
      }
      case "tag": {
        for (const key of entityNodeKeys) {
          const e = byKey.get(key)!;
          for (const v of attrValues(e, rule.attribute)) {
            const id = `tag:${rule.attribute}:${v}`;
            ensureNode({ id, kind: "tag", label: String(v) });
            addEdge({
              id: `${key}->${id}`,
              source: key,
              target: id,
              kind: "tag",
              label: labelForRule(rule),
              attribute: rule.attribute,
            });
          }
        }
        return;
      }
      case "reference": {
        // reference-by-stable-id: index entity keys by the target attribute value,
        // filtered to targetType (so ids reused across types don't collide) and
        // first-wins (duplicate ids resolve deterministically, not last-writer).
        let valueIndex: Map<string, string> | undefined;
        if (rule.targetAttribute) {
          valueIndex = new Map();
          for (const k of entityNodeKeys) {
            const cand = byKey.get(k)!;
            if (rule.targetType && String(cand.attrMap.get(typeAttr) ?? "") !== rule.targetType) continue;
            const tv = cand.attrMap.get(rule.targetAttribute);
            if (tv != null && !valueIndex.has(String(tv))) valueIndex.set(String(tv), k);
          }
        }
        for (const key of entityNodeKeys) {
          const e = byKey.get(key)!;
          if (rule.sourceType && String(e.attrMap.get(typeAttr) ?? "") !== rule.sourceType) continue;
          const refVal = e.attrMap.get(rule.attribute);
          if (refVal == null) continue;
          const rv = String(refVal);
          // resolve the target node id
          let tk: string | undefined = valueIndex ? valueIndex.get(rv) : rv;
          if (!tk) {
            // unresolved reference-by-id → ghost node so the link isn't silently dropped
            if (!createPlaceholders) continue;
            tk = `unresolved:${rule.attribute}:${rv}`;
            ensureNode({ id: tk, kind: "entity", label: rv, entityType: rule.targetType, unresolved: true });
          } else {
            const targetNode = nodes.get(tk);
            if (!targetNode) {
              if (!createPlaceholders) continue;
              ensureNode({
                id: tk,
                kind: "entity",
                label: shortKey(tk),
                entityType: rule.targetType,
                unresolved: true,
                explorerUrl: `${arkivExplorer}/entity/${tk}`,
              });
            } else if (rule.targetType && targetNode.entityType && targetNode.entityType !== rule.targetType) {
              continue;
            }
          }
          if (tk === key) continue; // skip self-loops
          addEdge({
            id: `${key}->${tk}:${rule.attribute}`,
            source: key,
            target: tk,
            kind: "reference",
            label: labelForRule(rule),
            attribute: rule.attribute,
            directed: rule.directed !== false,
          });
        }
        return;
      }
      case "shared": {
        const ignore = new Set((rule.ignoreValues ?? ["", "none", "null"]).map(String));
        const groups = new Map<string, string[]>();
        for (const key of entityNodeKeys) {
          const v = byKey.get(key)!.attrMap.get(rule.attribute);
          if (v == null) continue;
          const gk = String(v);
          if (ignore.has(gk)) continue;
          const arr = groups.get(gk);
          if (arr) arr.push(key);
          else groups.set(gk, [key]);
        }
        const maxGroup = rule.maxGroup ?? 12;
        const viaHub = rule.viaHub !== false; // default: hub (pairwise hairballs on high cardinality)
        for (const [value, members] of groups) {
          if (members.length < 2) continue;
          if (viaHub) {
            const hubId = `shared:${rule.attribute}:${value}`;
            ensureNode({ id: hubId, kind: "tag", label: `${rule.attribute}=${value}` });
            for (const m of members) {
              addEdge({
                id: `${m}->${hubId}`,
                source: m,
                target: hubId,
                kind: "shared",
                label: labelForRule(rule),
                attribute: rule.attribute,
              });
            }
          } else {
            if (members.length > maxGroup) continue; // avoid O(n^2) hairball
            for (let i = 0; i < members.length; i++) {
              for (let j = i + 1; j < members.length; j++) {
                const a = members[i]!;
                const b = members[j]!;
                addEdge({
                  id: `shared:${rule.attribute}:${value}:${a}|${b}`,
                  source: a,
                  target: b,
                  kind: "shared",
                  label: labelForRule(rule),
                  attribute: rule.attribute,
                });
              }
            }
          }
        }
        return;
      }
      case "join": {
        // optional indexes for join-by-stable-id: filtered by endpoint type (so
        // ids reused across types don't collide) and first-wins (deterministic).
        const buildIndex = (matchAttr: string, ofType?: string): Map<string, string> => {
          const idx = new Map<string, string>();
          for (const k of entityNodeKeys) {
            const cand = byKey.get(k)!;
            if (ofType && String(cand.attrMap.get(typeAttr) ?? "") !== ofType) continue;
            const mv = cand.attrMap.get(matchAttr);
            if (mv != null && !idx.has(String(mv))) idx.set(String(mv), k);
          }
          return idx;
        };
        const srcIndex = rule.sourceMatchAttr ? buildIndex(rule.sourceMatchAttr, rule.sourceType) : undefined;
        const dstIndex = rule.targetMatchAttr ? buildIndex(rule.targetMatchAttr, rule.targetType) : undefined;

        for (const e of norms) {
          if (String(e.attrMap.get(typeAttr) ?? "") !== rule.entityType) continue;
          const src = e.attrMap.get(rule.sourceAttr);
          const dst = e.attrMap.get(rule.targetAttr);
          if (src == null || dst == null) continue;
          const sId = srcIndex ? srcIndex.get(String(src)) ?? `unresolved:${rule.sourceAttr}:${src}` : String(src);
          const dId = dstIndex ? dstIndex.get(String(dst)) ?? `unresolved:${rule.targetAttr}:${dst}` : String(dst);
          for (const id of [sId, dId]) {
            if (!nodes.has(id)) {
              if (!createPlaceholders) break;
              const isUnresolved = id.startsWith("unresolved:");
              ensureNode({
                id,
                kind: "entity",
                label: isUnresolved ? id.split(":").slice(2).join(":") || id : shortKey(id),
                unresolved: true,
                explorerUrl: isUnresolved ? undefined : `${arkivExplorer}/entity/${id}`,
              });
            }
          }
          if (!nodes.has(sId) || !nodes.has(dId)) continue;
          if (sId === dId) continue; // skip self-loops (e.g. a malformed self-follow)
          addEdge({
            id: `join:${rule.entityType}:${e.key}`,
            source: sId,
            target: dId,
            kind: "join",
            label: labelForRule(rule),
            directed: rule.directed !== false,
            viaEntityKey: e.key,
          });
        }
        return;
      }
    }
  }
}

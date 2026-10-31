import type { ArkivAttribute, ArkivEntityLike } from "./types.js";

/** Internal, fully-resolved view of an entity used by the graph builder. */
export interface NormEntity {
  key: string;
  owner?: string;
  creator?: string;
  attributes: ArkivAttribute[];
  /** first value per attribute key (the common case). */
  attrMap: Map<string, string | number>;
  payload: Record<string, unknown>;
  expiresAtBlock?: number;
  createdAtBlock?: number;
  raw: ArkivEntityLike;
}

function toNum(v: unknown): number | undefined {
  if (typeof v !== "bigint" && typeof v !== "number" && typeof v !== "string") return undefined;
  try {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Decode a payload that may be bytes, a byte-map ({0:123,...}), a string, or an object. */
function decodePayload(entity: ArkivEntityLike): Record<string, unknown> {
  // Compatibility parser for legacy plain inputs; SDK 1.0 uses typed columns.
  if (typeof entity.toJson === "function") {
    try {
      const j = entity.toJson();
      if (j && typeof j === "object") return j as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  const p = entity.payload;
  if (p == null) return {};
  if (typeof p === "object" && !Array.isArray(p) && !isByteMap(p)) {
    return p as Record<string, unknown>;
  }
  // bytes → string → JSON
  const text = bytesToString(p);
  if (text) {
    try {
      const j = JSON.parse(text);
      if (j && typeof j === "object") return j as Record<string, unknown>;
    } catch {
      return { _raw: text };
    }
  }
  return {};
}

function isByteMap(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const keys = Object.keys(o as object);
  return keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
}

function bytesToString(p: unknown): string | undefined {
  try {
    let bytes: number[] | Uint8Array | undefined;
    if (p instanceof Uint8Array) bytes = p;
    else if (Array.isArray(p)) bytes = p as number[];
    else if (isByteMap(p)) {
      const o = p as Record<string, number>;
      bytes = Object.keys(o)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k] as number);
    } else if (typeof p === "string") return p;
    if (!bytes) return undefined;
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(Uint8Array.from(bytes));
    // Node fallback
    return Buffer.from(bytes as number[]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function normalizeEntity(entity: ArkivEntityLike): NormEntity {
  const sdkRow = typeof entity.$key === "string";
  const selected = sdkRow ? entity.$attributes ?? Object.fromEntries(
    Object.entries(entity).filter(([name, v]) => !name.startsWith("$") && v && typeof v === "object" && "type" in v && "value" in v),
  ) : entity.attributes;
  const attributes: ArkivAttribute[] = Array.isArray(selected)
    ? selected
    : Object.entries(selected && typeof selected === "object" ? selected : {}).flatMap(([key, typed]) => {
        if (!typed || typeof typed !== "object" || !("value" in typed)) return [];
        return [{ key, value: typeof typed.value === "number" ? typed.value : String(typed.value) }];
      });
  const attrMap = new Map<string, string | number>();
  for (const a of attributes) {
    if (a && a.key != null && !attrMap.has(a.key)) attrMap.set(a.key, a.value);
  }
  const owner = sdkRow ? entity.$owner : entity.owner;
  const creator = sdkRow ? entity.$creator : entity.creator;
  const key = sdkRow ? entity.$key : entity.key;
  return {
    key: typeof key === "string" ? key : "",
    owner: typeof owner === "string" ? owner.toLowerCase() : undefined,
    creator: typeof creator === "string" ? creator.toLowerCase() : undefined,
    attributes,
    attrMap,
    payload: sdkRow ? {} : decodePayload(entity),
    expiresAtBlock: toNum(sdkRow ? entity.$expiresAt : entity.expiresAt ?? entity.expiresAtBlock),
    createdAtBlock: toNum(sdkRow ? entity.$createdAt : entity.createdAt ?? entity.createdAtBlock),
    raw: entity,
  };
}

/** All values for a repeated attribute key (e.g. multiple `tag`s). */
export function attrValues(e: NormEntity, key: string): (string | number)[] {
  return e.attributes.filter((a) => a.key === key).map((a) => a.value);
}

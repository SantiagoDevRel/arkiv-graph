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

function toNum(v: bigint | number | string | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  try {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Decode a payload that may be bytes, a byte-map ({0:123,...}), a string, or an object. */
function decodePayload(entity: ArkivEntityLike): Record<string, unknown> {
  // Prefer the SDK's parser.
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
  const attributes = Array.isArray(entity.attributes) ? entity.attributes : [];
  const attrMap = new Map<string, string | number>();
  for (const a of attributes) {
    if (a && a.key != null && !attrMap.has(a.key)) attrMap.set(a.key, a.value);
  }
  return {
    key: entity.key,
    owner: entity.owner?.toLowerCase(),
    creator: entity.creator?.toLowerCase(),
    attributes,
    attrMap,
    payload: decodePayload(entity),
    expiresAtBlock: toNum(entity.expiresAtBlock),
    createdAtBlock: toNum(entity.createdAtBlock),
    raw: entity,
  };
}

/** All values for a repeated attribute key (e.g. multiple `tag`s). */
export function attrValues(e: NormEntity, key: string): (string | number)[] {
  return e.attributes.filter((a) => a.key === key).map((a) => a.value);
}

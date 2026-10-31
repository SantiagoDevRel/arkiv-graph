import { describe, expect, it } from 'vitest';
import { str, u256, bool, key as entityKey, bytes } from '@arkiv-network/sdk/schema';
import { buildGraph, buildTables, fetchArkivGraph, type LinkRule } from '../index.js';

const hex = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const;
const owner = `0x${'a'.repeat(40)}`;
const links: LinkRule[] = [
  { type: 'join', entityType: 'follow', sourceAttr: 'from_user', targetAttr: 'to_user', sourceMatchAttr: 'handle', targetMatchAttr: 'handle', sourceType: 'user', targetType: 'user', label: 'follows' },
  { type: 'reference', attribute: 'entity_ref', label: 'references' },
];
describe('Rabdi SDK 1.0 graph/table contract', () => {
  it('accepts $attributes and flat schema rows without rounding values', () => {
    const entities = [
      { $key: hex(1), $owner: owner, $createdAt: 10n, $expiresAt: 100n, $attributes: { entityType: str('user'), handle: str('alice'), name: str('Alice'), balance: u256(123456789012345678901234n), enabled: bool(true), document: bytes('0x0102') } },
      { $key: hex(2), entityType: str('user'), handle: str('bob'), name: str('Bob') },
      ...[3, 4].map(n => ({ $key: hex(n), $attributes: { entityType: str('follow'), from_user: str('alice'), to_user: str('bob') } })),
      { $key: hex(5), $attributes: { entityType: str('follow'), from_user: str('alice'), to_user: str('expired') } },
      { $key: hex(6), $attributes: { entityType: str('post'), entity_ref: entityKey(hex(99)) } },
    ];
    const graph = buildGraph(entities, { links, blockTiming: { currentBlock: 50n, currentBlockTime: 1000, blockDuration: 2 } });
    expect(graph.nodes.find(n => n.id === hex(1))).toMatchObject({ label: 'Alice', expiresAt: 1100 });
    const duplicates = graph.edges.filter(e => e.label === 'follows' && e.target === hex(2));
    expect(duplicates).toHaveLength(2);
    expect(duplicates.every(e => e.source === hex(1) && e.directed)).toBe(true);
    expect(graph.nodes.filter(n => n.unresolved)).toHaveLength(2);
    const tables = buildTables(graph, entities, { links });
    expect(tables.tables.find(t => t.type === 'follow')?.count).toBe(3);
    expect(tables.relationships.find(r => r.label === 'follows')?.count).toBe(3);
    const alice = tables.tables.find(t => t.type === 'user')!.rows.find(r => r.id === hex(1))!;
    expect(alice.cells['attr:balance']).toBe('123456789012345678901234');
    expect(alice.cells['attr:enabled']).toBe('true');
    expect((alice.cells['rel:follows'] as { direction: string }[]).every(r => r.direction === 'out')).toBe(true);
    expect(tables.warnings.join(' ')).toContain('expired or out of scope');
  });
  it('explains missing access keys before making an RPC request', async () => {
    await expect(fetchArkivGraph({ ownedBy: owner })).rejects.toThrow('access');
  });
  it('does not confuse named SDK columns with legacy metadata', () => {
    const row = { $key: hex(7), $owner: owner, owner: str('profile owner'), bytes: str('a named column'), attributes: str('another named column'), entityType: str('user'), handle: str('carol') };
    const graph = buildGraph([row]);
    expect(graph.nodes[0]).toMatchObject({ owner, label: 'carol', bytes: {} });
    const tables = buildTables(graph, [row]);
    expect(tables.tables[0].rows[0].cells['attr:owner']).toBe('profile owner');
    expect(tables.tables[0].rows[0].cells['attr:bytes']).toBe('a named column');
    expect(tables.tables[0].rows[0].cells['attr:attributes']).toBe('another named column');
  });
});

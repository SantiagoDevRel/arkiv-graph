import {afterEach, beforeEach, expect, test, vi} from 'vitest';

const boundary = vi.hoisted(() => ({query: vi.fn(), client: vi.fn()}));
vi.mock('arkiv-graph', () => ({
  fetchArkivGraph: boundary.query,
  buildGraph: () => ({nodes: [], links: []}),
  buildTables: () => ({}),
}));
vi.mock('@/lib/arkiv', () => ({
  EXPLORER: 'https://rabdi.explorer.arkiv.network', NATIVE_CHAIN_ID: 7794095,
  PROJECT: 'social', publicClient: boundary.client, SOCIAL_LINKS: [],
  trustedAddress: () => `0x${'11'.repeat(20)}`,
}));
vi.mock('@/lib/config', () => ({TYPE_ATTRIBUTE: 'type'}));
import {GET} from './route';

const same = {host: 'sample.example', origin: 'https://sample.example', 'content-type': 'application/json'};
const denied = [
  ['foreign JSON origin', {...same, origin: 'https://foreign.example'}],
  ['foreign plain-text origin', {...same, origin: 'https://foreign.example', 'content-type': 'text/plain'}],
  ['cross-site without origin', {host: same.host, 'sec-fetch-site': 'cross-site'}],
  ['cross-site despite matching origin', {...same, 'sec-fetch-site': 'cross-site'}],
  ['cross-site metadata with whitespace and case', {...same, 'sec-fetch-site': ' Cross-Site '}],
  ['malformed origin', {...same, origin: 'invalid-origin'}],
  ['opaque origin', {...same, origin: 'null'}],
  ['empty origin', {...same, origin: ''}],
  ['different origin port', {...same, origin: 'https://sample.example:444'}],
  ['foreign origin with URL-host fallback', {origin: 'https://foreign.example'}],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  boundary.client.mockReturnValue({});
  boundary.query.mockImplementation(async () => {
    await fetch('https://upstream.example/fixture');
    return {entities: [], truncated: false, blockTiming: null};
  });
});
afterEach(() => vi.unstubAllGlobals());

for (const [name, headers] of denied) test(`graph GET rejects ${name} before spending a key`, async () => {
  const response = await GET(new Request('https://sample.example/api/graph', {headers}));
  const calls = vi.mocked(fetch).mock.calls.length;
  console.log(JSON.stringify({originCase: name, expected: 403, status: response.status, upstreamCalls: calls}));
  expect(calls, 'rejected request must not reach upstream').toBe(0);
  expect(boundary.client).not.toHaveBeenCalled(); expect(boundary.query).not.toHaveBeenCalled();
  expect(response.status).toBe(403);
});

for (const [name, headers] of [
  ['same-origin JSON', same],
  ['GET without content type', {host: same.host, origin: same.origin}],
  ['GET with odd content type', {...same, 'content-type': 'application/jsonp'}],
  ['GET with plain content type', {...same, 'content-type': 'text/plain'}],
  ['origin absent', {host: same.host}],
  ['matching non-default port', {...same, host: 'sample.example:444', origin: 'https://sample.example:444'}],
  ['JSON with charset', {...same, 'content-type': 'application/json; charset=utf-8'}],
] as const) test(`graph GET allows ${name}`, async () => {
  const host = headers.host;
  const response = await GET(new Request(`https://${host}/api/graph`, {headers}));
  expect(response.status).toBe(200); expect(fetch).toHaveBeenCalledTimes(1); expect(boundary.query).toHaveBeenCalledTimes(1);
});

import { expect, it } from 'vitest';
import { buildGraph } from '../buildGraph.js';
import { normalizeEntity } from '../normalize.js';
const retired = 'pay' + 'load';
it('preserves legacy input, output identity and label behavior', () => {
  const data = { name: 'Alice' };
  const oldInput = { key: 'a', [retired]: data };
  const newInput = { key: 'a', bytes: data };
  const oldGraph = buildGraph([oldInput]);
  const newGraph = buildGraph([newInput]);
  expect(oldGraph).toEqual(newGraph);
  expect(newGraph.nodes[0].bytes).toBe(newGraph.nodes[0][retired as 'bytes']);
  expect(newGraph.nodes[0].bytes).toBe(data);
  expect(newGraph.nodes[0].label).toBe('Alice');
  expect(normalizeEntity(oldInput).bytes).toEqual(data);
});
it('preserves old binary, string, object and toJson inputs', () => {
  for (const data of [{name:'Alice'}, JSON.stringify({name:'Alice'}), new TextEncoder().encode(JSON.stringify({name:'Alice'})), {0:123,1:125}]) {
    expect(buildGraph([{key:'a', [retired]:data}])).toEqual(buildGraph([{key:'a', bytes:data}]));
  }
  expect(buildGraph([{key:'a',toJson:()=>({name:'Alice'})}]).nodes[0].label).toBe('Alice');
});
it('prefers the new field and keeps named SDK columns distinct', () => {
  expect(buildGraph([{key:'a', bytes:{name:'new'}, [retired]:{name:'old'}}]).nodes[0].label).toBe('new');
  const row = { $key:'a', bytes:{type:'bytes',value:'0x0102'}, [retired]:{type:'str',value:'column'}, name:{type:'str',value:'Alice'} };
  expect(buildGraph([row]).nodes[0]).toMatchObject({label:'Alice',bytes:{}});
});

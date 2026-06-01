import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, serializePark, parsePark } from '../src/store.js';

function memoryAdapter() {
  const map = new Map();
  return {
    get: k => (map.has(k) ? map.get(k) : null),
    set: (k, v) => map.set(k, v),
    remove: k => map.delete(k),
    keys: () => [...map.keys()]
  };
}

test('park speichern und laden', () => {
  const store = createStore(memoryAdapter());
  const id = store.savePark({ name: 'Park A', input: { term: 10 } });
  const loaded = store.loadPark(id);
  assert.equal(loaded.name, 'Park A');
  assert.equal(loaded.input.term, 10);
});

test('parkliste enthaelt gespeicherte parks', () => {
  const store = createStore(memoryAdapter());
  store.savePark({ name: 'A', input: {} });
  store.savePark({ name: 'B', input: {} });
  assert.equal(store.listParks().length, 2);
});

test('serialize und parse sind invers', () => {
  const park = { name: 'X', input: { term: 7 }, ist: {} };
  assert.deepEqual(parsePark(serializePark(park)), park);
});

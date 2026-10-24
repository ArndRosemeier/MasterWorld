import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegionMap, keyAt, sizeOf, parentOf, childrenOf, boundsOf, tilesOf, keyId, type RegionKey } from '../src/world/regions';

const area = (ks: RegionKey[]) => ks.reduce((a, k) => a + sizeOf(k.level) ** 2, 0);

test('regions: sizes double from 250 m, keys are aligned', () => {
  assert.deepEqual([0, 1, 2, 3].map(sizeOf), [250, 500, 1000, 2000]);
  assert.deepEqual(keyAt(2, 1500, -10), { level: 2, x: 1, z: -1 });
  assert.deepEqual(parentOf({ level: 0, x: -1, z: 3 }), { level: 1, x: -1, z: 1 });
  for (const c of childrenOf({ level: 2, x: 1, z: -1 })) assert.deepEqual(parentOf(c), { level: 2, x: 1, z: -1 });
  assert.deepEqual(boundsOf({ level: 1, x: -1, z: 0 }), [-500, 0, 0, 500]);
  assert.equal(tilesOf({ level: 3, x: 0, z: 0 }).length, 64);
});

test('regions: a free square opens whole', () => {
  const m = new RegionMap<string>();
  assert.deepEqual(m.open({ level: 2, x: 0, z: 0 }, 'town'), [{ level: 2, x: 0, z: 0 }]);
  assert.equal(m.at(999, 999)?.data, 'town');
  assert.equal(m.at(1000, 0), undefined);
  assert.throws(() => m.open({ level: 0, x: 1, z: 1 }, 'x'), /covered/);
});

test('regions: a big square around small open ones fills the holes with the largest squares, no gaps, no overlaps', () => {
  const m = new RegionMap<string>();
  m.open({ level: 0, x: 0, z: 0 }, 'farm');
  m.open({ level: 1, x: 3, z: 2 }, 'hamlet');
  const parts = m.open({ level: 3, x: 0, z: 0 }, 'forest', (k) => `fill ${keyId(k)}`);
  // 2 km square minus a 250 m and a 500 m square.
  assert.equal(area(parts), 2000 ** 2 - 250 ** 2 - 500 ** 2);
  assert.ok(parts.some((k) => k.level === 2), 'the untouched quarters stay 1 km squares');
  // Every point of the 2 km square is covered exactly once.
  for (let x = 10; x < 2000; x += 61) for (let z = 10; z < 2000; z += 67) {
    let hits = 0;
    for (const r of m.all()) { const [a, b, c, d] = boundsOf(r.key); if (x >= a && x < c && z >= b && z < d) hits++; }
    assert.equal(hits, 1, `${x},${z}`);
  }
  assert.equal(m.at(100, 100)?.data, 'farm');
  assert.match(m.at(1900, 1900)?.data ?? '', /^fill /);
});

test('regions: a fully covered square yields no free parts', () => {
  const m = new RegionMap<number>();
  m.open({ level: 4, x: -1, z: -1 }, 1);
  assert.deepEqual(m.freeParts({ level: 2, x: -1, z: -1 }), []);
});

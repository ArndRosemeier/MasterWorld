import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, KnownLand, NEAR_WAY, PATCH, SEEN, SIGHT, TOLD } from '../src/game/knownLand';

test('known land: the hero sees the land round them as they go, and only that', () => {
  const k = new KnownLand();
  assert.equal(k.at(0, 0), 0);
  assert.ok(k.see(0, 0));
  assert.equal(k.at(0, 0), SEEN);
  assert.equal(k.at(SIGHT - CELL, 0), SEEN);
  assert.equal(k.at(SIGHT + CELL * 2, 0), 0);
  // Seeing the same land again adds nothing.
  const v = k.version;
  assert.equal(k.see(0, 0), false);
  assert.equal(k.version, v);
  // Walking on fills in ahead.
  k.see(400, 0);
  assert.equal(k.at(500, 0), SEEN);
  assert.equal(k.at(0, 600), 0);
});

test('known land: a teller sketches a patch round the mark and the way there, once', () => {
  const k = new KnownLand();
  k.see(0, 0);
  assert.ok(k.tell('barrow-1', [0, 0], [1000, 0]));
  assert.equal(k.at(1000, 0), TOLD);
  assert.equal(k.at(1000, PATCH - CELL), TOLD);
  assert.equal(k.at(600, 0), TOLD, 'the way there');
  assert.equal(k.at(600, 200), 0, 'not beside the way');
  assert.equal(k.at(0, 0), SEEN, 'telling does not lower what was seen');
  assert.deepEqual(k.waysOf(new Set(['barrow-1'])).map((w) => w.to), [[1000, 0]]);
  assert.deepEqual(k.waysOf(new Set()), []);
  assert.equal(k.tell('barrow-1', [0, 0], [1000, 0]), false);
  // A place close by gets its patch but no way.
  k.tell('cellar-1', [0, 0], [NEAR_WAY / 2, 0]);
  assert.equal(k.waysOf(new Set(['cellar-1'])).length, 0);
  // Seeing told land makes it seen.
  k.see(1000, 0);
  assert.equal(k.at(1000, 0), SEEN);
});

test('known land: saved and loaded as it was', () => {
  const k = new KnownLand();
  k.see(-300, 250);
  k.tell('hold', [-300, 250], [900, -1400]);
  const back = new KnownLand(JSON.parse(JSON.stringify(k.landSave())));
  assert.equal(back.cellCount, k.cellCount);
  assert.deepEqual(back.bounds(), k.bounds());
  for (const [x, z] of [[-300, 250], [900, -1400], [300, -575], [-2000, 0]] as const) assert.equal(back.at(x, z), k.at(x, z));
  assert.ok(back.told('hold'));
  assert.equal(back.waysOf(new Set(['hold'])).length, 1);
});

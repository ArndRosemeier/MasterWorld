import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { DrawnGround, drawnSource } from '../src/world/drawnGround';
import { classic } from '../src/setting/classic/index';
import { feetOn } from '../tools/ground/creatureFeet';
import { SMALL } from './small';

/** Share of its size a foot may sink into the drawn ground (the pass lifts the body by the deepest foot, so none should). */
const SINK = 0.02;

test('creatures\' feet: a library animal of any size, on the drawn ground of a cliff coast and a brook valley, sinks no foot', () => {
  const t = new Terrain(parseSeed('masterworld'), classic, SMALL), g = new DrawnGround(drawnSource(t));
  const ground = (x: number, z: number) => g.footing(x, z);
  for (const size of [1, 14]) {
    let worst = 0;
    for (const [x0, z0] of [[-31872, 30848], [-24576, 34560]]) for (let k = 0; k < 5; k++) {
      const x = x0 + 20 + ((k * 37.31) % 340), z = z0 + 20 + ((k * 61.7) % 340);
      worst = Math.max(worst, feetOn(ground, x, z, k * 0.7, size, k).sunk / size);
    }
    assert.ok(worst <= SINK, `size ${size}: a foot sank ${(worst * 100).toFixed(1)}% of the animal's size into the drawn ground`);
  }
});

test('creatures\' feet: a giant on a steady slope has every foot within reach of the ground', () => {
  const slope = (x: number, z: number) => 40 + 0.3 * x - 0.15 * z;
  const r = feetOn(slope, 5, 7, 1.1, 14, 3);
  assert.ok(r.sunk <= SINK * 14, `sank ${r.sunk.toFixed(2)} m`);
  assert.ok(r.floating <= 0.1 * 14, `floated ${r.floating.toFixed(2)} m over a slope as steady as a plane`);
});

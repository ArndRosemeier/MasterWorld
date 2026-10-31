import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Skeleton } from '../src/world/skeleton';
import { classic } from '../src/setting/classic/index';

/**
 * The land's big shape has nothing narrower than the ground's mesh shows (a vertex every 2 m near the hero): a slot
 * between two vertices is not drawn, and the hero, walking the land's own height, sinks into the drawn ground
 * (Arnd, seed poev7x by 37691, -1576: up to the chest in a sea cliff's gully). Each 2 m cell's middle against its
 * corners' mean.
 */
function worstCell(sk: Skeleton, cx: number, cz: number, r: number): { dev: number; x: number; z: number } {
  let worst = { dev: 0, x: cx, z: cz };
  for (let z = cz - r; z < cz + r; z += 2) for (let x = cx - r; x < cx + r; x += 2) {
    const m = sk.elevation(x + 1, z + 1);
    const dev = m - (sk.elevation(x, z) + sk.elevation(x + 2, z) + sk.elevation(x, z + 2) + sk.elevation(x + 2, z + 2)) / 4;
    if (Math.abs(dev) > Math.abs(worst.dev)) worst = { dev, x: x + 1, z: z + 1 };
  }
  return worst;
}

test('drawn ground: a sea cliff\'s gullies are wide enough for the mesh to show (no slot the hero sinks into)', () => {
  const at = (w: { dev: number; x: number; z: number }) => `${w.dev.toFixed(1)} m at ${w.x}, ${w.z}`;
  // Arnd's spot, on the crest of a sea cliff.
  const poev = worstCell(new Skeleton(parseSeed('poev7x'), classic.world), 37691, -1576, 20);
  assert.ok(Math.abs(poev.dev) < 1.5, at(poev));
  // A stretch of cliff coast with gullies (up to 8.5 m off before they were widened).
  const coast = worstCell(new Skeleton(parseSeed('brazok'), classic.world), -200, 420, 80);
  assert.ok(Math.abs(coast.dev) < 1.5, at(coast));
});

test('drawn ground: a mesa pass\'s ramp runs out on the valley floor, without a step at its foot', () => {
  // Where the valley's quick out cut it off, it ended in a step some 17 m high here (62 m in from the coast).
  const sk = new Skeleton(parseSeed('poev7x'), classic.world);
  let prev = sk.elevation(37445, -1869), most = 0;
  for (let x = 37445.25; x <= 37455; x += 0.25) { const h = sk.elevation(x, -1869); most = Math.max(most, Math.abs(h - prev)); prev = h; }
  assert.ok(most < 1, `${most.toFixed(1)} m in a quarter metre`);
});

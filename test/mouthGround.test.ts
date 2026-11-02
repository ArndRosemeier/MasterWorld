import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawnGround } from '../src/world/drawnGround';
import { caveMouth, inCliff, mouthOffGround } from '../src/world/dungeon/caveMouth';
import { groundIn } from '../src/world/dungeon/site';

/**
 * A cave's crag is built on the ground as drawn (D63; Arnd 2026-11-02, seed v5jduk: a grass lip hung over a rock face where the
 * mouth stood in a sheer wall): the land's own height has a face the 2 m mesh steps over, so a crag on the land's height hung in the
 * air over the drawn ground or sank into it (up to 9 m and 7 m at that spot).
 */
test('cave mouth in a sheer face: built on the drawn ground it neither hangs over it nor sinks into it', () => {
  // Level ground, then a face 34 m high, rising over 0.9 m, at a slant the 2 m grid never matches; a little relief on the top.
  const exact = (x: number, z: number) => 34 * Math.min(1, Math.max(0, (-5.6 - z - 0.35 * x) / 0.9)) + Math.sin(x * 0.4) * 0.2;
  const drawn = new DrawnGround({ height: exact, version: 1, segs: () => 64 });
  const site = { x: 0, z: 0, yaw: 0 };
  const onDrawn = (x: number, z: number) => drawn.footing(x, z);
  const miss = (built: (x: number, z: number) => number) => {
    const base = built(site.x, site.z), g = groundIn(site, built, base);
    assert.ok(inCliff(g), 'a cliff');
    return mouthOffGround(caveMouth(7, g, true), site, base, built, onDrawn);
  };
  const off = miss(exact), on = miss(onDrawn);
  assert.ok(off.hover + off.buried > 20, `on the land's own height it is off the drawn ground (hover ${off.hover.toFixed(1)}, buried ${off.buried.toFixed(1)} m²)`);
  // (Not exactly: the crag's field is sampled every half metre, which a face this sheer is finer than.)
  assert.ok(on.hover < 1 && on.buried + on.hover < (off.hover + off.buried) / 5, `on the drawn ground it is on it (hover ${on.hover.toFixed(1)}, buried ${on.buried.toFixed(1)} m², against ${off.hover.toFixed(1)} and ${off.buried.toFixed(1)})`);
});

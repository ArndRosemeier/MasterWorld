import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { CaveSpace, caveField } from '../src/world/dungeon/caveRock';
import { caveFeatures, keepSpots } from '../src/world/dungeon/caveFeatures';
import { caveMouth, throatWalk } from '../src/world/dungeon/caveMouth';
import { THROAT_OPENING, caveThroat } from '../src/world/dungeon/caveThroat';
import { inWalkRaster } from '../src/world/dungeon/rockMesh';
import { onLand } from '../src/world/dungeon/site';
import { inOpening } from '../src/game/portal';
import { testDecision, testHouse } from '../src/world/dungeon/variety';

const cave = (n: number) => outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);

test('cave throat: most caves lead out of their entrance room into free rock, behind the way out', () => {
  let found = 0;
  for (let n = 1; n <= 8; n++) {
    const c = cave(n), t = caveThroat(c);
    if (!t) continue;
    found++;
    // A metre into the rock behind the wall the way out stands against, facing into the room, on its floor.
    const back = Math.hypot(t.x - c.hatch.x, t.z - c.hatch.z);
    assert.ok(Math.abs(back - (c.form.space.inset + 1)) < 1e-9 && t.y === c.hatch.y && t.yaw === c.hatch.yaw, `cave ${n}`);
    const [ix, iz] = onLand(t, 0, -back);
    assert.ok(Math.hypot(ix - c.hatch.x, iz - c.hatch.z) < 1e-9, `cave ${n}: the room lies ahead of the portal`);
  }
  assert.ok(found >= 6, `${found} of 8 have a throat`);
});

test('cave throat: the cave carves it from the room to past the portal; the mouth walks into it on a level floor', () => {
  const c = cave(2), t = caveThroat(c)!, seed = 2;
  const feat = caveFeatures(c.layout, seed, keepSpots(c)), field = caveField(c.layout, seed, feat, undefined, { ...t, seed: 77 });
  const space = new CaveSpace(c.layout, field, feat);
  // Clear at chest height from the hatch to just past the portal (towards the day), rock further on.
  for (const w of [-2.2, -1, 0, 0.6]) {
    const [x, z] = onLand(t, 0, w);
    assert.ok(space.sdf(x, t.y + 1.1, z) > 0.35, `air at ${w}: ${space.sdf(x, t.y + 1.1, z).toFixed(2)}`);
  }
  const [rx, rz] = onLand(t, 0, 3);
  assert.ok(space.sdf(rx, t.y + 1.1, rz) < 0, 'rock beyond the throat');
  // The arch fits inside the portal's opening, so its edge lies in the rock all round.
  assert.ok(!inOpening(THROAT_OPENING, THROAT_OPENING.halfWidth + 0.01, 1) && inOpening(THROAT_OPENING, 1.4, 1));

  // On the land: the mouth's way in is open up to the portal, its floor there the throat's level one.
  const slope = (x: number, z: number) => -z * 0.25 + Math.sin(x * 0.3) * 0.2;
  const m = caveMouth(77, slope);
  for (let z = 4; z >= m.portal.z - 0.4; z -= 0.25) assert.ok(!inWalkRaster(m.walk, 0, z), `blocked at z ${z}`);
  assert.ok(Math.abs(throatWalk(slope, m.portal, 0, m.portal.z)! - m.portal.floor) < 0.05, 'level at the portal');
  assert.ok(m.portal.floor >= slope(0, m.portal.z), 'never under the ground');
  assert.equal(throatWalk(slope, m.portal, 0, 3), null, 'the land\'s own ground out front');
});

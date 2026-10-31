import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { plateauInView } from '../src/world/start';
import { byFreshWater } from '../src/world/freshWater';
import { orbitPose, steadyHeight, type Orbit } from '../src/app/title/route';
import { SMALL } from './small';

// L5 (D56): the classic setting asks for its start in a mesa valley; every seed's start town stands there.
for (const name of ['masterworld', 'alpha']) {
  test(`start valley (${name}): the start town stands in mesa country by fresh water, plateaus in view, on a valley floor or at the sea`, () => {
    const terrain = new Terrain(parseSeed(name), classic, SMALL);
    const town = firstDecisions(terrain, startPlace(terrain)).find((d) => d.kind === 'town')!;
    const sk = terrain.skeleton;
    assert.ok(town, 'a start town');
    assert.ok(sk.kindShare('mesa', town.x, town.z) >= 0.9, `mesa country ${sk.kindShare('mesa', town.x, town.z).toFixed(2)}`);
    // A sea town where a river's mouth has cut the valley down to the sea (Arnd 2026-10-30): gentle on its landward
    // side. Else on the floor all over the town, not up a wall's apron.
    const h = town.harbour, c = terrain.height(town.x, town.z);
    for (let a = 0; a < 8; a++) {
      const ox = Math.cos((a * Math.PI) / 4), oz = Math.sin((a * Math.PI) / 4), x = town.x + ox * town.radius, z = town.z + oz * town.radius;
      if (!h) assert.ok(sk.mesaRise(x, z) < 5, `rise ${sk.mesaRise(x, z).toFixed(1)} m at the town's edge`);
      else if (ox * h.dx + oz * h.dz < 0.2) {
        const g = Math.abs(terrain.height(town.x + ox * town.radius * 0.8, town.z + oz * town.radius * 0.8) - c) / (town.radius * 0.8);
        assert.ok(g < 0.2, `a slope of ${g.toFixed(2)} inland`);
      }
    }
    if (name === 'masterworld') assert.ok(h, 'the start is a sea town');
    assert.ok(byFreshWater(terrain, town.x, town.z, town.radius, false), 'fresh water');
    assert.ok(plateauInView(sk, town.x, town.z), 'a plateau in view');
  });
}

test('start valley: the title orbit over the start town keeps above the land and climbs no wall in a jump', () => {
  const terrain = new Terrain(parseSeed('masterworld'), classic, SMALL);
  const town = firstDecisions(terrain, startPlace(terrain)).find((d) => d.kind === 'town')!;
  const ground = (x: number, z: number) => terrain.height(x, z);
  for (const near of [0]) {
    const o: Orbit = { centre: [town.x, ground(town.x, town.z), town.z], turn: 1, angle: 0.4, ground };
    // As the title camera flies it, a lap at 5 frames a second (the far orbit: the near one keeps inside the valley).
    let y: number | null = null, last = 0;
    for (let f = 0; f < 260 * 5; f++) {
      const pose = orbitPose(o, f / 5, near);
      y = steadyHeight(o, pose, y, 1 / 5);
      const g = ground(pose.at[0], pose.at[2]);
      assert.ok(y > g + 25, `t=${(f / 5).toFixed(1)} near=${near}: ${y.toFixed(0)} over ${g.toFixed(0)}`);
      // A fifth of a second: at most 5 m up or down (a wall of 150 m is not taken at once).
      if (f) assert.ok(Math.abs(y - last) < 5, `t=${(f / 5).toFixed(1)} near=${near}: ${(y - last).toFixed(2)} m in 0.2 s`);
      last = y;
    }
  }
});

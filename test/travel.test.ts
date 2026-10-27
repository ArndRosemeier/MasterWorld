import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { GROUND_PACE, HORSE, Steed, groundPace } from '../src/game/horse';
import { WALK, type WalkIntent, type WalkWorld } from '../src/game/walker';
import { SMALL } from './small';

// Plan 5.4 (D37): running 5.2 m/s (1 km in about 3 minutes), a horse about 12 m/s, on the roads (C7).
const flat: WalkWorld = { height: () => 2, rockSurface: () => null, waterLevel: () => null };
const gallop: WalkIntent = { forward: 1, strafe: 0, heading: 0, walk: false, up: false, down: false };

test('travel: on foot 1 km takes about 3 minutes; a horse gallops 12 m/s where the ground lets it', () => {
  assert.equal(WALK.run, 5.2);
  assert.ok(Math.abs(1000 / WALK.run / 60 - 3.2) < 0.1, '1 km on foot in about 3 minutes');
  assert.equal(HORSE.run, 12);
  for (const [pace, want] of [[GROUND_PACE.road, 12], [GROUND_PACE.open, 8.4], [GROUND_PACE.woods, 3.6]] as const) {
    const s = new Steed(flat, 0, 1);
    s.ground = () => pace;
    s.ridden = true;
    for (let t = 0; t < 5; t += 1 / 60) s.travel(1 / 60, gallop);
    assert.ok(Math.abs(s.speed - want) < 0.3, `pace ${pace}: ${s.speed.toFixed(1)} m/s, want ${want}`);
  }
});

test('travel: the land says the pace: full on a road and in town, less over open country, least in the woods', () => {
  const seed = parseSeed('masterworld');
  const { terrain } = openWorld(seed, classic, SMALL);
  const pace = groundPace(terrain), town = terrain.towns[0].decision;
  assert.equal(pace(town.x, town.z), GROUND_PACE.road, 'in town');
  // A road out of the town, past its edge.
  const road = terrain.towns[0].plan.streets.find((s) => s.kind === 'road')!;
  const n = road.pts.length / 2 - 1;
  assert.equal(pace(road.pts[n * 2], road.pts[n * 2 + 1]), GROUND_PACE.road, 'on the road out');
  // Off the roads, out on the land: never above open country's pace, never below the woods'.
  let woods = 0, open = 0;
  for (let k = 0; k < 400; k++) {
    const x = town.x + 600 + (k % 20) * 40, z = town.z + 600 + Math.floor(k / 20) * 40;
    if (terrain.roads.fromEdge(x, z) <= 3) continue;
    const p = pace(x, z);
    assert.ok(p <= GROUND_PACE.open + 1e-9 && p >= GROUND_PACE.woods - 1e-9);
    if (p < 0.4) woods++;
    if (p > 0.65) open++;
  }
  assert.ok(woods > 0 && open > 0, `woods ${woods}, open ${open}`);
});

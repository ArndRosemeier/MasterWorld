import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown, type TownBuilding } from '@futuremagic/settlement';
import { houseWalk } from '../src/game/interiorWorld';
import { Walker, type WalkWorld } from '../src/game/walker';
import { heightFit } from '@actors/generator';
import { allowOf } from '../src/render/hero/allow';
import { classic } from '../src/setting/classic/index';
import { raceScale } from '@actors/human';

const houses = [3, 4].flatMap((seed) => planTown({ seed, x: 0, z: 0, radius: 130, height: () => 10 }).buildings).filter((_, i) => i % 3 === 0);

/** Walks a body `tall` from 3 m outside the door in through it; whether it stands inside afterwards. */
function through(b: TownBuilding, tall: number): string | null {
  const plan = planInterior(b), h = houseWalk(b, plan), g = plan.storeys[0];
  const world: WalkWorld = { height: () => b.groundY, rockSurface: (x, y, z) => h.rockSurface(x, y, z), waterLevel: () => null, wall: (x, z, r, y) => h.wallAt(x, z, r, y) ?? false };
  const w = new Walker(world);
  w.height = tall;
  const [sx, sz] = h.frame.toWorld(0, g.b0 - 1.5), [ex, ez] = h.frame.toWorld(0, g.b0 + 1);
  w.place(sx, sz, b.groundY);
  const yaw = Math.atan2(-(ex - sx), -(ez - sz));
  for (let i = 0; i < 240; i++) w.step({ forward: 1, strafe: 0, heading: yaw, walk: true, up: false, down: false }, 1 / 30);
  const [, bb] = h.frame.toRoom(w.pos.x, w.pos.z);
  return bb > g.b0 + 0.5 ? null : `${b.kind} #${b.id}, ${tall} m tall: stopped at b=${(bb - g.b0).toFixed(2)} (door ${plan.doorW * 2} x ${plan.doorH})`;
}

const MAX = classic.hero.maxHeightM!;

for (const tall of [0.95, 1.25, 1.78, 1.95, 2.0, MAX]) {
  test(`door: a body ${tall} m tall walks in at the street door`, () => {
    assert.deepEqual(houses.map((b) => through(b, tall)).filter(Boolean), []);
  });
}

test('door: the tallest hero the setting allows is the 2.1 m the doors, stairs and caves are built for', () => {
  assert.equal(MAX, 2.1);
});

test('door: a look taller than the limit (any people, the height slider at its top) is scaled down to it by Actors', () => {
  // Actors' height law: scale * (1.03 + 0.14 * gender + 1.08 * slider), the scale of the people at its biggest.
  const range = allowOf(classic.hero).height;
  assert.deepEqual(range, { max: MAX });
  for (const race of classic.hero.races) for (const gender of [0, 1]) {
    const h = raceScale({ race, size: 1 } as never) * (1.03 + 0.14 * gender + 1.08);
    assert.ok(h * heightFit(h, range) <= MAX + 1e-9, `${race} gender ${gender}: ${h.toFixed(3)} m`);
  }
  assert.equal(heightFit(1.8, range), 1);
});

test('allow: Actors is told the four peoples and the setting\'s clothing, never robots or skeletons', () => {
  const allow = allowOf(classic.hero);
  assert.deepEqual(allow.races, ['human', 'dwarf', 'halfling', 'elf']);
  assert.deepEqual(allow.clothing, classic.hero.themes);
  assert.ok(!(allow.races as string[]).some((r) => r === 'robot' || r === 'skeleton' || r === 'goblin'));
});

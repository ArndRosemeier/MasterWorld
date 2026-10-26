import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown, type TownBuilding } from '@futuremagic/settlement';
import { houseWalk } from '../src/game/interiorWorld';
import { Walker, type WalkWorld } from '../src/game/walker';

// Heroes run from about 1.25 m (Actors' smallest peoples) to 2.1 m (its tallest).
const houses = [3, 4].flatMap((seed) => planTown({ seed, x: 0, z: 0, radius: 130, height: () => 10 }).buildings).filter((b, i) => b.floors > 1 && (b.kind !== 'house' || i % 2 === 0));

/** Walks a body `tall` up every flight of `b` from its foot and back down; returns what failed. */
function upAndDown(b: TownBuilding, tall: number): string[] {
  const plan = planInterior(b), h = houseWalk(b, plan), fails: string[] = [];
  const world: WalkWorld = { height: () => b.groundY - 0.3, rockSurface: (x, y, z) => h.rockSurface(x, y, z), waterLevel: () => null, wall: (x, z, r, y) => h.wallAt(x, z, r, y) ?? false };
  for (const s of plan.stairs) {
    const w = new Walker(world);
    w.height = tall;
    const foot = h.floorAt(s.a - s.da * 0.4, s.b - s.db * 0.4, s.storey);
    w.place(foot.x, foot.z, foot.y);
    const [x1, z1] = h.frame.toWorld(s.a + s.da, s.b + s.db), [x0, z0] = h.frame.toWorld(s.a, s.b);
    const yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
    // Walk until standing on the storey's floor for a moment (5 s at most).
    const reach = (heading: number, k: number): boolean => {
      let on = 0;
      for (let i = 0; i < 150 && on < 10; i++) {
        w.step({ forward: 1, strafe: 0, heading, walk: true, up: false, down: false }, 1 / 30);
        on = Math.abs(w.pos.y - b.floorY - plan.storeys[k].y) < 0.03 ? on + 1 : 0;
      }
      return on >= 10;
    };
    const at = () => `${b.kind} #${b.id} flight ${s.storey}, ${tall} m tall: stuck ${(w.pos.y - b.floorY).toFixed(2)} m up`;
    if (!reach(yaw, s.storey + 1)) fails.push(`${at()} going up`);
    else if (!reach(yaw + Math.PI, s.storey)) fails.push(`${at()} coming down`);
  }
  return fails;
}

for (const tall of [1.4, 1.78, 2.1]) {
  test(`stairs: a body ${tall} m tall goes up every flight and comes down again`, () => {
    const fails = houses.flatMap((b) => upAndDown(b, tall));
    assert.deepEqual(fails, []);
  });
}

test('stairs: a body pushing into a wall counts how long it has been stuck; walking free it is not', () => {
  const b = houses[0], plan = planInterior(b), h = houseWalk(b, plan);
  const world: WalkWorld = { height: () => b.groundY - 0.3, rockSurface: (x, y, z) => h.rockSurface(x, y, z), waterLevel: () => null, wall: (x, z, r, y) => h.wallAt(x, z, r, y) ?? false };
  const w = new Walker(world), g = plan.storeys[0];
  const p = h.floorAt(0, g.b0 + 1, 0);
  w.place(p.x, p.z, p.y);
  // Facing a side wall (towards +a): a few steps, then the wall.
  const [x1, z1] = h.frame.toWorld(1, 0), [x0, z0] = h.frame.toWorld(0, 0), yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
  for (let i = 0; i < 150; i++) w.step({ forward: 1, strafe: 0, heading: yaw, walk: true, up: false, down: false }, 1 / 30);
  assert.ok(w.stuckFor > 1, `stuck for ${w.stuckFor.toFixed(2)} s`);
  for (let i = 0; i < 10; i++) w.step({ forward: 1, strafe: 0, heading: yaw + Math.PI, walk: true, up: false, down: false }, 1 / 30);
  assert.equal(w.stuckFor, 0);
});

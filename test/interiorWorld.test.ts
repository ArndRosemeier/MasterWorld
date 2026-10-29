import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown } from '@futuremagic/settlement';
import { houseWalk, roomFrame } from '../src/game/interiorWorld';
import { Walker, type WalkWorld } from '../src/game/walker';

const town = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });

test('house walk: the frame goes to the world and back; the doorway is open, the walls and furniture are not', () => {
  for (const b of town.buildings.slice(0, 40)) {
    const plan = planInterior(b), f = roomFrame(b, { x: b.cx, z: b.cz }), w = houseWalk(b, plan);
    const [x, z] = f.toWorld(0.7, -1.2);
    const [a, bb] = f.toRoom(x, z);
    assert.ok(Math.abs(a - 0.7) < 1e-9 && Math.abs(bb + 1.2) < 1e-9);
    const g = plan.storeys[0], y0 = b.floorY + g.y;
    // b runs from the door inwards: one step in from the door is farther from the street door spot.
    const [ix, iz] = f.toWorld(0, g.b0 + 0.7), [ox, oz] = f.toWorld(0, g.b1);
    assert.ok(Math.hypot(ix - b.door[0], iz - b.door[1]) < Math.hypot(ox - b.door[0], oz - b.door[1]), `${b.kind} #${b.id}: the door end`);
    assert.equal(w.wallAt(ix, iz, 0.32, y0), false, `${b.kind} #${b.id}: just inside the door is free`);
    assert.equal(w.wallAt(b.door[0], b.door[1], 0.32, y0), null, 'outside the door: not the building\'s');
    const [sx, sz] = f.toWorld(g.a1 + 0.1, 0);
    assert.equal(w.wallAt(sx, sz, 0.32, y0), true, 'the side wall');
    assert.ok(w.rockSurface(ix, y0 + 1, iz)! > 0 && w.rockSurface(ix, y0 + g.height + 0.1, iz)! < 0, 'under the ceiling');
    for (const fx of plan.fixtures) {
      if (fx.kind === 'hatch' || fx.kind === 'stair' || fx.kind === 'well') continue;
      const [cx, cz] = f.toWorld(fx.a, fx.b);
      assert.equal(w.wallAt(cx, cz, 0.3, b.floorY + plan.storeys[fx.storey].y), true, `${fx.kind} is in the way`);
    }
    // A spot facing +b (into the room) faces away from the door in the world.
    const d = f.dirOf(Math.PI / 2);
    assert.ok(Math.abs(Math.cos(d) - b.vx) < 1e-9 && Math.abs(Math.sin(d) - b.vz) < 1e-9);
  }
});

test('house walk: the walker goes in at the door, up the stairs and stands on the floor above', () => {
  let climbed = 0;
  for (const b of town.buildings.filter((x) => x.floors > 1).slice(0, 12)) {
    const plan = planInterior(b), h = houseWalk(b, plan), s = plan.stairs[0];
    const world: WalkWorld = {
      height: () => b.groundY - 0.3,
      rockSurface: (x, y, z) => h.rockSurface(x, y, z),
      waterLevel: () => null,
      wall: (x, z, r, y) => h.wallAt(x, z, r, y) ?? false,
    };
    const w = new Walker(world);
    // At the stair's foot, facing up it (the walker's forward is (-sin yaw, -cos yaw)).
    const foot = h.floorAt(s.a - s.da * 0.4, s.b - s.db * 0.4, 0);
    w.place(foot.x, foot.z, foot.y);
    const [dx, dz] = (() => { const [x1, z1] = h.frame.toWorld(s.a + s.da, s.b + s.db), [x0, z0] = h.frame.toWorld(s.a, s.b); return [x1 - x0, z1 - z0]; })();
    const yaw = Math.atan2(-dx, -dz);
    // Up until standing on the floor above (a flight further up may start right at its top: not walked on into).
    const up1 = b.floorY + plan.storeys[1].y;
    for (let i = 0; i < 120 && !(h.storey(w.pos.y) === 1 && Math.abs(w.pos.y - up1) < 0.05); i++) w.step({ forward: 1, strafe: 0, heading: yaw, walk: true, up: false, down: false }, 1 / 30);
    assert.equal(h.storey(w.pos.y), 1, `${b.kind} #${b.id}: upstairs (feet ${(w.pos.y - b.floorY).toFixed(2)} m over the floor)`);
    assert.ok(Math.abs(w.pos.y - up1) < 0.05, 'on the floor');
    climbed++;
  }
  assert.ok(climbed > 3);
});

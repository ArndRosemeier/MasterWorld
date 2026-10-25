import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown } from '@futuremagic/settlement';
import { interiorWorld, roomFrame } from '../src/game/interiorWorld';

const town = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });

test('interior world: the room frame goes to the world and back; the door way is open, the walls and furniture are not', () => {
  for (const b of town.buildings.slice(0, 40)) {
    const plan = planInterior(b), f = roomFrame(b, { x: b.cx, z: b.cz }), w = interiorWorld(plan, f, -190);
    const [x, z] = f.toWorld(0.7, -1.2);
    const [a, bb] = f.toRoom(x, z);
    assert.ok(Math.abs(a - 0.7) < 1e-9 && Math.abs(bb + 1.2) < 1e-9);
    // b runs from the door inwards: one step in from the door is farther from the street door spot.
    const [ix, iz] = f.toWorld(0, -plan.hb + 0.7), [ox, oz] = f.toWorld(0, plan.hb);
    assert.ok(Math.hypot(ix - b.door[0], iz - b.door[1]) < Math.hypot(ox - b.door[0], oz - b.door[1]), `${b.kind} #${b.id}: the door end`);
    assert.equal(w.wall!(ix, iz, 0.32), false, `${b.kind} #${b.id}: just inside the door is free`);
    const [sx, sz] = f.toWorld(plan.ha + 0.2, 0);
    assert.equal(w.wall!(sx, sz, 0.32), true, 'the side wall');
    assert.ok(w.rockSurface(ix, -189, iz)! > 0 && w.rockSurface(ix, -190 + plan.height + 0.1, iz)! < 0, 'under the ceiling');
    for (const fx of plan.fixtures) {
      const [cx, cz] = f.toWorld(fx.a, fx.b);
      assert.equal(w.wall!(cx, cz, 0.3), true, `${fx.kind} is in the way`);
    }
    // A spot facing +b (into the room) faces away from the door in the world.
    const d = f.dirOf(Math.PI / 2);
    assert.ok(Math.abs(Math.cos(d) - b.vx) < 1e-9 && Math.abs(Math.sin(d) - b.vz) < 1e-9);
  }
});

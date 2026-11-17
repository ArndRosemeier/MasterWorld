import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruinGround, ruinSolids } from '../src/world/campRuin';
import { hitsSolid, layOutCamp } from '../src/world/sites';
import type { CampDecision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

// D69, Z4 in play: the big camps stand in great ruins that shape the ground they stand on (rule: what the hero walks on is what they see).
/** A goblin war camp in a great ruin 600 m east of the start, on the start's land. */
function warCamp(camp = 'goblin-warcamp', seed = 4242) {
  const w = startWorld({ own: true }), t = w.terrain, x = w.home.x + 600, z = w.home.z;
  const d: CampDecision = { kind: 'camp', id: 'camp:test:0', zone: 'zone:test', camp, x, z, yaw: 0, r: 45, landmark: 'great-ruin', level: 3, posts: [], seed, at: 0 };
  return { t, d };
}

test('camp ruin: the terrain stands the ruin on the land, its terraces level and its stairs ramps, and leaves the land round it alone', () => {
  const { t, d } = warCamp();
  const before = (x: number, z: number) => t.height(x, z);
  const far = [d.x + 200, d.z + 30], was = before(far[0], far[1]);
  t.settleMore([d]);
  const r = t.ruinOf(d.id);
  assert.ok(r, 'a war camp with the great ruin in play stands in one');
  assert.equal(r.plan.picks.holder.id, 'goblins', 'held by the camp\'s own holders');
  // Inside the terraces the ground is the plan's floor; far off it is the land as it was.
  const [x0, z0, x1, z1] = r.box;
  for (let u = x0 + 1; u < x1; u += 7) for (let v = z0 + 1; v < z1; v += 7) {
    const onStair = r.plan.stairs.some((s) => Math.hypot(u - (s.a[0] + s.b[0]) / 2, v - (s.a[1] + s.b[1]) / 2) < Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 2 + s.half);
    if (!onStair) assert.ok(Math.abs(t.height(d.x + u, d.z + v) - (r.y0 + r.plan.levelAt(u, v))) < 1e-6, `floor at ${u}, ${v}`);
  }
  assert.equal(t.height(far[0], far[1]), was);
  // A stair's middle lies between its two ends' heights.
  for (const s of r.plan.stairs) {
    const mu = (s.a[0] + s.b[0]) / 2, mv = (s.a[1] + s.b[1]) / 2, y = ruinGround(r, d.x + mu, d.z + mv, -1e9) - r.y0;
    assert.ok(y >= Math.min(s.y0, s.y1) - 0.01 && y <= Math.max(s.y0, s.y1) + 0.01, `stair ramp ${y} in ${s.y0}..${s.y1}`);
    // The gate stair starts on the land: no lip at its foot.
    if (s.onGround) assert.ok(Math.abs(s.y0 - r.land(s.a[0], s.a[1])) < 0.01, `gate stair's foot ${s.y0} on the land ${r.land(s.a[0], s.a[1])}`);
  }
  assert.ok(r.plan.stairs.some((s) => s.onGround), 'this ruin has its gate stair');
});

test('camp ruin: its towers and walls stand in the way, its gate and halls\' doors let the hero through', () => {
  const { t, d } = warCamp();
  t.settleMore([d]);
  const r = t.ruinOf(d.id)!, solids = ruinSolids(r).map((poly) => ({ poly }));
  const laid = layOutCamp(d, (x, z) => t.height(x, z), r)!;
  assert.ok(laid.mesh.index.length > 3000, 'the ruin is drawn');
  assert.deepEqual(laid.origin, [d.x, r.y0, d.z]);
  for (const tw of r.plan.towers.filter((q) => !q.ways)) {
    const cx = tw.pts.reduce((a, p) => a + p[0], 0) / tw.pts.length, cz = tw.pts.reduce((a, p) => a + p[1], 0) / tw.pts.length;
    assert.ok(hitsSolid(solids, d.x + cx, d.z + cz, 0.4), 'a tower is solid');
  }
  for (const c of r.plan.curtains) {
    if (c.gate === null) continue;
    const gx = c.a[0] + (c.b[0] - c.a[0]) * c.gate, gz = c.a[1] + (c.b[1] - c.a[1]) * c.gate;
    assert.ok(!hitsSolid(solids, d.x + gx, d.z + gz, 0.4), 'the gate is open');
  }
  for (const bl of r.plan.blocks) {
    const [x0, z0, x1, z1] = bl.box;
    assert.ok(!hitsSolid(solids, d.x + (x0 + x1) / 2, d.z + (z0 + z1) / 2, 0.4), `inside a ${bl.kind} is walkable`);
  }
});

test('camp ruin: a gatehouse lets the hero through its passage (halls of the dead in a citadel)', () => {
  const { t, d } = warCamp('dead-halls', 5004);
  t.settleMore([d]);
  const r = t.ruinOf(d.id)!, solids = ruinSolids(r).map((poly) => ({ poly }));
  assert.equal(r.plan.layout, 'citadel');
  const gh = r.plan.towers.filter((q) => q.ways);
  assert.ok(gh.length > 0, 'it has its gatehouse');
  for (const q of gh) {
    const xs = q.pts.map((p) => p[0]), zs = q.pts.map((p) => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    // Front to back along its middle, a body's width clear.
    for (let z = Math.min(...zs) - 1; z <= Math.max(...zs) + 1; z += 0.5) assert.ok(!hitsSolid(solids, d.x + mx, d.z + z, 0.4), `the gatehouse's passage at ${z}`);
    assert.ok(hitsSolid(solids, d.x + Math.min(...xs) + 0.5, d.z + (Math.min(...zs) + Math.max(...zs)) / 2, 0.4), 'its sides stand');
  }
});

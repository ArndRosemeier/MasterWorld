import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic';
import { HOLD_GRACE, HOLD_WARN, HoldWatch, holdDen, type HoldEvent } from '../src/game/hold';
import { Standing } from '../src/game/standing';
import type { Quarry } from '../src/sim/creatures';
import type { Land } from '../src/sim/wild';
import { COURT, FACE, POSTS, holdBare, holdGround, holdSite, inHoldShape } from '../src/world/hold';
import { holdMesh } from '../src/world/holdMesh';
import { onLand } from '../src/world/dungeon/site';

const dwarves = classic.peoples.find((p) => p.id === 'dwarf')!;
const def = dwarves.hold!;
/** Behind the doors' plane. */
const GATEBACK = 2.6;
/** A hillside rising to the north (−z), 0.3 m a metre, all dry. */
const hill = { height: (_x: number, z: number) => 600 - z * 0.3, waterDepth: () => 0 };
const town = { x: 0, z: 0 };
const site = holdSite(hill, town, 'dwarf', def, 7)!;

test('hold: the gate stands on a hillside in its ring, facing down the slope, its court level and the hill rising behind', () => {
  const d = Math.hypot(site.x - town.x, site.z - town.z);
  assert.ok(d >= def.ring[0] - 1 && d <= def.ring[1] + 1, `${d.toFixed(0)} m from town`);
  // Out of the gate is downhill (+z here).
  const [ox, oz] = onLand(site, 0, 10);
  assert.ok(oz - site.z > 9 && Math.abs(ox - site.x) < 1, 'faces down the slope');
  const ground = (u: number, v: number) => { const [x, z] = onLand(site, u, v); return holdGround(site, x, z, hill.height(x, z)); };
  for (const [u, v] of [[0, 1], [-COURT.half + 1, 5], [COURT.half - 1, COURT.depth - 1]]) assert.ok(Math.abs(ground(u, v) - site.level) < 1e-6, `court level at ${u}, ${v}`);
  assert.ok(Math.abs(ground(0, -2.5) - site.level) < 0.05, 'the doorway\'s recess level too');
  assert.ok(ground(0, -FACE.foot - FACE.run - 1) >= site.level + FACE.h * 0.8, 'a rock face behind the gate');
  const [fx, fz] = onLand(site, 0, 200);
  assert.equal(holdGround(site, fx, fz, 3), 3, 'far off the land is its own');
  const [cx, cz] = onLand(site, 3, 8);
  assert.ok(holdBare(site, cx, cz) && !holdBare(site, fx, fz), 'nothing grows in the court');
  assert.deepEqual(holdSite(hill, town, 'dwarf', def, 7), site, 'the same every time');
});

test('hold: the gate is solid but for its doorway\'s recess; the court is open; the mesh is whole', () => {
  assert.ok(inHoldShape(6, -1, 0.35), 'the front');
  assert.ok(!inHoldShape(0, -1.2, 0.35), 'the doorway recess');
  assert.ok(inHoldShape(0, -GATEBACK, 0.35), 'the doors are shut');
  assert.ok(!inHoldShape(0, 10, 0.35) && !inHoldShape(-9, 14, 0.35), 'the court');
  assert.ok(inHoldShape(COURT.half + 0.3, 8, 0.35), 'its walls');
  const m = holdMesh(3);
  assert.ok(m.index.length > 1000 && m.index.length % 3 === 0);
  for (const v of m.normal) assert.ok(Number.isFinite(v));
});

/** The wardens at their posts on level ground; the hero walks in from the town. */
function scene(tier: number) {
  const land: Land = { height: () => site.level, waterDepth: () => 0 };
  const den = holdDen(site, def, land, classic.creatures, 11);
  const standing = new Standing(classic, 'human');
  standing.change('dwarf', tier - standing.value('dwarf'));
  const watch = new HoldWatch(site, def, den, standing, classic.standing);
  const guard = { defence: 20, armour: 1, open: false };
  const events: HoldEvent[] = [];
  const stand = (v: number, secs: number) => {
    const [x, z] = onLand(site, 0, v);
    const q: Quarry = { x, y: site.level, z, noise: 0.4, light: 0, alive: true, guard };
    for (let t = 0; t < secs; t += 0.1) { den.step(0.1, q); events.push(...watch.judge(0.1, q)); }
  };
  return { den, standing, watch, events, stand };
}

test('hold: an outsider is warned, warned again in the court, and attacked if they stay; trespass costs standing', () => {
  const s = scene(0);
  s.stand(COURT.depth + HOLD_WARN + 30, 3);
  assert.equal(s.events.length, 0, 'far off: nothing');
  s.stand(COURT.depth + HOLD_WARN - 5, 3);
  assert.deepEqual(s.events.map((e) => e.kind), ['warn']);
  assert.ok(s.den.peace && s.den.fighting.length === 0, 'a warning, no blows');
  s.stand(COURT.depth - 3, 1);
  assert.deepEqual(s.events.map((e) => e.kind), ['warn', 'last']);
  s.stand(COURT.depth - 3, HOLD_GRACE + 1);
  assert.ok(s.events.some((e) => e.kind === 'attack'), 'they attack');
  assert.ok(!s.den.peace && s.watch.atWar);
  assert.ok(s.standing.value('dwarf') < 0, 'and the dwarves think worse of the hero');
  s.stand(COURT.depth - 3, 4);
  assert.ok(s.den.fighting.length > 0, 'the wardens fight');
});

test('hold: a friend of the hold is hailed and walks in peace; striking a warden ends it', () => {
  const s = scene(20);
  s.stand(COURT.depth + 10, 2);
  s.stand(4, 10);
  assert.deepEqual(s.events.map((e) => e.kind), ['hail']);
  assert.ok(s.den.peace && s.den.fighting.length === 0, 'walking right up to the door in peace');
  // A blow: the peace is over, and the dwarves will not forget it.
  const w = s.den.creatures[0];
  s.den.wound(w, { damage: 5, outcome: 'hit' } as never, { x: w.x, y: w.y, z: w.z + 1 });
  s.stand(4, 0.2);
  assert.ok(s.watch.atWar && !s.den.peace);
  assert.equal(s.standing.value('dwarf'), 20 + classic.standing.struck);
  // Gone a while: the peace comes back, and the wounded warden does not start it again.
  s.stand(COURT.depth + 400, 60);
  assert.ok(s.den.peace && !s.watch.atWar);
  s.standing.change('dwarf', 30);
  s.stand(4, 5);
  assert.ok(s.den.peace && !s.watch.atWar, 'at peace with a friend again');
});

test('hold: the hated are attacked on sight; once the hero is gone the wardens go back to their posts in peace', () => {
  const s = scene(-80);
  s.stand(COURT.depth + HOLD_WARN - 5, 1);
  assert.ok(s.events.some((e) => e.kind === 'attack') && !s.events.some((e) => e.kind === 'warn'), 'no warning');
  s.stand(COURT.depth + 400, 60);
  assert.ok(s.den.peace && !s.watch.atWar, 'peace again');
  s.den.creatures.forEach((c, i) => {
    const [px, pz] = onLand(site, POSTS[i][0], POSTS[i][1]);
    assert.ok(Math.hypot(c.x - px, c.z - pz) < 3, `warden ${i} back at the post`);
  });
});

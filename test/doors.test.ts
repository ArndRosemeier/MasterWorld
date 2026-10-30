import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS, type PlacedLink } from '@futuremagic/dungeon';
import { classic } from '../src/setting/classic/index';
import { CELL, STOREY, outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { Den, radiusOf, type DenEvent, type Quarry } from '../src/sim/creatures';
import { DungeonNav } from '../src/sim/dungeonNav';

const cellars: Cellar[] = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));
const guard = { defence: 20, armour: 1, open: false };

/**
 * A door of `kind` between a passage and a room: the cellar, its space, and points `off` metres to either side of
 * its middle (`room` inside the room, `way` in the passage: a barred door's bar side); `past(p)`: how far p is beyond
 * the door's plane, seen from the passage.
 */
function doorOf(kind: string, off: number) {
  for (const c of cellars) for (const pl of c.layout.links as PlacedLink[]) {
    if (pl.link.kind !== kind || !pl.path.length) continue;
    const space = new DungeonSpace(c.layout), d = pl.doors[1], [dx, dz] = DIRS[d.dir];
    const mx = (d.x + 0.5 + dx * 0.5) * CELL, mz = (d.z + 0.5 + dz * 0.5) * CELL, y = d.level * STOREY;
    // The door's cell is the room's; its side `dir` looks into the passage.
    const room = { x: mx - dx * off, y, z: mz - dz * off }, way = { x: mx + dx * off, y, z: mz + dz * off };
    // Only a flat way in (no stair at the door).
    if (space.floorAt(room.x, room.z, y + 0.5) !== y || space.floorAt(way.x, way.z, y + 0.5) !== y) continue;
    const past = (p: { x: number; z: number }) => -((p.x - mx) * dx + (p.z - mz) * dz);
    return { c, space, pl, room, way, past };
  }
  throw new Error(`no ${kind} door`);
}

const quarry = (p: { x: number; y: number; z: number }): Quarry => ({ ...p, noise: 1, light: 6, alive: true, guard });
/** One `creature` of a den at `at`, set on the hero (a blow that missed). */
function foeAt(space: DungeonSpace, creature: string, at: { x: number; y: number; z: number }, q: Quarry) {
  const den = new Den(space, [{ creature, room: 0 }], classic.creatures, 5), c = den.creatures[0];
  c.x = at.x; c.y = at.y; c.z = at.z;
  den.wound(c, { damage: 0, outcome: 'miss' }, q);
  return { den, c };
}

test('doors: no blow through a shut door, and no body in it, however near the hero stands behind it', () => {
  const { space, pl, room, way, past } = doorOf('locked', 0.9);
  const nav = new DungeonNav(space);
  assert.equal(nav.sees(way.x, way.y, way.z, room.x, room.y, room.z, 0.9), false, 'a shut door hides each from the other');
  const q = quarry(room), { den, c } = foeAt(space, 'skeleton', way, q);
  const events: DenEvent[] = [];
  for (let i = 0; i < 100; i++) {
    events.push(...den.step(0.1, q));
    assert.ok(past(c) < -radiusOf(c.def), `kept off the leaf (${past(c).toFixed(2)} m from it)`);
  }
  assert.ok(!events.some((e) => e.kind === 'blow' || e.kind === 'swing'), 'never swings through it');
  assert.ok(!space.open.has(pl.link.id));
  // Open, the same two see each other.
  space.open.add(pl.link.id);
  assert.ok(nav.sees(way.x, way.y, way.z, room.x, room.y, room.z, 0.9), 'through the open door');
});

test('doors: walls between cells hide what is behind them (they have no thickness)', () => {
  let walls = 0;
  for (const c of cellars.slice(0, 8)) {
    const space = new DungeonSpace(c.layout), nav = new DungeonNav(space);
    for (const r of c.layout.rooms) for (let k = 0; k < 4; k++) {
      // The middle of the room's first cell, and the cell beyond its wall on side k.
      const i = r.x, j = r.z, ni = i + DIRS[k][0], nj = j + DIRS[k][1], y = r.level * STOREY;
      if (space.own(ni, nj, r.level) === undefined || space.own(ni, nj, r.level) === r.id || space.opening(i, j, r.level, k)) continue;
      if (space.floorAt((ni + 0.5) * CELL, (nj + 0.5) * CELL, y + 0.5) !== y) continue;
      walls++;
      assert.equal(nav.sees((i + 0.5) * CELL, y, (j + 0.5) * CELL, (ni + 0.5) * CELL, y, (nj + 0.5) * CELL, 0.9), false, `${c.decision.id} room ${r.id} side ${k}`);
    }
  }
  assert.ok(walls > 3, `${walls} walls looked through`);
});

test('doors: a foe with hands unbars a barred door from its side (seen), then comes through; a rat goes no farther', () => {
  const { space, pl, room, way, past } = doorOf('oneway', 1.6);
  const q = quarry(room);
  const { den, c } = foeAt(space, 'goblin', way, q);
  let unbarred = -1, at = 0;
  for (let i = 0; i < 100 && unbarred < 0; i++) {
    for (const e of den.step(0.1, q)) if (e.kind === 'unbarred') { unbarred = e.link; at = past(c); }
  }
  assert.equal(unbarred, pl.link.id, 'it lifted the bar');
  assert.ok(at < -radiusOf(c.def), `from in front of the door (${at.toFixed(2)} m)`);
  // It stands while the door swings, then goes through.
  const x0 = c.x, z0 = c.z;
  den.step(0.5, q);
  assert.ok(Math.hypot(c.x - x0, c.z - z0) < 0.01, 'stands while the door opens');
  for (let i = 0; i < 60; i++) den.step(0.1, q);
  assert.ok(past(c) > 0, 'came through');

  const rats = new DungeonSpace(space.layout), r = foeAt(rats, 'giant rat', way, q);
  for (let i = 0; i < 100; i++) {
    for (const e of r.den.step(0.1, q)) assert.notEqual(e.kind, 'unbarred');
    assert.ok(past(r.c) < -radiusOf(r.c.def), 'the rat stays its side');
  }
  assert.ok(!rats.open.has(pl.link.id));
});

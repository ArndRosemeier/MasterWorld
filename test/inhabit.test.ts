import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { formedCave } from './support/formedCave';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { hoardsOf } from '../src/world/dungeon/treasure';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';
import { inhabit } from '../src/vgm/inhabit';
import { Den } from '../src/sim/creatures';
import { FormedSpace } from '../src/sim/formedSpace';
import { FormedSeen } from '../src/game/formedMap';
import { Delve } from '../src/game/delve';
import { Character } from '../src/game/character';

const { c, ...read } = formedCave(6, 'massive');
const field = c.field as BrickField;

test('inhabit: a cave outline gets its rooms as places of the formed cave: the way in at the throat, the lair deepest, props on its floor', () => {
  for (let n = 1; n <= 6; n++) {
    const cellar = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
    const h = inhabit(cellar, field, read.reading, c.skeleton.throat);
    const rd = read.reading, g = cellar.graph;
    assert.equal(h.cells.length, g.rooms.length);
    // The way in is the entry; every home is on ground that walks back out.
    assert.equal(h.cells[g.entrance], rd.entries[0]);
    for (const cell of h.cells) assert.ok(rd.depth[cell] < Infinity && rd.back[cell], 'a home on reached ground');
    // The lair lies deeper than the middle of the rooms.
    const depths = h.cells.map((cell) => rd.depth[cell]).sort((a, b) => a - b);
    assert.ok(rd.depth[h.cells[g.goal]] >= depths[Math.floor(depths.length / 2)], 'the lair lies deep');
    // Props stand in air, on a floor, apart.
    for (const p of h.cellar.props) {
      assert.ok(fieldAt(field, p.x, p.y + 0.9, p.z, -1) > 0, `${p.kind} stands in air`);
    }
    const spots = h.cellar.props.filter((p) => p !== h.cellar.hatch);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > 0.3, 'props apart');
    // The way out stays clear: nothing stands in the portal's window (the hatch itself is not drawn at a throat).
    for (const p of spots) assert.ok(Math.hypot(p.x - h.cellar.hatch.x, p.z - h.cellar.hatch.z) > 2.5, `${p.kind} stands ${Math.hypot(p.x - h.cellar.hatch.x, p.z - h.cellar.hatch.z).toFixed(1)} m from the way out`);
    // The lair's hoard lies at its home.
    const lair = hoardsOf(h.cellar, classic.creatures).find((x) => !x.prop)!;
    const home = h.cellar.formed!.homes[g.goal];
    assert.ok(Math.hypot(lair.x - home.x, lair.z - home.z) < 0.01);
    // Its dwellers live in the places.
    const den = new Den(h.ground, h.cellar.spawns, classic.creatures, 3);
    for (const cr of den.creatures) assert.ok(h.ground.clearance(cr.x, cr.y, cr.z) > 0, `${cr.def.id} stands in air`);
    // Seeded.
    assert.deepEqual(inhabit(cellar, field, read.reading, c.skeleton.throat).cells, h.cells);
  }
});

test('inhabit: a cave place is played over its cave: the delve over the cave\'s ground has its dwellers and hoards in the places, the space is the cave\'s rock', () => {
  const cellar = outlineCellar(testDecision(2, 1, 'cave'), testHouse(2), classic.dungeons.cave!);
  const h = inhabit(cellar, field, read.reading, c.skeleton.throat);
  const space = new FormedSpace(h.cellar.layout, field, h.ground, h.cellar.formed!.homes);
  const delve = new Delve(h.cellar, space.ground, classic, new Character(classic), 5);
  assert.equal(delve.den.creatures.length, cellar.spawns.length);
  assert.ok(delve.hoards.length >= 1 && delve.hoards.some((x) => !x.prop), 'the lair holds its hoard');
  // The space is the rock: air where the hero walks, a floor under the entry, the room of the lair known by its home.
  const e = read.reading.entries[0], x = read.reading.x[e], y = read.reading.y[e], z = read.reading.z[e];
  assert.ok(space.sdf(x, y + 1, z) > 0.3);
  assert.ok(Math.abs((space.floorAt(x, z, y + 0.6) ?? -99) - y) < 0.1);
  assert.equal(space.ownerAt(h.cellar.formed!.homes[cellar.graph.goal].x, h.cellar.formed!.homes[cellar.graph.goal].y, h.cellar.formed!.homes[cellar.graph.goal].z), cellar.graph.goal);
  // What the hero has seen of it grows as the lantern shows squares of floor.
  const seen = new FormedSeen(h.ground);
  seen.see(x, y, z);
  assert.ok(seen.version > 3, `${seen.version} squares shown at the way in`);
  const back = new FormedSeen(h.ground);
  back.restore(seen.save());
  assert.equal(back.version, seen.version);
});

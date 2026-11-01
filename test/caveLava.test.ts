import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves } from './support/formedCave';
import { formCave } from '../src/world/cave/form';
import { rockFor, sharesFor } from '../src/world/cave/choose';
import { Walker } from '../src/game/walker';
import { formedWorld } from '../src/game/formedWorld';
import type { BrickField } from '../src/world/dungeon/rockMesh';

test('lava tubes (K7): volcanic country holds basalt and lava, the flow forms the same twice from a vent down the land, and its tube is a way in', () => {
  assert.equal(rockFor(caves, 'volcanic', 5)!.id, 'basalt');
  assert.ok(Array.from({ length: 40 }, (_, i) => sharesFor(caves, 'volcanic', i).lava).some((l) => l > 0), 'lava is among the shares there');
  assert.equal(Array.from({ length: 40 }, (_, i) => sharesFor(caves, 'karst', i).lava).filter((l) => l > 0).length, 0, 'and nowhere else');
  const a = formCave(caves, 3, 'basalt', 'small'), b = formCave(caves, 3, 'basalt', 'small'), c = formCave(caves, 4, 'basalt', 'small');
  assert.equal(JSON.stringify(a.skeleton.conduits), JSON.stringify(b.skeleton.conduits), 'seeded');
  assert.notEqual(JSON.stringify(a.skeleton.conduits), JSON.stringify(c.skeleton.conduits));
  const tube = a.skeleton.conduits[0].points;
  assert.ok(tube.length >= 15 && a.skeleton.stats.length >= 60, `a tube of ${a.skeleton.stats.length.toFixed(0)} m`);
  for (const p of tube) assert.ok(p.A >= caves.way.minWidth / 2 && p.B >= caves.way.minHeight / 2 && p.C < p.A && p.D === 0, 'every tube fits the hero and has a flat floor, no canyon');
  // A gentle floor: the tube's centre falls slowly, never steeply.
  const drop = tube[0].y - tube[tube.length - 1].y, run = a.skeleton.stats.length;
  assert.ok(drop >= -1 && drop < 0.25 * run, `falls ${drop.toFixed(1)} m over ${run.toFixed(0)} m`);
  assert.ok(a.skeleton.conduits.some((x) => x.kind === 'mouth') && a.skeleton.throat, 'a way in from the land');
  for (const x of a.skeleton.conduits) assert.ok(!x.active && x.points.every((p) => p.flow === 0), 'no water runs in it');
});

test('lava tubes (K7): dressed with no dripstone and no crystals, read as one network from the way in, and the real walker goes in along its course', () => {
  const { c, reading, dressing } = formedCave(2, 'basalt');
  assert.equal(dressing.speleos.length, 0, 'no stalactites in a lava tube');
  assert.equal(dressing.streams.length, 0, 'no stream');
  assert.ok(reading.stats.reached >= 0.95 * reading.stats.cells && reading.stats.cutOff === 0, `reached ${reading.stats.reached} of ${reading.stats.cells}`);
  const t = c.skeleton.throat!, f = c.field as BrickField, w = new Walker(formedWorld(f));
  w.place(t.x, t.z, t.y + 0.02);
  for (let i = 0; i < 60; i++) w.step({ forward: 0, strafe: 0, heading: t.yaw, walk: false, up: false, down: false }, 1 / 60);
  // Along the tube's own course from its mouth (the way the flow ran, backwards): to a point 24 m up it within 30 s.
  const tube = c.skeleton.conduits[0].points, goal = tube[Math.max(0, tube.length - 1 - 8)];
  let k = tube.length - 1, steps = 0;
  for (; steps < 60 * 30 && k >= tube.length - 1 - 8; steps++) {
    const p = tube[k];
    if (Math.hypot(p.x - w.pos.x, p.z - w.pos.z) < 1.2) { k--; continue; }
    w.step({ forward: 1, strafe: 0, heading: Math.atan2(-(p.x - w.pos.x), -(p.z - w.pos.z)), walk: false, up: false, down: false }, 1 / 60);
  }
  assert.ok(k < tube.length - 1 - 8, `walked ${Math.hypot(w.pos.x - t.x, w.pos.z - t.z).toFixed(1)} m of the way, short of ${goal.x.toFixed(0)}, ${goal.z.toFixed(0)}`);
});

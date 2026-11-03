import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves, small } from './support/formedCave';
import { formCave } from '../src/world/cave/form';
import { rockFor, sharesFor } from '../src/world/cave/choose';
import { Walker } from '../src/game/walker';
import { formedWorld } from '../src/game/formedWorld';
import { carveSkeleton } from '../src/world/cave/carve';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';

test('lava tubes (K7): volcanic country holds basalt and lava, the flow forms the same twice from a vent down the land, and its tube is a way in', () => {
  assert.equal(rockFor(caves, 'volcanic', 5)!.id, 'basalt');
  assert.ok(Array.from({ length: 40 }, (_, i) => sharesFor(caves, 'volcanic', i).lava).some((l) => l > 0), 'lava is among the shares there');
  assert.equal(Array.from({ length: 40 }, (_, i) => sharesFor(caves, 'karst', i).lava).filter((l) => l > 0).length, 0, 'and nowhere else');
  const own = (seed: number) => formCave(caves, seed, 'basalt', small.id, undefined, undefined, small), a = own(3), b = own(3), c = own(4);
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
  assert.ok(dressing.speleos.every((s) => s.glaze && s.kind !== 'stalagmite' && s.kind !== 'column'), 'no dripstone in a lava tube: only its own glazed drips');
  assert.equal(dressing.drips.length, 0, 'no water falls');
  assert.equal(dressing.crystals.length, 0, 'no crystals');
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

test('lava tubes (K7c): lava drips hang short from the roof over the hero\'s head', () => {
  const { c, dressing } = formedCave(2, 'basalt'), f = c.field as BrickField, ld = caves.dress.lava;
  const drips = dressing.speleos;
  assert.ok(drips.length >= 40, `${drips.length} lava drips`);
  const head = caves.way.minHeight + 0.1;
  for (const s of drips) {
    assert.ok(s.y1 - s.y0 <= ld.length[1] + 1e-6, 'short');
    assert.ok(fieldAt(f, s.x, s.y1 + 0.35, s.z, -1) < 0.3, 'hangs from rock');
  }
  // The tips stay above the head of a hero standing under them.
  const low = drips.filter((s) => { for (let y = s.y0 - 0.1; y > s.y0 - head + 0.1; y -= 0.2) if (fieldAt(f, s.x, y, s.z, -1) <= 0) return true; return false; });
  assert.ok(low.length <= drips.length * 0.05, `${low.length} of ${drips.length} drips hang lower than a hero stands`);
});

test('lava tubes (K7c): flow ledges jut from the walls high over the floor and leave the floor and the middle alone', () => {
  const { c } = formedCave(2, 'basalt'), sk = c.skeleton;
  assert.ok(sk.ledges && sk.ledges.lip > 0, 'the lava former hands the carver its ledges');
  // (The carved field before the dressing, with the ledges and without.)
  const f = carveSkeleton(sk, c.block, caves, (c.field as BrickField).step), plain = carveSkeleton({ ...sk, ledges: undefined }, c.block, caves, f.step);
  const ups: number[] = [];
  const tube = sk.conduits[0].points;
  for (let n = 0; n + 1 < tube.length; n += 1) {
    const p = tube[n];
    // The floor of the tube and its middle are as they were.
    assert.ok(Math.abs(fieldAt(f, p.x, p.y - p.B + 0.4, p.z, -1) - fieldAt(plain, p.x, p.y - p.B + 0.4, p.z, -1)) < 0.05);
    for (let a = 0; a < 16; a++) for (let d = -p.A * 1.1; d <= p.A * 1.1; d += 0.3) for (let y = p.y - p.B; y < p.y + p.B; y += 0.25) {
      const x = p.x + Math.cos(a * 0.4) * d, z = p.z + Math.sin(a * 0.4) * d, g = fieldAt(f, x, y, z, -1), h = fieldAt(plain, x, y, z, -1);
      if (g < h - 0.1) ups.push(y - (p.y - p.B));
    }
  }
  ups.sort((a, b) => a - b);
  assert.ok(ups.length > 30, `${ups.length} samples of ledge`);
  const low = ups[Math.floor(ups.length * 0.05)];
  assert.ok(low >= sk.ledges!.first - 0.8, `5% of the ledge lies below ${low.toFixed(2)} m over the floor`);
});

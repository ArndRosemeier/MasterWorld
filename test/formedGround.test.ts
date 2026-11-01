import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { formedCave } from './support/formedCave';
import { Den, type Quarry } from '../src/sim/creatures';
import { FormedGround } from '../src/sim/formedGround';
import type { BrickField } from '../src/world/dungeon/rockMesh';

const { c, reading: g } = formedCave(6, 'massive');
const field = c.field as BrickField;
const guard = { defence: 20, armour: 1, open: false };

const mid = { range: (lo: number, hi: number) => (lo + hi) / 2 };
/** Two places a creature can walk between (the cave is in levels joined by climbs; creatures walk, scramble a step and drop a few metres). */
function twoPlaces(near = 14, skip = 0): [number, number, FormedGround] {
  const cells = g.places.filter((p) => p.kind !== 'entry' && p.kind !== 'skylight').map((p) => p.cell);
  let seen = 0;
  for (const a of cells) for (const b of cells) {
    const d = Math.hypot(g.x[a] - g.x[b], g.z[a] - g.z[b]);
    if (d < near || d > near + 6) continue;
    const ground = new FormedGround(field, g, [a, b]);
    if (ground.way(ground.spot(0, mid), ground.spot(1, mid)).length && seen++ >= skip) return [a, b, ground];
  }
  throw new Error('no two places a creature can walk between');
}

test('formed ground: floors are found under a body, and a way over the network ends at its goal', () => {
  const [, , ground] = twoPlaces();
  const a = ground.spot(0, mid), b = ground.spot(1, mid);
  for (const p of [a, b]) {
    assert.ok(ground.clearance(p.x, p.y, p.z) > 0, 'a spot is in air');
    assert.ok(Math.abs((ground.floorAt(p.x, p.z, p.y + 0.6) ?? -99) - p.y) < 0.05, 'standing on the floor');
  }
  const way = ground.way(a, b);
  assert.ok(way.length > 0, 'a way between two homes');
  const end = way[way.length - 1];
  assert.ok(Math.hypot(end.x - b.x, end.z - b.z) < 0.01);
  // The way does not leap: each point is near the one before.
  let at = a;
  for (const p of way.slice(0, -1)) { assert.ok(Math.hypot(p.x - at.x, p.z - at.z) < 30); at = p; }
});

test('formed ground: a goblin wakes in its place and walks the cave to the hero, never through rock', () => {
  // (Whether it notices the hero depends on the line of sight between two rooms, so a few pairs of places are tried: it
  // reaches the hero from at least one, and none of them takes it into the rock.)
  let reached = 0, tried = 0, worstClear = Infinity;
  const notes: string[] = [];
  for (let k = 0; k < 4; k++) {
    let pair: [number, number, FormedGround];
    try { pair = twoPlaces(8, k); } catch { break; }
    const [home, there, ground] = pair, hero = { x: g.x[there], y: g.y[there], z: g.z[there] };
    const den = new Den(ground, [{ creature: 'goblin', room: 0 }], classic.creatures, 11);
    const q: Quarry = { ...hero, noise: 1, light: 40, alive: true, guard };
    const gob = den.creatures[0], start = Math.hypot(gob.x - hero.x, gob.z - hero.z);
    let closest = start;
    for (let i = 0; i < 1200; i++) {
      den.step(0.1, q);
      closest = Math.min(closest, Math.hypot(gob.x - hero.x, gob.z - hero.z));
      worstClear = Math.min(worstClear, ground.clearance(gob.x, gob.y, gob.z));
    }
    assert.ok(home >= 0 && start > 5, `starts ${start.toFixed(0)} m off`);
    tried++;
    if (closest < 3) reached++;
    notes.push(`${closest.toFixed(1)} of ${start.toFixed(0)} m`);
  }
  assert.ok(tried >= 2 && reached >= 1, `came close to the hero from ${reached} of ${tried} pairs (${notes.join(', ')})`);
  assert.ok(worstClear > -0.3, `never deep in rock (${worstClear.toFixed(2)})`);
});

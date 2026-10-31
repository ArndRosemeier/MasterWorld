import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { drownedRooms, outlineCellar } from '../src/world/dungeon/cellar';
import { CaveSpace, caveField } from '../src/world/dungeon/caveRock';
import { caveFeatures, keepSpots } from '../src/world/dungeon/caveFeatures';
import { testDecision } from '../src/world/dungeon/variety';
import { dungeonWorld } from '../src/game/dungeonWorld';
import { Walker } from '../src/game/walker';
import { openWorld } from '../src/vgm/builder';
import { dungeonFor } from '../src/vgm/dungeons';

const lore = classic.dungeons['sea-cave']!;
const seed = parseSeed('masterworld'), world = openWorld(seed, classic);
const seaCave = (n: number) => outlineCellar(testDecision(n, 1, 'sea-cave', lore.form.pieces), { kind: 'sea-cave', hu: 3, hv: 3, name: 'the sea cave' }, lore);

test('sea cave (S8): its lowest storey under water, a room on the way there two storeys high; the lair and its dwellers dry', () => {
  for (let n = 0; n < 8; n++) {
    const c = seaCave(n), wet = drownedRooms(c.layout), S = c.layout.scale.storey;
    assert.equal(c.layout.flood, c.layout.levels[0] * S + lore.form.space.flood!, `cave ${n}: the water over the lowest storey`);
    assert.ok(wet.size > 0, `cave ${n}: something under water`);
    assert.ok(!wet.has(c.graph.goal) && !wet.has(c.graph.entrance) && !wet.has(c.pace.safe), `cave ${n}: the lair, the way in and the safe spot dry`);
    assert.ok(c.spawns.every((s) => !wet.has(s.room)), `cave ${n}: nobody lives under water`);
    for (const id of wet) assert.ok(c.layout.rooms.find((r) => r.id === id)!.height >= 2, `cave ${n}: air over the water of room ${id}`);
  }
});

test('sea cave: the walker swims its drowned room, dives to the floor and comes up into the air under its roof', () => {
  const n = 1, c = seaCave(n), f = caveFeatures(c.layout, n, keepSpots(c)), space = new CaveSpace(c.layout, caveField(c.layout, n, f), f);
  const wet = drownedRooms(c.layout), { cell: C, storey: S } = c.layout.scale;
  assert.equal(f.flood, c.layout.flood);
  assert.ok(f.pools.every((p) => !wet.has(p.hall)) && f.streams.every((s) => !wet.has(s.hall)), 'no pool or stream under the water');
  const world = dungeonWorld(space, { x: 0, y: 0, z: 0 });
  assert.equal(world.waterLevel(0, 0), c.layout.flood);
  const r = c.layout.rooms.find((q) => wet.has(q.id))!, x = (r.x + r.w / 2) * C, z = (r.z + r.d / 2) * C;
  const w = new Walker(world);
  w.place(x, z, space.floorAt(x, z, r.level * S + 2)! + 0.3);
  const still = { forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: true };
  for (let i = 0; i < 60; i++) w.step(still, 1 / 60);
  assert.equal(w.mode, 'swim');
  assert.ok(w.headUnder, 'down by the floor, the head under');
  for (let i = 0; i < 600; i++) w.step({ ...still, down: false, up: true }, 1 / 60);
  assert.ok(!w.headUnder, 'up at the surface, the head out');
  assert.ok(space.sdf(w.pos.x, w.pos.y + 1, w.pos.z) > 0, 'never in the rock');
});

test('sea cave: its mouth by the shore, the sea just below it, out on the ring round the town', () => {
  const t = world.terrain, town = t.towns[0];
  const d = dungeonFor({ purpose: 'lead', town, kinds: ['sea-cave'] }, { seed, terrain: t, log: world.log, home: town.decision, dungeons: classic.dungeons });
  assert.ok(d?.site, 'a sea cave near the harbour town');
  const { x, z, yaw } = d.site;
  assert.ok(t.height(x, z) > 0.5 && t.waterDepth(x, z) === 0, 'on dry ground');
  let sea = Infinity;
  for (let m = 0; m <= 100; m += 5) if (t.height(x + Math.sin(yaw) * m, z + Math.cos(yaw) * m) < -1) { sea = m; break; }
  assert.ok(sea <= 90, `the sea ${sea} m out from its mouth`);
  assert.ok(Math.max(t.height(x - Math.sin(yaw) * 20, z - Math.cos(yaw) * 20), t.height(x - Math.sin(yaw) * 16, z - Math.cos(yaw) * 16)) - t.height(x, z) > 9, 'the land rises behind it');
  const far = Math.hypot(x - town.decision.x, z - town.decision.z);
  assert.ok(far >= lore.form.ring![0] && far <= lore.form.ring![1] + 200, `${far.toFixed(0)} m from the town`);
});

test('sea cave: swimming under a roof that comes lower ahead, the body ducks under it and swims on', () => {
  // A drowned way: floor at 0, its roof at 3 m, then at 2.3 m past z = 2 (a lintel); the water over both.
  const roof = (z: number) => (z < 2 ? 3 : 2.3);
  const sdf = (x: number, y: number, z: number) => Math.min(y, roof(z) - y, 2 - Math.abs(x));
  const w = new Walker({ height: () => -100, rockSurface: sdf, waterLevel: () => 5 });
  w.place(0, -2, 0.5);
  const on = { forward: 1, strafe: 0, heading: Math.PI, walk: false, up: false, down: false };
  for (let i = 0; i < 360; i++) w.step(on, 1 / 60);
  assert.equal(w.mode, 'swim');
  assert.ok(w.pos.z > 4, `on past the lintel: z ${w.pos.z.toFixed(2)}`);
  assert.ok(sdf(w.pos.x, w.pos.y + w.height - 0.05, w.pos.z) > 0, 'the head under the roof, not in it');
});

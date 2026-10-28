import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { goSpots, type GoHost } from '../src/app/goPlaces';
import { atDoor, before, beside, clearStand, outsideGate, type Stand } from '../src/app/places';
import { guildHouses } from '../src/game/guilds';
import type { DecisionLog, DungeonDecision } from '../src/world/decisions';
import { first, terrain } from './frontierLand';

/** The way a stand faces (the walker's yaw: 0 faces −z), as a unit vector. */
const facing = (s: Stand) => ({ x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) });
/** It faces (x, z) (within a degree or so). */
const looksAt = (s: Stand, x: number, z: number): boolean => {
  const f = facing(s), d = Math.hypot(x - s.x, z - s.z);
  return (f.x * (x - s.x) + f.z * (z - s.z)) / d > 0.999;
};

test('places: every way of standing faces what it stands before', () => {
  const site = { x: 100, z: -40, yaw: 1.1 };
  const b = before(site, 20);
  assert.ok(Math.abs(Math.hypot(b.x - site.x, b.z - site.z) - 20) < 1e-9 && looksAt(b, site.x, site.z));
  const s = beside({ x: 5, z: 5 }, { x: 50, z: -30 }, 12);
  assert.ok(Math.abs(Math.hypot(s.x - 5, s.z - 5) - 12) < 1e-9 && looksAt(s, 5, 5));
  const g = outsideGate({ x: 0, z: 0, angle: 2, half: 4, road: 0, y: 0 });
  assert.ok(Math.hypot(g.x, g.z) > 20 && looksAt(g, 0, 0));
  const house = terrain.towns[0].plan.buildings.find((x) => x.kind === 'inn')!;
  const d = atDoor(house);
  assert.ok(looksAt(d, house.door[0], house.door[1]));
  // Something in the way: turned round what it looks at, same distance, still facing it.
  const c = clearStand(b, (x) => x < site.x);
  assert.ok(c.x < site.x && Math.abs(Math.hypot(c.x - site.x, c.z - site.z) - 20) < 1e-6 && looksAt(c, site.x, site.z));
  assert.equal(clearStand(b, () => false), b);
});

test('places: the debug go-to has every kind of place the setting has, and finds or makes each', async () => {
  const town = terrain.towns[0];
  let log: DecisionLog = first;
  let stood: Stand | null = null;
  const promised: string[] = [];
  const host: GoHost = {
    setting: classic,
    log: () => log,
    hours: () => 10,
    heroPos: () => stood ?? { x: town.decision.x, z: town.decision.z },
    towns: () => [{ town, guilds: guildHouses(town.plan, 'town', classic, log.filter((x) => x.kind === 'retreat')) }],
    stand: async (s, pick) => { stood = pick ? pick(s) : s; return stood; },
    clear: () => true,
    enter: async () => undefined,
    below: async () => true,
    open: async () => null,
    promise: (kind) => {
      promised.push(kind);
      const d: DungeonDecision = { kind: 'dungeon', id: `test-${kind}`, template: kind, town: town.decision.id, building: 0, site: { x: town.decision.x + 300, z: town.decision.z, yaw: 0 }, seed: 1, setPiece: 'x' };
      log = [...log, d];
      return d;
    },
    situation: () => null,
    answerFor: () => null,
    event: () => 'nothing is due',
    goodDay: () => 'no good day here',
    bridges: () => [],
  };
  const spots = goSpots(host);
  const labels = spots.map((s) => s.label);
  for (const kind of Object.keys(classic.dungeons)) assert.ok(labels.some((l) => l.toLowerCase() === kind) && labels.includes(`Down in: ${kind}`), kind);
  for (const g of classic.guilds ?? []) assert.ok(spots.some((s) => s.group.includes('guild') && g.name.toLowerCase().endsWith(s.label.toLowerCase())), g.keeper);
  for (const e of classic.events ?? []) assert.ok(labels.includes(`Event: ${e.id}`), e.id);
  for (const w of classic.wild) assert.ok(labels.includes(`Wild: ${w.id}`), w.id);
  for (const l of ['Capital gate', 'Capital market', 'Capital seat', 'Hamlet', 'Village', 'Waystation', 'Camp', 'Ruins', 'Barrow field', 'Hold gate', 'Hurt traveller', 'Wolves at a paddock', 'Refugees on the road', 'Inn', 'Paddock gate', 'Bridge']) assert.ok(labels.includes(l), l);
  // A town's buildings: before the inn's door, facing it.
  const inn = spots.find((s) => s.label === 'Inn')!;
  assert.match(await inn.go(), /^inn: /);
  const b = town.plan.buildings.find((x) => x.kind === 'inn')!;
  assert.ok(stood && looksAt(stood, b.door[0], b.door[1]));
  // A land place with none in the log: one is promised, then the hero stands before it.
  const cave = spots.find((s) => s.label === 'Cave')!;
  assert.match(await cave.go(), /^cave test-cave/);
  assert.deepEqual(promised, ['cave']);
  // Nothing can be made: the go-to says so and leaves the hero be.
  stood = null;
  assert.match(await spots.find((s) => s.label === 'Event: farm-raid')!.go(), /no farm-raid: nothing is due/);
  assert.equal(stood, null);
});

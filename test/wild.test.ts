import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeed, parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { OpenGround, Wilds, groupDanger, type Land } from '../src/sim/wild';
import { territoryOf, wildFor } from '../src/vgm/wild';
import { Den, type Quarry } from '../src/sim/creatures';
import { Delve, type DelveSave } from '../src/game/delve';
import { Character } from '../src/game/character';
import { onLand } from '../src/world/dungeon/site';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain } = startWorld();
const town = terrain.towns[0];
const land: Land = { height: (x, z) => terrain.height(x, z), waterDepth: (x, z) => terrain.waterDepth(x, z), blocked: (x, z, r) => town.solid(x, z, r) };
const placeWild = () => wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, town).map(territoryOf);
const places = placeWild();
const ringOf = (kind: string) => classic.wild.find((w) => w.id === kind)!.ring;
const guard = { defence: 20, armour: 1, open: false };
const hero = (x: number, z: number, noise = 0.4): Quarry => ({ x, y: terrain.height(x, z), z, noise, light: 0, alive: true, guard });

test('wild: deer, boar, a wolf pack and bandits live around the town, apart, on dry land, none too strong near it', () => {
  const kinds = new Set(places.map((t) => t.kind));
  for (const k of ['deer', 'boar', 'wolves', 'bandits']) assert.ok(kinds.has(k), `${k} live here (${[...kinds].join(', ')})`);
  for (const t of places) {
    const d = Math.hypot(t.x - town.decision.x, t.z - town.decision.z);
    assert.ok(d >= ringOf(t.kind)[0] - 1 && d <= ringOf(t.kind)[1] + 1, `${t.id} at ${d.toFixed(0)} m`);
    assert.equal(terrain.waterDepth(t.x, t.z), 0, `${t.id} on dry land`);
    assert.ok(groupDanger(t.members, classic.creatures) <= 18, `${t.id} fits a fresh hero`);
    for (const o of places) if (o !== t) assert.ok(Math.hypot(o.x - t.x, o.z - t.z) > o.r + t.r, `${t.id} and ${o.id} apart`);
  }
  assert.deepEqual(placeWild(), places, 'the same every time');
});

test('wild: far groups rest; near ones are always busy; deer bolt from a hero, wolves come for them', () => {
  const wilds = new Wilds(places, land, classic.creatures);
  // The hero in town: nobody out there is awake.
  wilds.step(0.1, hero(town.decision.x, town.decision.z));
  assert.ok(wilds.bands.every((b) => !b.awake));
  const deer = wilds.bands.find((b) => b.territory.kind === 'deer')!;
  const t = deer.territory;
  // Watching from a distance: they graze and wander, every one of them doing something.
  const far = hero(t.x + t.r + 120, t.z);
  let busy = 0, steps = 0;
  for (let i = 0; i < 300; i++) {
    wilds.step(0.1, far);
    for (const c of deer.den.creatures) { steps++; if (c.act !== 'stand') busy++; }
  }
  assert.ok(deer.awake);
  assert.ok(busy / steps > 0.9, `busy ${(busy / steps * 100).toFixed(0)} %`);
  // Running up to them: they bolt.
  const start = deer.den.creatures.map((c) => Math.hypot(c.x - t.x, c.z - t.z));
  let fled = 0;
  for (let i = 0; i < 200; i++) {
    const c0 = deer.den.creatures[0];
    for (const e of wilds.step(0.1, hero(c0.x + 12, c0.z, 1))) if (e.event.kind === 'flee') fled++;
  }
  assert.ok(fled > 0, 'the deer fled');
  assert.ok(start.length > 0);
  // Wolves: the pack comes for a hero who walks into their woods.
  const wolves = wilds.bands.find((b) => b.territory.kind === 'wolves')!;
  const w = wolves.territory;
  let fighting = 0;
  for (let i = 0; i < 300 && !fighting; i++) {
    wilds.step(0.1, hero(w.x + 10, w.z, 0.6));
    fighting = wolves.den.fighting.length;
  }
  assert.ok(fighting >= 2, `${fighting} wolves on the hunt`);
});

test('wild: a band is fought like a cellar (no hoards); its dead stay dead', () => {
  const bandits = places.find((t) => t.kind === 'bandits')!;
  const make = (saved?: DelveSave) => {
    const den = new Den(new OpenGround(land, [bandits]), bandits.members.map((creature) => ({ creature, room: 0 })), classic.creatures, deriveSeed(bandits.seed, 'den'), saved?.dead ?? []);
    return new Delve(null, den, classic, new Character(classic), 7, saved);
  };
  const d = make();
  assert.equal(d.hoards.length, 0);
  // A hero walking into their camp gets set upon.
  let hurt = 0;
  const c0 = d.den.creatures[0], at = { x: c0.x + 3, y: terrain.height(c0.x + 3, c0.z), z: c0.z, yaw: 0, speed: 1 };
  for (let i = 0; i < 300 && !hurt; i++) for (const e of d.step(0.1, at)) if (e.kind === 'hurt') hurt++;
  assert.ok(hurt > 0, 'the highwaymen strike');
  // One of them dies: after loading, still dead.
  const c = d.den.creatures[0];
  c.health = 0;
  c.state = 'dead';
  const again = make(d.tally());
  assert.equal(again.den.creatures[0].state, 'dead');
});

test('wild: the dwarves\' hold stands on the land (plan 11.6): in its ring from the town, its court level and bare, no band in it', () => {
  const hold = terrain.holds[0];
  assert.ok(hold && hold.people === 'dwarf', 'a hold is opened with the world');
  const ring = classic.peoples.find((p) => p.id === 'dwarf')!.hold!.ring;
  const d = Math.hypot(hold.x - town.decision.x, hold.z - town.decision.z);
  assert.ok(d >= ring[0] - 1 && d <= ring[1] + 1, `${d.toFixed(0)} m out`);
  for (const [u, v] of [[0, 2], [-10, 12], [10, 20]]) {
    const [x, z] = onLand(hold, u, v);
    assert.ok(Math.abs(terrain.height(x, z) - hold.level) < 1e-6, 'the court is level');
    assert.ok(terrain.rockAt(x, z, hold.level), 'and nothing grows there');
    assert.equal(terrain.waterDepth(x, z), 0);
  }
  for (const t of places) assert.ok(Math.hypot(t.x - hold.x, t.z - hold.z) > t.r + 60, `${t.id} keeps off the hold`);
});

test('wild: deer keep their distance (Arnd 2026-10-28): they bolt once, then watch from afar and never creep back', () => {
  const wilds = new Wilds(places, land, classic.creatures);
  const deer = wilds.bands.find((b) => b.territory.kind === 'deer')!;
  const t = deer.territory, wary = classic.creatures.find((c) => c.id === 'deer')!.wary!;
  // The hero stands in their meadow for three minutes.
  const q = hero(t.x, t.z);
  let fled = 0, near = 0;
  for (let i = 0; i < 1800; i++) {
    for (const e of wilds.step(0.1, q)) if (e.event.kind === 'flee') fled++;
    if (i > 300) for (const c of deer.den.creatures) if (Math.hypot(c.x - q.x, c.z - q.z) < wary) near++;
  }
  assert.ok(fled <= deer.den.creatures.length, `${fled} bolts from ${deer.den.creatures.length} deer`);
  assert.equal(near, 0, 'none walks back up to the hero');
  // Seen from just beyond their flight distance: heads up, watching, not coming nearer.
  const w2 = new Wilds(places, land, classic.creatures);
  const d2 = w2.bands.find((b) => b.territory.kind === 'deer')!;
  const c0 = d2.den.creatures[0];
  const watcher = hero(c0.x + wary + 6, c0.z);
  let bolts = 0, closest = Infinity;
  for (let i = 0; i < 600; i++) {
    for (const e of w2.step(0.1, watcher)) if (e.event.kind === 'flee') bolts++;
    for (const c of d2.den.creatures) closest = Math.min(closest, Math.hypot(c.x - watcher.x, c.z - watcher.z));
  }
  assert.ok(closest > wary * 0.9, `closest ${closest.toFixed(1)} m`);
  assert.ok(bolts <= d2.den.creatures.length, `${bolts} bolts`);
});

test('wild (S9): by the sea town, giant crabs and smugglers live on strands just above the sea, the sea beside them', () => {
  for (const k of ['crabs', 'smugglers']) {
    const groups = places.filter((t) => t.kind === k);
    assert.ok(groups.length > 0, `${k} on the coast`);
    for (const t of groups) {
      const h = terrain.height(t.x, t.z);
      assert.ok(h >= 0.3 && h <= 4, `${t.id} on a strand (${h.toFixed(1)} m)`);
      const sea = [0, 1, 2, 3, 4, 5, 6, 7].some((i) => terrain.waterDepth(t.x + Math.cos(i * Math.PI / 4) * 35, t.z + Math.sin(i * Math.PI / 4) * 35) > 1);
      assert.ok(sea, `${t.id} by the sea`);
    }
  }
  assert.ok(places.filter((t) => t.kind === 'crabs').every((t) => t.members.every((m) => m === 'giant crab')));
});

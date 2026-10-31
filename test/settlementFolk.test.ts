import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { regionDecisions, walkFrontier } from '../src/vgm/frontier';
import { nextPromise, openPromises } from '../src/vgm/leads';
import { TownLife } from '../src/sim/townLife';
import { townTalk, type TownTalkSave } from '../src/talk/townTalk';
import { Township } from '../src/game/township';
import { townSaves, type SaveData } from '../src/app/saveGame';
import { houseKey } from '../src/world/town';
import { Terrain } from '../src/world/terrain';
import { settlementOf, type Decision, type DecisionLog } from '../src/world/decisions';
import { SMALL } from './small';
import { planInterior } from '@futuremagic/settlement';
import { roomCast } from '../src/sim/roomCast';

const seed = parseSeed('masterworld');
// The start's land with small drainage tiles (as the frontier test): the same town, faster.
const terrain = new Terrain(seed, classic, SMALL);
const first = firstDecisions(terrain, startPlace(terrain));
terrain.settle(first);
const home = terrain.towns[0].decision;
const regions = classic.regions!;
const walked: DecisionLog = [...first, ...walkFrontier({ seed, log: first, terrain, regions, home }, Math.PI / 2, 3)];
const hamlet = regionDecisions(walked).find((d) => settlementOf(d, regions.fills)?.size === 'hamlet')!;
terrain.settleMore([hamlet]);
const town = terrain.town(hamlet.id)!;

const ctx = (log: DecisionLog, near: typeof town | null) => ({ seed, log, towns: terrain.towns, home, hours: 5, purposeOverdue: false, inside: () => false, dungeons: classic.dungeons, terrain, near });

test('settlements: a hamlet has its own people, who live their day', () => {
  assert.ok(town, 'the hamlet settled');
  const life = new TownLife(town.plan, town.decision.seed!, 9, classic.routines);
  const grown = life.agents.filter((a) => a.person.role !== 'child');
  assert.ok(grown.length >= 4, `${grown.length} grown-ups`);
  for (const a of life.agents) assert.ok(a.person.home < town.plan.buildings.length);
  const at = life.agents.map((a) => [a.x, a.z]);
  for (let i = 0; i < 200; i++) life.step(0.1, 9 + i / 600);
  assert.ok(life.agents.some((a, i) => Math.hypot(a.x - at[i][0], a.z - at[i][1]) > 0.5), 'somebody moved');
  // Their own names, not the start town's people under other roofs.
  const words = townTalk(town.decision.seed!, classic, town, life.agents.map((a) => a.person), walked).talk;
  const start = townTalk(seed, classic, terrain.towns[0], new TownLife(terrain.towns[0].plan, seed, 9).agents.map((a) => a.person), walked).talk;
  assert.notEqual(words.nameOf(0), start.nameOf(0));
});

test('settlements: in a hamlet the VGM promises a place from it, and its people tell of it', () => {
  // With the world's open leads already (the start town's first cellar and two more): one more, the hamlet's own.
  let log: Decision[] = [...walked];
  for (let h = 1; openPromises(log).length < 3 && h < 10; h++) {
    const d = nextPromise({ ...ctx(log, null), hours: h, purposeOverdue: true });
    if (d) log = [...log, d];
  }
  assert.equal(openPromises(log).length, 3);
  assert.equal(nextPromise({ ...ctx(log, null), hours: 20 }), null, 'away from the hamlet nothing more');
  const d = nextPromise({ ...ctx(log, town), hours: 20 });
  assert.ok(d && d.kind === 'dungeon', 'the hamlet gets a lead of its own');
  assert.equal(d.town, town.decision.id);
  // A cellar under one of its houses, or a place out on the land near it.
  const at = d.site ?? { x: town.plan.buildings[d.building].cx, z: town.plan.buildings[d.building].cz };
  assert.ok(Math.hypot(at.x - town.decision.x, at.z - town.decision.z) < 1500, 'near the hamlet');
  log = [...log, d];
  assert.equal(nextPromise({ ...ctx(log, town), hours: 30 }), null, 'one at a time');
  const life = new TownLife(town.plan, town.decision.seed!, 9, classic.routines);
  const words = townTalk(town.decision.seed!, classic, town, life.agents.map((a) => a.person), log).talk;
  const knowers = [...words.knowersOf(new Set([d.id]))];
  assert.ok(knowers.length > 0, 'somebody in the hamlet knows of it');
  const told = knowers.some((p) => words.ask(p, 'news').heard.includes(d.id));
  assert.ok(told, 'and tells of it');
});

// Plan B3a: every town runs on the one core (game/township.ts), the start town as any hamlet.
test('settlements: a hamlet\'s core is the start town\'s code: people, words, promises and a save', () => {
  let log: Decision[] = [...walked];
  const ctxOf = { seed, setting: classic, log: () => log, hours: () => 9 };
  const here = new Township(town, ctxOf), start = new Township(terrain.towns[0], ctxOf);
  assert.equal(here.seed, town.decision.seed);
  assert.equal(start.seed, seed, 'the start town keeps the world\'s seed');
  assert.ok(here.residents.length >= 4 && here.life.agents.length === here.residents.length);
  assert.notEqual(here.talk.nameOf(0), start.talk.nameOf(0));
  // A promise made after its words were: they hear of it (as the start town's people do).
  const d = nextPromise({ ...ctx(log, town), hours: 20, purposeOverdue: true })!;
  assert.ok(d && d.kind === 'dungeon' && d.town === town.decision.id);
  log = [...log, d];
  here.promised(d);
  start.promised(d);
  const knows = [...here.talk.knowersOf(new Set([d.id]))];
  assert.ok(knows.some((p) => here.talk.ask(p, 'news').heard.includes(d.id)), 'the hamlet tells of its new lead');
  // Its words come back from a save, as the start town's.
  const saved = here.toSave();
  assert.ok(saved.talk);
  const again = new Township(town, ctxOf, JSON.parse(JSON.stringify(saved)));
  assert.equal(again.talk.nameOf(0), here.talk.nameOf(0));
  assert.deepEqual(new Township(town, ctxOf).toSave(), {}, 'nothing kept where nobody talked');
});

test('settlements: houses are told apart by town (building ids start at 0 in each)', () => {
  assert.notEqual(houseKey(town.decision.id, 0), houseKey(terrain.towns[0].decision.id, 0));
  // An older save's start-town words and market go to the start town; the newer one keeps every town's.
  const t = { messages: [] } as unknown as TownTalkSave;
  assert.deepEqual(Object.keys(townSaves({ talk: t, talks: { [town.decision.id]: t } } as unknown as SaveData, 'town-1')).sort(), ['town-1', town.decision.id].sort());
  assert.deepEqual(townSaves({ towns: { a: {} } } as unknown as SaveData, 'town-1'), { a: {} });
});

// The town systems take the town they work in; none reaches for the start town by itself.
test('settlements: no town system names the start town', () => {
  const systems = ['app/talkUi.ts', 'app/interiorVisit.ts', 'app/upkeepUi.ts', 'app/hails.ts', 'app/tradeUi.ts', 'app/cellars.ts', 'app/soundDirector.ts', 'app/mapUi.ts', 'app/towns.ts', 'game/township.ts', 'sim/townLife.ts', 'talk/townTalk.ts', 'game/trade.ts', 'game/upkeep.ts', 'game/guilds.ts'];
  const startTown = /towns\[0\]|'town-1'|"town-1"|\bstartTown\b|\bstart\.decision\b/;
  for (const f of systems) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').split('\n');
    // The registry may say which town the game started in (a new hero's place), nothing more.
    const hits = src.filter((l, i) => startTown.test(l) && !(f === 'app/towns.ts' && /get start\(\)|const t = this\.h\.terrain\.towns\[0\]|this\.masked = /.test(l + (src[i - 1] ?? ''))));
    assert.deepEqual(hits, [], `${f} names the start town`);
  }
});

test('settlements: every guild house keeps its teacher at home while awake (the hedge witch is found in her cottage)', () => {
  const start = new Township(terrain.towns[0], { seed, setting: classic, log: () => walked, hours: () => 9 });
  const life = start.life;
  start.keepMarked(life, []);
  const teachers = start.guilds.map(({ guild, b }) => ({ b, a: life.agents.find((x) => x.person.work === b.id && x.person.trade === guild.keeper) })).filter((t) => t.a);
  // The warden keeps watch at the tower's door out on the land (its own post), not in a house in town.
  const housed = teachers.filter((t) => !t.a!.post);
  assert.ok(teachers.some((t) => t.a!.person.trade === 'hedge-witch'), 'the start town has its hedge witch');
  for (const { a } of housed) assert.ok(life.isKept(a!.person.id), `${a!.person.trade} is kept`);
  // From 9:00 to 17:00: once at home, never out about the town.
  const out = new Map<number, number>();
  for (let s = 0; s < 8 * 150; s++) {
    life.step(1, 9 + s / 150);
    if (s < 150) continue;
    for (const { a, b } of housed) if (a!.act === 'walk' || a!.spot < 0 || life.spots[a!.spot].building !== b.id) out.set(a!.person.id, (out.get(a!.person.id) ?? 0) + 1);
  }
  assert.deepEqual([...out], [], 'teachers out of their houses');
});

test('settlements: at night every guild teacher lies asleep in a bed of their own house (the hedge witch is found in hers)', () => {
  const start = new Township(terrain.towns[0], { seed, setting: classic, log: () => walked, hours: () => 2 });
  const life = start.life;
  start.keepMarked(life, []);
  for (let s = 0; s < 300; s++) life.step(1, 2);
  const housed = start.guilds.map((g) => ({ ...g, a: life.agents.find((x) => x.person.work === g.b.id && x.person.trade === g.guild.keeper) })).filter((t) => t.a && !t.a.post);
  assert.ok(housed.some((t) => t.a!.person.trade === 'hedge-witch'));
  // Laid out as the game opens them (interiorVisit): a hall where fighting is taught, a home for the witch.
  for (const { a, b, guild, out } of housed) {
    const room = planInterior(b, { hatch: false, hall: !!guild.hall && !out });
    const c = roomCast(life.agents, life.spots, b.id, room).find((x) => x.agent === a);
    assert.equal(c?.act, 'sleep', `${a!.person.trade} abed`);
    assert.equal(room.spots[c!.spot].kind, 'sleep');
  }
});

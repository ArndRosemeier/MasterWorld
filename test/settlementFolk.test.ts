import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { regionDecisions, walkFrontier } from '../src/vgm/frontier';
import { nextPromise, openPromises } from '../src/vgm/leads';
import { TownLife } from '../src/sim/townLife';
import { townTalk } from '../src/talk/townTalk';
import { Terrain } from '../src/world/terrain';
import { settlementOf, type Decision, type DecisionLog } from '../src/world/decisions';

const seed = parseSeed('masterworld');
// The start's land with small drainage tiles (as the frontier test): the same town, faster.
const terrain = new Terrain(seed, classic, { cell: 2000, core: 96, margin: 32, minArea: 120 });
const first = firstDecisions(terrain, startPlace(terrain));
terrain.settle(first);
const home = terrain.towns[0].decision;
const regions = classic.regions!;
const walked: DecisionLog = [...first, ...walkFrontier({ seed, log: first, terrain, regions, home }, 0, 5)];
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
  assert.ok(d.site, 'a place out on the land (its houses have no cellars to go down yet)');
  assert.ok(Math.hypot(d.site.x - town.decision.x, d.site.z - town.decision.z) < 1500, 'near the hamlet');
  log = [...log, d];
  assert.equal(nextPromise({ ...ctx(log, town), hours: 30 }), null, 'one at a time');
  const life = new TownLife(town.plan, town.decision.seed!, 9, classic.routines);
  const words = townTalk(town.decision.seed!, classic, town, life.agents.map((a) => a.person), log).talk;
  const knowers = [...words.knowersOf(new Set([d.id]))];
  assert.ok(knowers.length > 0, 'somebody in the hamlet knows of it');
  const told = knowers.some((p) => words.ask(p, 'news').heard.includes(d.id));
  assert.ok(told, 'and tells of it');
});

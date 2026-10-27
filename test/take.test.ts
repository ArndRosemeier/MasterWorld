import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { walkFrontier } from '../src/vgm/frontier';
import { keepPromise } from '../src/vgm/leads';
import { eventTold, heldBy, lairFor, nextEvent, openBands, refugeOf } from '../src/vgm/events';
import { criesDue } from '../src/vgm/situations';
import { Township } from '../src/game/township';
import { territoryOf, wildFor } from '../src/vgm/wild';
import { TownLife } from '../src/sim/townLife';
import { settlementOf, type Decision, type RegionDecision } from '../src/world/decisions';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = openWorld(seed, classic, SMALL);
const regions = classic.regions!;
const town = terrain.towns[0];
// Walk out from the start until a waystation opens (plan C6: bandits take one), in whichever way has one.
let opened: RegionDecision[] = [];
for (let dir = 0; dir < 8 && !opened.length; dir++) {
  const walked = walkFrontier({ seed, log: first, terrain, regions, home: town.decision }, (dir * Math.PI) / 4, 4, (d) => d.fill === 'waystation' && !!d.site);
  if (walked.at(-1)?.fill === 'waystation') opened = walked;
}
const way = opened.at(-1)!;
terrain.settleMore(opened);
const take = classic.events!.find((e) => e.kind === 'take')!;
const groups = wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, town).map(territoryOf).map((territory) => ({ town: town.decision.id, territory, left: territory.members.length }));
const ctx = (log: Decision[], hours: number) => ({ seed, log, towns: terrain.towns, terrain, hours, setting: classic, inside: () => false, home, wild: groups, which: take.id });

test('take: a waystation opens in the country, an inn and a stable', () => {
  assert.ok(way, 'a waystation within 4 km of the start');
  const w = terrain.town(way.id)!;
  assert.equal(settlementOf(way, regions.fills)?.size, 'waystation');
  assert.deepEqual(w.plan.buildings.map((b) => b.kind).sort(), ['inn', 'stable']);
});

test('take: bandits left alone take the waystation: its folk flee, a band holds it, the rest lie up in a hideout near it', () => {
  const log = [...first, ...opened];
  assert.equal(nextEvent(ctx(log, take.after - 1)), null, 'not before its time');
  const e = nextEvent(ctx(log, take.after + 1))!;
  assert.ok(e, 'the bandits take it');
  assert.equal(e.held, way.id);
  assert.ok(groups.some((g) => g.territory.id === e.from && g.territory.kind === take.by), 'by the bandits');
  const w = terrain.town(way.id)!;
  assert.ok(Math.hypot(e.x - w.decision.x, e.z - w.decision.z) < 40, 'the band is at the waystation');
  const now = [...log, e];
  assert.equal(heldBy(now, way.id)?.id, e.id);
  assert.equal(nextEvent({ ...ctx(now, take.after + 2), early: true }), null, 'one place held at a time');
  assert.equal(openBands(now).length, 1);
  // Its folk are gone while it is held.
  const life = new TownLife(w.plan, seed, take.after + 1);
  assert.ok(life.agents.length > 0);
  life.gone = !!heldBy(now, way.id);
  assert.ok(life.agents.every((a) => life.taskOf(a) === 'away'), 'its folk have fled');
  // Told with the waystation, every word filled in.
  const told = eventTold(classic, now, terrain.towns, e)!;
  assert.ok(told && /waystation/.test(told.news) && !/\{/.test(told.title + told.news + told.note + told.done), told?.news);
  // The lair: a place for a hideout, of the bandits' own kind of dwellers, near the waystation; asked once.
  const lair = lairFor(ctx(now, take.after + 1))!;
  assert.ok(lair, 'a lair');
  assert.equal(lair.event, e.id);
  assert.equal(lair.dwellers, e.encounter);
  assert.ok(classic.dungeons[lair.template]!.form.purposes.includes(take.lair!));
  assert.ok(Math.hypot(lair.site!.x - e.x, lair.site!.z - e.z) < 700, 'near the waystation');
  assert.equal(lairFor(ctx([...now, lair], take.after + 1)), null, 'asked once');
  // Beaten: the folk come home.
  const kept = keepPromise([...now, lair], e.id, take.after + 3)!;
  assert.equal(heldBy([...now, lair, kept], way.id), undefined);
});

test('take: its folk camp by the road outside the band\'s town, one hurt, and cry out; they saw it; freed, they go home', () => {
  const log = [...first, ...opened];
  const e = nextEvent(ctx(log, take.after + 1))!;
  let now: Decision[] = [...log, e];
  const w = terrain.town(way.id)!, band = terrain.town(e.town)!;
  const camp = refugeOf(terrain.towns, e)!;
  assert.ok(camp && camp.town === way.id);
  const out = Math.hypot(camp.x - band.decision.x, camp.z - band.decision.z) - band.decision.radius;
  assert.ok(out > 60 && out < 120, `outside the town they fled to (${out.toFixed(0)} m past its edge)`);
  const t = new Township(w, { seed, setting: classic, log: () => now, hours: () => take.after + 1.5, towns: () => terrain.towns });
  assert.ok(t.posts.some((p) => p.x === camp.x && p.z === camp.z), 'the camp is one of its places out on the land');
  const camped = t.life.agents.filter((a) => a.post && Math.hypot(a.x - camp.x, a.z - camp.z) < 4);
  assert.ok(camped.length >= 2, `some of its folk wait there (${camped.length})`);
  assert.equal(camped.filter((a) => a.act === 'hurt').length, 1, 'one of them hurt');
  // Seen first, then the cry, once.
  const cry = (hero: { x: number; z: number }, cried = new Set<string>()) => criesDue({ log: now, setting: classic, towns: terrain.towns, hero, hours: take.after + 1.5, cried }).filter((c) => c.kind === 'refugees');
  assert.equal(cry({ x: camp.x + 45, z: camp.z }).length, 0);
  const c = cry({ x: camp.x + 10, z: camp.z });
  assert.equal(c.length, 1);
  assert.equal(cry({ x: camp.x + 10, z: camp.z }, new Set([c[0].id])).length, 0, 'once');
  // They saw it themselves.
  const p = camped.find((a) => a.person.role !== 'child')!.person;
  assert.ok(t.talk.topics(p.id).some((x) => x.id === `event:${e.id}`), 'they can be asked of it');
  t.talk.ask(p.id, `event:${e.id}`);
  assert.match(t.talk.ask(p.id, 'source').text, /my own eyes/i);
  // Freed: no one waits at the camp any more.
  now = [...now, keepPromise(now, e.id, take.after + 3)!];
  assert.equal(t.posts.length, 0);
  assert.ok(t.life.agents.every((a) => !a.post), 'they went home');
});

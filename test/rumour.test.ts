import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { townsfolk } from '../src/sim/people';
import { townTalk, talkEvent } from '../src/talk/townTalk';
import { Rumour } from '../src/talk/rumour';
import { wildFor } from '../src/vgm/wild';
import type { Decision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log: first } = startWorld();
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const pd = town.plan.paddocks.find((p) => p.farm >= 0)!;
const AT = 40;
const raid: Decision = { kind: 'event', id: 'event-1', event: 'farm-raid', town: town.decision.id, from: 'wild-1', x: town.decision.x + 300, z: town.decision.z, r: 30, members: ['bandit'], seed: 2, at: AT, paddock: pd.id, taken: 2 };
const wild = wildFor({ seed, log: first, towns: terrain.towns, terrain, hours: 0, setting: classic }, town);
const log: Decision[] = [...first, ...wild, raid];
const house = town.plan.farms[pd.farm].house;

/** A town's talk with its own clock. */
function talking(now: { t: number }) {
  const { talk, folk } = townTalk(seed, classic, town, people, log, undefined, terrain.towns, AT);
  talk.gameHours = () => now.t;
  return { talk, folk };
}

test('rumour: word reaches the house first, then the lane, then the far side of town, and everyone heard it from someone who had it before', () => {
  const g = new Rumour(people, town.plan, seed);
  const witnesses = people.filter((p) => p.home === house && p.role !== 'child').map((p) => p.id);
  const reach = g.reach(witnesses, 0);
  assert.equal(reach.size, people.length, 'everyone is reached in time');
  for (const id of witnesses) assert.equal(reach.get(id)!.at, 0);
  for (const [id, w] of reach) if (!witnesses.includes(id)) {
    assert.ok(reach.get(w.from)!.at < w.at, 'they heard it from someone who had it before');
    assert.ok(w.at > 0);
  }
  const hour = (id: number) => reach.get(id)!.at;
  const own = people.filter((p) => p.home === house && p.role === 'child').map((p) => hour(p.id));
  const far = Math.max(...people.map((p) => hour(p.id)));
  assert.ok(own.every((h) => h < 3), 'the children of the house hear within hours');
  assert.ok(far > 12 && far < 120, `the far side of town hears after ${far.toFixed(1)} h`);
  const within = (h: number) => people.filter((p) => hour(p.id) <= h).length;
  assert.ok(within(3) < within(12) && within(12) < within(48), 'more know as the hours pass');
  // The same seed gives the same ways.
  const again = new Rumour(people, town.plan, seed).reach(witnesses, 0);
  assert.deepEqual([...again], [...reach]);
});

test('rumour: after an event its witnesses say they saw it, their neighbours heard it from them, the far side knows nothing yet, and a day later more know', () => {
  const now = { t: AT + 1 };
  const { talk, folk } = talking(now);
  const witness = folk.find((f) => f.person.home === house && f.person.role !== 'child')!;
  const e = `event:${raid.id}`;
  assert.ok(talkEvent(raid, classic, town, people, log, terrain.towns, AT)!.witnesses.includes(witness.person.id));
  const knows = (id: number) => talk.topics(id).some((t) => t.id === e);
  assert.ok(knows(witness.person.id));
  talk.ask(witness.person.id, e);
  assert.match(talk.ask(witness.person.id, 'source').text, /my own eyes/i);
  const who = new Set(folk.filter((f) => knows(f.person.id)).map((f) => f.person.id));
  assert.ok(who.size >= 1 && who.size < people.length / 2, `an hour after: ${who.size} of ${people.length} know`);
  // A day later more know it, each from someone, and the far side still lags behind the lane.
  now.t = AT + 24;
  const day = folk.filter((f) => knows(f.person.id)).length;
  assert.ok(day > who.size, `a day later ${day} know`);
  now.t = AT + 200;
  assert.equal(folk.filter((f) => knows(f.person.id)).length, people.length, 'in the end everyone');
  const hearer = folk.find((f) => !who.has(f.person.id) && f.person.role !== 'child')!;
  const told = talk.ask(hearer.person.id, e).text;
  assert.match(told, /drove off|fired the barn/i, told);
  const src = talk.ask(hearer.person.id, 'source').text;
  assert.ok(folk.some((f) => f.person.id !== hearer.person.id && src.includes(f.name)), `they name who told them: ${src}`);
});

test('rumour: a public day (nobody saw it) is known to all at once', () => {
  const now = { t: 0 };
  const { talk, folk } = talking(now);
  const plain: Decision = { ...raid, id: 'event-9' };
  talk.addEvent({ id: plain.id, name: 'A feast', told: 'a feast is to come', done: 'the feast was held', over: false, witnesses: [], at: AT });
  assert.ok(folk.every((f) => talk.topics(f.person.id).some((t) => t.id === 'event:event-9')));
});

test('rumour: those who know the land tell of it first-hand, the rest only what they heard from them, and each is asked for the next thing they know', () => {
  const now = { t: 0 };
  const { talk, folk } = talking(now);
  const lore = (id: number) => talk.topics(id).some((t) => t.id === 'lore');
  const hunters = folk.filter((f) => f.persona.pursuits.includes('hunting') && f.person.role !== 'child');
  assert.ok(hunters.length, 'the town has hunters');
  for (const h of hunters) assert.ok(lore(h.person.id), `${h.name} knows the land`);
  const own = classic.talk.lore.source;
  talk.ask(hunters[0].person.id, 'lore');
  assert.match(talk.ask(hunters[0].person.id, 'source').text, new RegExp(own));
  // Before word had time to go anywhere only those who go out there know of it; given the time, all do.
  now.t = -1000;
  const firsthand = folk.filter((f) => lore(f.person.id));
  assert.ok(firsthand.length > 0 && firsthand.length < folk.length / 2, `${firsthand.length} of ${folk.length} know the land first-hand`);
  assert.ok(hunters.every((h) => firsthand.includes(h)));
  now.t = 500;
  assert.ok(folk.every((f) => lore(f.person.id)));
  // A hearer is told it by name.
  const hearer = folk.find((f) => !firsthand.includes(f) && f.person.role === 'homemaker')!;
  const said = talk.ask(hearer.person.id, 'lore').text;
  assert.match(said, /south|north|east|west/, said);
  assert.match(talk.ask(hearer.person.id, 'source').text, /Vane|Hollin|\w+ \w+/);
  // Asked again, they tell another thing when they know one.
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) seen.add(talk.ask(hunters[0].person.id, 'lore').text);
  assert.ok(seen.size >= 3, `${seen.size} things told`);
});

test('rumour: what was heard is saved, and a town made again keeps it', () => {
  const now = { t: AT + 200 };
  const { talk, folk } = talking(now);
  const e = `event:${raid.id}`;
  const hearer = folk.find((f) => f.person.home !== house && f.person.role !== 'child')!;
  talk.ask(hearer.person.id, e);
  const saved = JSON.parse(JSON.stringify(talk.save()));
  assert.ok(Object.keys(saved.learned).length > 0);
  const again = townTalk(seed, classic, town, people, log, saved, terrain.towns, AT).talk;
  again.gameHours = () => AT + 1;
  assert.ok(again.topics(hearer.person.id).some((t) => t.id === e), 'still knows');
  assert.match(again.ask(hearer.person.id, e).text, /drove off|fired the barn/i);
});

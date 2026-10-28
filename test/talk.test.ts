import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { townsfolk } from '../src/sim/people';
import { TownLife } from '../src/sim/townLife';
import { townTalk, TownTalk } from '../src/talk/townTalk';
import { Journal } from '../src/talk/journal';
import { firstDungeon } from '../src/vgm/dungeons';
import { acquaintances } from '../src/game/background';
import { Market } from '../src/game/trade';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const { terrain, log } = openWorld(seed, classic, SMALL);
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const cellar = firstDungeon(log)!;
const inn = people.find((p) => town.plan.buildings[p.home].kind === 'inn' && p.role === 'trade')!;
const household = people.filter((p) => p.home === cellar.building && p.role !== 'child');
// A homemaker of a house far across town from the cellar's.
const fromCellar = (p: (typeof people)[number]) => Math.hypot(town.plan.buildings[p.home].cx - town.plan.buildings[cellar.building].cx, town.plan.buildings[p.home].cz - town.plan.buildings[cellar.building].cz);
const stranger = people.filter((p) => p.home !== inn.home && p.home !== cellar.building && p.role === 'homemaker').sort((a, b) => fromCellar(b) - fromCellar(a))[0];

test('talk: every townsperson has a name, and households share their family name', () => {
  const { folk } = townTalk(seed, classic, town, people, log);
  assert.equal(folk.length, people.length);
  for (const f of folk) assert.match(f.name, /^\S+ \S+$/);
  const byHome = new Map<number, Set<string>>();
  for (const f of folk) if (f.person.role !== 'traveller') (byHome.get(f.person.home) ?? byHome.set(f.person.home, new Set()).get(f.person.home)!).add(f.family);
  for (const s of byHome.values()) assert.equal(s.size, 1, 'one family name per house');
  // A guest keeps a name of their own, and calls the inn after its family.
  const guest = folk.find((f) => f.person.role === 'traveller')!;
  const host = folk.find((f) => f.person.home === guest.person.home && f !== guest)!;
  assert.notEqual(guest.family, host.family);
  assert.equal(guest.house, host.house);
});

test('talk: the household knows first-hand, the inn heard it from them, a stranger knows nothing', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const own = talk.ask(household[0].id, 'news');
  assert.deepEqual(own.heard, [cellar.id]);
  assert.match(own.text, /something is wrong in our cellar/i);
  const innNews = talk.ask(inn.id, 'news');
  assert.deepEqual(innNews.heard, [cellar.id]);
  assert.match(innNews.text, /heard/i, 'hearsay is told as hearsay');
  assert.ok(talk.topics(inn.id).some((t) => t.id === 'source'));
  const source = talk.ask(inn.id, 'source');
  assert.ok(household.some((p) => source.text.includes(talk.nameOf(p.id))), `the inn names who told them: ${source.text}`);
  const none = talk.ask(stranger.id, 'news');
  assert.deepEqual(none.heard, []);
  assert.ok(classic.talk.nothing.includes(none.text), 'plain talk for knowing nothing');
});

test('talk: once heard, the lead is a topic; the household tells the signs one by one', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const p = household[0].id;
  assert.ok(!talk.topics(p).some((t) => t.lead), 'no lead before hearing of it');
  talk.ask(inn.id, 'news');
  const lead = talk.topics(p).find((t) => t.lead)!;
  assert.ok(lead, 'the lead is offered');
  talk.ask(p, lead.id);
  const told = new Set<string>();
  for (let i = 0; i < 4 && talk.topics(p).some((t) => t.id === 'more'); i++) told.add(talk.ask(p, 'more').text);
  assert.ok(told.size >= 2, 'more than one thing to tell');
  assert.ok(talk.ask(p, 'bye').done);
});

test('talk: who they are, from what they do', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const self = talk.ask(inn.id, 'self').text;
  assert.ok(self.includes(talk.nameOf(inn.id)) && self.includes('innkeeper'), self);
});

test('talk: saved and restored, the townsfolk still know what they learned and the leads stay', () => {
  const { talk, folk } = townTalk(seed, classic, town, people, log);
  talk.ask(inn.id, 'news');
  const saved = JSON.parse(JSON.stringify(talk.save()));
  const again = townTalk(seed, classic, town, people, log, saved).talk;
  assert.ok(again.topics(inn.id).some((t) => t.lead));
  assert.ok(again instanceof TownTalk && folk.length === people.length);
  assert.match(again.ask(inn.id, 'news').text, /heard/i);
});

test('talk: the journal keeps one lead per promise, with every new thing told', () => {
  const j = new Journal();
  const mark = { x: 1, z: 2, label: 'the smithy' };
  assert.ok(j.hear('c', 'Something is wrong.', { text: 'a', from: 'A' }, mark));
  assert.equal(j.hear('c', 'Something is wrong.', { text: 'b', from: 'B' }, mark), null);
  j.hear('c', 'Something is wrong.', { text: 'b', from: 'B' }, mark);
  assert.equal(j.open.length, 1);
  assert.deepEqual(j.open[0].notes.map((n) => n.text), ['a', 'b']);
  assert.deepEqual(new Journal(j.entries()).open, j.open);
});

test('talk: someone stopped for a talk stands and faces the player, and goes on when let go', () => {
  const life = new TownLife(town.plan, seed, 10);
  // One stopped on the side they face (someone stopped from behind their work walks round it first).
  const a = life.agents.find((x) => {
    if (x.hidden || x.person.role === 'child') return false;
    life.hold(x, x.x + 1, x.z);
    if (x.path.length === 0) return true;
    life.letGo(x);
    return false;
  })!;
  const at = [a.x, a.z];
  for (let i = 0; i < 50; i++) life.step(0.2, 10);
  assert.deepEqual([a.x, a.z], at, 'stays put');
  assert.equal(a.act, 'chat');
  assert.ok(Math.abs(a.dir) < 1e-9, 'faces the player');
  life.letGo(a);
  assert.ok(!a.held);
  assert.notEqual(a.act, 'chat');
});

test('talk: people who know the hero from before greet them by name, others as usual', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const guard = classic.backgrounds.find((b) => b.id === 'sellsword')!;
  const friends = acquaintances(guard, people);
  assert.ok(friends.length >= 1 && friends.length <= 2);
  assert.equal(friends[0].person, people.find((p) => p.trade === 'carter' && p.role === 'trade') ?? friends[0].person);
  talk.acquaint(friends.map((f) => ({ person: f.person.id, line: f.line })), 'Wenna Hollin');
  assert.match(talk.greet(friends[0].person.id).text, /Wenna Hollin/);
  assert.doesNotMatch(talk.greet(stranger.id).text, /Wenna Hollin/);
});

test('talk: a merchant offers trade as a topic, and asking for it opens the trade window', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const market = new Market(classic, people, seed, 0);
  talk.services = (p) => { const s = market.of(p)?.shop; return s ? [{ id: 'trade', label: s.topic, line: s.line }] : []; };
  const topics = talk.topics(inn.id).map((t) => t.id);
  assert.ok(topics.includes('trade') && topics.indexOf('trade') < topics.indexOf('bye'), topics.join(','));
  assert.ok(!talk.topics(stranger.id).some((t) => t.id === 'trade'), 'a homemaker sells nothing');
  const r = talk.ask(inn.id, 'trade');
  assert.equal(r.opens, 'trade');
  assert.ok(r.done);
  assert.equal(r.text, market.of(inn.id)!.shop.line);
});

test('talk: the household calls the cellar under their own house "our cellar"; the inn names the house', () => {
  const { talk } = townTalk(seed, classic, town, people, log);
  const own = talk.ask(household[0].id, 'news');
  assert.match(own.text, /our cellar/i, own.text);
  assert.doesNotMatch(own.text, /cellar under/i, own.text);
  assert.match(talk.ask(inn.id, 'news').text, /cellar under/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { openPromises } from '../src/vgm/leads';
import { TownLife } from '../src/sim/townLife';
import { townTalk } from '../src/talk/townTalk';
import { marketStart } from '../src/world/town';
import { ARRIVAL, Guide, HAIL, arrivalEntry, hailer, besideHero } from '../src/vgm/guide';
import { SMALL } from './small';

test('guide: the first hail soon after arrival, then each one waits longer; a lead stops it, none left starts it over', () => {
  const g = new Guide();
  const free = { leads: 0, busy: false };
  let t = 0;
  while (!g.due(1, free)) t++;
  assert.ok(t + 1 >= HAIL.first && t + 1 <= HAIL.first + 1, `first hail at ${t + 1} s`);
  g.hailed();
  const gaps: number[] = [];
  for (let k = 0; k < 4; k++) { let s = 0; while (!g.due(1, free)) s++; gaps.push(s + 1); g.hailed(); }
  for (let k = 1; k < gaps.length; k++) assert.ok(gaps[k] >= gaps[k - 1], `gaps grow: ${gaps.join(', ')}`);
  assert.ok(gaps[gaps.length - 1] <= HAIL.most + 1);
  // Busy (talking, in a fight): the clock waits.
  for (let s = 0; s < 5000; s++) assert.equal(g.due(1, { leads: 0, busy: true }), false);
  // A lead heard: nothing more; once it is done, the next comes after a while.
  for (let s = 0; s < 5000; s++) assert.equal(g.due(1, { leads: 1, busy: false }), false);
  let s = 0;
  while (!g.due(1, free)) s++;
  assert.equal(s + 1, HAIL.again);
});

test('guide: the nearest awake person who knows comes, a fresh face next time; nobody from too far', () => {
  const people = [
    { id: 1, x: 10, z: 0, asleep: false, busy: false },
    { id: 2, x: 5, z: 0, asleep: false, busy: false },
    { id: 3, x: 2, z: 0, asleep: true, busy: false },
    { id: 4, x: 1, z: 0, asleep: false, busy: false },
    { id: 5, x: HAIL.reach + 10, z: 0, asleep: false, busy: false },
  ];
  const knows = new Set([1, 2, 3, 5]);
  assert.equal(hailer(people, knows, { x: 0, z: 0 }), 2, 'the nearest who knows and is awake');
  assert.equal(hailer(people, knows, { x: 0, z: 0 }, new Set([2])), 1, 'someone new');
  assert.equal(hailer(people, knows, { x: 0, z: 0 }, new Set([1, 2])), 2, 'again, when nobody new knows');
  assert.equal(hailer(people, new Set([5]), { x: 0, z: 0 }), null, 'too far off');
  const at = besideHero({ x: 10, z: 0 }, { x: 0, z: 0 });
  assert.deepEqual(at, { x: 1.6, z: 0 });
});

test('guide: from a fresh start, someone near the market comes over, waits by the hero, and their news is a lead', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log } = openWorld(seed, classic, SMALL);
  const town = terrain.towns[0];
  const life = new TownLife(town.plan, seed, 8);
  const { talk } = townTalk(seed, classic, town, life.agents.map((a) => a.person), log);
  const hero = marketStart(town.plan);
  for (let s = 0; s < 30; s++) life.step(1, 8 + s / 3600);
  const open = new Set(openPromises(log).map((d) => d.id));
  const knows = talk.knowersOf(open);
  assert.ok(knows.size >= 3, `${knows.size} people know of a promised place`);
  const id = hailer(life.agents.map((a) => ({ id: a.person.id, x: a.x, z: a.z, asleep: a.act === 'sleep' || a.act === 'away', busy: a.person.role === 'child' })), knows, hero);
  assert.notEqual(id, null, 'somebody within reach of the market knows');
  const a = life.agents.find((g) => g.person.id === id)!;
  const at = besideHero(a, hero);
  life.seek(a, at.x, at.z, hero, HAIL.wait);
  let came = -1;
  for (let s = 0; s < 400 && came < 0; s++) {
    life.step(0.5, 8.2 + s / 7200);
    if (a.act === 'chat' && Math.hypot(a.x - at.x, a.z - at.z) < 0.2) came = s / 2;
  }
  assert.ok(came >= 0, `they arrive (now ${a.act} at ${Math.hypot(a.x - hero.x, a.z - hero.z).toFixed(1)} m)`);
  assert.ok(Math.abs(Math.atan2(hero.z - a.z, hero.x - a.x) - a.dir) < 1e-6, 'facing the hero');
  // They wait, then go back to their day.
  for (let s = 0; s < 20; s++) life.step(1, 8.3);
  assert.equal(a.act, 'chat', 'still waiting');
  for (let s = 0; s < HAIL.wait + 10; s++) life.step(1, 8.3);
  assert.equal(a.seek, undefined, 'gave up and went on');
  // Talked to: the hail opens the talk, the news glows and leads somewhere.
  talk.beckon(a.person.id, true);
  assert.ok(classic.talk.beckon.includes(talk.greet(a.person.id).text));
  assert.ok(talk.topics(a.person.id).find((t) => t.id === 'news')?.lead, 'their news glows');
  const news = talk.ask(a.person.id, 'news');
  assert.ok(news.heard.some((h) => open.has(h)), `the news is of a promised place: ${news.text}`);
  assert.ok(!talk.topics(a.person.id).find((t) => t.id === 'news')?.lead, 'asked: it glows no more');
  // The hero's own first page points at the inn.
  const page = arrivalEntry(classic.talk, 'the inn of the Hollin family', { x: 1, z: 2 });
  assert.equal(page.id, ARRIVAL);
  assert.match(page.notes[0].text, /the inn of the Hollin family/);
});

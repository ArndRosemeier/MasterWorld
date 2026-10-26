import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { townsfolk } from '../src/sim/people';
import { talkCellar, townTalk } from '../src/talk/townTalk';
import { Journal } from '../src/talk/journal';
import { firstDungeon } from '../src/vgm/dungeons';
import { nextPromise } from '../src/vgm/leads';
import type { Decision } from '../src/world/decisions';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = openWorld(seed, classic);
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const cellar = firstDungeon(first)!;
const inn = people.find((p) => town.plan.buildings[p.home].kind === 'inn' && p.role === 'trade')!;
const owner = people.find((p) => p.home === cellar.building && p.role !== 'child' && p.role !== 'traveller')!;

/** The opening log and one more promise the Builder makes (the next lead). */
function withNext(): Decision[] {
  const d = nextPromise({ seed, log: first, towns: terrain.towns, home, hours: 1, purposeOverdue: true, inside: () => false, dungeons: classic.dungeons, terrain });
  assert.ok(d, 'the Builder has a next lead');
  return [...first, d];
}

test('report: a quiet place is a topic for its household only, and telling them keeps it', () => {
  const { talk } = townTalk(seed, classic, town, people, first);
  talk.ask(inn.id, 'news');
  const report = `report:${cellar.id}`;
  assert.ok(!talk.topics(owner.id).some((t) => t.id === report), 'nothing to tell before it is quiet');
  assert.ok(talk.clear(cellar.id));
  assert.ok(!talk.clear(cellar.id), 'quiet once');
  const topic = talk.topics(owner.id).find((t) => t.id === report);
  assert.ok(topic?.lead, 'the household can be told, and it glows');
  assert.match(topic.label, /your cellar/i, topic.label);
  assert.ok(!talk.topics(inn.id).some((t) => t.id === report), 'the inn is not whom to tell');
  assert.ok(!talk.topics(owner.id).some((t) => t.id === `lead:${cellar.id}`), 'its old story is no topic any more');
  const r = talk.toldSafe(owner.id, cellar.id, 'Here, 2 silver.');
  assert.equal(r.reported, cellar.id);
  assert.match(r.text, /^Here, 2 silver\./);
  assert.ok(talk.isSettled(cellar.id) && !talk.isQuiet(cellar.id));
  assert.ok(!talk.topics(owner.id).some((t) => t.id === report), 'told once');
});

test('report: once kept, nobody tells of the trouble any more, and the hailer has nobody to send', () => {
  const { talk } = townTalk(seed, classic, town, people, first);
  talk.clear(cellar.id);
  talk.toldSafe(owner.id, cellar.id, 'Thank you.');
  for (const p of [owner, inn]) {
    const news = talk.ask(p.id, 'news');
    assert.deepEqual(news.heard, [], `${talk.nameOf(p.id)} no longer tells of it: ${news.text}`);
    assert.ok(classic.talk.nothing.includes(news.text), news.text);
  }
  assert.equal(talk.knowersOf(new Set([cellar.id])).size, 0);
});

test('report: the household passes on a rumour of the next lead, which the journal can take up', () => {
  const log = withNext();
  const next = log[log.length - 1];
  const { talk } = townTalk(seed, classic, town, people, log);
  talk.clear(cellar.id);
  const r = talk.toldSafe(owner.id, cellar.id, 'Thank you.');
  assert.deepEqual(r.heard, [next.id], r.text);
  assert.ok(r.text.includes(classic.talk.cleared.rumour), r.text);
  // Added while playing (the game's Builder) works the same.
  const { talk: later } = townTalk(seed, classic, town, people, first);
  const c = talkCellar(next, classic, town, people, log);
  if (c) later.add(c);
  later.clear(cellar.id);
  assert.deepEqual(later.toldSafe(owner.id, cellar.id, 'Thank you.').heard, c ? [next.id] : []);
});

test('report: saved and restored, a quiet place still waits to be told and a kept one stays quiet', () => {
  const { talk } = townTalk(seed, classic, town, people, first);
  talk.clear(cellar.id);
  const waiting = townTalk(seed, classic, town, people, first, JSON.parse(JSON.stringify(talk.save()))).talk;
  assert.ok(waiting.topics(owner.id).some((t) => t.id === `report:${cellar.id}`));
  waiting.toldSafe(owner.id, cellar.id, 'Thank you.');
  const kept = townTalk(seed, classic, town, people, first, JSON.parse(JSON.stringify(waiting.save()))).talk;
  assert.ok(kept.isSettled(cellar.id));
  assert.deepEqual(kept.ask(owner.id, 'news').heard, []);
});

test('report: a save from before (paid on leaving) is settled from the log: the old story stops', () => {
  const { talk } = townTalk(seed, classic, town, people, first);
  talk.ask(inn.id, 'news');
  const old = JSON.parse(JSON.stringify(talk.save()));
  delete old.quiet;
  delete old.settled;
  const again = townTalk(seed, classic, town, people, first, old).talk;
  again.hush(cellar.id);
  assert.deepEqual(again.ask(owner.id, 'news').heard, []);
  assert.ok(!again.topics(inn.id).some((t) => t.id === `lead:${cellar.id}`));
});

test('report: the journal says whom to tell, moves the mark to their door, and closes when kept', () => {
  const j = new Journal();
  j.hear('c', 'Something is wrong.', { text: 'a', from: 'A' }, { x: 1, z: 2, label: 'the smithy' });
  j.quiet('c', { text: 'Tell Mara.', from: 'you' }, { x: 5, z: 6, label: 'Mara' });
  assert.deepEqual(j.open[0].mark, { x: 5, z: 6, label: 'Mara' });
  assert.equal(j.open[0].notes.at(-1)?.text, 'Tell Mara.');
  assert.deepEqual(new Journal(j.entries()).open[0].mark, j.open[0].mark);
  j.fulfil('c');
  assert.equal(j.open.length, 0);
});

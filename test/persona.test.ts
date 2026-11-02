import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting, TEMPERAMENTS } from '../src/setting/contract';
import { townsfolk } from '../src/sim/people';
import { townTalk } from '../src/talk/townTalk';
import { ageGroupOf, personaOf } from '../src/talk/persona';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log } = startWorld();
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const { talk, folk } = townTalk(seed, classic, town, people, log);
const def = classic.talk.persona;

/** What someone says of themselves with their own names taken out (what is left is what they are like). */
const bare = (f: (typeof folk)[number], text: string) => text.split(f.name).join('<name>').split(f.given).join('<given>').split(f.house).join('<house>');

test('persona: the setting holds the words and the pursuits, and is valid', () => {
  assert.deepEqual(validateSetting(classic), []);
  assert.ok(def.pursuits.length >= 15);
  for (const t of TEMPERAMENTS) assert.ok(def.temperaments[t].nothing.length >= 3, t);
});

test('persona: the same seed gives the same people, with a temperament, one or two pursuits and a time of life', () => {
  const again = townTalk(seed, classic, town, townsfolk(town.plan, seed), log);
  assert.deepEqual(again.folk.map((f) => f.persona), folk.map((f) => f.persona));
  for (const f of folk) {
    assert.ok(TEMPERAMENTS.includes(f.persona.temperament));
    assert.ok(f.persona.pursuits.length >= 1 && f.persona.pursuits.length <= 2, `${f.name}: ${f.persona.pursuits}`);
    assert.equal(new Set(f.persona.pursuits).size, f.persona.pursuits.length);
    assert.equal(f.persona.ageGroup, ageGroupOf(f.person, def));
    assert.deepEqual(f.persona, personaOf(f.person, def));
    if (f.person.role === 'child') assert.equal(f.persona.ageGroup, 'young');
  }
  assert.ok(new Set(folk.map((f) => f.persona.temperament)).size >= 4, 'a town has all sorts of people');
});

test('persona: pursuits fit the person: children play, trades keep their own', () => {
  for (const f of folk) for (const id of f.persona.pursuits) {
    const d = def.pursuits.find((x) => x.id === id)!;
    if (d.roles) assert.ok(d.roles.includes(f.person.role), `${f.name} (${f.person.role}) has ${id}`);
    if (d.trades) assert.ok(d.trades.includes(f.person.trade), `${f.name} (${f.person.trade}) has ${id}`);
    if (f.person.role === 'child') assert.ok(d.roles?.includes('child'), `${f.name} is a child with ${id}`);
  }
  // Someone of a trade only they take up: the harbour's hands mend nets, now and then.
  const hands = folk.filter((f) => ['harbourmaster', 'warehouse', 'carter'].includes(f.person.trade));
  assert.ok(hands.some((f) => f.persona.pursuits.includes('net_mending')));
});

test('persona: ten townsfolk of one kind give ten different answers to "Who are you?"', () => {
  const homemakers = folk.filter((f) => f.person.role === 'homemaker').slice(0, 10);
  assert.equal(homemakers.length, 10);
  const said = homemakers.map((f) => bare(f, talk.ask(f.person.id, 'self').text));
  assert.equal(new Set(said).size, 10, said.join('\n'));
  // And not only in their names: each tells something of what they do with their hours.
  for (const f of homemakers) {
    const text = talk.ask(f.person.id, 'self').text;
    assert.ok(def.pursuits.find((d) => d.id === f.persona.pursuits[0])!.self.some((l) => text.includes(l)), `${f.name} tells of ${f.persona.pursuits[0]}: ${text}`);
  }
});

test('persona: asked the same, the people answer in their own voices', () => {
  const asked = folk.filter((f) => f.person.role !== 'child').slice(0, 60);
  const answers = asked.map((f) => ({ f, text: talk.ask(f.person.id, 'news').text }));
  // (Those who know of the cellar tell it; the rest know nothing, each in the voice of their temperament.)
  const nothing = answers.filter((a) => def.temperaments[a.f.persona.temperament].nothing.includes(a.text));
  assert.ok(nothing.length >= 20);
  assert.ok(new Set(nothing.map((a) => a.text)).size >= 8, 'many ways of saying "I know nothing"');
  assert.ok(new Set(nothing.map((a) => a.f.persona.temperament)).size >= 4);
  // No two temperaments share a line.
  const owner = new Map<string, string>();
  for (const t of TEMPERAMENTS) for (const l of def.temperaments[t].nothing) {
    assert.ok(!owner.has(l), `"${l}" is said by ${owner.get(l)} and ${t}`);
    owner.set(l, t);
  }
  // Greetings and partings too.
  const greets = new Set(folk.slice(0, 40).map((f) => talk.greet(f.person.id).text));
  assert.ok(greets.size >= 8, `${greets.size} greetings`);
  const byes = new Set(folk.slice(0, 40).map((f) => talk.ask(f.person.id, 'bye').text));
  assert.ok(byes.size >= 8, `${byes.size} partings`);
});

test('persona: a calling of its own is said as it is, and a person of the town is told of by name', () => {
  const guest = folk.find((f) => f.person.role === 'traveller')!;
  const text = talk.ask(guest.person.id, 'self').text;
  assert.ok(text.includes(guest.name) && text.includes('passing through'), text);
  // The home is a place the profile names.
  assert.ok(talk.homeCalled(guest.person.id).length > 0);
});

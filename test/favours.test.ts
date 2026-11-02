import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting, TEMPERAMENTS } from '../src/setting/contract';
import { townsfolk, type Person } from '../src/sim/people';
import { townTalk } from '../src/talk/townTalk';
import { personaOf } from '../src/talk/persona';
import { askMet, askWords, keepsakeOf } from '../src/vgm/asks';
import { promiseCellar } from '../src/vgm/dungeons';
import { FAVOUR, craftAskOf, craftsOf, favourFor, favourHolds, favourWhy } from '../src/vgm/favours';
import { keepPromise } from '../src/vgm/leads';
import { toolOf } from '../src/vgm/toolbox';
import type { DungeonDecision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = startWorld();
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const ask = craftAskOf(classic)!;
const ctx = (log = first, hours = 100) => ({ seed, log, hours, setting: classic, home });
const grown = people.filter((p) => p.role !== 'child' && p.role !== 'traveller');
/** The people of the town who would ask something of their own, as the VGM chooses. */
const askers = grown.flatMap((p) => { const d = favourFor({ town, people, person: p.id }, ctx()); return d ? [{ p, d }] : []; });
/** A favour made by hand for `p` (as the VGM would, but not left to the seed's share). */
function byHand(p: Person, log = first): DungeonDecision | null {
  const pick = craftsOf(classic, log, p)[0], cellar = promiseCellar(seed, town, log, home, 'cellar', undefined, p.home);
  if (!pick || !cellar) return null;
  return { ...cellar, at: 100, ask: { id: ask.id, verb: 'fetch', thing: pick.index, line: 0, want: { person: p.id, kind: 'craft', craft: pick.craft } } };
}

test('favours: the setting holds the words, every thing is a catalogue item of someone\'s calling, and the tool is in the toolbox', () => {
  assert.deepEqual(validateSetting(classic), []);
  assert.equal(ask.verb, 'fetch');
  assert.ok(ask.things!.length >= 20);
  for (const t of ask.things!) {
    assert.ok(classic.items.items.some((i) => i.id === t.item), t.item);
    assert.ok(t.told!.length >= 2 && t.told!.every((l) => l.includes('{thing}')), `${t.item} tells of itself`);
    assert.ok(t.thanks!.includes('{coins}') && t.thanks!.includes('{thing}'), t.item);
  }
  assert.equal(toolOf('favour').asked, 'call');
  // Never a household's ask.
  assert.equal(classic.asks!.filter((a) => a.personal).length, 1);
});

test('favours: a favour is made from who the person is: their pursuit or trade, under their own house, in the log', () => {
  assert.ok(askers.length >= 3, `${askers.length} people would ask`);
  for (const { p, d } of askers) {
    assert.equal(d.kind, 'dungeon');
    assert.equal(d.building, p.home, 'under their own house');
    assert.equal(d.ask!.verb, 'fetch');
    assert.equal(d.ask!.want!.person, p.id);
    assert.equal(d.ask!.want!.kind, 'craft');
    assert.ok(favourHolds(classic, people, d), `${p.id}'s favour reads back from the world`);
    const thing = ask.things![d.ask!.thing!]!, pursuits = personaOf(p, classic.talk.persona).pursuits;
    assert.ok(thing.for!.trades?.includes(p.trade) || pursuits.some((x) => thing.for!.pursuits?.includes(x)), `${p.trade}/${pursuits}: ${thing.item}`);
    assert.ok(['house', 'cottage', 'inn', 'bakery', 'workshop', 'smithy'].includes(town.plan.buildings[d.building]!.kind));
    assert.match(favourWhy(d, { person: String }), /pursuit|trade/);
  }
  // The same seed, the same favour; and no two ask for the same thing.
  const again = favourFor({ town, people, person: askers[0]!.p.id }, ctx());
  assert.deepEqual(again, askers[0]!.d);
  const sample = askers.slice(0, 6).map((a) => a.d.ask!.thing);
  assert.ok(new Set(sample).size >= 2, 'different people lose different things');
  // Not a child, nor one passing through.
  for (const p of people.filter((x) => x.role === 'child' || x.role === 'traveller')) assert.equal(favourFor({ town, people, person: p.id }, ctx()), null);
});

test('favours: rare, never a quest hub: a share of the people, one open at a time, a gap, and each person once', () => {
  assert.ok(askers.length < grown.length * 0.5, `${askers.length} of ${grown.length} would ask`);
  const { p, d } = askers[0]!, others = askers.slice(1);
  const log = [...first, d];
  // One is open: nobody else asks.
  for (const o of others) assert.equal(favourFor({ town, people, person: o.p.id }, ctx(log, 101)), null, 'one open');
  // Kept, but too soon after.
  const kept = [...log, keepPromise(log, d.id, 101)!];
  for (const o of others) assert.equal(favourFor({ town, people, person: o.p.id }, ctx(kept, 100 + FAVOUR.gap - 1)), null, 'a gap');
  // Later another may ask; the first never again.
  const later = others.map((o) => favourFor({ town, people, person: o.p.id }, ctx(kept, 100 + FAVOUR.gap + 1))).filter(Boolean);
  assert.ok(later.length > 0, 'after a gap another asks');
  assert.equal(favourFor({ town, people, person: p.id }, ctx(kept, 1000)), null, 'each person once');
  // The thing named is not given twice.
  for (const l of later) assert.notEqual(l!.ask!.thing, d.ask!.thing);
});

test('favours: only the thing named counts, and the keepsake is the person\'s own, named for their family', () => {
  const { d } = askers[0]!;
  const { talk } = townTalk(seed, classic, town, people, [...first, d]);
  const names = talk.namesFor(d), thing = keepsakeOf(classic, d, names)!;
  assert.ok(thing && thing.name.includes(names.family) && thing.keepsake === d.id, thing?.name);
  assert.equal(askMet(d.ask, { beaten: true, holds: false }), false, 'beating the cellar is not the thing');
  assert.equal(askMet(d.ask, { beaten: false, holds: true }), true);
  const words = askWords(classic, d.ask, names)!;
  assert.ok(words.told.includes(names.family) || words.told.toLowerCase().includes('cellar'), words.told);
  assert.ok(words.thanks.includes('{coins}'));
  assert.ok(words.told.toLowerCase().includes(thing.name.toLowerCase()), words.told);
  assert.ok(ask.things![d.ask!.thing!]!.told!.length >= 2);
});

test('favours: asked in their own manner: blurted at once, told when asked for news, or hinted at until asked again', () => {
  const manners = new Set<string>(), temperaments = new Set<string>();
  for (const p of grown) {
    const d = byHand(p);
    if (!d) continue;
    const { talk, folk } = townTalk(seed, classic, town, people, [...first, d]);
    const f = folk.find((x) => x.person.id === p.id)!, m = classic.talk.persona.temperaments[f.persona.temperament].asking;
    temperaments.add(f.persona.temperament);
    const hello = talk.greet(p.id), told = talk.askOf(d.id)!.told;
    const manner = m.when;
    manners.add(manner);
    if (manner === 'greeting') {
      assert.deepEqual(hello.heard, [d.id], `${f.name} blurts it out`);
      assert.ok(hello.text.includes(told) && m.lead.some((l) => hello.text.includes(l)) && m.close.some((l) => hello.text.includes(l)), hello.text);
      // Said once: the next news is no repeat of it.
      assert.ok(!talk.ask(p.id, 'news').text.includes(told));
      continue;
    }
    assert.deepEqual(hello.heard, [], `${f.name} does not open with it`);
    const first1 = talk.ask(p.id, 'news');
    if (manner === 'again') {
      assert.deepEqual(first1.heard, [], `${f.name} holds back`);
      assert.ok(m.hint!.includes(first1.text), first1.text);
      const second = talk.ask(p.id, 'news');
      assert.deepEqual(second.heard, [d.id]);
      assert.ok(second.text.includes(told));
    } else {
      assert.deepEqual(first1.heard, [d.id], `${f.name} tells it when asked`);
      assert.ok(first1.text.includes(told) && m.lead.some((l) => first1.text.includes(l)), first1.text);
    }
    // Their own house does not say it for them, and they are the one to be told when it is done.
    assert.deepEqual(talk.reportTo(d.id), [p.id]);
    for (const other of people.filter((o) => o.home === p.home && o.id !== p.id && o.role !== 'child')) {
      const r = townTalk(seed, classic, town, people, [...first, d]).talk;
      const said = [r.ask(other.id, 'news').text, r.topics(other.id).some((t) => t.id === 'more') ? r.ask(other.id, 'more').text : ''].join(' ');
      assert.ok(!said.includes(told), `${other.id} of the house tells the person's task: ${said}`);
    }
  }
  assert.ok(manners.size >= 2, `the ways of asking: ${[...manners]}`);
  assert.ok(temperaments.size >= 3, `the temperaments: ${[...temperaments]}`);
  for (const t of TEMPERAMENTS) assert.ok(classic.talk.persona.temperaments[t].asking.close.length > 0);
});

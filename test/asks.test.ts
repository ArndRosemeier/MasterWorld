import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { askFor, askMet, asksGiven, askWords, holdsKeepsake, keepsakeOf, lostOne, verbOf } from '../src/vgm/asks';
import { keepPromise, nextPromise, openPromises } from '../src/vgm/leads';
import { townsfolk } from '../src/sim/people';
import { talkCellar, townTalk } from '../src/talk/townTalk';
import { Character } from '../src/game/character';
import { Delve } from '../src/game/delve';
import { Market } from '../src/game/trade';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import type { Decision, DecisionLog, DungeonDecision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = startWorld();
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const ctx = (log: DecisionLog, hours: number) => ({ seed, log, towns: terrain.towns, home, hours, purposeOverdue: false, inside: () => false, dungeons: classic.dungeons, terrain, asks: classic.asks });

/** The Builder for `hours`, keeping the oldest open promise every two game hours. */
function play(hours: number, s = seed): Decision[] {
  let log: Decision[] = [...first];
  for (let h = 0; h < hours; h += 0.25) {
    const d = nextPromise({ ...ctx(log, h), seed: s });
    if (d) log = [...log, d];
    const k = Math.round(h * 4) % 8 === 0 ? openPromises(log)[0]?.id : null;
    const kd = k ? keepPromise(log, k, h) : null;
    if (kd) log = [...log, kd];
  }
  return log;
}

test('asks: the classic setting\'s asks are valid', () => {
  assert.deepEqual(validateSetting(classic).filter((e) => e.includes('ask')), []);
});

test('asks: new places carry what their household asks, and no kind comes twice in a row (Q2)', () => {
  let fetches = 0, total = 0;
  for (const name of ['masterworld', 'alpha', 'x4', 'q2']) {
    const log = play(48, parseSeed(name));
    const given = asksGiven(log);
    total += given.length;
    fetches += given.filter((k) => k === 'heirloom').length;
    for (let i = 1; i < given.length; i++) assert.notEqual(given[i], given[i - 1], `${name}: ${given.slice(0, i + 1).join(', ')}`);
  }
  // Over two days of play every kind comes up.
  assert.ok(total > 40 && fetches > total * 0.2 && fetches < total * 0.6, `${fetches} fetches of ${total}`);
});

test('asks: the VGM weighs a kind that has waited, and leaves out the last one given', () => {
  const d = testDecision(3) as DungeonDecision;
  const withLast = (id: string): DecisionLog => [{ ...d, id: 'x', ask: { id, verb: id === 'clear' ? 'clear' : 'fetch', line: 0 } }];
  for (let i = 0; i < 40; i++) {
    const p = { decision: { ...d, id: `p${i}` }, lived: true };
    assert.notEqual(askFor(classic, i, withLast('clear'), p)?.id, 'clear');
    assert.notEqual(askFor(classic, i, withLast('heirloom'), p)?.id, 'heirloom');
  }
  // A kind that has waited long comes more often than one just given before the last.
  const recent: DecisionLog = ['lost', 'clear', 'lost', 'heirloom', 'lost', 'clear', 'lost', 'clear'].map((id, k) => ({ ...d, id: `r${k}`, ask: { id, verb: id === 'heirloom' ? 'fetch' : id, line: 0 } }));
  const picks = Array.from({ length: 200 }, (_, i) => askFor(classic, i, recent, { decision: { ...d, id: `q${i}` }, lived: true })!.id);
  assert.ok(picks.filter((k) => k === 'heirloom').length > picks.filter((k) => k === 'lost').length, 'heirloom waited longer than lost');
  // Only one kind fits: it comes again rather than nothing.
  const one = { asks: classic.asks!.filter((a) => a.id === 'heirloom') };
  assert.equal(askFor(one, 1, withLast('heirloom'), { decision: d, lived: true })?.id, 'heirloom');
});

test('asks: a fetch is told by its household and done only by the thing it names (D62)', () => {
  const log = play(24);
  const d = log.find((x): x is DungeonDecision => x.kind === 'dungeon' && x.ask?.verb === 'fetch' && x.town === town.decision.id)!;
  assert.ok(d, 'a fetch in the start town');
  // Told: its household says what they want back, in their name.
  const { talk, folk } = townTalk(seed, classic, town, people, log);
  const family = talk.familyAt(d.building);
  const thing = keepsakeOf(classic, d, { family })!;
  assert.ok(thing.name.includes(family), thing.name);
  const asked = talk.askOf(d.id)!;
  assert.equal(asked.verb, 'fetch');
  const knower = talkCellar(d, classic, town, people, log)!.hint.knowers[0]!;
  assert.ok(folk.length);
  // Asked about it over and over, they come to what they want back.
  let said = '';
  for (let i = 0; i < 3 && !said.toLowerCase().includes(thing.name.toLowerCase()); i++) said += ' ' + talk.ask(knower, i ? 'more' : `lead:${d.id}`).text;
  assert.ok(said.toLowerCase().includes(thing.name.toLowerCase()), said);
  assert.ok(asked.topic.toLowerCase().includes(thing.name.toLowerCase()), asked.topic);
  // Judged only by its thing: the place beaten is not it; the thing in hand is, beaten or not.
  assert.equal(askMet(d.ask, { beaten: true, holds: false }), false);
  assert.equal(askMet(d.ask, { beaten: false, holds: true }), true);
  assert.equal(askMet(null, { beaten: true, holds: false }), true);
  assert.equal(verbOf(log, d.id), 'fetch');
  // Another household's keepsake does not do it.
  const pack = [{ ...thing, keepsake: 'cellar-other' }];
  assert.equal(holdsKeepsake(pack, d.id), false);
  assert.equal(holdsKeepsake([thing], d.id), true);
  assert.ok(askWords(classic, d.ask, { family })!.thanks.includes('{coins}'));
});

test('asks: the keepsake lies in the lair\'s hoard; clearing the place without it does not do the fetch', () => {
  const dec = { ...testDecision(2), ask: { id: 'heirloom', verb: 'fetch', thing: 1, line: 0 } } as DungeonDecision;
  const c = outlineCellar(dec, testHouse(2), classic.dungeons.cellar);
  const space = new DungeonSpace(c.layout);
  const hero = new Character(classic);
  const delve = new Delve(c, space, classic, hero, 4);
  delve.ask = dec.ask!;
  delve.keepsake = keepsakeOf(classic, dec, { family: 'Hollin' });
  for (const k of delve.den.creatures) k.state = 'dead';
  assert.ok(delve.beaten);
  assert.equal(delve.met, false, 'beaten is not fetched');
  // A chest holds no keepsake; the lair's hoard does.
  for (const h of delve.hoards.filter((x) => x.prop)) delve.plunder({ kind: 'hoard', hoard: h, ...h, name: h.name });
  assert.equal(delve.met, false);
  const lair = delve.hoards.find((x) => !x.prop)!;
  delve.plunder({ kind: 'hoard', hoard: lair, ...lair, name: lair.name });
  assert.ok(delve.met);
  const it = hero.pack.find((x) => x.keepsake === dec.id)!;
  assert.equal(it.name, 'The Hollin signet ring');
  // Nobody buys it: it is the household's.
  const market = new Market(classic, people, seed, 0);
  const m = market.merchants.find((x) => x.shop.buys.includes('valuable'))!;
  assert.ok(market.pays(m, { ...it, keepsake: undefined }, 0) > 0, 'a ring like it would sell');
  assert.equal(market.pays(m, it, 0), 0);
});

test('asks: someone lost is one of the town who does not tell of it, never lost twice; found alive or brought home dead (D62)', () => {
  let alive = 0, dead = 0;
  for (const name of ['masterworld', 'alpha', 'x4']) {
    const log = play(48, parseSeed(name));
    const lost = log.filter((x): x is DungeonDecision => x.kind === 'dungeon' && x.ask?.verb === 'lost' && x.town === town.decision.id);
    const who = lost.map((d) => lostOne(people, log, d));
    assert.equal(new Set(who.map((p) => p?.id)).size, who.length, `${name}: nobody is lost twice`);
    for (const [i, d] of lost.entries()) {
      const p = who[i]!;
      assert.ok(p && p.role !== 'trade' && p.role !== 'keeper' && p.role !== 'traveller', `${name}: ${p?.role} is lost`);
      // Those who tell of it are not the one lost.
      assert.ok(!talkCellar(d, classic, town, people, log)!.hint.knowers.includes(p.id));
      const { talk } = townTalk(seed, classic, town, people, log);
      const names = talk.namesFor(d), words = talk.askOf(d.id)!;
      assert.ok(names.who && words.told.includes(names.who.split(' ')[0]!), words.told);
      if (d.ask!.alive) {
        alive++;
        // Found alive: nothing to bring; done only when the hero came up to them.
        assert.equal(keepsakeOf(classic, d, names), null);
        assert.equal(askMet(d.ask, { beaten: true, holds: false }), false, 'clearing the place is not finding them');
        assert.equal(askMet(d.ask, { beaten: false, holds: false, found: true }), true);
        assert.ok(words.found && words.topic.includes(names.who));
      } else {
        dead++;
        const left = keepsakeOf(classic, d, names)!;
        assert.ok(left.name.includes(names.who), left.name);
        assert.equal(askMet(d.ask, { beaten: true, holds: false, found: true }), false);
        assert.equal(askMet(d.ask, { beaten: false, holds: true }), true);
        assert.ok(words.topic.includes('what was left'), words.topic);
      }
    }
  }
  assert.ok(alive > 0 && dead >= 0 && alive + dead >= 3, `${alive} alive, ${dead} dead`);
});

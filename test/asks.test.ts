import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { askFor, askMet, asksGiven, askWords, holdsKeepsake, keepsakeOf, askedOne, verbOf } from '../src/vgm/asks';
import { endingOf, keepPromise, moveInto, nextPromise, openPromises, thiefBack } from '../src/vgm/leads';
import { NightWatch, nightWatchFor } from '../src/vgm/watch';
import { firstDungeon } from '../src/vgm/dungeons';
import { wantOf } from '../src/vgm/wants';
import { townsfolk } from '../src/sim/people';
import { talkCellar, townTalk } from '../src/talk/townTalk';
import { Character } from '../src/game/character';
import { Delve } from '../src/game/delve';
import { Market } from '../src/game/trade';
import { outlineCellar, sketchCellar } from '../src/world/dungeon/cellar';
import { cellarMeshes } from '../src/world/dungeon/cellarMesh';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import type { Decision, DecisionLog, DungeonDecision, PromiseAsk } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = startWorld();
const town = terrain.towns[0];
const people = townsfolk(town.plan, seed);
const ctx = (log: DecisionLog, hours: number) => ({ seed, log, towns: terrain.towns, home, hours, purposeOverdue: false, inside: () => false, dungeons: classic.dungeons, terrain, asks: classic.asks, twists: classic.twists });

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
    const who = lost.map((d) => askedOne(people, log, d));
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

test('asks: a seal\'s breach stands in a wall of the last room, is walled up course by course, and only that does it (D62)', () => {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const dec = { ...testDecision(i), ask: { id: 'breach', verb: 'seal', line: 0 } } as DungeonDecision;
    const c = outlineCellar(dec, testHouse(i), classic.dungeons.cellar);
    const b = c.props.filter((p) => p.kind === 'breach');
    assert.equal(b.length, 1, `cellar ${i}: one breach`);
    assert.equal(b[0]!.room, c.graph.goal, 'in the last room');
    // A place that asks no seal has none.
    assert.ok(!outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar).props.some((p) => p.kind === 'breach'));
    // Drawn: the hole in the props, the stones apart in courses.
    assert.ok(cellarMeshes(c).seal.length >= 4, 'courses of stones to set');
    const hero = new Character(classic), delve = new Delve(c, new DungeonSpace(c.layout), classic, hero, 4);
    delve.ask = dec.ask!;
    for (const k of delve.den.creatures) k.state = 'dead';
    assert.ok(delve.beaten && !delve.met, 'beating what came through is not sealing it');
    // Before it, the hero is offered to wall it up.
    const f = [Math.sin(b[0]!.yaw), Math.cos(b[0]!.yaw)];
    const near = delve.within({ x: b[0]!.x + f[0]! * 1.2, y: b[0]!.y, z: b[0]!.z + f[1]! * 1.2 });
    assert.equal(near?.kind, 'breach');
    delve.seal();
    assert.ok(delve.met && delve.sealed);
    // Kept in the save.
    const again = new Delve(c, new DungeonSpace(c.layout), classic, new Character(classic), 4, delve.tally());
    assert.ok(again.sealed);
    n++;
  }
  assert.equal(n, 8);
});

test('asks: a parley\'s dwellers watch and wait; their leader names terms, and only terms struck do it; a blow breaks it for good (D62)', () => {
  // Only where those who live there can be talked with.
  const d = testDecision(3) as DungeonDecision;
  const fits = (dweller: string) => askFor({ asks: classic.asks!.filter((a) => a.id === 'parley') }, 1, [], { decision: d, lived: true, dweller });
  assert.equal(fits('rats'), null);
  assert.equal(fits('smugglers')?.verb, 'parley');
  for (const terms of ['price', 'pact'] as const) {
    const dec = { ...testDecision(4), dwellers: 'smugglers', ask: { id: 'parley', verb: 'parley', line: 0, terms, ...(terms === 'price' ? { price: 20 } : {}) } } as DungeonDecision;
    const c = outlineCellar(dec, testHouse(4), classic.dungeons.cellar);
    assert.equal(c.dweller.id, 'smugglers');
    const hero = new Character(classic);
    hero.coins = 50;
    const delve = new Delve(c, new DungeonSpace(c.layout), classic, hero, 4);
    delve.ask = dec.ask!;
    assert.ok(delve.den.peace && delve.talking, 'at peace, someone to talk to');
    // Up to their leader: spoken with from a step or two off.
    const k = delve.chief!;
    assert.equal(delve.within({ x: k.x + 2.2, y: k.y, z: k.z })?.kind, 'chief');
    const first = delve.speak()!;
    assert.equal(first.kind, 'terms');
    assert.ok(!delve.met, 'hearing terms is not striking them');
    if (terms === 'price') assert.ok(first.text.includes('20 copper'), first.text);
    assert.equal(delve.speak()!.kind, 'struck');
    assert.ok(delve.met && !delve.failed);
    assert.equal(hero.coins, terms === 'price' ? 30 : 50);
    // Paid off, they go meekly; a pact, they stay at peace.
    if (terms === 'price') assert.ok(delve.den.creatures.every((x) => x.state === 'meek' || x.state === 'dead'));
    else assert.ok(delve.den.peace && !delve.beaten);
    assert.equal(delve.tally().parley, 'struck');
  }
  // Short of the price, they say so and nothing is struck.
  const dec = { ...testDecision(4), dwellers: 'smugglers', ask: { id: 'parley', verb: 'parley', line: 0, terms: 'price', price: 20 } } as DungeonDecision;
  const c = outlineCellar(dec, testHouse(4), classic.dungeons.cellar);
  const poor = new Character(classic);
  poor.coins = 3;
  const delve = new Delve(c, new DungeonSpace(c.layout), classic, poor, 4);
  delve.ask = dec.ask!;
  delve.speak();
  assert.equal(delve.speak()!.kind, 'short');
  assert.equal(poor.coins, 3);
  // A blow before terms: broken, they fight; killing them all is not the parley, and it ends failed.
  const k = delve.chief!;
  k.health -= 1;
  delve.step(0.1, { x: 0, y: 0, z: 0, yaw: 0, speed: 0 });
  assert.equal(delve.parley, 'broken');
  assert.ok(!delve.den.peace && !delve.talking && delve.speak() === null);
  for (const x of delve.den.creatures) x.state = 'dead';
  assert.ok(delve.beaten && !delve.met && delve.failed);
  // Kept in the save: broken stays broken, never at peace again.
  const again = new Delve(c, new DungeonSpace(c.layout), classic, new Character(classic), 4, delve.tally());
  again.ask = dec.ask!;
  assert.ok(!again.den.peace && again.failed);
  // The promise ends failed in the log.
  assert.equal(keepPromise([], dec.id, 3, true)?.failed, true);
});

test('asks: a night watch is kept at the household\'s door: the band comes out of the dark, or the night is watched through; clearing their place is not it (D62)', () => {
  const house = town.plan.buildings.findIndex((b, i) => i > 0 && b.door);
  const door = { x: town.plan.buildings[house]!.door[0], z: town.plan.buildings[house]!.door[1] };
  const watchOf = (comes: boolean): DungeonDecision => ({ ...testDecision(5, 1, 'cave'), id: `cave-watch-${comes}`, town: town.decision.id, building: house, site: { x: door.x + 300, z: door.z, yaw: 0 }, ask: { id: 'watch', verb: 'watch', line: 0, comes, band: 'wolves' } });
  // Only out on the land, and only dwellers who come by night.
  const only = { asks: classic.asks!.filter((a) => a.id === 'watch') };
  assert.equal(askFor(only, 1, [], { decision: testDecision(1), lived: true, dweller: 'goblins', encounter: 'goblins' }), null, 'not a cellar');
  assert.equal(askFor(only, 1, [], { decision: testDecision(1, 1, 'cave'), lived: true, dweller: 'spiders', encounter: 'spiders' }), null, 'not spiders');
  const asked = askFor(only, 1, [], { decision: testDecision(1, 1, 'cave'), lived: true, dweller: 'wolves', encounter: 'wolves' })!;
  assert.equal(asked.verb, 'watch');
  assert.equal(asked.band, 'wolves');
  // The threat comes: nothing by day or away from the door; at the door in the night, a band of them out of the dark.
  const d = watchOf(true);
  let log: DecisionLog = [...first, d];
  const at = (hours: number, hero = door) => ({ seed, log, towns: terrain.towns, hours, hero, setting: classic });
  assert.equal(nightWatchFor(at(12)), null, 'not by day');
  assert.equal(nightWatchFor(at(22.5, { x: door.x + 80, z: door.z })), null, 'not away from the door');
  const band = nightWatchFor(at(22.5))!;
  assert.ok(band && band.watch === d.id && band.members.length > 0, 'a band comes');
  const from = Math.hypot(band.x - door.x, band.z - door.z);
  assert.ok(from > 10 && from < band.r, `out of the dark (${from.toFixed(0)} m), roaming to the door (${band.r} m)`);
  assert.ok(band.x > door.x, 'from the side of their place');
  log = [...log, band];
  assert.equal(nightWatchFor(at(23)), null, 'once a watch');
  // Nothing comes: only the night watched through from its first hour does it; walking off ends the watch.
  const q = watchOf(false);
  log = [...first, q];
  assert.equal(nightWatchFor(at(22.5)), null, 'nothing comes');
  const night = new NightWatch();
  assert.deepEqual(night.step(at(22.2)), []);
  assert.deepEqual(night.step(at(24.5, { x: door.x + 10, z: door.z })), [], 'a step round the house is still watching');
  assert.deepEqual(night.step(at(26.3)), [q.id]);
  const left = new NightWatch();
  left.step(at(22.2));
  left.step(at(23, { x: door.x + 100, z: door.z }));
  assert.deepEqual(left.step(at(26.3)), [], 'walked off');
  const late = new NightWatch();
  late.step(at(25));
  assert.deepEqual(late.step(at(26.3)), [], 'coming at one in the morning is not watching the night');
  // Judged only by the watch.
  assert.equal(askMet(q.ask, { beaten: true, holds: false }), false, 'clearing their place is not the watch');
  assert.equal(askMet(q.ask, { beaten: false, holds: false, watched: true }), true);
});

test('asks: a thief is one of the town; what they stole gives them away, and only facing them does it; caught or let go goes into the log (D62)', () => {
  const house = town.plan.buildings.findIndex((_, i) => i > 2 && people.some((p) => p.home === i));
  const d = { ...testDecision(6), town: town.decision.id, building: house, ask: { id: 'thief', verb: 'thief', line: 0, thing: 0, who: 7 } } as DungeonDecision;
  const log: DecisionLog = [...first, d];
  const thief = askedOne(people, log, d)!;
  assert.ok(thief && thief.home !== house && (thief.role === 'hand' || thief.role === 'homemaker'), `${thief?.role} of house ${thief?.home}`);
  const { talk } = townTalk(seed, classic, town, people, log);
  assert.equal(talk.askOf(d.id)!.thief, thief.id);
  // What they stole lies in the stash, and it gives them away.
  const names = talk.namesFor(d), thing = keepsakeOf(classic, d, names)!;
  assert.ok(names.who === talk.nameOf(thief.id) && thing.lore!.includes(names.who), thing.lore);
  // Faced only with it in hand, and only the thief.
  assert.ok(!talk.topics(thief.id).some((t) => t.id.startsWith('accuse:')), 'not without the thing');
  talk.holding = (id) => id === d.id;
  assert.ok(talk.topics(thief.id).some((t) => t.id === `accuse:${d.id}`));
  const other = people.find((p) => p.id !== thief.id && p.role !== 'child')!;
  assert.ok(!talk.topics(other.id).some((t) => t.id.startsWith('accuse:')), 'nobody else is offered it');
  assert.ok(talk.ask(thief.id, `accuse:${d.id}`).text.length > 10);
  const offered = talk.topics(thief.id).map((t) => t.id);
  assert.ok(offered.includes(`catch:${d.id}`) && offered.includes(`spare:${d.id}`), offered.join(', '));
  const r = talk.ask(thief.id, `spare:${d.id}`);
  assert.deepEqual(r.named, { id: d.id, ending: 'let-go' });
  assert.equal(talk.endingOf(d.id), 'let-go');
  assert.ok(!talk.topics(thief.id).some((t) => t.id.includes(d.id)), 'dealt with');
  // Kept in the save, and the ending goes into the log with the promise kept.
  assert.equal(townTalk(seed, classic, town, people, log, talk.save()).talk.endingOf(d.id), 'let-go');
  assert.equal(keepPromise(log, d.id, 5, false, 'let-go')?.ending, 'let-go');
  // Judged only by the facing: the stash found is not it.
  assert.equal(askMet(d.ask, { beaten: true, holds: true }), false);
  assert.equal(askMet(d.ask, { beaten: false, holds: true, named: true }), true);
});

test('asks: twists come now and then, never the same twist twice running, each seen in the place or heard in talk (Q3)', () => {
  assert.deepEqual(validateSetting(classic).filter((e) => e.includes('twist')), []);
  // Over two days of play: some asks turn out other than told, and the twist given last is not given again.
  let n = 0, total = 0;
  for (const name of ['masterworld', 'alpha', 'x4']) {
    const twisted = play(48, parseSeed(name)).filter((x): x is DungeonDecision => x.kind === 'dungeon' && !!x.ask);
    total += twisted.length;
    const seen = twisted.map((x) => x.ask!.twist).filter(Boolean);
    n += seen.length;
    for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `${name}: ${seen.join(', ')}`);
  }
  assert.ok(n > total * 0.1 && n < total * 0.5, `${n} twists of ${total} asks`);
  // Someone got there first: the bodies lie searched, the strongest is left, hurt.
  const beat = { ...testDecision(4), dwellers: 'smugglers', ask: { id: 'clear', verb: 'clear', line: 0, twist: 'got-there-first' } } as DungeonDecision;
  const c = outlineCellar(beat, testHouse(4), classic.dungeons.cellar);
  const delve = new Delve(c, new DungeonSpace(c.layout), classic, new Character(classic), 4);
  const full = delve.chief!.health;
  delve.ask = beat.ask!;
  const alive = delve.den.creatures.filter((x) => x.state !== 'dead');
  assert.ok(delve.den.creatures.length > 1 && alive.length === 1 && alive[0]!.health < full, `${alive.length} of ${delve.den.creatures.length} alive`);
  for (const x of delve.den.creatures.filter((k) => k.state === 'dead')) assert.equal(delve.within(x)?.kind === 'body', false, 'already searched');
  assert.ok(!delve.beaten, 'not done for the hero');
  const again = new Delve(c, new DungeonSpace(c.layout), classic, new Character(classic), 4, delve.tally());
  again.ask = beat.ask!;
  assert.equal(again.den.creatures.filter((x) => x.state !== 'dead').length, 1, 'the save keeps it, nothing more falls');
  // The place changed since it was told: other dwellers there than the town speaks of.
  let changed = 0;
  for (let i = 0; i < 6; i++) {
    const d = { ...testDecision(i), ask: { id: 'clear', verb: 'clear', line: 0, twist: 'changed' } } as DungeonDecision;
    const lore = classic.dungeons.cellar, told = sketchCellar(d, testHouse(i), lore, undefined, true), found = sketchCellar(d, testHouse(i), lore);
    if (found.dweller.id !== told.dweller.id) changed++;
    assert.equal(outlineCellar(d, testHouse(i), lore).dweller.id, found.dweller.id, 'the place holds what is there now');
  }
  assert.ok(changed >= 5, `${changed} of 6 changed`);
  // The household lied: the thing bears another family's mark, and their household can be given it.
  const house = town.plan.buildings.findIndex((_, i) => i > 2 && people.some((p) => p.home === i));
  const lied = { ...testDecision(7), town: town.decision.id, building: house, ask: { id: 'heirloom', verb: 'fetch', line: 0, thing: 1, twist: 'not-theirs' } } as DungeonDecision;
  const log: DecisionLog = [...first, lied];
  const { talk } = townTalk(seed, classic, town, people, log);
  const names = talk.namesFor(lied), thing = keepsakeOf(classic, lied, names)!;
  assert.ok(names.other && names.other !== names.family && thing.lore!.includes(names.other), thing.lore);
  const owner = people.find((p) => p.home === talk.askOf(lied.id)!.rightful && p.role !== 'child')!;
  assert.ok(!talk.topics(owner.id).some((t) => t.id.startsWith('give:')), 'not without the thing');
  talk.holding = (id) => id === lied.id;
  assert.ok(talk.topics(owner.id).some((t) => t.id === `give:${lied.id}`));
  assert.deepEqual(talk.ask(owner.id, `give:${lied.id}`).named, { id: lied.id, ending: 'given' });
});

test('asks: endings feed what comes next, replayed from the log: a thief let go comes back, a pact or a sealed breach stays as it ended (Q4)', () => {
  const house = town.plan.buildings.findIndex((_, i) => i > 2 && people.some((p) => p.home === i));
  const robbed = { ...testDecision(6), id: 'cellar-robbed', town: town.decision.id, building: house, ask: { id: 'thief', verb: 'thief', line: 0, thing: 0, who: 7 } } as DungeonDecision;
  const ended = (ending: string): DecisionLog => [...first, robbed, keepPromise([...first, robbed], robbed.id, 5, false, ending)!];
  // Caught: not again. Let go: after a day, the town's next place under a house is robbed again, by the same one.
  const next = (log: DecisionLog) => { for (let h = 30; h < 80; h += 0.25) { const d = nextPromise(ctx(log, h)); if (d?.kind === 'dungeon' && d.town === town.decision.id && !d.site) return d; if (d) log = [...log, d]; } return null; };
  assert.equal(endingOf(ended('let-go'), robbed.id), 'let-go');
  assert.equal(thiefBack(ended('caught'), robbed, 40), null);
  assert.equal(thiefBack(ended('let-go'), robbed, 20), null, 'they keep their word a while');
  const back = next(ended('let-go'))!;
  assert.ok(back && back.ask?.verb === 'thief' && back.ask.again === robbed.id, JSON.stringify(back?.ask));
  const log = [...ended('let-go'), back];
  assert.equal(askedOne(people, log, back)?.id, askedOne(people, log, robbed)?.id, 'the same thief');
  const { talk } = townTalk(seed, classic, town, people, log);
  assert.ok(talk.askOf(back.id)!.told.includes(talk.namesFor(back).who), talk.askOf(back.id)!.told);
  assert.equal(thiefBack(log, robbed, 80), null, 'back once');
  // A pact's dwellers, or a breach walled up: nobody new moves in there.
  const d = firstDungeon(first)!;
  const keptAs = (ending?: string): DecisionLog => [...first, keepPromise(first, d.id, 1, false, ending)!];
  const moved = (log: DecisionLog) => [0, 1, 2, 3, 4, 5].some((s) => moveInto({ ...ctx(log, 400) }, s)?.dungeon === d.id);
  assert.ok(moved(keptAs()), 'cleared, someone moves in later');
  assert.ok(!moved(keptAs('pact')), 'a pact holds');
  assert.ok(!moved(keptAs('sealed')), 'walled up stays shut');
});

test('asks: tasks come from what people want, and the log traces each back to who wanted it and why (Q5)', () => {
  // A trader with a rival of the same trade in town suspects them; the eldest of a house, old now, wants back what is left.
  const byHouse = (h: number) => ({ ...testDecision(8), town: town.decision.id, building: h }) as DungeonDecision;
  const houses = [...new Set(people.map((p) => p.home))];
  const rivalHouse = houses.find((h) => wantOf(people, byHouse(h))?.kind === 'rival');
  assert.ok(rivalHouse !== undefined, 'a trader with a rival');
  const w = wantOf(people, byHouse(rivalHouse!))!;
  const me = people.find((p) => p.id === w.person)!, them = people.find((p) => p.id === w.rival)!;
  assert.ok(me.home === rivalHouse && me.trade === them.trade && them.home !== rivalHouse, `${me.trade} / ${them.trade}`);
  // The want pulls its ask: a rival's household mostly asks to find the thief, and the thief is the rival.
  let thieves = 0;
  for (let i = 0; i < 40; i++) {
    const a: PromiseAsk = askFor(classic, i, [], { decision: { ...byHouse(rivalHouse!), id: `w${i}` }, lived: false, want: w })!;
    if (a.verb !== 'thief') { assert.equal(a.want, undefined, 'a want only rides the ask it called for'); continue; }
    thieves++;
    assert.deepEqual(a.want, w);
    const d: DungeonDecision = { ...byHouse(rivalHouse!), id: `w${i}`, ask: a };
    assert.equal(askedOne(people, [...first, d], d)?.id, them.id, 'the rival did it');
  }
  assert.ok(thieves > 20, `${thieves} of 40 ask for the thief`);
  // Over two days of play, asks carry wants; each traced back to someone of that household.
  let traced = 0;
  for (const name of ['masterworld', 'alpha', 'x4']) {
    for (const d of play(48, parseSeed(name))) {
      if (d.kind !== 'dungeon' || !d.ask?.want || d.town !== town.decision.id) continue;
      const who = people.find((p) => p.id === d.ask!.want!.person);
      assert.equal(who?.home, d.building, 'the one who wants it lives there');
      traced++;
    }
  }
  assert.ok(traced > 0, 'some tasks come from a want');
});

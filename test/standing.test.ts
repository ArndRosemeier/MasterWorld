import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { nameFolk } from '../src/talk/folk';
import { TownTalk } from '../src/talk/townTalk';
import { Market } from '../src/game/trade';
import { plainItem } from '../src/game/items';
import { Standing, atLeast, changeLine, householdOf, tierFloor, tierOf } from '../src/game/standing';
import type { Decision } from '../src/world/decisions';

const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
const folk = townsfolk(plan, 3);
/** Standing with the dwarves set to `n`. */
const at = (s: Standing, n: number) => { s.change('dwarf', n - s.value('dwarf')); return s; };

test('standing: each people starts at its regard for a stranger, its own kin higher; tiers by number', () => {
  const s = new Standing(classic, 'human');
  assert.equal(s.tier('dwarf'), 'stranger');
  assert.equal(s.value('human'), classic.peoples.find((p) => p.id === 'human')!.kin);
  assert.equal(new Standing(classic, 'dwarf').tier('dwarf'), 'friend', 'a dwarf hero is a friend of the dwarves from the start');
  assert.deepEqual([-80, -30, 0, 30, 80].map(tierOf), ['hated', 'unwelcome', 'stranger', 'friend', 'honoured']);
  for (const t of ['hated', 'unwelcome', 'stranger', 'friend', 'honoured'] as const) assert.equal(tierOf(tierFloor(t)), t);
  assert.ok(atLeast(15, 'friend') && !atLeast(14, 'friend'));
  // Clamped, and a new hero starts afresh.
  s.change('dwarf', -500);
  assert.equal(s.value('dwarf'), -100);
  s.begin('dwarf');
  assert.equal(s.value('dwarf'), 30);
  assert.deepEqual(new Standing(classic, 'elf', s.save()).save(), s.save(), 'saved and loaded');
});

test('standing: reputation changes prices: a dwarf smith asks more of the disliked and pays a friend better', () => {
  const m = new Market(classic, folk, 3, 0);
  const smith = m.merchants.find((x) => x.shop.keeper === 'smith')!;
  assert.equal(smith.race, 'dwarf', 'dwarves keep the smithy');
  const s = new Standing(classic, 'human');
  m.standing = s;
  const axe = plainItem(classic.items, 'bearded-axe'), find = plainItem(classic.items, 'short-sword');
  const price = (n: number) => { at(s, n); return { asks: m.asks(smith, axe, 10), pays: m.pays(smith, find, 10) }; };
  const stranger = price(0), hated = price(-80), honoured = price(80);
  assert.ok(hated.asks > stranger.asks * 1.15, `hated pays ${hated.asks} for what a stranger pays ${stranger.asks}`);
  assert.ok(honoured.asks < stranger.asks, `honoured ${honoured.asks} < ${stranger.asks}`);
  assert.ok(hated.pays < stranger.pays && honoured.pays > stranger.pays, 'and what they pay for a find moves the other way');
  assert.ok(honoured.pays < honoured.asks, 'never more than they ask');
  // Another people's merchant does not care what the dwarves think.
  const inn = m.merchants.find((x) => x.shop.keeper === 'innkeeper')!;
  const bread = plainItem(classic.items, 'bread');
  at(s, -80);
  const a = m.asks(inn, bread, 10);
  at(s, 80);
  assert.equal(m.asks(inn, bread, 10), a);
});

test('standing: reputation changes greetings: a friend is welcomed, the unwelcome hear nothing, the hated are refused', () => {
  const s = new Standing(classic, 'human');
  const talk = new TownTalk(nameFolk(folk, plan, classic.names, classic.talk, 3), classic.talk, []);
  talk.manner = (p) => s.manner(p.race, p.seed);
  const smith = folk.find((p) => p.trade === 'smith' && p.role === 'trade')!;
  const dwarf = classic.peoples.find((p) => p.id === 'dwarf')!;
  const greet = (n: number) => { at(s, n); return talk.greet(smith.id).text; };
  assert.ok(dwarf.greet.stranger!.includes(greet(0)), 'a stranger: the dwarves\' wary greeting');
  assert.ok(dwarf.greet.friend!.includes(greet(30)), 'a friend: their warm one');
  assert.ok(dwarf.greet.honoured!.includes(greet(80)));
  at(s, -30);
  assert.ok(dwarf.curt.includes(talk.ask(smith.id, 'news').text), 'unwelcome: they keep their news to themselves');
  assert.ok(talk.topics(smith.id).length > 2, 'but they still talk');
  assert.ok(dwarf.refuse.includes(greet(-80)), 'hated: refused');
  assert.deepEqual(talk.topics(smith.id).map((t) => t.id), ['bye'], 'and nothing to ask but farewell');
  // The humans in town do not hold the dwarves' grudge.
  const human = folk.find((p) => p.race === 'human' && p.role === 'homemaker')!;
  assert.ok(talk.topics(human.id).length > 2);
});

test('standing: deeds: a kept promise raises the household\'s people most, gifts cost more each time and stop at their limit', () => {
  const s = new Standing(classic, 'human');
  const changes = s.keptFor('dwarf');
  const own = changes.find((c) => c.people.id === 'dwarf')!, other = changes.find((c) => c.people.id === 'elf')!;
  assert.equal(own.to - own.from, classic.standing.kept);
  assert.ok(other.to - other.from < own.to - own.from && other.to > other.from, 'word gets round the others');
  const g = classic.standing.gift, prices: number[] = [];
  for (let i = 0; i < 10; i++) { const p = s.giftPrice('dwarf'); if (p === null) break; prices.push(p); s.gift('dwarf'); }
  assert.ok(prices.length >= 1 && prices.every((p, i) => !i || p > prices[i - 1]), `rising: ${prices.join(', ')}`);
  assert.equal(s.value('dwarf'), Math.max(g.upTo, classic.standing.kept));
  assert.equal(s.giftPrice('dwarf'), null, 'no buying honour');
  assert.match(changeLine({ people: classic.peoples[1], from: 10, to: 16, tier: 'friend' }), /dwarves think better of you: you are a friend/);
});

test('standing: whose promise it was: the household of a dungeon, or of the dungeon a move-in moved into', () => {
  const home = folk.find((p) => p.role === 'homemaker')!;
  const log: Decision[] = [
    { kind: 'dungeon', id: 'cellar-1', template: 'cellar', town: 'town-1', building: home.home, seed: 1, setPiece: 'x' },
    { kind: 'move-in', id: 'move-1', dungeon: 'cellar-1', dweller: 'rats', seed: 2, at: 5 },
  ];
  assert.equal(householdOf(log, 'cellar-1', folk)?.home, home.home);
  assert.equal(householdOf(log, 'move-1', folk)?.home, home.home);
  assert.equal(householdOf(log, 'nothing', folk), null);
});

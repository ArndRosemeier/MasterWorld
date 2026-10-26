import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { hitChance, strike, threatOf } from '../src/sim/combat';
import { Character } from '../src/game/character';
import { coinText, rarityOdds, rollItem, rollLoot } from '../src/game/items';
import { fightBot } from '../src/game/bot';
import { outlineCellar, CELL, type Cellar } from '../src/world/dungeon/cellar';
import { cellarDanger, hoardsOf } from '../src/world/dungeon/treasure';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSpace } from '../src/world/dungeon/space';
import { DungeonNav, navKey } from '../src/sim/dungeonNav';
import { Den, type Quarry } from '../src/sim/creatures';
import { Delve } from '../src/game/delve';

const cellars: Cellar[] = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));
const openSpace = (c: Cellar) => { const s = new DungeonSpace(c.layout); for (const pl of c.layout.links) s.open.add(pl.link.id); return s; };
const away: Quarry = { x: 1e4, y: 0, z: 1e4, noise: 0, light: 0, alive: true, guard: { defence: 10, armour: 0 } };

test('fight: the setting names only things that exist', () => {
  assert.deepEqual(validateSetting(classic), []);
  const bad = { ...classic, creatures: [...classic.creatures, { ...classic.creatures[0], id: 'rat', loot: 'nowhere' }] };
  const errors = validateSetting(bad).join('\n');
  for (const want of ['"rat" defined twice', 'loot "nowhere"']) assert.ok(errors.includes(want), errors);
});

test('fight: blows land by skill against dodging, armour takes its share, never nothing', () => {
  assert.ok(hitChance(50, 10) > hitChance(10, 50));
  assert.ok(hitChance(0, 100) >= 0.08 && hitChance(100, 0) <= 0.96);
  const rng = new Rng(3);
  let hits = 0, dmg = 0;
  for (let i = 0; i < 2000; i++) {
    const s = strike({ damage: [4, 8], kind: 'cut', skill: 30 }, { defence: 20, armour: 3 }, rng);
    if (s.outcome !== 'miss') { hits++; dmg += s.damage; assert.ok(s.damage >= 1); }
  }
  assert.ok(Math.abs(hits / 2000 - hitChance(30, 20)) < 0.04, `hit share ${hits / 2000}`);
  assert.ok(dmg / hits > 2 && dmg / hits < 8);
  const a = strike({ damage: [4, 8], kind: 'cut', skill: 30 }, { defence: 20, armour: 3 }, new Rng(9));
  assert.deepEqual(a, strike({ damage: [4, 8], kind: 'cut', skill: 30 }, { defence: 20, armour: 3 }, new Rng(9)));
  assert.equal(threatOf(2, 15), 'trivial');
  assert.equal(threatOf(15, 15), 'even');
  assert.equal(threatOf(40, 15), 'deadly');
});

test('fight: a fresh hero is about power 15; skills grow by use, slower when high, hardly against the trivial', () => {
  const h = new Character(classic);
  assert.ok(h.power > 11 && h.power < 19, `power ${h.power}`);
  assert.equal(h.health, h.maxHealth);
  const gain = (level: number, challenge: number) => {
    const c = new Character(classic);
    c.skills.set('blades', level);
    c.practise('blades', challenge);
    return c.skills.get('blades')! - level;
  };
  assert.ok(gain(10, 8) > gain(60, 30) * 2, 'slower when high');
  assert.ok(gain(40, 1) < gain(40, 20) / 5, 'little from a rat when good');
  // A hundred fights' worth of blows against fitting foes makes a real difference, but no master.
  const c = new Character(classic);
  for (let i = 0; i < 400; i++) c.practise('blades', 10 + c.skill('blades') * 0.4);
  assert.ok(c.skills.get('blades')! > 25 && c.skills.get('blades')! < 70, `${c.skills.get('blades')}`);
  assert.ok(c.power > h.power + 3);
});

test('fight: finds have rarities by danger, legendary only where it is dangerous', () => {
  const cat = classic.items, rng = new Rng(5);
  const count = (danger: number) => {
    const n: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < 3000; i++) n[rollItem(cat, 'short-sword', danger, rng).rarity]++;
    return n;
  };
  const low = count(5), high = count(25);
  assert.equal(low.legendary, 0);
  assert.ok(high.legendary > 0 && high.rare > low.rare && high.uncommon > low.uncommon, JSON.stringify({ low, high }));
  assert.ok(rarityOdds(10).uncommon < 0.4);
  const rare = Array.from({ length: 400 }, () => rollItem(cat, 'mace', 12, rng)).find((i) => i.rarity === 'rare')!;
  assert.ok(rare.name.includes('Heavy') || Object.keys(rare.bonuses).length === 2, rare.name);
  assert.ok(Object.values(rare.bonuses).every((v) => v > 0));
  // Potions are plain; loot is seeded.
  assert.equal(rollItem(cat, 'potion', 30, rng).rarity, 'common');
  assert.deepEqual(rollLoot(cat, 'lair', 15, new Rng(1)), rollLoot(cat, 'lair', 15, new Rng(1)));
  assert.equal(coinText(12345), '1 gold, 23 silver, 45 copper');
  assert.equal(coinText(0), '0 copper');
});

test('fight: wearing a find raises its skills; a potion heals', () => {
  const h = new Character(classic);
  const blade = { def: 'short-sword', rarity: 'rare' as const, name: 'Keen Short sword of the Edge', bonuses: { blades: 6, dodge: 3 } };
  const before = h.skill('blades');
  h.pack.push(blade);
  h.equip(blade);
  assert.equal(h.skill('blades'), before + 6);
  assert.ok(h.pack.some((i) => i.def === 'short-sword' && i.rarity === 'common'), 'the old one went into the pack');
  h.health = 10;
  const pot = h.remedy!;
  assert.ok(h.consume(pot) > 0 && h.health > 10);
  const saved = JSON.parse(JSON.stringify(h.save()));
  assert.equal(new Character(classic, saved).skill('blades'), h.skill('blades'));
  // Taking it off: back into the pack, the bonus gone.
  h.unequip('main');
  assert.equal(h.worn.main, undefined);
  assert.ok(h.pack.includes(blade));
  assert.equal(h.skill('blades'), before);
});

test('fight: creatures can walk from the hatch to every room, along the walls, never through them', () => {
  for (const c of cellars.slice(0, 10)) {
    const s = openSpace(c), nav = new DungeonNav(s);
    const h = c.hatch, start = nav.at(h.x, h.y + 0.3, h.z)!;
    assert.ok(start, 'the hatch stands in the cellar');
    const seen = nav.distances(start, 400);
    for (const r of c.layout.rooms) {
      const cell = nav.cell(r.x, r.z, r.level)!;
      assert.ok(seen.has(navKey(cell)), `${c.decision.id}: room ${r.id} reachable`);
      // Every leg of the way is clear of the walls.
      let at = nav.centre(start);
      for (const p of nav.way(start, cell, 400)) {
        const n = Math.ceil(Math.hypot(p.x - at.x, p.z - at.z) / 0.25);
        for (let k = 1; k < n; k++) {
          const x = at.x + ((p.x - at.x) * k) / n, z = at.z + ((p.z - at.z) * k) / n;
          assert.ok(s.sdf(x, Math.max(at.y, p.y) + 1, z) > 0, `${c.decision.id}: way to room ${r.id} cuts a wall at ${x.toFixed(1)},${z.toFixed(1)}`);
        }
        at = p;
      }
    }
  }
});

test('fight: left alone, a den stays busy at home (never just standing about)', () => {
  for (const c of cellars.slice(0, 6)) {
    const den = new Den(openSpace(c), c.spawns, classic.creatures, 7);
    let standing = 0, total = 0;
    for (let t = 0; t < 90; t += 0.1) {
      den.step(0.1, away);
      for (const k of den.creatures) { total++; if (k.act === 'stand') standing++; }
    }
    assert.ok(standing / total < 0.35, `${c.decision.id}: standing ${(standing / total).toFixed(2)}`);
    for (const k of den.creatures) {
      const r = c.layout.rooms[k.home];
      assert.ok(k.x >= r.x * CELL - 0.5 && k.x <= (r.x + r.w) * CELL + 0.5 && k.z >= r.z * CELL - 0.5 && k.z <= (r.z + r.d) * CELL + 0.5, 'still at home');
    }
  }
});

test('fight: they notice a lit, running hero close by, not one sneaking far off in the dark', () => {
  const c = cellars.find((x) => x.dweller.id === 'goblins')!;
  const lair = c.layout.rooms[c.graph.goal];
  const at = { x: (lair.x + lair.w / 2) * CELL, y: lair.level * 2.8, z: (lair.z + lair.d / 2) * CELL };
  const loud = new Den(openSpace(c), c.spawns, classic.creatures, 1);
  let noticed = false;
  for (let t = 0; t < 3 && !noticed; t += 0.1) noticed = loud.step(0.1, { ...away, ...at, x: at.x + 1.5, noise: 1, light: 9 }).some((e) => e.kind === 'notice');
  assert.ok(noticed);
  const quiet = new Den(openSpace(c), c.spawns, classic.creatures, 1);
  for (let t = 0; t < 3; t += 0.1) assert.ok(!quiet.step(0.1, { ...away, ...at, x: at.x + 40, noise: 0.05, light: 0 }).some((e) => e.kind === 'notice'));
});

test('fight: the begging goblin pleads in broken Common and is spared when left alone', () => {
  const c = cellars.find((x) => x.spawns.some((s) => s.surprise))!;
  const i = c.spawns.findIndex((s) => s.surprise);
  const only = { ...c, spawns: [c.spawns[i]] };
  const den = new Den(openSpace(only), only.spawns, classic.creatures, 2);
  const g = den.creatures[0];
  const pleas: string[] = [];
  let spared = false;
  for (let t = 0; t < 40 && !spared; t += 0.1) {
    const near = t < 20;
    for (const e of den.step(0.1, { ...away, x: g.x + (near ? 2 : 30), y: g.y, z: g.z, noise: 1, light: 9 })) {
      if (e.kind === 'plea') pleas.push(e.text);
      if (e.kind === 'spared') spared = true;
    }
  }
  assert.ok(pleas.length >= 1 && pleas[0].includes('No hurt'), pleas.join(' / '));
  assert.ok(spared && g.state === 'meek' && den.beaten);
});

test('fight: a fresh hero clears rats and goblins most times, and does not walk through spiders', () => {
  const by = new Map<string, boolean[]>();
  for (const [i, c] of cellars.entries()) {
    const r = fightBot(c, classic, i, undefined, 400);
    by.set(c.dweller.id, [...(by.get(c.dweller.id) ?? []), r.won]);
  }
  const share = (k: string) => { const v = by.get(k) ?? []; return v.length ? v.filter(Boolean).length / v.length : null; };
  for (const [k, lo] of [['rats', 0.8], ['goblins', 0.6]] as const) {
    const s = share(k);
    if (s !== null) assert.ok(s >= lo, `${k}: ${s}`);
  }
  for (const k of ['spiders', 'ghoul']) { const s = share(k); if (s !== null) assert.ok(s <= 0.34, `${k}: ${s}`); }
  assert.ok(by.has('goblins') && by.size >= 3, [...by.keys()].join(','));
});

test('fight: a cellar has its danger and its treasure: chests and the hoard in the lair', () => {
  for (const c of cellars.slice(0, 8)) {
    const d = cellarDanger(c, classic.creatures);
    assert.ok(d > 0 && d <= c.dweller.danger * 1.4 + 2, `${c.dweller.id}: ${d} vs ${c.dweller.danger}`);
    const h = hoardsOf(c, classic.creatures);
    assert.equal(h.filter((x) => !x.prop).length, 1);
    assert.equal(h[h.length - 1].room, c.graph.goal);
  }
});

test('fight: a delve saves who fell and what was taken, and a load finds the same bodies and chests', () => {
  const c = cellars.find((x) => x.dweller.id === 'rats')!;
  const hero = new Character(classic);
  const d = new Delve(c, openSpace(c), classic, hero, 4);
  const victim = d.den.creatures[0];
  d.den.wound(victim, { outcome: 'hit', damage: 500 }, victim);
  const loot = d.fight.restoreBody(victim);
  if (loot.items.length || loot.coins) assert.equal(d.within({ x: victim.x + 0.5, y: victim.y, z: victim.z })?.kind, 'body');
  const lair = d.hoards[d.hoards.length - 1];
  const coins = hero.coins;
  const got = d.plunder({ kind: 'hoard', hoard: lair, x: lair.x, y: lair.y, z: lair.z, name: lair.name })!;
  assert.ok(got && hero.coins === coins + got.coins);
  assert.equal(d.plunder({ kind: 'hoard', hoard: lair, x: lair.x, y: lair.y, z: lair.z, name: lair.name }), null, 'a hoard is opened once');
  const saved = JSON.parse(JSON.stringify(d.tally()));
  const again = new Delve(c, openSpace(c), classic, new Character(classic), 4, saved);
  assert.equal(again.den.creatures[0].state, 'dead');
  assert.ok(again.hasOpened(lair));
  assert.deepEqual(again.fight.bodies.get(victim.id) ?? { items: [], coins: 0 }, loot);
});

test('fight: every past gives its skills and kit, and a fresh hero of any past is a fair start (power 10-20)', () => {
  for (const bg of classic.backgrounds) {
    const h = new Character(classic);
    h.beginAs(bg);
    assert.equal(h.background, bg.id);
    for (const s of classic.skills) assert.equal(h.skills.get(s.id), s.start + (bg.skills[s.id] ?? 0));
    assert.equal(h.worn.main?.def, bg.kit.worn.main);
    assert.equal(h.pack.length, bg.kit.pack.length);
    assert.equal(h.coins, bg.kit.coins);
    assert.equal(h.health, h.maxHealth);
    assert.ok(h.power > 9 && h.power < 21, `${bg.id}: power ${h.power}`);
    assert.equal(new Character(classic, JSON.parse(JSON.stringify(h.save()))).background, bg.id);
  }
});

test('fight: the target plate reads all who fight the hero at once, not the one alone', () => {
  const c = cellars.find((x) => x.dweller.id === 'rats')!;
  const d = new Delve(c, openSpace(c), classic, new Character(classic), 4);
  const [one, ...rest] = d.den.creatures;
  assert.deepEqual(d.fight.threat(one), { threat: threatOf(one.def.danger, d.fight.hero.power), together: false });
  for (const o of [one, ...rest]) o.state = 'fight';
  const all = [one, ...rest].reduce((a, o) => a + o.def.danger, 0);
  assert.deepEqual(d.fight.threat(one), { threat: threatOf(all, d.fight.hero.power), together: rest.length > 0 });
});

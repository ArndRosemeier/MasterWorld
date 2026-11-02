import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateFactions } from '../src/setting/contract';
import { Standing } from '../src/game/standing';
import { factionIds, hostility, opposed } from '../src/sim/factions';
import { Township } from '../src/game/township';
import { frontierLand } from './frontierLand';

// D65: every creature and townsperson has a faction; the matrix between them is constant; only the hero's standing moves.
const ids = new Set(factionIds(classic));

test('factions: every creature kind belongs to a known faction, and the setting\'s matrix is sound', () => {
  assert.deepEqual(validateFactions(classic, 'classic'), []);
  for (const c of classic.creatures) assert.ok(ids.has(c.faction), `${c.id} -> ${c.faction}`);
  // Every faction of the setting has somebody in it, or is a people (townsfolk) or kept for what comes later.
  const later = new Set(['watch', 'cutthroats']);
  for (const f of classic.factions.others) assert.ok(later.has(f.id) || classic.creatures.some((c) => c.faction === f.id), `${f.id} has members`);
});

test('factions: every townsperson belongs to a people that is a faction', () => {
  const { terrain, seed } = frontierLand({ own: true });
  const folk = terrain.towns.slice(0, 2).flatMap((town) => new Township(town, { seed, setting: classic, log: () => [], hours: () => 12, towns: () => terrain.towns }).residents);
  assert.ok(folk.length > 20);
  for (const p of folk) assert.ok(ids.has(p.race), `${p.role} ${p.race}`);
});

test('factions: the matrix is the same both ways round, a faction is its own ally, and the lawless, the dead and the wild are set against whom they should be', () => {
  for (const a of ids) for (const b of ids) assert.equal(hostility(classic, a, b), hostility(classic, b, a), `${a} ${b}`);
  for (const a of ids) assert.equal(hostility(classic, a, a), 'ally');
  assert.ok(opposed(classic, 'predators', 'prey'), 'wolves hunt deer');
  assert.ok(opposed(classic, 'goblins', 'smugglers'));
  assert.ok(opposed(classic, 'undead', 'human') && opposed(classic, 'undead', 'prey') && opposed(classic, 'undead', 'goblins'), 'the dead go for the living');
  assert.ok(opposed(classic, 'watch', 'goblins') && !opposed(classic, 'watch', 'human'), 'the watch stands with the town');
  assert.equal(hostility(classic, 'human', 'dwarf'), 'neutral');
  assert.equal(hostility(classic, 'prey', 'vermin'), 'neutral');
});

test('factions: the hero starts as a stranger to the lawless and by their people with the peoples, and old saves get the new factions', () => {
  const dwarf = new Standing(classic, 'dwarf');
  assert.equal(dwarf.tier('dwarf'), 'friend');
  for (const f of classic.factions.others) assert.equal(dwarf.value(f.id), f.regard, f.id);
  assert.equal(dwarf.tier('goblins'), 'unwelcome');
  assert.equal(dwarf.tier('undead'), 'hated');
  const old = new Standing(classic, 'human').save();
  const of = Object.fromEntries(Object.entries(old.of).filter(([k]) => classic.peoples.some((p) => p.id === k)));
  const loaded = new Standing(classic, 'human', { ...old, of: { ...of, dwarf: 40 } });
  assert.equal(loaded.value('dwarf'), 40);
  assert.equal(loaded.value('bandits'), -20);
  assert.deepEqual(new Standing(classic, 'human', loaded.save()).save(), loaded.save());
});

test('factions: killing moves standing with the victim\'s faction down and with its foes up, only as far as the setting says, and beasts and peoples do not count', () => {
  const s = new Standing(classic, 'dwarf'), k = classic.factions.kill;
  const was = (id: string) => s.value(id);
  const humans = was('human');
  assert.ok(humans < k.upTo);
  const out = s.slain('goblins');
  assert.equal(s.value('goblins'), -30 + k.own);
  assert.ok(out.some((c) => c.people.id === 'goblins'));
  assert.equal(was('human'), humans + k.foes, 'the town\'s people think better of it');
  assert.ok(s.value('smugglers') > 0 && s.value('watch') > 10, 'and goblins\' other foes');
  assert.equal(was('dwarf'), classic.peoples.find((p) => p.id === 'dwarf')!.kin, 'the hero\'s own people already think more of them');
  for (let i = 0; i < 30; i++) s.slain('goblins');
  for (const f of ['human', 'watch', 'smugglers']) assert.ok(s.value(f) <= Math.max(k.upTo, classic.peoples.find((p) => p.id === f)?.kin ?? -99, classic.factions.others.find((o) => o.id === f)?.regard ?? -99), `${f} not past ${k.upTo} by killing`);
  assert.equal(s.value('goblins'), -100);
  assert.deepEqual(s.slain('prey'), [], 'beasts hear of nothing');
  assert.deepEqual(s.slain('dwarf'), [], 'a people\'s losses belong to the deed (a hold\'s guard)');
});

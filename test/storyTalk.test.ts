import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Township } from '../src/game/township';
import { keepPromise } from '../src/vgm/leads';
import type { Decision } from '../src/world/decisions';
import { seed, terrain, walk, EAST } from './frontierLand';

const town = terrain.towns[0];
const pd = town.plan.paddocks.find((p) => p.farm >= 0)!;
const raid: Decision = { kind: 'event', id: 'event-1', event: 'farm-raid', town: town.decision.id, from: 'wild-1', x: town.decision.x + 300, z: town.decision.z, r: 30, members: ['bandit'], seed: 2, at: 40, paddock: pd.id, taken: 2 };

test('story talk: the town knows its story events; a raided farm\'s household saw it, and once it is over they tell how it ended', () => {
  let log: Decision[] = [...walk(1, EAST), raid];
  const t = new Township(town, { seed, setting: classic, log: () => log, hours: () => 41, towns: () => terrain.towns });
  const words = t.talk;
  const house = town.plan.farms[pd.farm].house;
  const witness = t.residents.find((p) => p.home === house && p.role !== 'child')!;
  const other = t.residents.find((p) => p.home !== house && p.role !== 'child')!;
  for (const p of [witness, other]) assert.ok(words.topics(p.id).some((x) => x.id === 'event:event-1'), `${p.id} can be asked`);
  const told = words.ask(other.id, 'event:event-1').text;
  assert.match(told, /drove off|fired the barn/i, told);
  words.ask(witness.id, 'event:event-1');
  assert.match(words.ask(witness.id, 'source').text, /my own eyes/i);
  assert.match(words.ask(other.id, 'source').text, /whole town/i);
  // Beaten: the band's promise kept; they tell how it ended.
  log = [...log, keepPromise(log, 'event-1', 44)!];
  t.ended('event-1');
  const after = words.ask(other.id, 'event:event-1').text;
  assert.match(after, /beaten|home again/i, after);
  // A town made after it ended knows it ended.
  const later = new Township(town, { seed, setting: classic, log: () => log, hours: () => 45, towns: () => terrain.towns });
  assert.match(later.talk.ask(other.id, 'event:event-1').text, /beaten|home again/i);
});

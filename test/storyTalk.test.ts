import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Township } from '../src/game/township';
import { keepPromise } from '../src/vgm/leads';
import { fadedFor, openEvents, takenFrom } from '../src/vgm/events';
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

test('story talk: an event left alone runs its course unseen; the raiders keep the beasts, and the town tells how it ended', () => {
  const def = classic.events!.find((e) => e.id === 'farm-raid')!;
  let log: Decision[] = [...walk(1, EAST), raid];
  const ctx = (hours: number, hero?: { x: number; z: number }) => ({ seed, log, towns: terrain.towns, terrain, hours, setting: classic, inside: () => false, ...(hero ? { hero } : {}) });
  assert.ok(def.fades, 'a raid runs its course');
  assert.equal(fadedFor(ctx(raid.at + def.fades! - 1)), null, 'not before its time');
  assert.equal(fadedFor(ctx(raid.at + def.fades! + 1, { x: raid.x + 50, z: raid.z })), null, 'never under the hero\'s eyes');
  const k = fadedFor(ctx(raid.at + def.fades! + 1, { x: raid.x + 2000, z: raid.z }))!;
  assert.ok(k && k.kind === 'kept' && k.faded && k.promise === raid.id);
  const t = new Township(town, { seed, setting: classic, log: () => log, hours: () => raid.at + 1, towns: () => terrain.towns });
  const other = t.residents.find((p) => p.home !== town.plan.farms[pd.farm].house && p.role !== 'child')!;
  t.talk.ask(other.id, 'event:event-1');
  log = [...log, k];
  assert.equal(openEvents(log).length, 0, 'over');
  assert.equal(takenFrom(log, town.decision.id).get(pd.id), 2, 'the beasts are gone for good');
  assert.equal(fadedFor(ctx(raid.at + def.fades! + 2)), null, 'once');
  t.ended(raid.id);
  const after = t.talk.ask(other.id, 'event:event-1').text;
  assert.match(after, /moved on|gone for good/i, after);
  // Beaten instead: home again.
  const beaten = [...log.slice(0, -1), keepPromise(log.slice(0, -1), raid.id, 50)!];
  assert.equal(takenFrom(beaten, town.decision.id).size, 0);
});

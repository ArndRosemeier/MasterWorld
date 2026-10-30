import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { Township } from '../src/game/township';
import { festivityFor, festivityOrder, festivityTold, isMarketDay, type FestivityContext } from '../src/vgm/festivities';
import { keepPromise, nextPromise } from '../src/vgm/leads';
import type { Decision } from '../src/world/decisions';
import { EAST, frontierLand } from './frontierLand';

const { home, seed, terrain, walk } = frontierLand({ own: true });

const town = terrain.towns[0];
const base = walk(1, EAST);
const promise = nextPromise({ seed, log: base, towns: terrain.towns, terrain, home, hours: 5, purposeOverdue: true, inside: () => false, dungeons: classic.dungeons })!;
const ctx = (log: readonly Decision[], hours: number, over: Partial<FestivityContext> = {}): FestivityContext => ({ seed, log, towns: terrain.towns, hours, setting: classic, ...over });
const market = classic.festivities!.find((f) => f.kind === 'market')!;

test('festivities: the setting\'s good days are sound', () => {
  assert.deepEqual(validateSetting(classic), []);
  assert.ok(promise && promise.kind === 'dungeon');
});

test('festivities: the town the hero did a deed for feasts them the next evening, once, and its people know of it', () => {
  const log: Decision[] = [...base, promise, keepPromise([...base, promise], promise.id, 30)!];
  const d = festivityFor(ctx(log, 30.5))!;
  assert.ok(d && d.kind === 'festivity' && d.for === promise.id && d.town === (promise.kind === 'dungeon' ? promise.town : ''));
  assert.equal(d.from, 24 + 18, 'this evening');
  assert.equal(festivityFor(ctx([...log, d], 31)), null, 'once');
  assert.equal(festivityFor(ctx(log, 30 + 30)), null, 'not for a deed long past');
  const faded: Decision[] = [...base, promise, { ...keepPromise([...base, promise], promise.id, 30)!, faded: true }];
  assert.equal(festivityFor(ctx(faded, 30.5)), null, 'not for a thing that ran its course');
  const order = festivityOrder(terrain.towns, d)!;
  assert.ok(order.kind === 'gather' && order.from === d.from && order.to === d.to);
  const told = festivityTold(classic, [...log, d], terrain.towns, d)!;
  assert.ok(told && !/\{/.test(told.title + told.news + told.told + told.done) && /cleared/.test(told.news), told?.news);
  // Its people know of it, and once it is over they tell it as past.
  const now: Decision[] = [...log, d];
  let hours = 31;
  const t = new Township(town, { seed, setting: classic, log: () => now, hours: () => hours, towns: () => terrain.towns });
  const p = t.residents.find((x) => x.role !== 'child')!;
  assert.ok(t.talk.topics(p.id).some((x) => x.id === `event:${d.id}`));
  assert.match(t.talk.ask(p.id, `event:${d.id}`).text, /feast/i);
  hours = d.to + 1;
  t.ended(d.id);
  assert.match(t.talk.ask(p.id, `event:${d.id}`).text, /feasted/i);
});

test('festivities: each town holds its market day every few days, in the morning, where the hero is', () => {
  const days = Array.from({ length: market.every! * 2 }, (_, k) => k + 2).filter((day) => isMarketDay(seed, market, town.decision.id, day));
  assert.equal(days.length, 2, 'once every few days');
  const day = days[0], morning = day * 24 + market.hours[0] - 1;
  assert.equal(festivityFor(ctx(base, morning)), null, 'not without the hero there');
  const d = festivityFor(ctx(base, morning, { near: town }))!;
  assert.ok(d && d.festivity === market.id && d.from === day * 24 + market.hours[0] && !d.for);
  assert.equal(festivityFor(ctx([...base, d], morning + 1, { near: town })), null, 'once that day');
  assert.equal(festivityFor(ctx(base, (day + 1) * 24 + market.hours[0], { near: town })), null, 'not the next day');
  assert.equal(festivityFor(ctx(base, day * 24 + market.hours[1] + 1, { near: town })), null, 'not after its hours');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { keepPromise, nextPromise, openPromises } from '../src/vgm/leads';
import { eventTold, gatherFor, nextEvent, openBands, openEvents } from '../src/vgm/events';
import { Wilds } from '../src/sim/wild';
import type { Decision } from '../src/world/decisions';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = openWorld(seed, classic, SMALL);
const towns = terrain.towns;
const after = classic.events![0].after;

/** The world's first leads, promised at hour 0, then left alone. */
function leftAlone(): Decision[] {
  let log: Decision[] = [...first];
  for (let h = 0; h < 2; h += 0.1) {
    const d = nextPromise({ seed, log, towns, home, hours: h, purposeOverdue: false, inside: () => false, dungeons: classic.dungeons, terrain });
    if (d) log = [...log, d];
  }
  return log;
}
const ctx = (log: Decision[], hours: number, inside = (_: string) => false) => ({ seed, log, towns, terrain, hours, setting: classic, inside });

test('events: a place left alone too long spills its dwellers onto the land: the ledger, the land and the leads change', () => {
  const log = leftAlone();
  assert.ok(openPromises(log).length >= 2);
  assert.equal(nextEvent(ctx(log, after - 1)), null, 'not before its time');
  assert.ok(nextEvent({ ...ctx(log, 3), early: true }), 'unless asked for now (the debug menu)');
  const e = nextEvent(ctx(log, after + 1));
  assert.ok(e, 'an event once it is due');
  assert.equal(e!.kind, 'event');
  assert.ok(openPromises(log).some((p) => p.id === e!.from), 'from an open promise');
  assert.ok(e!.members.length >= 2 && terrain.waterDepth(e!.x, e!.z) === 0);
  const now = [...log, e!];
  // The land: the band roams there, in the wild's simulation.
  const bands = openBands(now);
  assert.equal(bands.length, 1);
  const wilds = new Wilds(bands, terrain, classic.creatures);
  assert.equal(wilds.bands[0].den.creatures.length, e!.members.length);
  // The leads: told in the town's words, pointing at the band; the town gathers to talk it over.
  const told = eventTold(classic, now, towns, e!)!;
  assert.ok(told && /came up out of|come up out of/.test(told.news) && !/\{/.test(told.news + told.note + told.done), told?.news);
  const order = gatherFor(classic, towns, e!);
  assert.ok(order && order.kind === 'gather' && order.to > order.from);
  // One at a time per town (its cooldown), and never under the hero's feet.
  assert.equal(nextEvent(ctx(now, after + 2)), null);
  assert.equal(nextEvent(ctx(log, after + 1, () => true)), null);
  // Dealt with: the band is gone from the land and the lead is closed.
  const kept = keepPromise(now, e!.id, after + 3)!;
  assert.equal(openEvents([...now, kept]).length, 0);
  assert.equal(openBands([...now, kept]).length, 0);
});

test('events: the same ledger gives the same event (a save replays it)', () => {
  const log = leftAlone();
  assert.deepEqual(nextEvent(ctx(log, after + 1)), nextEvent(ctx(log, after + 1)));
});

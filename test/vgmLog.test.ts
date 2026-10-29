import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Director } from '../src/vgm/director';
import { TOOLS, toolOf, vgmTurn } from '../src/vgm/toolbox';
import { PACING, toolFor, vgmLines, VgmWatch } from '../src/vgm/vgmLog';
import type { Decision, DungeonDecision } from '../src/world/decisions';
import { EAST, frontierLand } from './frontierLand';

const { home, seed, terrain, walk } = frontierLand();

// The VGM's log (D53, C8): every move has its line, with the tool, its need and why.

test('vgm log: every decision a tool writes has a line, with that tool and its need', () => {
  const walked = walk(3, EAST);
  const turn = vgmTurn({ seed, log: walked, towns: terrain.towns, terrain, home, hours: 5, purposeOverdue: true, inside: () => false, setting: classic });
  assert.ok(turn.length >= 1, 'the turn made a promise');
  const promise = turn[0].decision as DungeonDecision;
  assert.equal(promise.kind, 'dungeon');
  const road = (id: string, at?: number): Decision => ({ kind: 'road', id, way: 'track', from: home.id, to: 'region-1', pts: [0, 0, 10, 10], ...(at !== undefined ? { at } : {}) });
  // The kinds the game writes when asked (a fight, the debug menu, the cart): one each, by hand.
  const asked: Decision[] = [
    { kind: 'wild', id: 'wild-1', town: home.id, group: 'wolves', encounter: 'wolves', members: ['wolf'], x: 0, z: 0, r: 50, seed: 1, at: 6 },
    { kind: 'event', id: 'event-1', event: 'farm-raid', town: home.id, from: 'wild-1', x: 0, z: 0, r: 30, members: ['bandit'], seed: 2, at: 7 },
    { ...promise, id: 'cellar-9', event: 'event-1', at: 8 },
    { kind: 'move-in', id: 'move-in-1', dungeon: promise.id, dweller: 'rats', seed: 5, at: 8.5 },
    road('road-9', 8.7),
    { kind: 'kept', id: 'kept-1', promise: promise.id, at: 9 },
    { kind: 'kept', id: 'kept-2', promise: 'event-1', at: 9.5, faded: true },
    { kind: 'retake', id: 'retake-1', dungeon: promise.id, dweller: 'rats', seed: 4, at: 10 },
    { kind: 'order', id: 'order-1', town: home.id, order: { kind: 'stayIn', from: 10, to: 12 } },
    { kind: 'journey', id: 'journey-1', from: home.id, to: 'region-2', fare: 20, at: 11, arrive: 13 },
    { kind: 'sight', id: 'sight-1', sight: 'cairn', x: 10, z: 10, yaw: 0, seed: 6, at: 12 },
    { kind: 'stray', id: 'stray-1', town: home.id, paddock: 0, x: 30, z: 10, seed: 8, at: 12.6, until: 14, situation: 'stray-beast' },
    { kind: 'festivity', id: 'festivity-1', festivity: 'feast', town: home.id, at: 12.7, from: 18, to: 22, for: promise.id },
    { kind: 'traveller', id: 'traveller-1', town: home.id, x: 20, z: 10, yaw: 0, seed: 7, at: 12.5, until: 14.5 },
  ];
  const log = [road('road-1'), ...walked, ...turn.map((m) => m.decision), ...asked];
  const lines = vgmLines(log, turn);
  assert.equal(lines.length, log.length, 'one line per decision');
  const kinds = new Set(TOOLS.flatMap((t) => t.writes));
  assert.deepEqual(new Set(lines.map((l) => l.kind)), kinds, 'every kind a tool writes is in this log');
  for (const l of lines) {
    const t = toolOf(l.tool);
    assert.ok(t.writes.includes(l.kind), `${l.id}: ${l.tool} writes ${l.kind}`);
    assert.equal(l.need, t.need, `${l.id}: the need is its tool's`);
    assert.ok(l.reason.length > 4, `${l.id}: says why`);
  }
  // The turn's own reason (what it read) wins over what the decision says of itself.
  assert.equal(lines.find((l) => l.id === promise.id)!.reason, turn[0].reason);
  assert.equal(toolFor(asked[2], log), 'event', 'an event\'s lair is the event\'s');
  assert.equal(toolFor(promise, log), 'promise');
  assert.equal(toolFor(log[0], log), 'open-world', 'roads laid before the first region are the world\'s first');
  assert.equal(toolFor(asked[4], log), 'road', 'later ones the road tool\'s');
});

test('vgm log: the pacing changes how fast the needs grow', () => {
  const quiet = { fighting: 0, pressure: 0, health: 1, talking: false, underground: false, inTown: false, leads: 0 };
  const grown = (pace: number) => {
    const d = new Director(classic.director);
    d.pace = pace;
    for (let s = 0; s < 600; s++) d.observe(1, quiet);
    return d.needs;
  };
  const calm = grown(PACING.calm), normal = grown(PACING.normal), eventful = grown(PACING.eventful);
  for (const n of ['discovery', 'challenge', 'reward'] as const) {
    assert.ok(Math.abs(normal[n] - classic.director.needs[n] * 10) < 1e-6, `${n}: ten minutes at the setting's rate`);
    assert.ok(calm[n] < normal[n] && normal[n] < eventful[n], n);
    assert.ok(Math.abs(eventful[n] / calm[n] - PACING.eventful / PACING.calm) < 1e-6, n);
  }
});

test('vgm log: the watch for its alerts gives each new move once, not what was there before', () => {
  const sight = (id: string): Decision => ({ kind: 'sight', id, sight: 'cairn', x: 0, z: 0, yaw: 0, seed: 1, at: 1 });
  const before = [sight('sight-1'), sight('sight-2')];
  const watch = new VgmWatch(before.length);
  assert.deepEqual(watch.see(before), [], 'what the log held is not news');
  const later = [...before, sight('sight-3'), sight('sight-4')];
  assert.deepEqual(watch.see(later).map((l) => l.id), ['sight-3', 'sight-4']);
  assert.equal(watch.see(later).length, 0, 'each move once');
  assert.equal(watch.see([sight('other-1')]).length, 0, 'a shorter log (another game) starts over from its end');
  assert.deepEqual(watch.see([sight('other-1'), sight('other-2')]).map((l) => l.tool), ['sight']);
});

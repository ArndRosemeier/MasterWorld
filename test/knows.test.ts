import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { KIN_HOURS, stanceFor } from '../src/vgm/stance';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';
import { foeLine } from '../src/game/foeSpeech';
import type { DecisionLog, DungeonDecision, WildDecision } from '../src/world/decisions';
import { nextPromise } from '../src/vgm/leads';
import { frontierLand } from './frontierLand';

// D64 (R4): the VGM decides what a group knows of the hero from the log; the den attacks at once, the speaker says why.
const { terrain, first, home, seed } = frontierLand({ own: true });
const towns = terrain.towns;
const place = nextPromise({ seed, log: first, towns, terrain, home, hours: 5, purposeOverdue: true, inside: () => false, dungeons: classic.dungeons }) as DungeonDecision;
const base = (over: Partial<DungeonDecision> = {}): DungeonDecision => ({ ...place, ...over });
const ctx = (log: DecisionLog, group: { id: string; members: string[]; town?: string }, hours = 100) => ({ setting: classic, log, towns, hours, group });
const wild = (over: Partial<WildDecision> = {}): WildDecision => ({ kind: 'wild', id: 'night-1', town: place.town, group: 'night', encounter: 'wolves', members: ['wolf'], x: 0, z: 0, r: 5, seed: 1, at: 50, ...over });

test('stance tool: a band that came out on the hero\'s night watch knows who was sent, until the watch is kept', () => {
  const asked = base({ id: 'cellar-w', ask: { id: 'watch', verb: 'watch', line: 0, comes: true, band: 'goblins' } });
  const band = wild({ watch: asked.id, members: ['goblin', 'goblin'] });
  const group = { id: band.id, members: band.members as string[], town: band.town };
  assert.equal(stanceFor(ctx([asked, band], group)), 'hired');
  assert.equal(stanceFor(ctx([asked, band, { kind: 'kept', id: 'k1', promise: asked.id, at: 60 }], group)), null, 'the watch kept, they are strangers again');
  assert.equal(stanceFor(ctx([wild({ members: ['goblin'] })], { id: 'night-1', members: ['goblin'] })), null, 'a band of the wild is no hired quarry');
});

test('stance tool: a place cleared lately in the town gives its kind a reason, for three days, and no other kind', () => {
  const lair = base({ id: 'cellar-k' });
  const kept = { kind: 'kept' as const, id: 'k2', promise: lair.id, at: 90 };
  const kin = (id: string, hours = 100, at = 'elsewhere') => stanceFor(ctx([lair, kept], { id: at, members: [id], town: place.town }, hours)) === 'kin';
  const knowing = classic.creatures.filter((c) => kin(c.id));
  assert.ok(knowing.length > 0, 'the lair\'s own kind knows');
  assert.equal(new Set(knowing.map((c) => c.faction)).size, 1, `only one faction knows (${knowing.map((c) => c.id).join(', ')})`);
  assert.ok(!kin(knowing[0].id, 90 + KIN_HOURS + 1), 'word fades');
  assert.equal(stanceFor(ctx([lair, kept], { id: lair.id, members: [knowing[0].id], town: place.town })), null, 'not the place that was cleared itself');
});

test('stance tool: the den attacks at once with the reason, and the speaker has a line for it', () => {
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const guard = { defence: 20, armour: 1, open: false };
  for (const reason of ['hired', 'kin'] as const) {
    const d = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: 3 }, () => ({ creature: 'bandit', room: 0 })), classic.creatures, 5);
    d.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });
    d.knows = reason;
    const out: DenEvent[] = [];
    for (let t = 0; t < 2; t += 0.1) out.push(...d.step(0.1, { x: 8, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard } as Quarry));
    const b = out.find((e) => e.kind === 'break')!;
    assert.ok(b.kind === 'break' && b.cause === reason);
    assert.equal(d.fighting.length, 3);
    assert.ok(foeLine(classic, b.who.def, reason, 1, 0));
  }
});

test('stance tool: a band far weaker than the hero says so once and keeps back, and a friend\'s band says nothing of it', () => {
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const guard = { defence: 20, armour: 1, open: false };
  const q = (extra: Partial<Quarry> = {}): Quarry => ({ x: 8, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard, daunts: 99, ...extra });
  const run = (extra: Partial<Quarry>) => {
    const d = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: 3 }, () => ({ creature: 'bandit', room: 0 })), classic.creatures, 5);
    d.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });
    const out: DenEvent[] = [];
    for (let t = 0; t < 12; t += 0.1) out.push(...d.step(0.1, q(extra)));
    return { d, out };
  };
  const weak = run({});
  assert.deepEqual(weak.out.filter((e) => e.kind === 'warn').map((e) => (e as { turn: string }).turn), ['yield']);
  assert.equal(weak.d.fighting.length, 0);
  assert.equal(run({ regard: () => 'friend' }).out.filter((e) => e.kind === 'warn' && e.turn === 'yield').length, 0);
});

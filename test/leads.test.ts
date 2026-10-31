import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { LEADS, keepPromise, nextPromise, openPromises, occupationOf } from '../src/vgm/leads';
import { loreOf, placeOf } from '../src/vgm/dungeons';
import { townsfolk } from '../src/sim/people';
import { talkCellar, townTalk } from '../src/talk/townTalk';
import { isEmpty, moveIn, occupantId, outlineCellar } from '../src/world/dungeon/cellar';
import type { Decision, DecisionLog, DungeonDecision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = startWorld();
const town = terrain.towns[0];
const ctx = (log: DecisionLog, hours: number, purposeOverdue = false) => ({ seed, log, towns: terrain.towns, home, hours, purposeOverdue, inside: () => false, dungeons: classic.dungeons, terrain });

/** Plays the Builder for `hours`, checking every few minutes; keeps whatever `keep` says. */
function play(hours: number, keep: (log: DecisionLog, h: number) => string | null, overdue = () => false): Decision[] {
  let log: Decision[] = [...first];
  for (let h = 0; h < hours; h += 0.1) {
    const d = nextPromise(ctx(log, h, overdue()));
    if (d) log = [...log, d];
    const k = keep(log, h);
    const kd = k ? keepPromise(log, k, h) : null;
    if (kd) log = [...log, kd];
  }
  return log;
}

test('leads: there are always at least two open promises, and a third when Purpose is overdue', () => {
  const calm = play(3, () => null);
  assert.equal(openPromises(calm).length, LEADS.min);
  const restless = play(3, () => null, () => true);
  assert.equal(openPromises(restless).length, LEADS.max);
});

test('leads: a hero who keeps every promise always finds new ones; cleared cellars are moved into again', () => {
  // Keep the oldest open promise every two game hours, for four game days.
  const log = play(96, (l, h) => (Math.round(h * 10) % 20 === 0 ? openPromises(l)[0]?.id ?? null : null));
  const kept = log.filter((d) => d.kind === 'kept').length;
  assert.ok(kept >= 30, `${kept} kept`);
  const after = nextPromise(ctx(log, 97));
  assert.ok(openPromises(after ? [...log, after] : log).length >= LEADS.min);
  const moved = log.filter((d) => d.kind === 'move-in');
  assert.ok(moved.length > 0, 'something moved into a cleared cellar');
  // New dwellers, not the ones that were cleared out.
  for (const m of moved) {
    const d = log.find((x): x is DungeonDecision => x.kind === 'dungeon' && x.id === (m as { dungeon: string }).dungeon)!;
    const lore = loreOf(classic, d.template);
    const c = outlineCellar(d, placeOf(d, terrain.towns, classic.dungeons)!, lore);
    const mm = m as Extract<Decision, { kind: 'move-in' }>;
    const now = moveIn(c, mm, placeOf(d, terrain.towns, classic.dungeons)!, lore);
    assert.equal(now.dweller.id, mm.dweller);
    assert.equal(occupantId(now), mm.id);
    assert.deepEqual(now.layout, c.layout, 'the layout stays');
    assert.ok(now.spawns.length > 0);
  }
  assert.ok(moved.every((m) => occupationOf(log, (m as { dungeon: string }).dungeon)));
});

test('leads: the townsfolk learn of a promise made while playing, and keep what they knew', () => {
  const people = townsfolk(town.plan, seed);
  const { talk } = townTalk(seed, classic, town, people, first);
  const d = nextPromise({ ...ctx(first, 1), terrain: undefined })!;
  assert.equal(d.kind, 'dungeon');
  const c = talkCellar(d, classic, town, people, [...first, d])!;
  talk.add(c);
  const knower = c.hint.knowers[0];
  assert.deepEqual(talk.ask(knower, 'news').heard, [d.id]);
  // The innkeeper heard of both.
  const inn = people.find((p) => town.plan.buildings[p.home].kind === 'inn' && p.role === 'trade')!;
  const heard = talk.ask(inn.id, `lead:${d.id}`).heard;
  assert.ok(heard.includes(d.id), `the inn heard: ${heard.join(', ')}`);
  // Saved and loaded with the longer log, it is the same.
  const again = townTalk(seed, classic, town, people, [...first, d], talk.save()).talk;
  assert.deepEqual(again.ask(knower, 'news').heard, [d.id]);
});

test('leads: now and then the new place is out on the land (a barrow, a cave, a tower), with its own lore, named and marked in town', () => {
  const log = play(48, (l, h) => (Math.round(h * 10) % 20 === 0 ? openPromises(l)[0]?.id ?? null : null));
  const land = log.filter((d): d is DungeonDecision => d.kind === 'dungeon' && d.template !== 'cellar');
  const kinds = new Set(land.map((d) => d.template));
  assert.ok(kinds.has('barrow') && kinds.has('cave') && kinds.has('tower'), [...kinds].join(', '));
  const people = townsfolk(town.plan, seed);
  const NAMES = { barrow: 'the barrow', cave: 'the cave', tower: 'the old tower', 'sea-cave': 'the sea cave' } as const;
  for (const b of land) {
    const kind = b.template as keyof typeof NAMES;
    const far = Math.hypot(b.site!.x - town.decision.x, b.site!.z - town.decision.z);
    assert.ok(far > 500 && far < 1700, `${b.id} at ${far.toFixed(0)} m`);
    assert.equal(terrain.waterDepth(b.site!.x, b.site!.z), 0);
    const c = outlineCellar(b, placeOf(b, terrain.towns, classic.dungeons)!, loreOf(classic, kind));
    assert.ok(classic.dungeons[kind]!.dwellers.some((w) => w.id === c.dweller.id) || isEmpty(c), `a ${kind} dweller (or an empty cave)`);
    const fits = [kind, ...(classic.dungeons[kind]!.form.pieces ?? [])];
    assert.ok(!c.setPiece.kinds || c.setPiece.kinds.some((k) => fits.includes(k)), `${c.setPiece.id} fits a ${kind}`);
    assert.match(c.house, new RegExp(`^${NAMES[kind]} (north|south|east|west)`));
    const t = talkCellar(b, classic, town, people, log)!;
    assert.equal(t.sketch.called, c.house);
    assert.ok(t.hint.knowers.length > 0, 'someone in town knows');
  }
  // A cave's mouth goes into its hill; a tower stands on level ground.
  for (const b of land) {
    const { x, z, yaw } = b.site!, fx = -Math.sin(yaw), fz = -Math.cos(yaw), h = terrain.height(x, z);
    if (b.template === 'cave') assert.ok(terrain.height(x + fx * 14, z + fz * 14) - h > 2, `${b.id} goes into its hill`);
    if (b.template === 'tower') for (const [a, c] of [[-9, 0], [9, 0], [0, -18]]) assert.ok(Math.abs(terrain.height(x + a, z + c) - h) <= 1.8, `${b.id} on level ground`);
  }
});

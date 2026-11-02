import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { NEEDS } from '../src/vgm/director';
import { TOOLS, toolOf, vgmTurn } from '../src/vgm/toolbox';
import type { Decision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

/** Every kind of decision the log can hold (the compiler checks the list is whole). */
const KINDS = { delay: 1, festivity: 1, stray: 1, castaway: 1, traveller: 1, sight: 1, journey: 1, retake: 1, wild: 1, event: 1, town: 1, volume: 1, dungeon: 1, order: 1, kept: 1, 'move-in': 1, road: 1, region: 1, hold: 1, retreat: 1 } satisfies Record<Decision['kind'], 1>;

test('toolbox: every decision in the log is some tool\'s, and every tool is well formed', () => {
  const written = new Set(TOOLS.flatMap((t) => t.writes));
  for (const k of Object.keys(KINDS)) assert.ok(written.has(k as Decision['kind']), `no tool writes "${k}"`);
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length, 'ids are unique');
  for (const t of TOOLS) {
    assert.ok(t.need === null || (NEEDS as readonly string[]).includes(t.need), t.id);
    assert.equal(t.asked === 'turn', !!t.next, `${t.id}: a turn tool has a move, others are asked by name`);
    assert.equal(t.asked === 'need', !!t.answer && !!t.need, `${t.id}: a need tool answers its need (C9)`);
  }
  assert.throws(() => toolOf('nope'));
});

test('toolbox: every tool has its row in docs/design/vgm.md', { skip: !existsSync('docs/design/vgm.md') && 'vgm.md not on this branch yet' }, () => {
  const doc = readFileSync('docs/design/vgm.md', 'utf8');
  for (const t of TOOLS) assert.ok(doc.includes(`**${t.name}`), `vgm.md has no row for "${t.name}"`);
});

test('toolbox: the Builder\'s turn asks its tools in order, each seeing the ones before', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = startWorld();
  const c = { seed, log, towns: terrain.towns, terrain, home, hours: 0, purposeOverdue: false, inside: () => false, setting: classic };
  const made = vgmTurn(c);
  assert.ok(made.length >= 1 && made.every((m) => m.tool === 'promise' && toolOf('promise').writes.includes(m.decision.kind)), 'a fresh world gets a promise');
  assert.ok(made.every((m) => m.need === 'purpose' && /leads? open|Purpose/.test(m.reason)), 'each with its need and reason (the VGM log, C8)');
  assert.deepEqual(vgmTurn(c), made, 'seeded: the same turn again');
  assert.equal(vgmTurn({ ...c, tools: ['event'] }).length, 0, 'only the tools asked for');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { SPELL_MOTIFS } from '../src/setting/contract';
import { Motes } from '../src/app/spellMotes';

test('spell motes: every school has its own motif', () => {
  const magic = classic.skills.filter((s) => s.group === 'magic');
  const motifs = magic.map((s) => s.motif);
  assert.ok(motifs.every((m) => m && SPELL_MOTIFS.includes(m)), String(motifs));
  assert.equal(new Set(motifs).size, magic.length);
});

test('spell motes: sparks rise, flakes fall, grit falls back, glints fly out; all are spent', () => {
  const after = (motif: (typeof SPELL_MOTIFS)[number], t: number) => {
    const m = new Motes(7);
    m.shed(motif, null, 40, 0, 0, 0);
    for (let s = 0; s < t; s += 0.05) m.drift(0.05);
    return m.list;
  };
  const mean = (l: { y: number }[]) => l.reduce((a, m) => a + m.y, 0) / l.length;
  assert.ok(mean(after('flame', 0.3)) > 0.3, 'sparks rise');
  assert.ok(mean(after('frost', 0.6)) < -0.1, 'flakes fall');
  assert.ok(mean(after('stone', 0.6)) < mean(after('stone', 0.2)), 'grit falls back');
  const glints = after('radiance', 0.2);
  assert.ok(glints.reduce((a, m) => a + Math.hypot(m.x, m.z), 0) / glints.length > 0.2, 'glints fly out');
  for (const k of SPELL_MOTIFS) assert.equal(after(k, 2).length, 0, `${k} spent`);
});

test('spell motes: the same seed sheds the same motes; the cap holds', () => {
  const a = new Motes(3, 50), b = new Motes(3, 50);
  for (const m of [a, b]) { m.shed('bloom', null, 80, 1, 2, 3, 0.5); m.drift(0.1); }
  assert.equal(a.list.length, 50);
  assert.deepEqual(a.list.map((m) => [m.x, m.y, m.z]), b.list.map((m) => [m.x, m.y, m.z]));
});

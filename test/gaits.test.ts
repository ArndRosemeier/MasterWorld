import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTown } from '@futuremagic/settlement';
import { townsfolk, OLD_AGE } from '../src/sim/people';
import { GAIT_CUTS, GAIT_PACE, gaitOf, gaitScale } from '../src/render/folk/gaits';

test('gaits: the town walks many ways; the old like the old, children quick, each the same every time', () => {
  const folk = townsfolk(planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 }), 5);
  const ways = new Set(folk.map(gaitOf));
  assert.ok(ways.size >= 6, [...ways].join(', '));
  for (const p of folk) {
    const g = gaitOf(p);
    assert.ok(GAIT_PACE[g], `${g} has a pace`);
    assert.equal(gaitOf(p), g);
    if (p.role === 'child') assert.ok(['walk quick', 'walk'].includes(g), g);
    else if (p.race !== 'elf' && p.age >= OLD_AGE) assert.ok(['walk old', 'walk hobble', 'walk stooped'].includes(g), `${p.age}: ${g}`);
  }
  // The old walk slower than the rest.
  const old = folk.filter((p) => p.role !== 'child' && p.race !== 'elf' && p.age >= OLD_AGE), young = folk.filter((p) => p.role !== 'child' && p.age < OLD_AGE);
  assert.ok(old.length && Math.max(...old.map((p) => p.speed)) < Math.min(...young.map((p) => p.speed)));
});

test('gaits: a walk keeps step within bounds; the pack step reads every cut (one line each)', () => {
  assert.equal(gaitScale('walk', 1.4), 1);
  assert.equal(gaitScale('walk old', 5), 1.35);
  assert.equal(gaitScale('idle', 1.2), 1);
  const text = readFileSync('src/render/folk/gaits.ts', 'utf8');
  const read = [...text.matchAll(/\{ clip: '([^']+)', take: '([^']+)', pace: ([\d.]+) \}/g)].map((m) => m[1]);
  assert.deepEqual(read, GAIT_CUTS.map((g) => g.clip));
});

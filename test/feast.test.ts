import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { TownLife } from '../src/sim/townLife';
import { OLD_AGE } from '../src/sim/people';

const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 });

test('feast: a ring dances facing its middle, the rest revel round it, the children run about at play', () => {
  const life = new TownLife(plan, 5, 18);
  const [x, z] = plan.centre;
  life.order({ kind: 'gather', x, z, radius: 16, from: 18, to: 21, mood: 'feast' });
  const ran = new Set<number>(), moved = new Map<number, number>();
  for (let s = 0; s < 300; s++) {
    life.step(1, 18.1);
    for (const a of life.agents) {
      if (a.run && a.act === 'walk') ran.add(a.person.id);
      if (a.person.role === 'child' && a.act === 'walk') moved.set(a.person.id, (moved.get(a.person.id) ?? 0) + 1);
    }
  }
  const dancers = life.agents.filter((a) => a.act === 'dance'), revellers = life.agents.filter((a) => a.act === 'revel');
  assert.ok(dancers.length >= 6, `${dancers.length} dancing`);
  assert.ok(revellers.length > dancers.length, `${revellers.length} revelling`);
  for (const a of dancers) {
    const d = Math.hypot(a.x - x, a.z - z);
    assert.ok(d > 2 && d < 5.5, `a dancer ${d.toFixed(1)} m from the middle`);
    const toMiddle = Math.atan2(z - a.z, x - a.x), off = Math.abs(Math.atan2(Math.sin(a.dir - toMiddle), Math.cos(a.dir - toMiddle)));
    assert.ok(off < 0.5, `a dancer faces ${off.toFixed(2)} rad off the middle`);
    assert.ok(a.person.age < OLD_AGE && a.person.role !== 'child', 'the old and the children do not dance');
  }
  for (const a of revellers) assert.ok(Math.hypot(a.x - x, a.z - z) > 4, 'revellers keep out of the ring');
  const kids = life.agents.filter((a) => a.person.role === 'child' && !a.hidden);
  assert.ok(kids.length && kids.filter((a) => ran.has(a.person.id)).length > kids.length * 0.6, `${ran.size} of ${kids.length} children ran`);
});

test('feast: on a market day the town goes round the stalls', () => {
  const life = new TownLife(plan, 5, 10);
  const [x, z] = plan.centre;
  life.order({ kind: 'gather', x, z, radius: 16, from: 10, to: 13, mood: 'market' });
  for (let s = 0; s < 300; s++) life.step(1, 10.1);
  const browsing = life.agents.filter((a) => a.act === 'browse').length, standing = life.agents.filter((a) => a.act === 'gather').length;
  assert.ok(browsing > 10 && standing === 0, `${browsing} browsing, ${standing} just standing`);
});

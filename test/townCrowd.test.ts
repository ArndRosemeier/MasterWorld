import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { TownLife, waitsInWay, type Agent } from '../src/sim/townLife';

// Nobody walks through another in the streets (Arnd 2026-10-30): townsfolk give way to each other and to the hero.
const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
const [mx, mz] = plan.market.reduce((s, v, i) => { s[i % 2] += v / (plan.market.length / 2); return s; }, [0, 0]);

/** A town with everyone indoors but `n` set walking across the market (each a from and a to). */
function walkers(ways: [number, number, number, number][]): { life: TownLife; ws: Agent[] } {
  const life = new TownLife(plan, 7, 12);
  for (const a of life.agents) { a.hidden = true; a.stay = 1e9; a.act = 'indoors'; }
  life.focus = { x: mx, z: mz };
  const ws = ways.map(([x0, z0, x1, z1], i) => {
    const a = life.agents[i];
    Object.assign(a, { hidden: false, stay: undefined, held: false, post: undefined, act: 'walk', next: 'wait', x: mx + x0, z: mz + z0, path: [mx + x1, mz + z1], pi: 0, until: 1e9, spot: -1 });
    return a;
  });
  return { life, ws };
}
const gap = (a: Agent, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('town crowd: two walking at each other step aside and pass, never through each other', () => {
  const { life, ws: [a, b] } = walkers([[-5, 0, 5, 0], [5, 0.05, -5, 0.05]]);
  let least = Infinity;
  for (let i = 0; i < 150; i++) { life.step(0.1, 12); least = Math.min(least, gap(a, b)); }
  assert.ok(least >= 0.56, `closest ${least.toFixed(2)} m`);
  assert.equal(a.act, 'wait'); assert.equal(b.act, 'wait');
  assert.ok(gap(a, { x: mx + 5, z: mz }) < 0.6 && gap(b, { x: mx - 5, z: mz }) < 0.6, 'both got where they went');
});

test('town crowd: a walker goes round the hero standing in the way', () => {
  const { life, ws: [a] } = walkers([[-5, 0, 5, 0]]);
  life.hero = { x: mx, z: mz };
  let least = Infinity;
  for (let i = 0; i < 150; i++) { life.step(0.1, 12); least = Math.min(least, gap(a, life.hero)); }
  assert.ok(least >= 0.6, `closest ${least.toFixed(2)} m`);
  assert.equal(a.act, 'wait', 'and arrived');
});

test('town crowd: boxed in, one stands (seen waiting, not walking on the spot), then squeezes out', () => {
  // Ringed round by six standing shoulder to shoulder: nowhere to step.
  const ring = Array.from({ length: 6 }, (_, i): [number, number, number, number] => {
    const x = Math.cos((i * Math.PI) / 3) * 0.6, z = Math.sin((i * Math.PI) / 3) * 0.6;
    return [x, z, x, z];
  });
  const { life, ws } = walkers([[0, 0, 4, 0.3], ...ring]);
  for (const o of ws.slice(1)) { o.act = 'wait'; o.path = []; }
  const a = ws[0];
  let waited = 0;
  for (let i = 0; i < 100; i++) { life.step(0.1, 12); if (waitsInWay(a)) waited += 0.1; }
  assert.ok(waited > 3, `it stood waiting ${waited.toFixed(1)} s`);
  assert.equal(a.act, 'wait', 'and got out in the end');
});

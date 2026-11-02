import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpellBits } from '../src/app/spellFx/particles';
import { CrossingFx, CROSSING_TIME } from '../src/app/spellFx/crossingFx';

const feet = [10, 2, -4] as const;

/** Run one crossing's glow; the sprites held at each frame (the held list is rebuilt every frame). */
function run(seed: number, n: number): { held: number[]; ringY: number[]; first: string } {
  const b = new SpellBits(5), fx = new CrossingFx(seed), held: number[] = [], ringY: number[] = [];
  assert.equal(fx.glowing, false);
  fx.glow(b, 1 / 30, [...feet]);
  assert.equal(b.held.length, 0, 'nothing before a crossing');
  fx.flare(n);
  assert.equal(fx.glowing, true);
  let first = '';
  for (let t = 0; t < CROSSING_TIME + 0.3; t += 1 / 30) {
    b.held.length = 0;
    fx.glow(b, 1 / 30, [...feet]);
    b.step(1 / 30);
    held.push(b.held.length);
    for (const h of b.held) if (h.sprite === 4 && h.flat && h.size > 0.8) ringY.push(h.y);
    if (!first && b.held[0]) first = JSON.stringify(b.held[0].c);
  }
  assert.equal(fx.glowing, false, 'over by itself');
  return { held, ringY, first };
}

test('crossing glow: lights the hero at once, a ring climbs the body, and it is gone after its time', () => {
  const r = run(7, 1);
  assert.ok(r.held[0]! > 0 && Math.max(...r.held) <= 16, 'a few sprites only (fixed-count instancing)');
  assert.equal(r.held.at(-1), 0, 'gone');
  assert.ok(r.ringY.length > 5 && r.ringY[0]! < feet[1] + 0.4 && Math.max(...r.ringY) > feet[1] + 1.3, 'the ring climbs from the feet toward the head');
  for (let i = 1; i < r.ringY.length; i++) assert.ok(r.ringY[i]! >= r.ringY[i - 1]! - 1e-9, 'only up');
});

test('crossing glow: seeded, so the same crossing is the same and another differs', () => {
  assert.equal(run(7, 1).first, run(7, 1).first);
  const seen = new Set([1, 2, 3, 4, 5].map((n) => run(7, n).first));
  assert.ok(seen.size > 1, 'crossings vary');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAVES, swellHeight, swellScale, waveMotion } from '../src/world/swell';

test('swell: waves rise and fall within their amplitudes, and roll on with time', () => {
  const most = WAVES.reduce((s, [, , steep, l]) => s + steep / waveMotion(l).k, 0);
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 30; t += 0.25) {
    const y = swellHeight(12, -40, t, 1, 0, 1);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
    assert.ok(Math.abs(y) <= most + 1e-9);
  }
  assert.ok(hi - lo > 0.5, `range ${hi - lo}`);
  assert.equal(swellHeight(12, -40, 3, 1, 0, 0), 0);
});

test('swell: full on the open sea, small on lakes and in shallows, none on running rivers', () => {
  const sea = swellScale(1, 0, 20, 0);
  assert.ok(sea > 0.99);
  assert.ok(swellScale(1, 40, 20, 0) < 0.2 * sea, 'a lake high above the sea');
  assert.ok(swellScale(1, 0, 0.5, 0) < 0.05, 'shallows');
  assert.equal(swellScale(1, 0, 20, 1), 0, 'a river');
});

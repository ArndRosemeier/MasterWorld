import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAVA_BURN, inLava, lavaBurn } from '../src/game/heat';

test('heat: feet in lava burn at a share of the most health a second; out of it nothing; a step over a flow is a wade', () => {
  assert.equal(lavaBurn(1, false, 100), 0);
  assert.equal(lavaBurn(1, true, 100), LAVA_BURN * 100);
  assert.ok(inLava(10, 10.2));
  assert.ok(inLava(10.5, 10));
  assert.ok(!inLava(11, 10), 'a jump over it');
  assert.ok(!inLava(10, null), 'no lava here');
  // A few seconds in it use up the health (the game keeps the last point).
  assert.ok(lavaBurn(4, true, 100) > 100);
});

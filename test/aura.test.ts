import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AURA_RANGE, FAINT, STRONG, auraReach, auraSize, healthLook } from '../src/sim/aura';
import { classic } from '../src/setting/classic/index';

test('aura: green when well, red when nearly spent, and dimmer the weaker', () => {
  const well = healthLook(1), half = healthLook(0.5), low = healthLook(0.1);
  assert.ok(well.g > well.r && well.g > well.b, 'well: green');
  assert.ok(low.r > low.g && low.r > low.b, 'low: red');
  assert.ok(half.r > 0.8 && half.g > 0.5, 'half: amber');
  assert.ok(well.dim > half.dim && half.dim > low.dim, 'dimmer as it weakens');
  // Out of range values are held to the ends.
  assert.deepEqual(healthLook(2), healthLook(1));
  assert.deepEqual(healthLook(-1), healthLook(0));
  for (let f = 0; f <= 1; f += 0.05) { const l = healthLook(f); assert.ok(l.r >= 0 && l.g >= 0 && l.b >= 0 && l.dim > 0 && l.dim <= 1); }
});

test('aura: faint is fainter than strong; reach is whole to 24 m and gone at 30 m', () => {
  assert.ok(FAINT > 0 && FAINT < STRONG && STRONG <= 1);
  assert.equal(AURA_RANGE, 30);
  assert.equal(auraReach(0), 1);
  assert.equal(auraReach(24), 1);
  assert.equal(auraReach(30), 0);
  assert.equal(auraReach(80), 0);
  assert.ok(auraReach(27) > 0 && auraReach(27) < 1);
});

test('aura: every creature of the setting gets a sensible ellipse that holds its body', () => {
  for (const def of classic.creatures) {
    const s = auraSize(def);
    assert.ok(s.halfW > 0.2 && s.halfH > 0.2 && s.lift > 0.05, def.id);
    assert.ok(s.lift < s.halfH * 1.2, `${def.id}: its middle is no higher than the ellipse reaches`);
  }
});

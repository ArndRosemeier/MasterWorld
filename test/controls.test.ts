import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bind, cleanBindings, Controls, DEFAULT_BINDINGS, keyLabel } from '../src/input/controls';

test('controls: R toggles autorun; forward, back or R again stop it', () => {
  const c = new Controls();
  c.press('KeyR'); c.release('KeyR');
  assert.equal(c.autorun, true);
  c.press('KeyR');
  assert.equal(c.autorun, false);
  c.press('KeyR');
  c.press('KeyS');
  assert.equal(c.autorun, false);
  assert.equal(c.axis('back', 'forward'), -1);
  c.release('KeyS');
  c.press('KeyR'); c.press('ArrowUp');
  assert.equal(c.autorun, false);
  c.press('KeyR'); c.press('Space'); c.press('KeyA');
  assert.equal(c.autorun, true, 'jumping and turning keep running');
  c.clear();
  assert.equal(c.autorun, true, 'letting go of the keys keeps running');
  assert.equal(c.held('jump'), false);
});

test('controls: a key bound elsewhere moves to the new action', () => {
  const b = bind(DEFAULT_BINDINGS, 'autorun', 0, 'KeyW');
  assert.deepEqual(b.autorun, ['KeyW', 'NumLock']);
  assert.deepEqual(b.forward, ['', 'ArrowUp']);
  assert.deepEqual(DEFAULT_BINDINGS.forward, ['KeyW', 'ArrowUp'], 'defaults untouched');
  const c = new Controls(b);
  c.press('KeyW');
  assert.equal(c.autorun, true);
  assert.equal(c.held('forward'), false);
});

test('controls: stored bindings are checked', () => {
  const b = cleanBindings({ jump: ['KeyF', ''], dive: ['Escape', ''], walk: 'nope', ghost: ['KeyG', ''] });
  assert.deepEqual(b.jump, ['KeyF', '']);
  assert.deepEqual(b.dive, DEFAULT_BINDINGS.dive);
  assert.deepEqual(b.walk, DEFAULT_BINDINGS.walk);
  assert.equal('ghost' in b, false);
});

test('controls: key labels', () => {
  assert.equal(keyLabel('KeyR'), 'R');
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('KeyY', new Map([['KeyY', 'z']])), 'Z');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { params, startSeed } from '../src/app/params';

test('params: defaults without a URL', () => {
  // A fresh world each start: six letters or digits.
  assert.match(params.seed, /^[0-9a-z]{6}$/);
  assert.equal(params.gl, false);
});

test('params: a pinned seed (the checks) wins over a fresh one', () => {
  const g = globalThis as { __mwSeed?: string };
  g.__mwSeed = 'masterworld';
  try {
    assert.equal(startSeed(), 'masterworld');
  } finally {
    delete g.__mwSeed;
  }
  assert.notEqual(startSeed(), startSeed());
});

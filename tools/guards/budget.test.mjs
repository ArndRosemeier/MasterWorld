import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from './budget.mjs';

test('budget: a step is ok up to its warning, warned up to its budget, failed past it', () => {
  assert.equal(verdict(30, 45, 60), 'ok');
  assert.equal(verdict(45, 45, 60), 'ok');
  assert.equal(verdict(50, 45, 60), 'warn');
  assert.equal(verdict(60, 45, 60), 'warn');
  assert.equal(verdict(61, 45, 60), 'fail');
});

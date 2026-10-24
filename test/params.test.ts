import { test } from 'node:test';
import assert from 'node:assert/strict';
import { params } from '../src/app/params';

test('params: defaults without a URL', () => {
  assert.equal(params.seed, 'masterworld');
  assert.equal(params.gl, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplersIn } from './check.mjs';

test('units: samplers are counted as the driver counts them (arrays by their length)', () => {
  const src = `precision highp sampler2D;
uniform sampler2D a;
uniform highp sampler2DArray b;
uniform mediump usampler2D c;
uniform sampler2D d[3];
uniform vec4 notOne;`;
  assert.equal(samplersIn(src), 6);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutLoop, findLoop, framesOf } from './cutLoop.mjs';

/**
 * A made-up take: two bones swinging with a 1.2 s cycle, the body walking 0.8 hip heights a second along a heading
 * of 30 degrees (the pelvis turned so), then standing still.
 */
function take() {
  const fps = 30, n = 240, bones = ['pelvis', 'thigh_l'], stride = bones.length * 4 + 3;
  const data = new Float32Array(n * stride), yaw = Math.PI / 6;
  for (let f = 0; f < n; f++) {
    const walking = f < 180, t = f / fps, swing = walking ? 0.4 * Math.sin((2 * Math.PI * t) / 1.2) : 0;
    const qp = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    // The thigh: the heading, then its own swing about x.
    const s = [Math.sin(swing / 2), 0, 0, Math.cos(swing / 2)];
    const qt = [qp[3] * s[0] + qp[0] * s[3] + qp[1] * s[2] - qp[2] * s[1], qp[3] * s[1] - qp[0] * s[2] + qp[1] * s[3] + qp[2] * s[0],
      qp[3] * s[2] + qp[0] * s[1] - qp[1] * s[0] + qp[2] * s[3], qp[3] * s[3] - qp[0] * s[0] - qp[1] * s[1] - qp[2] * s[2]];
    data.set(qp, f * stride);
    data.set(qt, f * stride + 4);
    const d = 0.8 * Math.min(t, 6);
    data.set([Math.sin(yaw) * d, 0.02 * Math.cos((4 * Math.PI * t) / 1.2), Math.cos(yaw) * d], f * stride + 8);
  }
  return { def: { bones, rootBone: 'pelvis', fps, frameCount: n }, data };
}

test('cut loop: one gait cycle off the walking stretch, facing +z on the spot, closed at the seam, with its pace', () => {
  const { def, data } = take();
  const frames = framesOf(def, data);
  const loop = findLoop(def, frames);
  assert.ok(loop, 'a loop');
  assert.ok(Math.abs(loop.len - 36) <= 1, `cycle of ${loop.len} frames`);
  assert.ok(loop.start + loop.len < 180, 'on the walking stretch');
  assert.ok(Math.abs(loop.pace - 0.8) < 0.05, `pace ${loop.pace}`);
  const out = cutLoop(def, frames, loop, 0.1), stride = 11, last = loop.len;
  for (let k = 0; k < stride; k++) assert.ok(Math.abs(out[k] - out[last * stride + k]) < 1e-5, `seam differs at ${k}`);
  // Facing +z: the pelvis turned back to no heading; on the spot: no travel; lifted.
  assert.ok(Math.abs(out[1]) < 1e-5 && Math.abs(out[3] - 1) < 1e-5, `faces +z: ${[...out.slice(0, 4)]} loop ${JSON.stringify(loop)}`);
  for (let f = 0; f <= last; f++) assert.ok(Math.hypot(out[f * stride + 8], out[f * stride + 10]) < 1e-4, `travels at ${f}`);
  assert.ok(Math.abs(out[9] - (data[loop.start * stride + 9] + 0.1)) < 1e-5, 'lifted');
});

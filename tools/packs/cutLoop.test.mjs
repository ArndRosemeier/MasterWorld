import { test } from 'node:test';
import assert from 'node:assert/strict';
import { climbLoop, cutLoop, findClimb, findLoop, framesOf, mirrorFrames } from './cutLoop.mjs';

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

test('mirror: left and right swap, a rotation about an axis reflects across x, the root and heading flip, and mirroring twice is the take', () => {
  const bones = ['pelvis', 'hand_l', 'hand_r'], def = { bones, rootBone: 'pelvis', fps: 30, frameCount: 1 };
  const frames = [{ q: [[0, 0, 0, 1], [0.1, 0.2, 0.3, 0.9], [0.5, -0.5, 0.5, 0.5]], root: [0.2, 1, -0.3], yaw: 0.4 }];
  const m = mirrorFrames(def, frames)[0];
  assert.deepEqual(m.q[1], [0.5, 0.5, -0.5, 0.5], 'the right hand\'s rotation is now the left\'s, reflected');
  assert.deepEqual(m.q[2], [0.1, -0.2, -0.3, 0.9]);
  assert.deepEqual(m.root, [-0.2, 1, -0.3]);
  assert.equal(m.yaw, -0.4);
  assert.deepEqual(mirrorFrames(def, [m])[0], frames[0]);
  assert.throws(() => mirrorFrames({ ...def, bones: ['pelvis', 'hand_l'] }, frames), /no hand_r/);
});

/** A made-up climb: the body rises 0.3 hip heights a second; the left hand swings up in the first second of every two, the right in the second. */
function climb() {
  const fps = 30, n = 150, bones = ['pelvis', 'hand_l', 'hand_r'], stride = bones.length * 4 + 3;
  const data = new Float32Array(n * stride);
  for (let f = 0; f < n; f++) {
    const t = f / fps, phase = t % 2, l = phase < 1 ? Math.sin(Math.PI * phase) : 0, r = phase >= 1 ? Math.sin(Math.PI * (phase - 1)) : 0;
    const q = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
    data.set([0, 0, 0, 1], f * stride);
    data.set(q(0.8 * l), f * stride + 4);
    data.set(q(0.8 * r), f * stride + 8);
    data.set([0, 0.3 * t + 0.02 * Math.sin(2 * Math.PI * t), 0], f * stride + 12);
  }
  return { def: { bones, rootBone: 'pelvis', fps, frameCount: n }, data };
}

test('climb: a step whose end is the mirror image of its start, and with its mirror image a cycle that closes and carries the rise on', () => {
  const { def, data } = climb();
  const frames = framesOf(def, data), mirrored = mirrorFrames(def, frames);
  const win = findClimb(def, frames, mirrored);
  assert.ok(win, 'a step');
  assert.ok(win.score < 0.01, `ends alike: ${win.score}`);
  assert.ok(Math.abs(win.len - 30) <= 1, `a step of ${win.len} frames`);
  assert.ok(Math.abs(win.rise - 0.3) < 0.03, `rises ${win.rise}`);
  const cycle = climbLoop(frames, mirrored, win);
  assert.equal(cycle.length, 2 * win.len + 1);
  // The second half rises on from where the first ended, by as much.
  const up = cycle[win.len].root[1] - cycle[0].root[1], on = cycle[2 * win.len].root[1] - cycle[win.len].root[1];
  assert.ok(Math.abs(up - on) < 0.03, `${up} then ${on}`);
  // And it closes once the rise is taken out, the hands back where they began.
  const out = cutLoop(def, cycle, { start: 0, len: 2 * win.len }), stride = 15;
  for (let k = 0; k < 12; k++) assert.ok(Math.abs(out[k] - out[2 * win.len * stride + k]) < 1e-5, `seam differs at ${k}`);
  assert.ok(Math.abs(out[13] - out[2 * win.len * stride + 13]) < 1e-5, 'the rise is out of the loop');
  assert.equal(findClimb(def, frames.map((f) => ({ ...f, root: [0, 0, 0] })), mirrored), null, 'a take that does not rise has no climbing step');
});

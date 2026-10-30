/**
 * Cuts a seamless walking loop out of a long motion-capture take (the CMU library in the Actors pack): the
 * straightest, steadiest stretch where the body comes back to the same pose one gait cycle (two steps) later.
 * The loop is turned to face +z, walks on the spot (the travel taken out, as the pack's own walks do), closes
 * exactly at its seam, and reports its pace. Clip data as Actors stores it (@actors/core ClipDef, decoded): per
 * frame each bone's world rotation change (xyzw) relative to the reference pose, then the root position in hip
 * heights. Pure: numbers in, numbers out (tools/packs/actors.mjs reads and writes the files).
 */

import { quatAxisAngle, quatConjugate as inv, quatMul as mul, quatSlerp as slerp } from '@actors/core';

/** Rotates v by unit quaternion q (xyzw). */
const rotate = (q, v) => mul(mul(q, [v[0], v[1], v[2], 0]), inv(q)).slice(0, 3);
const yawQuat = (a) => quatAxisAngle([0, 1, 0], a);

/** The take as frames: each frame's bone rotations, root, and heading (yaw of the pelvis, radians, unwrapped). */
export function framesOf(def, data) {
  const nb = def.bones.length, stride = nb * 4 + 3, n = def.frameCount, pelvis = def.bones.indexOf(def.rootBone);
  const frames = [];
  let last = 0;
  for (let f = 0; f < n; f++) {
    const o = f * stride;
    const q = [];
    for (let b = 0; b < nb; b++) q.push([data[o + b * 4], data[o + b * 4 + 1], data[o + b * 4 + 2], data[o + b * 4 + 3]]);
    const fw = rotate(q[pelvis], [0, 0, 1]);
    let yaw = Math.atan2(fw[0], fw[2]);
    while (yaw - last > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - last < -Math.PI) yaw += 2 * Math.PI;
    last = yaw;
    frames.push({ q, root: [data[o + nb * 4], data[o + nb * 4 + 1], data[o + nb * 4 + 2]], yaw });
  }
  return frames;
}

/** How unlike two frames are once each is turned to face +z (0: the same pose). */
function unlike(a, b, flat) {
  const ta = yawQuat(-a.yaw), tb = yawQuat(-b.yaw);
  let d = 0;
  for (let i = 0; i < a.q.length; i++) {
    const p = mul(ta, a.q[i]), r = mul(tb, b.q[i]);
    const dot = Math.abs(p[0] * r[0] + p[1] * r[1] + p[2] * r[2] + p[3] * r[3]);
    d += 1 - Math.min(1, dot);
  }
  if (flat) return d;
  return d + 4 * Math.abs(a.root[1] - b.root[1]);
}

/**
 * Finds the loop: the window [start, start + len] (len one gait cycle, `cycle` seconds at most) whose ends are most
 * alike, on a stretch that walks forward (at least `minPace` hip heights a second, along the facing) and keeps
 * its heading (under `maxTurn` radians over the cycle).
 */
export function findLoop(def, frames, { cycle = [0.8, 1.9], minPace = 0.25, maxTurn = 0.12 } = {}) {
  const fps = def.fps, n = frames.length;
  const lo = Math.round(cycle[0] * fps), hi = Math.round(cycle[1] * fps);
  let best = null;
  for (let a = 0; a + lo < n; a++) {
    for (let len = lo; len <= hi && a + len < n; len++) {
      const b = a + len, A = frames[a], B = frames[b];
      if (Math.abs(B.yaw - A.yaw) > maxTurn) continue;
      // Travel along the mean facing, and across it.
      const mid = (A.yaw + B.yaw) / 2, dx = B.root[0] - A.root[0], dz = B.root[2] - A.root[2];
      const along = dx * Math.sin(mid) + dz * Math.cos(mid), across = -dx * Math.cos(mid) + dz * Math.sin(mid);
      const secs = len / fps;
      if (along / secs < minPace || Math.abs(across) > 0.25 * along) continue;
      // The heading must hold all the way, not only at the ends.
      let bent = false;
      for (let f = a + 1; f < b && !bent; f += 2) if (Math.abs(frames[f].yaw - (A.yaw + ((B.yaw - A.yaw) * (f - a)) / len)) > 0.35) bent = true;
      if (bent) continue;
      const score = unlike(A, B);
      if (!best || score < best.score) best = { start: a, len, score, pace: along / secs };
    }
  }
  return best;
}

/**
 * Whether frames a..b keep upright: the hips never more than `hips` hip heights below where the take stands (its 90th percentile),
 * the chest never leaning more than `tilt` radians off upright. Not a squat, a sit or a tumble.
 */
function uprightIn(frames, a, b, { hips, tilt, stand, chest }) {
  for (let f = a; f <= b; f++) {
    if (frames[f].root[1] < stand - hips) return false;
    if (rotate(frames[f].q[chest], [0, 1, 0])[1] < Math.cos(tilt)) return false;
  }
  return true;
}

/**
 * Finds a loop done on the spot (a dance, a laugh, a cheer): of the windows `secs` long whose ends match within
 * `seam` and that keep within `travel` hip heights of where they began, the one with the most going on (so not a
 * stretch of standing still before or after the act). With `upright` ({ hips, tilt }), only stretches that keep upright.
 */
export function findStill(def, frames, { secs = [2, 4], seam = 0.08, travel = 0.4, upright = null } = {}) {
  const fps = def.fps, n = frames.length;
  const lo = Math.round(secs[0] * fps), hi = Math.round(secs[1] * fps);
  // How much the body moves from each frame to the next (summed, so a window's motion is one difference).
  const moved = new Float64Array(n);
  for (let f = 1; f < n; f++) moved[f] = moved[f - 1] + unlike(frames[f - 1], frames[f], true);
  if (upright) {
    const ys = frames.map((f) => f.root[1]).sort((x, y) => x - y);
    upright = { ...upright, stand: ys[Math.floor(ys.length * 0.9)], chest: def.bones.indexOf('spine_03') };
  }
  let best = null;
  for (let a = 0; a + lo < n; a++) {
    for (let len = lo; len <= hi && a + len < n; len += 2) {
      const b = a + len, A = frames[a], B = frames[b];
      const score = unlike(A, B);
      if (score > seam) continue;
      let far = false;
      for (let f = a; f <= b && !far; f += 3) if (Math.hypot(frames[f].root[0] - A.root[0], frames[f].root[2] - A.root[2]) > travel) far = true;
      if (far) continue;
      if (upright && !uprightIn(frames, a, b, upright)) continue;
      const busy = (moved[b] - moved[a]) / len;
      if (!best || busy > best.busy) best = { start: a, len, score, pace: 0, busy };
    }
  }
  return best;
}

/**
 * The loop as clip data (frameCount len + 1, the last frame the first again): facing +z, on the spot, the seam
 * closed by spreading the ends' difference over the loop, the root lifted by `lift` hip heights.
 */
export function cutLoop(def, frames, loop, lift = 0) {
  const { start, len } = loop, nb = def.bones.length, stride = nb * 4 + 3;
  const A = frames[start], B = frames[start + len];
  const turn = (f) => A.yaw + ((B.yaw - A.yaw) * (f - start)) / len;
  // Each frame turned to face +z (the heading eased from end to end, so the hips' own sway stays).
  const out = [];
  for (let f = start; f <= start + len; f++) {
    const t = yawQuat(-turn(f)), fr = frames[f];
    const r = rotate(t, [fr.root[0] - A.root[0], 0, fr.root[2] - A.root[2]]);
    out.push({ q: fr.q.map((q) => mul(t, q)), root: [r[0], fr.root[1], r[2]] });
  }
  // On the spot: the travel taken out evenly (what is left is the body's own surge and sway).
  const end = out[len].root;
  out.forEach((fr, i) => { fr.root[0] -= (end[0] * i) / len; fr.root[2] -= (end[2] * i) / len; });
  // The seam: the last frame's difference to the first, undone a share a frame.
  const fix = out[len].q.map((q, b) => mul(out[0].q[b], inv(q)));
  const dy = out[0].root[1] - out[len].root[1];
  out.forEach((fr, i) => {
    const k = i / len;
    fr.q = fr.q.map((q, b) => {
      const d = slerp([0, 0, 0, 1], fix[b], k);
      return mul(d, q);
    });
    fr.root[1] += dy * k + lift;
  });
  const data = new Float32Array((len + 1) * stride);
  out.forEach((fr, i) => {
    fr.q.forEach((q, b) => data.set(q, i * stride + b * 4));
    data.set(fr.root, i * stride + nb * 4);
  });
  return data;
}

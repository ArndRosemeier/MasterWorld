import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HoldSteps, FOOT, HAND, type Frame } from '../src/app/climbHolds';

/** A face along x (the way into it +z), the walker 0.35 m before it, climbing at (vs, vu) for `secs` at 60 frames a second. */
function climb(k: number, vs: number, vu: number, secs: number, each: (h: HoldSteps, f: Frame) => void) {
  const h = new HoldSteps(), p = { x: 100, y: 50, z: 200 };
  const f = (): Frame => ({ p, nx: 0, nz: 1, face: 0.35, k, vs, vu, dt: 1 / 60 });
  for (let t = 0; t < secs * 60; t++) {
    h.stepHolds(f());
    each(h, f());
    // Right of one facing +z is -x (the walker's (-nz, nx)).
    p.x += (-1 * vs) / 60;
    p.y += vu / 60;
  }
  return h;
}
const far = (h: HoldSteps, f: Frame, i: number) => { const r = h.restOf(h.limbs[i], f, { x: 0, y: 0, z: 0 }), l = h.limbs[i].hold; return Math.hypot(l.x - r.x, l.y - r.y, l.z - r.z); };

for (const k of [1, 0.5]) {
  test(`climb holds: up a face, limbs stay on their holds and within reach (body ${k})`, () => {
    let still = 0, moved = 0;
    const most = [0, 0, 0, 0];
    const prev = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    const was: boolean[] = [false, false];
    let first = true;
    const h = climb(k, 0, 0.6, 10, (h, f) => {
      h.limbs.forEach((l, i) => {
        const d = Math.hypot(l.hold.x - prev[i].x, l.hold.y - prev[i].y, l.hold.z - prev[i].z), reaching = h.reaching[l.group] !== null || was[l.group];
        // A limb moves only while its pair is reaching.
        if (!reaching && !first) { assert.ok(d < 1e-9, `${l.key} slid ${d} while on its hold`); still++; } else moved++;
        prev[i] = { x: l.hold.x, y: l.hold.y, z: l.hold.z };
        most[i] = Math.max(most[i], far(h, f, i));
        // In front of the face as far as its kind is held, on its hold.
        const depth = (l.hold.z - f.p.z) - f.face;
        assert.ok(h.reaching[l.group] !== null || Math.abs(depth + l.sizes.off * k) < 1e-9, `${l.key} depth ${depth}`);
      });
      was[0] = h.reaching[0] !== null; was[1] = h.reaching[1] !== null;
      first = false;
    });
    assert.ok(still > moved * (k < 1 ? 0.8 : 1.5), `on their holds much of the time (${still} of ${still + moved})`);
    assert.ok(h.reached >= 8, `${h.reached} reaches in 10 s`);
    // Never further from its rest place than it may lag (and the frames a reach takes) allows.
    h.limbs.forEach((l, i) => assert.ok(most[i] <= (l.sizes.lag + l.sizes.lead) * k, `${l.key} ${most[i].toFixed(2)} m from its rest`));
  });
}

test('climb holds: the pairs alternate and the second lets go only as the first takes hold', () => {
  const pairs: number[] = [], was: boolean[] = [false, false];
  climb(1, 0, 0.6, 12, (h) => {
    for (const g of [0, 1] as const) {
      const r = h.reaching[g];
      if (r !== null && !was[g]) pairs.push(g);
      was[g] = r !== null;
    }
    const [a, b] = h.reaching;
    if (a !== null && b !== null) assert.ok(Math.max(a, b) >= 0.6, 'both pairs off the rock');
  });
  assert.ok(pairs.length >= 8);
  pairs.slice(1).forEach((g, i) => assert.notEqual(g, pairs[i], 'the same pair twice running'));
});

test('climb holds: down a face reaches below, and the holds stay in reach', () => {
  let top = 0, lowest = Infinity;
  const h = climb(1, 0, -0.6, 10, (h, f) => { for (let i = 0; i < 4; i++) top = Math.max(top, far(h, f, i)); lowest = Math.min(lowest, h.limbs[1].to.y - h.limbs[1].from.y); });
  assert.ok(h.reached >= 8);
  assert.ok(lowest < 0, 'the foot reached down');
  assert.ok(top <= Math.max(HAND.lag + HAND.lead, FOOT.lag + FOOT.lead));
});

test('climb holds: along a face limbs step sideways between holds, not up and down', () => {
  const ys: number[] = [];
  let right = 0, left = 0;
  const h = climb(1, 0.6, 0, 8, (h) => { ys.push(h.limbs[1].hold.y); const l = h.limbs[1]; if (l.to.x < l.from.x) right++; else left++; });
  assert.ok(h.reached >= 6, `${h.reached} reaches`);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.1, 'no pedalling up and down');
  // Going right (−x): the next hold is to the right of the one left.
  assert.ok(right > left);
});

test('climb holds: standing on the face the limbs stay put and the cycle does not turn', () => {
  const h = new HoldSteps(), p = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < 120; t++) h.stepHolds({ p, nx: 0, nz: 1, face: 0.35, k: 1, vs: 0, vu: 0, dt: 1 / 60 });
  assert.equal(h.reached, 0);
  assert.equal(h.phase, 0);
});

test('climb holds: the phase of the cycle runs on, a half cycle a pair, never back', () => {
  let last = 0, wraps = 0;
  const h = climb(1, 0, 0.6, 12, (h) => { if (h.phase < last - 0.5) wraps++; else assert.ok(h.phase >= last - 1e-9, 'the phase went back'); last = h.phase; });
  assert.equal(wraps, Math.floor(h.reached / 2));
});

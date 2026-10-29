import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Skeleton } from '../src/world/skeleton';
import { classic } from '../src/setting/classic/index';

const sk = new Skeleton(parseSeed('masterworld'), classic.world);
const MESA = classic.world.kinds!.findIndex((k) => k.mesa);

test('landscape kinds: stretches 5-20 km across, by share, blending over a border', () => {
  // A long walk east: the runs of one kind, and how fast the mix changes along the way.
  const step = 100, runs: number[] = [];
  let kind = sk.kindAt(-300_000, 20_000), run = 0, mesa = 0, n = 0, jump = 0;
  for (let x = -300_000; x < 300_000; x += step) {
    const k = sk.kindAt(x, 20_000), w = sk.mesaWeight(x, 20_000);
    jump = Math.max(jump, Math.abs(w - sk.mesaWeight(x + step, 20_000)));
    if (k === MESA) mesa++;
    n++;
    if (k === kind) run += step;
    else { runs.push(run); run = step; kind = k; }
  }
  runs.sort((a, b) => a - b);
  const median = runs[runs.length >> 1];
  assert.ok(median > 3000 && median < 25_000, `median stretch ${median} m`);
  assert.ok(runs.length > 10, `${runs.length} stretches`);
  const share = mesa / n, want = classic.world.kinds![MESA].share / classic.world.kinds!.reduce((a, k) => a + k.share, 0);
  assert.ok(Math.abs(share - want) < 0.2, `mesa share ${share.toFixed(2)} (setting ${want.toFixed(2)})`);
  // No sudden border: the mix changes by little over 100 m.
  assert.ok(jump < 0.12, `mix jumps by ${jump.toFixed(2)} over ${step} m`);
});

/**
 * Plateau tops in a square of mesa country, and whether a walker gets onto each from the valley floors: up
 * ground no steeper than it can climb (the walker's 1.25), never through the sea.
 */
function plateaus(sk: Skeleton, cx: number, cz: number, span: number, step: number, maxSlope = 1.25) {
  const N = Math.round(span / step), h = new Float64Array(N * N), top = new Uint8Array(N * N), reach = new Uint8Array(N * N);
  const q: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx - span / 2 + i * step, z = cz - span / 2 + j * step, k = j * N + i;
    h[k] = sk.elevation(x, z);
    const m = sk.lastMesa;
    if (m.rise > 0.92 * m.tall && m.tall > 35 && sk.mesaWeight(x, z) > 0.9) top[k] = 1;
    // Valley floors well out from any wall: where the walker starts.
    if (h[k] > 0 && m.u < -150) { reach[k] = 1; q.push(k); }
  }
  // Steepness at each cell: the steeper side each way (so a wall is not averaged with its foot or crest).
  const steep = new Float64Array(N * N);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    steep[k] = Math.hypot(Math.max(Math.abs(h[k + 1] - h[k]), Math.abs(h[k] - h[k - 1])), Math.max(Math.abs(h[k + N] - h[k]), Math.abs(h[k] - h[k - N]))) / step;
  }
  while (q.length) {
    const k = q.pop()!, i = k % N, j = (k / N) | 0;
    for (const m of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1]) {
      if (m < 0 || reach[m] || h[m] <= 0) continue;
      // Down is always fine; up only on ground the walker can climb.
      if (h[m] > h[k] && (steep[m] > maxSlope || (h[m] - h[k]) / step > maxSlope)) continue;
      reach[m] = 1;
      q.push(m);
    }
  }
  // Each whole plateau top (not cut by the square's edge), its area and whether the walker got onto it.
  const seen = new Uint8Array(N * N), out: { km2: number; reached: boolean; x: number; z: number }[] = [];
  for (let s = 0; s < N * N; s++) {
    if (!top[s] || seen[s]) continue;
    const st = [s];
    seen[s] = 1;
    let area = 0, hit = false, edge = false, sx = 0, sz = 0;
    while (st.length) {
      const k = st.pop()!, i = k % N, j = (k / N) | 0;
      area++; sx += i; sz += j;
      hit ||= reach[k] === 1;
      edge ||= i === 0 || j === 0 || i === N - 1 || j === N - 1;
      for (const m of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1]) if (m >= 0 && top[m] && !seen[m]) { seen[m] = 1; st.push(m); }
    }
    if (!edge) out.push({ km2: (area * step * step) / 1e6, reached: hit, x: cx - span / 2 + (sx / area) * step, z: cz - span / 2 + (sz / area) * step });
  }
  return out;
}

test('mesa country: plateaus 40-200 m high behind walls a walker cannot climb, each with a pass it can', () => {
  const tops = plateaus(sk, -22500, 36500, 5600, 10).filter((p) => p.km2 > 0.1);
  assert.ok(tops.length >= 3, `${tops.length} plateaus`);
  for (const p of tops) assert.ok(p.reached, `no way onto the plateau of ${p.km2.toFixed(2)} km² at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
  // Their walls: up the lower step's face (above its talus, below a bench), away from the passes, steeper than the walker climbs; heights in the setting's range.
  let walls = 0, climbable = 0, low = Infinity, high = 0;
  for (let z = 34000; z < 39000; z += 7) for (let x = -25000; x < -20000; x += 53) {
    const rise = sk.mesaRise(x, z), m = sk.lastMesa;
    if (m.pass > 0 || m.tall < 35 || rise < 12 || rise > 0.3 * m.tall || sk.mesaWeight(x, z) < 1) continue;
    // (Near the coast the plateaus come down to the sea cliffs.)
    const e = sk.elevation(x, z);
    if (sk.lastShore < 600) continue;
    const g = Math.hypot(sk.elevation(x + 0.5, z) - e, sk.elevation(x, z + 0.5) - e) / 0.5;
    walls++;
    if (g <= 1.25) climbable++;
    low = Math.min(low, m.tall);
    high = Math.max(high, m.tall);
  }
  assert.ok(walls > 50, `${walls} wall points`);
  assert.ok(climbable / walls < 0.05, `${climbable} of ${walls} wall points walkable`);
  assert.ok(low >= 40 && high <= 200 && high - low > 40, `plateaus ${low.toFixed(0)}-${high.toFixed(0)} m high`);
});

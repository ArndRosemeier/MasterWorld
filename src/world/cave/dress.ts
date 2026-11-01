/**
 * The dresser (D63, phase K3; docs/design/caves.md 3.4; pure, seeded, runs in a worker): what lies in a carved solution
 * cave. After the carver it
 *  - lays silt on the floors (never level, deeper where the way is roomy, none in the stream's bed) and cuts the stream's
 *    bed and its pools into the field;
 *  - sets fallen rock along the feet of the walls and over a collapse's heap, stamped into the field;
 *  - lets water drip from the cracks (joints) that cross a way's roof, where each drip hangs a stalactite over a
 *    stalagmite, or a column once they meet; old dry levels grow longer, dusty, dead formations.
 * The formations are thin, so they are a list (the game instances them and the walker reads their colliders), not field.
 * Nothing narrows a way: silt never takes the head room (D63: no squeezing), a formation stays off the floor's middle where
 * the way is narrow, and a stalactite's tip hangs above the hero's head.
 */
import { Noise, Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { CavesDef } from '../../setting/contract';
import { jointDistance, type RockBlock } from './block';
import { BRICK, brickIndex, sampleOf, setSample, type BrickField } from '../dungeon/rockMesh';
import type { CondPoint, Conduit, Skeleton } from './skeleton';

/** A formation: a body of revolution about a vertical axis from `y0` up to `y1`, `rb` wide at the bottom, `rt` at the top, `waist` the share of the mean radius in the middle. */
export interface Speleo {
  readonly kind: 'stalactite' | 'stalagmite' | 'column' | 'straw';
  readonly x: number;
  readonly z: number;
  readonly y0: number;
  readonly y1: number;
  readonly rb: number;
  readonly rt: number;
  readonly waist: number;
  /** Dry: no water runs here any more (dusty, grey). */
  readonly dead: boolean;
}

/** Water falling from a roof: where it leaves the tip, and the height it lands at. */
export interface Drip { readonly x: number; readonly y: number; readonly z: number; readonly floor: number }

/** A stream: points along its course with the surface's height and the half-width. */
export interface Stream { readonly pts: readonly (readonly [number, number, number, number])[] }

/** A pool: a basin cut into the floor, its surface and radius. */
export interface Pool { readonly x: number; readonly y: number; readonly z: number; readonly r: number }

/** A fallen rock: an ellipsoid turned by its yaw. */
export interface Rock { readonly x: number; readonly y: number; readonly z: number; readonly rx: number; readonly ry: number; readonly rz: number; readonly yaw: number }

export interface Dressing {
  readonly speleos: readonly Speleo[];
  readonly drips: readonly Drip[];
  readonly streams: readonly Stream[];
  readonly pools: readonly Pool[];
  readonly rocks: readonly Rock[];
  readonly stats: {
    /** Columns with head room to stand, and the share of them whose floor is level (under about 2.5 degrees). */
    readonly standable: number;
    readonly level: number;
    readonly ms: number;
  };
}

/** The air of a column of a field as floor, ceiling pairs (metres, interpolated at the surface). */
export function columnSpans(f: BrickField, i: number, k: number, out: number[] = []): number[] {
  out.length = 0;
  if (i < 0 || k < 0 || i >= f.nx || k >= f.nz) return out;
  const inI = i % BRICK, inK = k % BRICK;
  let air = false, floor = f.oy, prev = -1;
  for (let j = 0; j < f.ny;) {
    const row = (j / BRICK) | 0, brick = f.bricks[brickIndex(f, i, j, k)], end = Math.min(f.ny, (row + 1) * BRICK);
    if (!brick) {
      // A missing brick is solid throughout.
      if (air) { out.push(floor, f.oy + (j - 1 + prev / (prev + 1)) * f.step); air = false; }
      prev = -1; j = end; continue;
    }
    for (; j < end; j++) {
      const v = brick[inI + BRICK * ((j % BRICK) + BRICK * inK)];
      if (v > 0 && !air) { floor = j === 0 ? f.oy : f.oy + (j - 1 + -prev / (v - prev)) * f.step; air = true; }
      else if (v <= 0 && air) { out.push(floor, f.oy + (j - 1 + prev / (prev - v)) * f.step); air = false; }
      prev = v;
    }
  }
  return out;
}

const smooth01 = (t: number): number => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/** Dress a carved cave: edits `f` (silt, the stream, pools, rocks) and lists the rest. */
export function dressCave(sk: Skeleton, block: RockBlock, f: BrickField, caves: CavesDef, timer: () => number = Date.now): Dressing {
  const t0 = timer(), d = caves.dress, head = caves.way.minHeight + 0.1, half = caves.way.minWidth / 2;
  const rng = new Rng(deriveSeed(block.seed, 'cave', 'dress')), noise = new Noise(deriveSeed(block.seed, 'cave', 'silt'));
  const { ox, oy, oz, step, nx, ny, nz } = f;
  const col = (x: number) => Math.round((x - ox) / step), row = (z: number) => Math.round((z - oz) / step);
  const wayHalf = (p: CondPoint) => (p.C > 0 ? p.C : p.A);

  // Which columns of the field hold any brick.
  const has = new Uint8Array(f.bx * f.bz);
  for (let b = 0; b < f.bricks.length; b++) if (f.bricks[b]) has[(b % f.bx) + f.bx * Math.floor(b / (f.bx * f.by))] = 1;
  const inBricks = (i: number, k: number) => has[((i / BRICK) | 0) + f.bx * ((k / BRICK) | 0)] === 1;

  const spansOf = (i: number, k: number, out: number[] = []): number[] => (inBricks(i, k) ? columnSpans(f, i, k, out) : (out.length = 0, out));
  const tmp: number[] = [];
  /** The span of the column at (x, z) that holds height y (or lies nearest to it), as [floor, ceiling]. */
  const spanAt = (x: number, y: number, z: number): [number, number] | null => {
    const s = spansOf(col(x), row(z), tmp);
    let best: [number, number] | null = null, bd = 1.2;
    for (let n = 0; n < s.length; n += 2) {
      const gap = y < s[n] ? s[n] - y : y > s[n + 1] ? y - s[n + 1] : 0;
      if (gap < bd) { bd = gap; best = [s[n], s[n + 1]]; }
    }
    return best;
  };
  /** The least head room (metres) over the floor of a disc of radius r about (x, z), -1 where its middle is no floor near y (the rock's wall side is ignored). */
  const roomAround = (x: number, y: number, z: number, r: number): number => {
    let room = Infinity;
    for (let a = -1; a < 8; a++) {
      const sx = a < 0 ? x : x + Math.cos(a * Math.PI / 4) * r, sz = a < 0 ? z : z + Math.sin(a * Math.PI / 4) * r, sp = spanAt(sx, y, sz);
      if (!sp) { if (a < 0) return -1; continue; }
      room = Math.min(room, sp[1] - sp[0]);
    }
    return room;
  };
  const brickThere = (i: number, j: number, k: number) => !!f.bricks[brickIndex(f, i, j, k)];

  // --- the stream and its pools ---
  const streams: Stream[] = [], pools: Pool[] = [];
  const chan = new Float32Array(nx * nz).fill(1e9);
  const passages = sk.conduits.filter((c) => c.kind === 'passage');
  for (const c of passages) if (c.active) streamOf(c);
  for (const sm of streams) for (const [x, , z, w] of sm.pts) {
    const r = w + 1.6, i0 = Math.max(0, col(x - r)), i1 = Math.min(nx - 1, col(x + r)), k0 = Math.max(0, row(z - r)), k1 = Math.min(nz - 1, row(z + r));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) chan[i + nx * k] = Math.min(chan[i + nx * k], Math.hypot(ox + i * step - x, oz + k * step - z) - w);
  }

  function streamOf(c: Conduit): void {
    // Points about a metre apart with the floor under them.
    const raw: { x: number; z: number; fl: number; w: number; hh: number }[] = [];
    for (let s = 0; s + 1 < c.points.length; s++) {
      const a = c.points[s], b = c.points[s + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.1));
      for (let m = 0; m < n; m++) {
        const t = m / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), y = lerp(a.y - a.B - a.D, b.y - b.B - b.D, t), hh = lerp(wayHalf(a), wayHalf(b), t);
        const sp = spanAt(x, y + 1, z);
        if (sp) raw.push({ x, z, fl: sp[0], w: Math.min(lerp(d.water.width[0], d.water.width[1], Math.sqrt(lerp(a.flow, b.flow, t))), hh * 0.55 - 0.1), hh });
        else if (raw.length > 1) { finish(raw.splice(0)); }
        else raw.length = 0;
      }
    }
    if (raw.length > 1) finish(raw);
  }
  function finish(raw: { x: number; z: number; fl: number; w: number; hh: number }[]): void {
    if (raw.length < 6) return;
    // The surface keeps to the lowest floor near it, so the water never floats over a dip.
    const pts = raw.map((r, i) => {
      let lo = Infinity;
      for (let o = -3; o <= 3; o++) lo = Math.min(lo, raw[Math.max(0, Math.min(raw.length - 1, i + o))].fl);
      return [r.x, lo - 0.05, r.z, Math.max(0.5, r.w)] as [number, number, number, number];
    });
    const length = pts.length * 1.1, want = Math.round(length / 100 * d.water.pools + rng.float() * 0.8);
    const flat = pts.map((_, i) => ({ i, slope: i < 4 || i > pts.length - 5 ? 9 : Math.abs(pts[i + 4][1] - pts[i - 4][1]) })).sort((a, b) => a.slope - b.slope);
    const taken: number[] = [], mine: Pool[] = [];
    for (const { i, slope } of flat) {
      if (taken.length >= want || slope > 0.3) break;
      if (taken.some((t) => Math.abs(t - i) < 9)) continue;
      const r = Math.min(2.4, raw[i].hh * 0.55, pts[i][3] * 1.8);
      if (r < 1.1) continue;
      taken.push(i); mine.push({ x: pts[i][0], y: pts[i][1], z: pts[i][2], r });
    }
    for (const p of pts) basin(p[0], p[1], p[2], p[3], d.water.bed);
    for (const p of mine) basin(p.x, p.y, p.z, p.r, d.water.poolDepth);
    // Water stays where the cut bed holds it: a stretch over a drop or a gap is no stream.
    let run: [number, number, number, number][] = [];
    const keep = (): void => { if (run.length >= 6) streams.push({ pts: run }); run = []; };
    for (const p of pts) {
      const sp = spanAt(p[0], p[1] + 0.3, p[2]);
      if (sp && sp[0] <= p[1] - d.water.bed * 0.4 && sp[0] >= p[1] - d.water.bed - 0.5) run.push(p); else keep();
    }
    keep();
    for (const p of mine) if (streams.some((s) => s.pts.some((q) => q[0] === p.x && q[2] === p.z))) pools.push(p);
  }
  /** Cut a basin of radius r into the floor, its surface at `top`, `depth` deep in the middle. */
  function basin(x: number, top: number, z: number, r: number, depth: number): void {
    const i0 = Math.max(0, col(x - r - step)), i1 = Math.min(nx - 1, col(x + r + step)), k0 = Math.max(0, row(z - r - step)), k1 = Math.min(nz - 1, row(z + r + step));
    const j0 = Math.max(0, Math.floor((top - depth - 1 - oy) / step)), j1 = Math.min(ny - 1, Math.ceil((top + 1.2 - oy) / step));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const dd = Math.hypot(ox + i * step - x, oz + k * step - z);
      if (dd > r + step) continue;
      const bed = top - depth * Math.max(0, 1 - (dd / r) ** 2);
      for (let j = j0; j <= j1; j++) {
        if (!brickThere(i, j, k)) continue;
        const y = oy + j * step, v = Math.min((r - dd) * 0.8, y - bed, top + 1.2 - y);
        if (v > sampleOf(f, i, j, k)) setSample(f, i, j, k, Math.min(v, 3));
      }
    }
  }

  // --- silt: the floor is never level ---
  const sp = [] as number[];
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!inBricks(i, k)) continue;
    spansOf(i, k, sp);
    const x = ox + i * step, z = oz + k * step, fade = smooth01(chan[i + nx * k] / 1.4);
    for (let n = 0; n < sp.length; n += 2) {
      const floor = sp[n], gap = sp[n + 1] - floor, avail = gap - head;
      if (avail <= 0.05) continue;
      const deep = lerp(d.floor.silt[0], d.floor.silt[1], 0.5 + 0.5 * noise.n2(x / 11, z / 11));
      let lift = Math.max(0, deep + d.floor.relief * noise.n2(x / 3.3 + 7, z / 3.3 - 3) + 0.4 * d.floor.relief * noise.n2(x / 1.4, z / 1.4 + 9));
      lift = Math.min(lift, avail) * smooth01(avail / 1.2) * fade;
      if (lift < 0.03) continue;
      const top = floor + lift, j0 = Math.max(0, Math.floor((floor - oy) / step) - 1), j1 = Math.min(ny - 1, Math.ceil((top - oy) / step) + 1);
      for (let j = j0; j <= j1; j++) {
        const v0 = sampleOf(f, i, j, k), v = oy + j * step - top;
        if (v < v0) setSample(f, i, j, k, Math.max(-1, v));
      }
    }
  }

  // --- fallen rock ---
  const rocks: Rock[] = [], rn = new Noise(deriveSeed(block.seed, 'cave', 'rocks'));
  const passagePts: { p: CondPoint; q: CondPoint }[] = [];
  for (const c of passages) for (let s = 0; s + 1 < c.points.length; s++) passagePts.push({ p: c.points[s], q: c.points[s + 1] });
  const nAlong = passagePts.length ? Math.round(sk.stats.length / 100 * d.rocks.along) : 0;
  for (let n = 0; n < nAlong; n++) {
    const { p, q } = passagePts[rng.int(0, passagePts.length - 1)], hh = wayHalf(p);
    const r = rng.range(d.rocks.size[0], d.rocks.size[1]);
    // Only where the free way stays at its least: rocks lie against the walls, off the middle.
    if (hh - r * 1.2 < half + 0.25) continue;
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, off = (hh - r * 0.8) * rng.sign();
    const x = p.x - dz / l * off, z = p.z + dx / l * off, fl = spanAt(x, p.y - p.B - p.D + 1, z);
    if (fl && roomAround(x, fl[0] + 0.5, z, r * 1.5) > head + r * 1.2) rocks.push({ x, y: fl[0] + r * 0.25, z, rx: r * rng.range(0.9, 1.5), ry: r * rng.range(0.6, 0.95), rz: r, yaw: rng.range(0, Math.PI) });
  }
  for (const v of sk.voids) {
    const n = rng.int(d.rocks.perHall[0], d.rocks.perHall[1]), cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    for (let m = 0; m < n; m++) {
      const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.float()) * 0.85, u = Math.cos(a) * rr * v.rx, w = Math.sin(a) * rr * v.rz;
      const x = v.x + u * cy - w * sy, z = v.z + u * sy + w * cy, r = rng.range(d.rocks.size[0], d.rocks.size[1] * 1.5), fl = spanAt(x, v.floor + 1, z);
      if (fl && roomAround(x, fl[0] + 0.5, z, r * 1.6) > head + r * 1.5) rocks.push({ x, y: fl[0] + r * 0.2, z, rx: r * rng.range(0.9, 1.6), ry: r * rng.range(0.55, 0.9), rz: r, yaw: rng.range(0, Math.PI) });
    }
  }
  for (const k of rocks) {
    const reach = Math.max(k.rx, k.rz) + 0.8, i0 = Math.max(0, col(k.x - reach)), i1 = Math.min(nx - 1, col(k.x + reach)), k0 = Math.max(0, row(k.z - reach)), k1 = Math.min(nz - 1, row(k.z + reach));
    const j0 = Math.max(0, Math.floor((k.y - k.ry - 0.8 - oy) / step)), j1 = Math.min(ny - 1, Math.ceil((k.y + k.ry + 0.8 - oy) / step)), c = Math.cos(k.yaw), s = Math.sin(k.yaw);
    for (let kk = k0; kk <= k1; kk++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!brickThere(i, j, kk)) continue;
      const px = ox + i * step - k.x, py = oy + j * step - k.y, pz = oz + kk * step - k.z, u = (px * c + pz * s) / k.rx, w = (-px * s + pz * c) / k.rz, e = Math.sqrt(u * u + (py / k.ry) ** 2 + w * w);
      const v = (e - 1) * Math.min(k.rx, k.ry, k.rz) + 0.18 * rn.n3(px / 0.9 + k.x, py / 0.9, pz / 0.9);
      if (v < sampleOf(f, i, j, kk)) setSample(f, i, j, kk, Math.max(-1, v));
    }
  }

  // --- drips and formations along the cracks over the ways ---
  const speleos: Speleo[] = [], drips: Drip[] = [], lastLevel = Math.max(0, sk.tables.length - 1);
  for (const c of passages) {
    const age = 1 + d.formations.age * (1 - (lastLevel ? c.level / lastLevel : 0));
    for (let s = 0; s + 1 < c.points.length && speleos.length < d.formations.most; s++) {
      const a = c.points[s], b = c.points[s + 1];
      if (a.B < 1.4) continue;
      for (const set of block.joints) {
        const u0 = a.x * set.nx + a.z * set.nz, u1 = b.x * set.nx + b.z * set.nz, lo = Math.min(u0, u1), hi = Math.max(u0, u1);
        for (const plane of set.planes) {
          if (plane < lo || plane >= hi) continue;
          const t = (plane - u0) / (u1 - u0), qx = lerp(a.x, b.x, t), qy = lerp(a.y, b.y, t), qz = lerp(a.z, b.z, t), A = lerp(a.A, b.A, t);
          // Along the crack across the roof, a drip every so often.
          for (let o = -A * 0.85 + rng.range(0, d.drips.spacing); o < A * 0.85; o += d.drips.spacing * rng.range(0.7, 1.4)) {
            if (!rng.chance(d.drips.chance) || speleos.length >= d.formations.most) continue;
            const x = qx - set.nz * o, z = qz + set.nx * o, span = spanAt(x, qy, z);
            if (!span || span[1] - span[0] < head + 0.3 || Math.abs(jointDistance(set, x, z)) > 1) continue;
            dripAt(x, z, span[0], span[1], c, age, wayHalf(a));
          }
        }
      }
    }
  }
  // Seeps away from the cracks too.
  const nSeep = passagePts.length ? Math.round(sk.stats.length / 100 * d.drips.scatter) : 0;
  for (let n = 0; n < nSeep && speleos.length < d.formations.most; n++) {
    const { p, q } = passagePts[rng.int(0, passagePts.length - 1)], t = rng.float(), c = passages.find((k) => k.points.includes(p))!;
    const x = lerp(p.x, q.x, t) + rng.range(-0.75, 0.75) * p.A, z = lerp(p.z, q.z, t) + rng.range(-0.75, 0.75) * p.A, span = spanAt(x, lerp(p.y, q.y, t), z);
    if (span && span[1] - span[0] >= head + 0.3 && p.B >= 1.4) dripAt(x, z, span[0], span[1], c, 1 + d.formations.age * (1 - (lastLevel ? c.level / lastLevel : 0)), wayHalf(p));
  }
  function dripAt(x: number, z: number, floor: number, ceil: number, c: Conduit, age: number, hh: number): void {
    const live = c.active || c.level >= lastLevel || rng.chance(d.drips.live), dead = !live, gap = ceil - floor;
    // A stalactite's tip stays above the hero's head.
    let lenT = Math.min(lerp(d.formations.length[0], d.formations.length[1], rng.float() ** 2) * age, gap - head);
    const r = Math.max(0.05, Math.min(0.5, 0.05 + 0.13 * lenT));
    const lenM = Math.min(lenT > 0.15 ? lenT * rng.range(0.3, 0.85) : rng.range(0.08, 0.3), gap - head, 2.4), rM = Math.min(0.65, Math.max(0.1, r * 1.7));
    const mayStand = 2 * hh - 2 * rM >= caves.way.minWidth + 0.4 && chan[col(x) + nx * row(z)] > 0.7;
    if (lenT > 0.15 && mayStand && gap < d.formations.column * age * rng.range(0.5, 1) && lenT + lenM + 0.4 >= gap * 0.5) {
      const rc = Math.min(0.8, Math.max(0.2, rM * 0.9));
      speleos.push({ kind: 'column', x, z, y0: floor, y1: ceil, rb: rc, rt: rc * 0.9, waist: 0.6, dead });
      return;
    }
    if (lenT > 0.15) speleos.push({ kind: 'stalactite', x, z, y0: ceil - lenT, y1: ceil, rb: 0.02, rt: r, waist: 0.85, dead });
    else lenT = 0;
    if (mayStand && lenM > 0.1) speleos.push({ kind: 'stalagmite', x, z, y0: floor, y1: floor + lenM, rb: rM, rt: Math.min(0.1, rM * 0.3), waist: 0.9, dead });
    if (rng.chance(d.formations.straws)) {
      const sl = Math.min(rng.range(0.4, 1.4), gap - head - lenT * 0.5);
      if (sl > 0.25) speleos.push({ kind: 'straw', x: x + rng.range(-0.25, 0.25), z: z + rng.range(-0.25, 0.25), y0: ceil - sl, y1: ceil, rb: 0.012, rt: 0.03, waist: 1, dead });
    }
    if (live) drips.push({ x, y: ceil - lenT, z, floor: floor + (mayStand && lenM > 0.1 ? lenM : 0) });
  }

  // --- how level is the standable ground? ---
  const floors = new Float32Array(nx * nz).fill(NaN);
  let standable = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!inBricks(i, k)) continue;
    spansOf(i, k, sp);
    for (let n = 0; n < sp.length; n += 2) if (sp[n + 1] - sp[n] >= head) { floors[i + nx * k] = sp[n]; standable++; break; }
  }
  let level = 0;
  for (let k = 0; k + 1 < nz; k++) for (let i = 0; i + 1 < nx; i++) {
    const h = floors[i + nx * k], hx = floors[i + 1 + nx * k], hz = floors[i + nx * (k + 1)];
    if (h === h && hx === hx && hz === hz && Math.max(Math.abs(hx - h), Math.abs(hz - h)) < 0.045 * step) level++;
  }
  return { speleos, drips, streams, pools, rocks, stats: { standable, level: standable ? level / standable : 0, ms: timer() - t0 } };
}

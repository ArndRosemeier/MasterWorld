/**
 * The mine former (D63, phase K8; docs/design/caves.md 3.2; pure, runs in a worker): people followed an ore body into the hill.
 * The block's first ore body is a long, tall vein. They drove an adit (a square-cut tunnel) from the hillside to it, drifts
 * along it on one or more levels, crosscuts off the drifts, inclines between the levels, and took the ore out as stopes (tall
 * chambers over a drift, a heap of waste under each). Ore is for show (no mining, ever): it gives the mine its look and purpose.
 * It writes the same skeleton the other formers do (world/cave/skeleton.ts), with `sq` set so the carver cuts the drifts square
 * and `rough` low so the walls keep the marks of tools instead of water's scallops.
 */
import { Noise, Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { CavesDef } from '../../setting/contract';
import type { OreBody, RockBlock } from './block';
import { mouthOf, type CondPoint, type Conduit, type Skeleton, type Void } from './skeleton';

/** Metres between a drift's points. */
const STEP = 3;
/** Metres of rock kept between a drift and the block's sides and bottom. */
const EDGE = 8, BOTTOM = 3;
/** The way a mouth runs on outwards. */
const OUT = [0, 4, 8] as const;
/** How much of the water's scalloping the walls of a mine keep (tool marks, not water: see `Skeleton.rough`). */
const TOOLED = 0.3;
/** The adit's floor falls this much a metre toward the mouth (it drains). */
const DRAIN = 0.012;

type Vein = Extract<OreBody, { kind: 'vein' }>;

/** The block's best vein: the biggest in plane area. */
function bestVein(block: RockBlock): Vein | null {
  let best: Vein | null = null, area = 0;
  for (const o of block.ore) if (o.kind === 'vein') {
    const a = o.along * (o.y1 - o.y0);
    if (a > area) { area = a; best = o; }
  }
  return best;
}

/** Form the mine of a block. `scale` sizes the lengths (the size's scale, 1 for a medium one). */
export function formMine(block: RockBlock, caves: CavesDef, scale: number, since: () => number): Skeleton {
  const t0 = since(), made = block.rock.mine;
  if (!made) throw new Error(`rock "${block.rock.id}" has no mine`);
  const mine = made, rng = new Rng(deriveSeed(block.seed, 'cave', 'mine')), noise = new Noise(deriveSeed(block.seed, 'cave', 'mine', 'hand'));
  const way = caves.way, land = block.land, across = block.across, top = block.deep - 2, ln = Math.sqrt(scale);
  const vein = bestVein(block);
  if (!vein) throw new Error('a mine needs a vein');
  const nh = Math.hypot(vein.plane.nx, vein.plane.nz) || 1, hx = vein.plane.nx / nh, hz = vein.plane.nz / nh, sx = -hz, sz = hx;
  const A = Math.max(way.minWidth / 2 + 0.1, lerp(mine.halfWidth[0], mine.halfWidth[1], rng.float()));
  // Where the drift runs at height y, `s` metres along the strike: beside the vein's plane (its middle), one drift's half width over, so
  // the drift's wall is the vein and the ore shows along it (the vein is a sheet less than a drift wide: right on it, the drift would cut it all away).
  const planeAt = (y: number, s: number): [number, number] => {
    const d = (vein.cx - vein.plane.px) * vein.plane.nx + (y - vein.plane.py) * vein.plane.ny + (vein.cz - vein.plane.pz) * vein.plane.nz, off = A - d / nh;
    return [vein.cx + sx * s + hx * off, vein.cz + sz * s + hz * off];
  };
  const B = Math.max(way.minHeight / 2 + 0.1, lerp(mine.halfHeight[0], mine.halfHeight[1], rng.float()));
  const inside = (x: number, z: number) => x > EDGE && z > EDGE && x < across - EDGE && z < across - EDGE;
  const conduits: Conduit[] = [], voids: Void[] = [];
  let length = 0, points = 0, junctions = 0;
  /** A hand-cut course varies a little: the walls and the floor wander by a few decimetres. */
  const point = (x: number, y: number, z: number, a = A, b = B): CondPoint => ({ x: x + noise.n3(x / 9, 1.3, z / 9) * 0.25, y, z: z + noise.n3(x / 9, 7.1, z / 9) * 0.25, A: a, B: b, C: a * 0.8, D: 0, flow: 0, sq: mine.square });
  const addPassage = (pts: CondPoint[], mouth = false, yaw = 0, ladder?: Conduit['ladder']): void => {
    if (pts.length < 2) return;
    conduits.push({ kind: 'passage', points: pts, level: 0, active: false, ...(ladder ? { ladder } : {}) });
    points += pts.length;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
    if (mouth) {
      conduits.push(mouthOf(pts[pts.length - 1], yaw, OUT));
      length += OUT[OUT.length - 1];
    }
  };

  // --- the levels: floors of drifts, the lowest first, inside the vein's height ---
  const floorLow = Math.min(vein.y0 + 3, top - 2 * B - 2), room = Math.max(0, vein.y1 - 3 - floorLow);
  const nLevels = Math.max(1, Math.min(rng.int(mine.levels[0], mine.levels[1]), 1 + Math.floor(room / mine.gap)));
  const floors: number[] = [];
  for (let k = 0; k < nLevels; k++) floors.push(Math.min(floorLow + k * mine.gap, top - 2 * B - 2));
  const reach = Math.max(8, vein.along - 4);

  // --- the adit: from the lowest level's middle out to where the land comes down to its roof (a way in from the hillside) ---
  const [mx, mz] = planeAt(floors[0] + B, 0);
  type Run = { yaw: number; pts: CondPoint[]; mouth: boolean };
  let best: Run | null = null;
  const dirs = 18, start = rng.range(0, Math.PI * 2);
  for (let k = 0; k < dirs; k++) {
    const yaw = start + (k / dirs) * Math.PI * 2, pts: CondPoint[] = [];
    let mouth = false, ok = true;
    for (let run = 0; ; run += STEP) {
      const x = mx + Math.cos(yaw) * run, z = mz + Math.sin(yaw) * run, floor = floors[0] - DRAIN * run, ground = land.surface(x, z), roofTop = floor + 2 * B;
      if (!inside(x, z) || floor < BOTTOM) { ok = false; break; }
      if (run >= mine.adit && roofTop > ground - 1) { mouth = true; break; }
      // Rock enough over the roof, until the last stretch where the land comes down to it.
      if (ground - roofTop < mine.roof && run < 8) { ok = false; break; }
      pts.push(point(x, floor + B, z));
      if (run > across) { ok = false; break; }
    }
    // The shortest adit that comes out wins; a way that did not is kept only if none does.
    if (mouth && pts.length >= 3 && (!best || !best.mouth || pts.length < best.pts.length)) best = { yaw, pts, mouth };
    else if (!best && ok === false && pts.length >= 6) best = { yaw, pts, mouth: false };
  }
  if (!best) {
    // (No way found: a straight adit to the nearest side of the block, its mouth at the end.)
    const yaw = Math.atan2(across / 2 - mz, across / 2 - mx) + Math.PI, pts: CondPoint[] = [];
    for (let run = 0; run < 40; run += STEP) { const x = mx + Math.cos(yaw) * run, z = mz + Math.sin(yaw) * run; if (!inside(x, z)) break; pts.push(point(x, floors[0] + B - DRAIN * run, z)); }
    best = { yaw, pts, mouth: true };
  }
  // The adit is walked from the mouth in, so its points run from the vein out: that is the order a mouth conduit follows (it ends at the mouth).
  addPassage(best.pts, true, best.yaw);

  // --- the drifts, along the vein on each level, and what comes off them ---
  const drifts: { level: number; pts: CondPoint[]; sMin: number; sMax: number }[] = [];
  for (let k = 0; k < nLevels; k++) {
    const floor = floors[k], pts: CondPoint[] = [];
    // The drift runs along the strike a long way each side of the vein's middle, as far as the rock is thick over it.
    const span = (dir: 1 | -1): number => {
      let s = 0;
      const most = reach * rng.range(0.55, 1);
      for (; s < most; s += STEP) {
        const [x, z] = planeAt(floor + B, dir * (s + STEP));
        if (!inside(x, z) || land.surface(x, z) - (floor + 2 * B) < mine.roof + 1) break;
      }
      return s;
    };
    const sMin = -span(-1), sMax = span(1);
    for (let s = sMin; s <= sMax + 1e-6; s += STEP) { const [x, z] = planeAt(floor + B, s); pts.push(point(x, floor + B, z)); }
    if (pts.length >= 3) { addPassage(pts); drifts.push({ level: k, pts, sMin, sMax }); }
  }

  const strike = Math.atan2(sz, sx);
  for (const d of drifts) {
    const floor = floors[d.level];
    // Crosscuts: from the drift across to the other side of the vein and on into the barren rock, ending where the people stopped.
    const nc = rng.int(mine.crosscuts[0], mine.crosscuts[1]);
    for (let c = 0; c < nc; c++) {
      const at = rng.int(2, Math.max(2, d.pts.length - 3)), p = d.pts[at];
      if (Math.hypot(p.x - mx, p.z - mz) < 7 && d.level === 0) continue;
      const sign = rng.chance(0.5) ? 1 : -1, len = rng.range(mine.crosscutLength[0], mine.crosscutLength[1]) * ln, pts: CondPoint[] = [];
      for (let t = 0; t <= len; t += STEP) {
        const x = p.x + hx * sign * t, z = p.z + hz * sign * t;
        if (!inside(x, z) || land.surface(x, z) - (floor + 2 * B) < mine.roof) break;
        pts.push(point(x, floor + B, z));
      }
      if (pts.length >= 3) { addPassage(pts); junctions++; }
    }
    // Stopes: where the ore was taken out, a tall chamber over the drift (a heap of waste rock under it).
    const topLevel = d.level === nLevels - 1;
    for (let q = 0; q < mine.stopes; q++) {
      const at = rng.int(2, Math.max(2, d.pts.length - 3)), p = d.pts[at], rx = rng.range(mine.stopeLength[0], mine.stopeLength[1]) * ln, rz = Math.max(A + 1.2, vein.thick * 2 + 1.8);
      const room = land.surface(p.x, p.z) - floor - mine.roof - 1, height = Math.min(topLevel ? rng.range(10, 15) : mine.gap * 0.7, room);
      if (height < 2 * B + 2 || voids.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < v.rx + rx + 3 && Math.abs(v.floor - floor) < 3)) continue;
      voids.push({ x: p.x, z: p.z, floor, rx, rz, yaw: strike, height, heapR: 0.45 * rz, heapH: Math.min(0.1 * height, 1), skylight: false, seed: deriveSeed(block.seed, 'stope', voids.length) });
    }
  }

  // Inclines: from the end of a lower drift, up beside the vein to the end of the drift above (the ways between the levels).
  for (let k = 0; k + 1 < drifts.length; k++) {
    const lo = drifts[k], hi = drifts[k + 1], rise = floors[hi.level] - floors[lo.level], run = rise / mine.incline;
    // From the lower drift's farther end back along it, so the incline lies over the drift's own length.
    const dir: 1 | -1 = lo.sMax - lo.sMin > hi.sMax - hi.sMin ? 1 : -1, s0 = dir === 1 ? lo.sMin + 3 : lo.sMax - 3;
    if (Math.abs(s0 + dir * run) > Math.max(Math.abs(hi.sMin), Math.abs(hi.sMax)) + 1 || (dir === 1 ? s0 + run > hi.sMax : s0 - run < hi.sMin)) continue;
    const pts: CondPoint[] = [], side = 6;
    for (let t = 0; t <= run + 6; t += STEP) {
      const u = Math.min(1, t / run), s = s0 + dir * Math.min(t, run), floor = lerp(floors[lo.level], floors[hi.level], u);
      // Out of the lower drift to the side at the start, back into the upper one at the end.
      const lateral = side * Math.min(1, t / 6) * Math.min(1, (run + 6 - t) / 6);
      const [x, z] = planeAt(floor + B, s);
      const px = x + hx * lateral, pz = z + hz * lateral;
      if (!inside(px, pz) || land.surface(px, pz) - (floor + 2 * B) < mine.roof) { pts.length = 0; break; }
      pts.push(point(px, floor + B, pz));
    }
    if (pts.length >= 4) { addPassage(pts); junctions += 2; }
  }

  // Winzes: a steep shaft between two levels along the vein's dip, in a niche at the drift's side (the drift's floor is left to walk by), a ladder up its
  // floor; the climber faces the slope and pulls over at the top onto the upper drift's floor. A vertical vein would give a plumb shaft that cannot be
  // climbed over its top, so the shaft always leans along the strike by `lean` metres of run for each metre of rise.
  for (let k = 0; k + 1 < drifts.length; k++) {
    const lo = drifts[k], hi = drifts[k + 1], r = Math.max(mine.winzes.half, way.minWidth / 2 + 0.1, way.minHeight / 2 + 0.1), wanted = rng.int(mine.winzes.count[0], mine.winzes.count[1]);
    const y0 = floors[lo.level] + r, y1 = floors[hi.level] + r, side = A + 0.3;
    for (let q = 0; q < wanted; q++) {
      // (A few tries for a place: the stopes and the other winzes take up much of the drift.)
      for (let attempt = 0; attempt < 8; attempt++) {
        const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1, run = (floors[hi.level] - floors[lo.level]) * mine.winzes.lean;
        const from = Math.max(lo.sMin, hi.sMin) + 4, to = Math.min(lo.sMax, hi.sMax) - 4 - run;
        if (to - from < 3) break;
        const s = rng.range(from, to), s1 = s + run * dir;
        const [xl, zl] = planeAt(y0, s), [xu, zu] = planeAt(y1, s1), ax = xl + hx * side, az = zl + hz * side, bx = xu + hx * side, bz = zu + hz * side;
        const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az, y1 - y0) / STEP)), pts: CondPoint[] = [];
        for (let t = 0; t <= n; t++) {
          const u = t / n, y = lerp(y0, y1, u), p = point(lerp(ax, bx, u), y, lerp(az, bz, u), r, r);
          if (!inside(p.x, p.z) || land.surface(p.x, p.z) - (y + r) < mine.roof) { pts.length = 0; break; }
          pts.push({ ...p, C: 0 });
        }
        // The shaft comes out at the top into a landing: a level, wider stretch of the niche, its floor flush with the drift's, so the climber pulls up over the lip onto ground.
        if (pts.length) {
          const e = pts[pts.length - 1], hor = Math.hypot(bx - ax, bz - az) || 1;
          for (const m of [STEP, 2 * STEP]) { const x = e.x + (bx - ax) / hor * m, z = e.z + (bz - az) / hor * m; if (!inside(x, z) || land.surface(x, z) - (floors[hi.level] + 2 * B) < mine.roof) { pts.length = 0; break; } pts.push({ ...point(x, floors[hi.level] + B, z, r + 0.5, B), C: 0 }); }
        }
        // Not in a stope, and not beside another winze (a shaft in a chamber is no shaft; two side by side are one).
        const clear = pts.length >= 3 && pts.every((p) => voids.every((v) => Math.hypot(p.x - v.x, p.z - v.z) > Math.max(v.rx, v.rz) + 3 || p.y > v.floor + v.height + 2 || p.y < v.floor - 3) && conduits.every((c) => !c.ladder || c.points.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 6)));
        if (clear) { addPassage(pts, false, 0, { foot: floors[lo.level], head: floors[hi.level], top: pts.length - 3 }); junctions += 2; break; }
      }
    }
  }

  return {
    conduits, voids, sinks: [], springs: [], tables: [0], rough: TOOLED,
    stats: { nodes: points, runs: conduits.length, length, junctions, loops: 0, ms: { prep: 0, flow: 0, chains: since() - t0 } },
  };
}

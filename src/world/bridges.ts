/**
 * Bridges where a road crosses a brook (D50), an inter-town road or a town's own street (its road out of a gate, a lane, a
 * farm track). The brook cuts its channel through the road's bed (terrain.ts,
 * as a river cuts its ford) and a stone bridge spans it: a deck at the road's height (a little humped where
 * the road runs low over the water), parapets, and one arch or more over the water, its feet in the bank.
 * The hero walks on the deck (`deckAt`, a floor). Rivers keep their fords. Pure.
 */
import { lerp, smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { emptyWater, inChannel, type Hydrology } from './hydro';
import { WAY_WIDTH, emptyRoad, type RoadNet } from './roads';
import type { RoadDecision } from './decisions';
import type { Town } from './town';
import { BuildingMat as M, MeshKit, type Tint } from './dungeon/meshKit';

/** A road's centre within this of a brook's edge is bridged, m. */
export const BRIDGE_REACH = 1;
/** Sampling step along the road, m. */
const STEP = 1;
/** The deck runs this far onto the road past the channel at either end, m. */
const PAD = 2.5;
/** Parapets: height over the deck, thickness; the deck's thickness at the crown; longest single arch, m. */
const PARAPET = 0.75, PARAPET_T = 0.32, DECK_T = 0.45, ARCH_MAX = 7;
/**
 * The deck stands this much proud of the road (no flicker between the deck and the road under it); its
 * ends start just under the road's surface and ramp up to that over RAMP m, so there is no step onto it.
 */
const LIP = 0.1, SUNK = 0.04, RAMP = 1.5;

const here = emptyRoad(), centreWater = emptyWater();

/**
 * Whether a brook's channel at (x, z) cuts the road's levelled ground: off the road's bed always (its
 * shoulders never dam a brook), on the bed where the road's centre line beside it runs within BRIDGE_REACH
 * of the brook: under a bridge.
 */
export function brookCuts(net: RoadNet, hydro: Hydrology, x: number, z: number): boolean {
  const r = net.nearest(x, z, here);
  if (!r || r.edge > 0) return true;
  // Back across to the centre line (`across` is positive on the left, along (-dz, dx)).
  const cx = x + r.dz * r.across, cz = z - r.dx * r.across;
  return inChannel(hydro.brookAt(cx, cz, centreWater), BRIDGE_REACH) && centreWater.brook;
}

export interface Bridge {
  /** The road's id and the metres along it where the bridge starts. */
  readonly id: string;
  /** Its middle (the mesh's place). */
  readonly x: number;
  readonly z: number;
  /** The deck's ends on the road's centre line, and the road's height there. */
  readonly x0: number;
  readonly z0: number;
  readonly y0: number;
  readonly x1: number;
  readonly z1: number;
  readonly y1: number;
  /** Half the deck's width, parapets and all. */
  readonly half: number;
  /** How much the deck rises in the middle over a straight line between its ends. */
  readonly hump: number;
  /** The arches: [from, to] as fractions of the deck's length. */
  readonly arches: readonly (readonly [number, number])[];
  /** The brook's level (the arches spring from just over it) and the walls' foot (under its bed). */
  readonly level: number;
  readonly foot: number;
}

/** The deck's top at `t` (0..1) along it. */
export function deckY(b: Bridge, t: number): number {
  const m = Math.min(t, 1 - t) * Math.hypot(b.x1 - b.x0, b.z1 - b.z0);
  return lerp(b.y0, b.y1, t) + lerp(-SUNK, LIP, smoothstep(0, RAMP, m)) + b.hump * Math.sin(Math.PI * t);
}

/** Under the deck at `t`: the arch's underside over the water, else null (solid down to the foot). */
export function archY(b: Bridge, t: number): number | null {
  for (const [a0, a1] of b.arches) {
    if (t <= a0 || t >= a1) continue;
    const m = (a0 + a1) / 2, r = (a1 - a0) / 2, spring = b.level - 0.05;
    const crown = deckY(b, m) - DECK_T;
    return spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - ((t - m) / r) ** 2));
  }
  return null;
}

/** (x, z) in bridge `b`'s frame: `t` along its deck (0..1 on it) and the distance across from its middle line. */
function frameOf(b: Bridge, x: number, z: number): { t: number; across: number } {
  const dx = b.x1 - b.x0, dz = b.z1 - b.z0, L2 = dx * dx + dz * dz;
  return { t: ((x - b.x0) * dx + (z - b.z0) * dz) / L2, across: Math.abs((x - b.x0) * dz - (z - b.z0) * dx) / Math.sqrt(L2) };
}

/** The deck's top at (x, z) if that is on bridge `b` (between its parapets), else null. */
export function deckAt(b: Bridge, x: number, z: number): number | null {
  const { t, across } = frameOf(b, x, z);
  return t >= 0 && t <= 1 && across < b.half ? deckY(b, t) : null;
}

/**
 * Whether a body of radius `r` at (x, z) runs into bridge `b`'s sides: its parapets from the deck (feet
 * at `feet` under their top), or its walls from the bank below. `feet` left out: anything in them.
 */
export function bridgeSideAt(b: Bridge, x: number, z: number, r: number, feet?: number): boolean {
  const { t, across } = frameOf(b, x, z);
  if (t < 0 || t > 1 || across < b.half - PARAPET_T - r || across > b.half + r) return false;
  return feet === undefined || feet < deckY(b, t) + PARAPET - 0.05;
}

/** A centre line sampled every STEP m: x, y, z, metres along. `dim` 3 (x, y, z, ...) or 2 (x, z, ...: y NaN, asked when needed). */
function samples(p: ArrayLike<number>, dim: 2 | 3): number[][] {
  const n = Math.floor(p.length / dim), out: number[][] = [], y = (k: number) => (dim === 3 ? p[k * 3 + 1] : NaN);
  let s0 = 0, next = 0;
  for (let k = 0; k + 1 < n; k++) {
    const ax = p[k * dim], az = p[k * dim + dim - 1], dx = p[k * dim + dim] - ax, dz = p[k * dim + 2 * dim - 1] - az, ay = y(k), dy = y(k + 1) - ay;
    const L = Math.hypot(dx, dz);
    for (; next < s0 + L; next += STEP) {
      const f = (next - s0) / L;
      out.push([ax + dx * f, ay + dy * f, az + dz * f, next]);
    }
    s0 += L;
  }
  return out;
}

/** What a road may continue at its ends (the land, Terrain): the towns' roads out it joins there, and the land's height along them. */
export interface Joins {
  readonly towns: readonly Town[];
  height(x: number, z: number): number;
}

/** A road joins a town's road out whose end lies this near its own, m (its points are rounded). */
const JOIN_EPS = 1;
/** The last this many m of a town's road out are taken onto a road that continues it (a brook at the join), m. */
const JOIN_TAIL = 30;

/** The town road out that ends at (x, z), sampled (`samples`), or null if none does. */
function roadOutTo(towns: readonly Town[], x: number, z: number): number[][] | null {
  for (const t of towns) {
    if (!t.near(x, z, JOIN_EPS)) continue;
    for (const st of t.plan.streets) {
      const p = st.pts, n = p.length;
      if (st.kind === 'road' && n >= 4 && Math.hypot(p[n - 2] - x, p[n - 1] - z) < JOIN_EPS) return samples(p, 2);
    }
  }
  return null;
}

/** Whether a road of `net` begins or ends at (x, z) (it continues a town's road out from there). */
function roadJoins(net: RoadNet, x: number, z: number): boolean {
  return net.roads.some((d) => {
    const p = d.pts, n = p.length;
    return Math.hypot(p[0] - x, p[2] - z) < JOIN_EPS || Math.hypot(p[n - 3] - x, p[n - 1] - z) < JOIN_EPS;
  });
}

/** Samples `s` (copied) with their metres along counted on from sample `from` (at `start`), each one's distance past the one before. */
function onFrom(s: readonly number[][], from: number[], start: number): number[][] {
  let prev = from, at = start;
  return s.map((q) => {
    at += Math.hypot(q[0] - prev[0], q[2] - prev[2]);
    prev = q;
    return [q[0], q[1], q[2], at];
  });
}

/**
 * The bridges on road `d` where its points are within `reach` of (x, z) and `ready` there (the brooks are
 * known: the main thread asks only where its brook tiles have come). A crossing at the edge of that is left
 * for a later ask, so a bridge is always whole. With `joins`, a crossing where the road continues a town's road
 * out (the town's road ending in the brook, this one going on from it) is this road's: the bridge spans the join.
 */
export function bridgesOn(d: RoadDecision, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean, joins?: Joins): Bridge[] {
  const half = WAY_WIDTH[d.way] / 2 + 0.35, s = samples(d.pts, 3), n = d.pts.length / 3;
  const head = joins ? roadOutTo(joins.towns, d.pts[0], d.pts[2]) : null, tail = joins ? roadOutTo(joins.towns, d.pts[n * 3 - 3], d.pts[n * 3 - 1]) : null;
  if (!s.length || (!head && !tail)) return bridgesAlong(d.id, half, s, hydro, x, z, reach, ready, null);
  // The town's road runs up to the join (head) or away from it (tail), its heights the land's (asked when needed).
  const before = head ? onFrom(head.slice(-JOIN_TAIL).reverse(), s[0], 0).map((q) => [q[0], q[1], q[2], -q[3]]).reverse() : [];
  const after = tail ? onFrom(tail.slice(-JOIN_TAIL).reverse(), s[s.length - 1], s[s.length - 1][3]) : [];
  const K = before.length, M = K + s.length;
  // A crossing wholly on the town's road is the town's (`townBridges`), as it would be without this road.
  return bridgesAlong(d.id, half, [...before, ...s, ...after], hydro, x, z, reach, ready, (px, pz) => joins!.height(px, pz), (a, b) => b + PAD_N >= K && a - PAD_N < M);
}

/**
 * The bridges on a town's streets where they cross a brook: its roads out (the road from a gate over the brook by
 * its wall), lanes and farm tracks. Their heights are the land's (`height`: a town's streets lie on it, unlevelled).
 * A street that ends in a brook goes on over it (the road of `net` that continues a road out there has that bridge,
 * else the street runs on a little past its end). Null until the brooks are known (`ready`) over the whole town: then all
 * at once, as they stand while no road is laid.
 */
export function townBridges(town: Town, net: RoadNet, hydro: Hydrology, height: (x: number, z: number) => number, ready: (x: number, z: number) => boolean): Bridge[] | null {
  const x0 = town.x0 - JOIN_TAIL, z0 = town.z0 - JOIN_TAIL, x1 = town.x0 + town.nx + JOIN_TAIL, z1 = town.z0 + town.nz + JOIN_TAIL;
  for (let x = x0; x < x1 + TOWN_ASK; x += TOWN_ASK) {
    for (let z = z0; z < z1 + TOWN_ASK; z += TOWN_ASK) if (!ready(Math.min(x, x1), Math.min(z, z1))) return null;
  }
  const w = emptyWater();
  return town.plan.streets.flatMap((st, i) => {
    const p = st.closed ? [...st.pts, st.pts[0], st.pts[1]] : st.pts, n = p.length;
    let s = samples(p, 2), keep = (_a: number, _b: number) => true;
    if (!st.closed && s.length && n >= 4) {
      // On past an end in a brook (or too near one for the deck to land before it ends), straight on, over it.
      const on = (ex: number, ez: number, bx: number, bz: number, from: number[], dir: 1 | -1): number[][] => {
        if (!(inChannel(hydro.brookAt(ex, ez, w), BRIDGE_REACH + PAD + 2) && w.brook) || roadJoins(net, ex, ez)) return [];
        const L = Math.hypot(ex - bx, ez - bz) || 1, ux = (ex - bx) / L, uz = (ez - bz) / L, out: number[][] = [];
        for (let k = 1; k <= JOIN_TAIL; k++) out.push([from[0] + ux * k * STEP, NaN, from[2] + uz * k * STEP, from[3] + dir * k * STEP]);
        return out;
      };
      const before = on(p[0], p[1], p[2], p[3], s[0], -1).reverse(), after = on(p[n - 2], p[n - 1], p[n - 4], p[n - 3], s[s.length - 1], 1);
      // Only a brook the street itself runs into (not one the way on would come to).
      const i0 = before.length, i1 = before.length + s.length - 1;
      keep = (a, b) => a <= i1 && b >= i0;
      s = [...before, ...s, ...after];
    }
    return bridgesAlong(`${town.decision.id}/${st.kind}${i}`, st.width / 2 + 0.35, s, hydro, 0, 0, Infinity, () => true, height, keep);
  });
}
/** A town's brooks are asked whether known every this many m over its bounds (under a brook tile's side). */
const TOWN_ASK = 50;
/** Samples a bridge's deck runs on past the water at either end (and needs before it is built). */
const PAD_N = Math.ceil(PAD / STEP) + 1;

/**
 * The bridges along a centre line's samples (`samples`), the heights not known there (NaN) taken from `height`;
 * only the crossings `keep` takes (by the first and last of its samples in the water).
 */
function bridgesAlong(id: string, half: number, s: number[][], hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean, height: ((x: number, z: number) => number) | null, keep: (a: number, b: number) => boolean = () => true): Bridge[] {
  const w = emptyWater();
  const near = s.map(([px, , pz]) => Math.hypot(px - x, pz - z) < reach && ready(px, pz));
  const wet = (i: number): boolean => inChannel(hydro.brookAt(s[i][0], s[i][2], w), BRIDGE_REACH) && w.brook;
  const pad = PAD_N;
  const out: Bridge[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!near[i] || !wet(i)) continue;
    let j = i, level = -Infinity, bed = Infinity;
    for (; ; j++) {
      hydro.brookAt(s[j][0], s[j][2], w);
      level = Math.max(level, w.level);
      bed = Math.min(bed, w.level - w.depth);
      if (!(j + 1 < s.length && near[j + 1] && wet(j + 1))) break;
    }
    const a = i, b = j;
    i = j + 1;
    // Cut off by the edge of what is known (or the road's ends): asked again later.
    if (a - pad < 0 || b + pad >= s.length || !near[a - pad] || !near[b + pad] || !keep(a, b)) continue;
    const p0 = s[a - pad + 1], p1 = s[b + pad - 1], L = p1[3] - p0[3];
    for (const q of [p0, p1]) if (Number.isNaN(q[1]) && height) q[1] = height(q[0], q[2]);
    // The water's stretch (the channel, a little wide), in arches of up to ARCH_MAX m with piers between.
    const w0 = (s[a][3] - 0.6 - p0[3]) / L, w1 = (s[b][3] + 0.6 - p0[3]) / L;
    const n = Math.max(1, Math.ceil((w1 - w0) * L / ARCH_MAX)), pier = 0.8 / L, each = (w1 - w0 - pier * (n - 1)) / n;
    const arches: [number, number][] = [];
    for (let k = 0; k < n; k++) arches.push([w0 + k * (each + pier), w0 + k * (each + pier) + each]);
    // Humped where the road would run too low over the water for an arch.
    const mid = (p0[1] + p1[1]) / 2 + LIP, hump = Math.max(0, level + 0.55 + DECK_T - mid);
    out.push({
      id: `${id}@${Math.round(p0[3])}`, x: (p0[0] + p1[0]) / 2, z: (p0[2] + p1[2]) / 2,
      x0: p0[0], z0: p0[2], y0: p0[1], x1: p1[0], z1: p1[2], y1: p1[1], half, hump, arches, level, foot: bed - 0.5,
    });
  }
  return out;
}

/** Every bridge on the roads of `net` near (x, z). */
export function bridgesNear(net: RoadNet, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean, joins?: Joins): Bridge[] {
  return net.roads.flatMap((d) => bridgesOn(d, hydro, x, z, reach, ready, joins));
}

const STONE: Tint = [136, 129, 118], DECK: Tint = [120, 112, 100], UNDER: Tint = [84, 82, 78];
/** Pieces along the deck, m. */
const PIECE = 0.5;

/** Bridge `b` as a building mesh (the town's one building shader), around (b.x, 0, b.z). */
export function bridgeMesh(b: Bridge): BuildingMesh {
  const k = new MeshKit();
  const dx = b.x1 - b.x0, dz = b.z1 - b.z0, L = Math.hypot(dx, dz), ax = dx / L, az = dz / L;
  // Across: to the left of the way along.
  const nx = -az, nz = ax;
  const onDeck = (t: number, u: number, y: number) => [b.x0 - b.x + dx * t + nx * u, y, b.z0 - b.z + dz * t + nz * u];
  /** A quad facing `want` (x, y, z): the corners are turned round if they face the other way. */
  const face = (q: number[][], uv: number[][], want: number[], mat: number, tint: Tint) => {
    const [a, bb, c, d] = q;
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - bb[0], d[1] - bb[1], d[2] - bb[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) k.quad(a, bb, c, d, uv, mat, tint);
    else k.quad(a, d, c, bb, [uv[0], uv[3], uv[2], uv[1]], mat, tint);
  };
  const steps = Math.max(2, Math.ceil(L / PIECE)), h = b.half, hi = h - PARAPET_T;
  const under = (t: number) => archY(b, t) ?? b.foot;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps, s0 = t0 * L, s1 = t1 * L;
    const y0 = deckY(b, t0), y1 = deckY(b, t1);
    // The road over it.
    face([onDeck(t0, -hi, y0), onDeck(t1, -hi, y1), onDeck(t1, hi, y1), onDeck(t0, hi, y0)], [[s0, -hi], [s1, -hi], [s1, hi], [s0, hi]], [0, 1, 0], M.Ashlar, DECK);
    // Under an arch: its curved underside.
    const tm = (t0 + t1) / 2;
    if (archY(b, tm) !== null) {
      const u0 = under(t0), u1 = under(t1);
      face([onDeck(t0, -h, u0), onDeck(t1, -h, u1), onDeck(t1, h, u1), onDeck(t0, h, u0)], [[s0, -h], [s1, -h], [s1, h], [s0, h]], [0, -1, 0], M.Rubble, UNDER);
    }
    for (const side of [1, -1]) {
      const out = [nx * side, 0, nz * side], inn = [-nx * side, 0, -nz * side];
      // The face, from the arch (or the foot) to the parapet's top.
      const b0 = under(t0), b1 = under(t1), top0 = y0 + PARAPET, top1 = y1 + PARAPET;
      face([onDeck(t0, h * side, b0), onDeck(t1, h * side, b1), onDeck(t1, h * side, top1), onDeck(t0, h * side, top0)], [[s0, b0], [s1, b1], [s1, top1], [s0, top0]], out, M.Rubble, STONE);
      // The parapet's inside and its coping.
      face([onDeck(t0, hi * side, y0), onDeck(t1, hi * side, y1), onDeck(t1, hi * side, top1), onDeck(t0, hi * side, top0)], [[s0, y0], [s1, y1], [s1, top1], [s0, top0]], inn, M.Rubble, STONE);
      face([onDeck(t0, hi * side, top0), onDeck(t1, hi * side, top1), onDeck(t1, h * side, top1), onDeck(t0, h * side, top0)], [[s0, 0], [s1, 0], [s1, PARAPET_T], [s0, PARAPET_T]], [0, 1, 0], M.Ashlar, STONE);
    }
  }
  // The ends: the deck's lip, and the parapets' ends.
  for (const [t, dir] of [[0, -1], [1, 1]] as const) {
    const y = deckY(b, t), want = [ax * dir, 0, az * dir];
    face([onDeck(t, -h, y - 0.6), onDeck(t, h, y - 0.6), onDeck(t, h, y), onDeck(t, -h, y)], [[-h, y - 0.6], [h, y - 0.6], [h, y], [-h, y]], want, M.Rubble, STONE);
    for (const side of [1, -1]) {
      face([onDeck(t, hi * side, y), onDeck(t, h * side, y), onDeck(t, h * side, y + PARAPET), onDeck(t, hi * side, y + PARAPET)], [[0, y], [PARAPET_T, y], [PARAPET_T, y + PARAPET], [0, y + PARAPET]], want, M.Rubble, STONE);
    }
  }
  return k.mesh();
}

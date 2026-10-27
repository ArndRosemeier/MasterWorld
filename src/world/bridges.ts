/**
 * Bridges where a road crosses a brook (D50). The brook cuts its channel through the road's bed (terrain.ts,
 * as a river cuts its ford) and a stone bridge spans it: a deck at the road's height (a little humped where
 * the road runs low over the water), parapets, and one arch or more over the water, its feet in the bank.
 * The hero walks on the deck (`deckAt`, a floor). Rivers keep their fords. Pure.
 */
import { lerp, smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { emptyWater, inChannel, type Hydrology } from './hydro';
import { WAY_WIDTH, emptyRoad, type RoadNet } from './roads';
import type { RoadDecision } from './decisions';
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

/** The deck's top at (x, z) if that is on bridge `b` (between its parapets), else null. */
export function deckAt(b: Bridge, x: number, z: number): number | null {
  const dx = b.x1 - b.x0, dz = b.z1 - b.z0, L2 = dx * dx + dz * dz;
  const t = ((x - b.x0) * dx + (z - b.z0) * dz) / L2;
  if (t < 0 || t > 1) return null;
  const across = Math.abs((x - b.x0) * dz - (z - b.z0) * dx) / Math.sqrt(L2);
  return across < b.half ? deckY(b, t) : null;
}

/** A road's centre line sampled every STEP m: x, y, z, metres along. */
function samples(d: RoadDecision): number[][] {
  const p = d.pts, n = p.length / 3, out: number[][] = [];
  let s0 = 0, next = 0;
  for (let k = 0; k + 1 < n; k++) {
    const ax = p[k * 3], ay = p[k * 3 + 1], az = p[k * 3 + 2], dx = p[k * 3 + 3] - ax, dy = p[k * 3 + 4] - ay, dz = p[k * 3 + 5] - az;
    const L = Math.hypot(dx, dz);
    for (; next < s0 + L; next += STEP) {
      const f = (next - s0) / L;
      out.push([ax + dx * f, ay + dy * f, az + dz * f, next]);
    }
    s0 += L;
  }
  return out;
}

/**
 * The bridges on road `d` where its points are within `reach` of (x, z) and `ready` there (the brooks are
 * known: the main thread asks only where its brook tiles have come). A crossing at the edge of that is left
 * for a later ask, so a bridge is always whole.
 */
export function bridgesOn(d: RoadDecision, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean): Bridge[] {
  const s = samples(d), w = emptyWater(), half = WAY_WIDTH[d.way] / 2 + 0.35;
  const near = s.map(([px, , pz]) => Math.hypot(px - x, pz - z) < reach && ready(px, pz));
  const wet = (i: number): boolean => inChannel(hydro.brookAt(s[i][0], s[i][2], w), BRIDGE_REACH) && w.brook;
  const pad = Math.ceil(PAD / STEP) + 1;
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
    if (a - pad < 0 || b + pad >= s.length || !near[a - pad] || !near[b + pad]) continue;
    const p0 = s[a - pad + 1], p1 = s[b + pad - 1], L = p1[3] - p0[3];
    // The water's stretch (the channel, a little wide), in arches of up to ARCH_MAX m with piers between.
    const w0 = (s[a][3] - 0.6 - p0[3]) / L, w1 = (s[b][3] + 0.6 - p0[3]) / L;
    const n = Math.max(1, Math.ceil((w1 - w0) * L / ARCH_MAX)), pier = 0.8 / L, each = (w1 - w0 - pier * (n - 1)) / n;
    const arches: [number, number][] = [];
    for (let k = 0; k < n; k++) arches.push([w0 + k * (each + pier), w0 + k * (each + pier) + each]);
    // Humped where the road would run too low over the water for an arch.
    const mid = (p0[1] + p1[1]) / 2 + LIP, hump = Math.max(0, level + 0.55 + DECK_T - mid);
    out.push({
      id: `${d.id}@${Math.round(p0[3])}`, x: (p0[0] + p1[0]) / 2, z: (p0[2] + p1[2]) / 2,
      x0: p0[0], z0: p0[2], y0: p0[1], x1: p1[0], z1: p1[2], y1: p1[1], half, hump, arches, level, foot: bed - 0.5,
    });
  }
  return out;
}

/** Every bridge on the roads of `net` near (x, z). */
export function bridgesNear(net: RoadNet, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean): Bridge[] {
  return net.roads.flatMap((d) => bridgesOn(d, hydro, x, z, reach, ready));
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

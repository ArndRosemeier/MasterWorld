/**
 * Active volcanoes (K7d, Arnd 2026-11-02): in volcanic country (the kind `volcanic`) a few big cones stand with a crater
 * at the top. A volcano is `erupting` (a lake of lava fills its crater, spills over the rim's lowest saddle and runs down the
 * flank in a channel, with other flows from vents on the flank), a `lake` (the lava stands well below the rim) or `steaming`
 * (no lava: fumaroles and sulphur crusts). Sulphur and steam stand round the vents in every state.
 *
 * The cone is a landform of its own size (reach about 800 m, bigger than a landform cell holds): one volcano per
 * VOLCANO_CELL square, placed from the seed, its shape added to the height field next to the landforms
 * (`Terrain.landShape`). The flows' channels are cut into it by the same functions the lava is drawn from
 * (render/volcano/VolcanoView.ts), so the lava lies in its channel exactly. Where the lava is, and how high its surface
 * stands, is `Terrain.lavaAt` (the hero burns in it).
 *
 * Pure, runs in workers.
 */
import { Rng, clamp, deriveSeed, hash2i, smoothstep } from '@futuremagic/core';
import { bump } from './landforms';
import type { Skeleton } from './skeleton';

/** Side of the square one volcano may stand in (m). Its reach (at most 920 m) stays within a square of a centre placed 1000 m or more from the edge. */
export const VOLCANO_CELL = 2800;
/** The sizes, in one place: base radius of the cone, height of its rim over the foot, crater rim radius, floor depth below the rim (m). */
export const VOLCANO = {
  base: [620, 760] as const,
  height: [230, 310] as const,
  rim: [85, 115] as const,
  depth: [30, 40] as const,
  /** Cells that get one: share of the cells wholly in volcanic country. */
  chance: 0.6,
  /** How the cone's flank profile bends (1: straight; more: steeper near the top). */
  bend: 1.45,
  /** How much of the rim's height the saddle (the lowest point, where the lava spills) is cut (m). */
  saddle: 6.5,
  /** The lava's channel on the flank: half width at the head and at the toe (m), and how deep it is cut (m). */
  channel: [3.2, 7.5] as const,
  cut: 1.4,
};

export type VolcanoState = 'erupting' | 'lake' | 'steaming';

/** A stream of lava down the flank: from `r0` to `r1` metres from the middle, along azimuth `phi`, wandering a little. */
export interface Flow {
  readonly phi: number;
  readonly r0: number;
  readonly r1: number;
  /** The wander's phase (radians). */
  readonly ph: number;
}

/** A vent: steam rises from it, and sulphur crusts the ground round it (world x, z; radius m). */
export interface Vent {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface Volcano {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Radius of the cone's foot, the crater rim's radius, the cone's height (rim over foot), the crater's depth (m). */
  readonly R: number;
  readonly rimR: number;
  readonly H: number;
  readonly depth: number;
  /** The skeleton's elevation at the middle: the pedestal the cone stands on is levelled to it (m). */
  readonly e0: number;
  /** Azimuth of the saddle in the rim, where the lava spills (radians). */
  readonly phi0: number;
  readonly state: VolcanoState;
  /** How far the lava stands under the saddle in a `lake` (m). */
  readonly drop: number;
  readonly flows: readonly Flow[];
  readonly vents: readonly Vent[];
  readonly seed: number;
  /** Farthest from the middle it shapes the land (m). */
  readonly reach: number;
}

/** A town's ground, which keeps volcanoes away. */
export interface VolcanoFree { readonly x: number; readonly z: number; readonly r: number }

const TAU = Math.PI * 2;
/** The most the levelled pedestal raises or lowers the land under the crater (m), and the tilt (m over 120 m) the land may have there to be built on. */
const PEDESTAL = 24, TILT = 30;
/** The shortest signed turn from azimuth b to a (radians). */
const turn = (a: number, b: number): number => { const d = (a - b) % TAU; return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d; };

/** A flow's sideways wander at `r` metres from the middle (m). */
export function wander(f: Flow, r: number): number {
  const s = r - f.r0;
  return 14 * Math.sin(s / 85 + f.ph) + 6 * Math.sin(s / 31 + f.ph * 2.3);
}

/** Half width of a flow's lava at `r` (m): widening towards the toe, rounded off at its end. */
export function flowHalf(f: Flow, r: number): number {
  const t = clamp((r - f.r0) / (f.r1 - f.r0), 0, 1);
  return (VOLCANO.channel[0] + (VOLCANO.channel[1] - VOLCANO.channel[0]) * t) * (0.55 + 0.45 * smoothstep(0, 0.1, t)) * (0.45 + 0.55 * smoothstep(1, 0.86, t));
}

/** Across a flow at (x, z): how far (m) from its line (negative on one side), and the metres along it from its head; r the distance from the middle, th the azimuth. */
export function acrossFlow(f: Flow, r: number, th: number): number {
  return r * Math.sin(turn(th, f.phi)) - wander(f, r);
}

export class Volcanoes {
  private readonly cells = new Map<number, Volcano | null>();
  private readonly seed: number;
  private free: readonly VolcanoFree[] = [];
  private lastI = NaN;
  private lastJ = NaN;
  private last: Volcano | null = null;

  /** `watered(x, z)`: a river or brook runs near (no volcano is placed there). */
  constructor(seed: number, private readonly skeleton: Skeleton, private readonly watered: (x: number, z: number) => boolean = () => false) {
    this.seed = deriveSeed(seed, 'volcanoes');
  }

  /** The towns' grounds, which hold no volcano. Forgets the volcanoes placed so far. */
  keepFree(free: readonly VolcanoFree[]): void {
    this.free = free;
    this.cells.clear();
    this.lastI = NaN;
  }

  /** The volcano whose square holds (x, z), null where none. */
  private squareAt(x: number, z: number): Volcano | null {
    const i = Math.floor(x / VOLCANO_CELL), j = Math.floor(z / VOLCANO_CELL);
    if (i === this.lastI && j === this.lastJ) return this.last;
    const key = i + j * 2_097_152;
    let v = this.cells.get(key);
    if (v === undefined) {
      if (this.cells.size > 512) this.cells.clear();
      v = this.found(i, j);
      this.cells.set(key, v);
    }
    this.lastI = i; this.lastJ = j; this.last = v;
    return v;
  }

  /** How much the volcano round (x, z) raises (or lowers) the ground there, metres (0 outside its reach). */
  lift(x: number, z: number): number {
    const v = this.squareAt(x, z);
    if (!v) return 0;
    const dx = x - v.x, dz = z - v.z;
    if (dx * dx + dz * dz >= v.reach * v.reach) return 0;
    return coneAt(v, Math.hypot(dx, dz), Math.atan2(dz, dx), this.skeleton.elevation(x, z));
  }

  /** How much of the other landforms the volcano keeps off (x, z): 1 over the cone, easing to 0 at the edge of its reach. */
  shield(x: number, z: number): number {
    const v = this.squareAt(x, z);
    if (!v) return 0;
    const r = Math.hypot(x - v.x, z - v.z);
    return r >= v.reach ? 0 : 1 - smoothstep(v.R * 0.9, v.reach, r);
  }

  /** The volcano whose reach holds (x, z), else null. */
  holding(x: number, z: number): Volcano | null {
    const v = this.squareAt(x, z);
    return v && Math.hypot(x - v.x, z - v.z) < v.reach ? v : null;
  }

  /** The volcanoes with their middles within `r` metres of (x, z). */
  nearTo(x: number, z: number, r: number): Volcano[] {
    const out: Volcano[] = [];
    const i0 = Math.floor((x - r) / VOLCANO_CELL), i1 = Math.floor((x + r) / VOLCANO_CELL);
    const j0 = Math.floor((z - r) / VOLCANO_CELL), j1 = Math.floor((z + r) / VOLCANO_CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = this.squareAt((i + 0.5) * VOLCANO_CELL, (j + 0.5) * VOLCANO_CELL);
      if (v && Math.hypot(v.x - x, v.z - z) <= r) out.push(v);
    }
    return out;
  }

  /**
   * The volcano nearest (x, z) that is `want` (`any`, one of the states, or an id), looked for in widening rings out to 90 km (null: none).
   * For starts and the debug menu.
   */
  nearestVolcano(x: number, z: number, want = 'any'): Volcano | null {
    for (const reach of [3000, 8000, 20000, 45000, 90000]) {
      let best: Volcano | null = null, low = Infinity;
      for (const v of this.nearTo(x, z, reach)) {
        const d = Math.hypot(v.x - x, v.z - z);
        if (d < low && (want === 'any' || v.state === want || v.id === want)) { low = d; best = v; }
      }
      if (best) return best;
    }
    return null;
  }

  /** The volcano square (i, j) holds, from the seed: only where the land is wholly volcanic country, inland, level, dry and clear of towns. */
  private found(i: number, j: number): Volcano | null {
    const rng = new Rng(hash2i(this.seed, i, j)), sk = this.skeleton;
    if (rng.float() >= VOLCANO.chance) return null;
    // Keep 1000 m from the square's edges: no reach crosses into a neighbour's square.
    const x = (i + (1000 + rng.float() * (VOLCANO_CELL - 2000)) / VOLCANO_CELL) * VOLCANO_CELL;
    const z = (j + (1000 + rng.float() * (VOLCANO_CELL - 2000)) / VOLCANO_CELL) * VOLCANO_CELL;
    const R = rng.range(VOLCANO.base[0], VOLCANO.base[1]);
    const e0 = sk.elevation(x, z), shore = sk.lastShore;
    if (e0 < 30 || shore < 1500 || sk.kindShare('volcanic', x, z) < 0.9) return null;
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a * TAU) / 8) * R * 0.85, pz = z + Math.sin((a * TAU) / 8) * R * 0.85;
      if (sk.kindShare('volcanic', px, pz) < 0.3 || sk.elevation(px, pz) < 8 || this.watered(x + Math.cos((a * TAU) / 8) * R * 0.5, z + Math.sin((a * TAU) / 8) * R * 0.5)) return null;
    }
    for (let a = 0; a < 8; a++) if (Math.abs(sk.elevation(x + Math.cos((a * TAU) / 8) * 120, z + Math.sin((a * TAU) / 8) * 120) - e0) > TILT) return null;
    if (this.watered(x, z)) return null;
    for (const t of this.free) if (Math.hypot(x - t.x, z - t.z) < t.r + R * 1.2) return null;
    const rimR = rng.range(VOLCANO.rim[0], VOLCANO.rim[1]), H = rng.range(VOLCANO.height[0], VOLCANO.height[1]);
    const roll = rng.float(), state: VolcanoState = roll < 0.45 ? 'erupting' : roll < 0.75 ? 'lake' : 'steaming';
    const phi0 = rng.float() * TAU;
    const flows: Flow[] = [];
    if (state === 'erupting') {
      flows.push({ phi: phi0, r0: rimR * 0.85, r1: R * rng.range(0.82, 1.0), ph: rng.float() * TAU });
      // Vents on the flank: a flow or two from each, away from the main one.
      const extra = rng.int(1, 2);
      for (let k = 0; k < extra; k++) {
        const r0 = R * rng.range(0.28, 0.5);
        flows.push({ phi: phi0 + (0.9 + rng.float() * (TAU - 1.8)), r0, r1: Math.min(R * 1.02, r0 + rng.range(170, 300)), ph: rng.float() * TAU });
      }
    }
    // Steam and sulphur: round the crater's rim and its inner walls, up the flank, and at each flank vent.
    const vents: Vent[] = [];
    const nv = state === 'steaming' ? rng.int(9, 14) : rng.int(5, 8);
    for (let k = 0; k < nv; k++) {
      const a = rng.float() * TAU, r = k < nv / 2 ? rimR * rng.range(0.6, 1.25) : R * rng.range(0.22, 0.5);
      vents.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, r: rng.range(5, state === 'steaming' ? 16 : 12) });
    }
    for (const f of flows.slice(1)) vents.push({ x: x + Math.cos(f.phi) * f.r0, z: z + Math.sin(f.phi) * f.r0, r: 9 });
    return {
      id: `volcano:${i},${j}`, x, z, R, rimR, H, depth: rng.range(VOLCANO.depth[0], VOLCANO.depth[1]), e0, phi0, state, drop: 5 + rng.float() * 6,
      flows, vents, seed: rng.nextU32(), reach: R * 1.2,
    };
  }
}

/**
 * The volcano's rise at `r` metres from its middle along azimuth `th`, metres: the cone (a lobed foot, ribs of gullies down
 * its flank, a flat top out to the crater's rim), the crater's bowl and its rim with the saddle cut in it, the levelled
 * pedestal it stands on (`e` the skeleton's elevation here) and the flows' channels.
 */
export function coneAt(v: Volcano, r: number, th: number, e: number): number {
  const ph = (v.seed % 1000) / 159.2;
  // The pedestal: the skeleton's tilt taken out under the crater, easing back to it within a couple of rim radii.
  let h = clamp(v.e0 - e, -PEDESTAL, PEDESTAL) * (1 - smoothstep(v.rimR * 1.3, v.rimR * 2.7, r));
  const foot = v.R * (1 + 0.1 * Math.sin(3 * th + ph) + 0.05 * Math.sin(5 * th + ph * 2.1) + 0.03 * Math.sin(8 * th - ph));
  const t = Math.min(Math.max(r, v.rimR) / foot, 1);
  h += v.H * (1 - t) ** VOLCANO.bend;
  // Ribs: gullies down the flank, from a third of the way down to the foot.
  const flank = smoothstep(0.12, 0.4, r / v.R) * (1 - smoothstep(0.8, 1, r / v.R));
  h -= 0.04 * v.H * (0.5 + 0.5 * Math.sin(13 * th + ph * 3 + r / 140)) * flank;
  // The crater: a bowl with steep walls and a flat floor, and a crest round its rim, cut down at the saddle.
  h -= v.depth * smoothstep(v.rimR * 1.04, v.rimR * 0.4, r);
  const saddle = bump(Math.abs(turn(th, v.phi0)) / 0.4);
  h += 4.5 * bump(Math.abs(r - v.rimR) / 26) * (1 - (1 + VOLCANO.saddle / 4.5) * saddle * 0.97);
  // The flows' channels (and a little spatter mound at the head of each flank vent).
  for (let k = 0; k < v.flows.length; k++) {
    const f = v.flows[k];
    if (r < f.r0 - 12 || r > f.r1 + 8) continue;
    const half = flowHalf(f, r), d = Math.abs(acrossFlow(f, r, th));
    if (d < half * 2.4) h -= VOLCANO.cut * smoothstep(half * 2.4, half * 0.7, d) * smoothstep(f.r0 - 12, f.r0 + 6, r) * smoothstep(f.r1 + 8, f.r1 - 30, r);
    if (k > 0) h += 3 * bump(Math.hypot(r - f.r0, r * Math.sin(turn(th, f.phi))) / 11);
  }
  return h;
}

/**
 * Where the lava lies: in the crater's lake (the ground at (x, z) lower than the lake's level, inside the rim) or in a
 * flow's channel (within 0.8 of the half width of its line). `lake`: the lake's level; null when the volcano holds none.
 */
export function lavaIn(v: Volcano, x: number, z: number, ground: number, lake: number | null): 'lake' | 'flow' | null {
  const dx = x - v.x, dz = z - v.z, r = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  if (v.state === 'steaming') return null;
  if (lake !== null && r < v.rimR * 1.15 && ground < lake) return 'lake';
  for (const f of v.flows) {
    if (r < f.r0 || r > f.r1) continue;
    if (Math.abs(acrossFlow(f, r, th)) < flowHalf(f, r) * 0.8) return 'flow';
  }
  return null;
}

/** The lowest crest round a volcano's crater rim: for each of 48 azimuths the highest ground on a short line across the rim, and the least of those (m). */
export function lowestCrest(v: Volcano, height: (x: number, z: number) => number): number {
  let low = Infinity;
  for (let a = 0; a < 48; a++) {
    const th = (a * TAU) / 48;
    let crest = -Infinity;
    for (let k = 0; k <= 10; k++) {
      const r = v.rimR * (0.8 + 0.045 * k);
      crest = Math.max(crest, height(v.x + Math.cos(th) * r, v.z + Math.sin(th) * r));
    }
    low = Math.min(low, crest);
  }
  return low;
}

/** Is (x, z) on the crust round one of the volcano's vents (where nothing grows)? */
export function nearVent(v: Volcano, x: number, z: number): boolean {
  for (const e of v.vents) if (Math.hypot(x - e.x, z - e.z) < e.r * 1.8) return true;
  return false;
}

/** Is (x, z) on the crater (its walls and the rim's crest) or beside a flow's lava, where nothing grows? */
export function scorched(v: Volcano, x: number, z: number): boolean {
  const dx = x - v.x, dz = z - v.z, r = Math.hypot(dx, dz);
  if (r < v.rimR * 1.3) return true;
  if (v.state !== 'erupting') return false;
  const th = Math.atan2(dz, dx);
  for (const f of v.flows) if (r > f.r0 - 15 && r < f.r1 + 12 && Math.abs(acrossFlow(f, r, th)) < flowHalf(f, r) * 2.8 + 3) return true;
  return false;
}

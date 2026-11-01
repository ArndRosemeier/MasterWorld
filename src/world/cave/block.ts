/**
 * The rock block of a formed cave (D63, phase K1; docs/design/caves.md 3.1; pure, seeded, runs in a worker): a block of
 * rock around the cave in its own frame (x and z from 0 to `across`, y from 0 at the bottom to `deep` at the top, the
 * land's height over the same datum). It holds
 *  - beds (layers): thickness, a slight dip, how readily each dissolves and its wall colour;
 *  - joints: sets of near-vertical cracks at an angle to each other, and a few faults, long breaks;
 *  - ore bodies (veins on faults and joints, seams along a bed, pockets), for show and for the mines of K8;
 *  - groundwater: the sinks where water gets in high up, the valley side where it comes out low, and the levels
 *    the water table stood at as the valley cut deeper (the oldest first).
 * Sinks, the valley side and the levels come from the land's real heights over the block (`CaveLand`).
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CaveOreDef, CaveRockDef, CaveSizeDef } from '../../setting/contract';

/** The land over a cave: the ground's height (metres, over the block's datum) at a point of the block's frame. */
export interface CaveLand {
  surface(x: number, z: number): number;
}

/** The side of the block the valley lies on, where the springs are. */
export type Face = 'west' | 'east' | 'south' | 'north';

/** Beds: bed i is the rock between `edges[i]` and `edges[i + 1]` along the bed coordinate. */
export interface BedTable {
  /** The direction the beds dip towards (horizontal, unit). */
  readonly ux: number;
  readonly uz: number;
  /** Rise of the bed planes per metre along the dip direction (tan of the dip). */
  readonly slope: number;
  /** Boundaries, ascending; one more than there are beds. */
  readonly edges: Float64Array;
  /** How readily each bed dissolves, 0..1. */
  readonly sol: Float32Array;
  /** Each bed's wall colour, red, green, blue. */
  readonly color: Uint8Array;
}

/** A set of near-vertical cracks: planes with the horizontal normal (nx, nz), at these positions along it. */
export interface JointSet {
  readonly nx: number;
  readonly nz: number;
  readonly planes: Float64Array;
}

/** A fault: a long steep break, the plane through (px, py, pz) with the unit normal (nx, ny, nz). */
export interface Fault {
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/** A body of ore in the rock. */
export type OreBody =
  /** A thin sheet along a fault or a joint plane (`plane` a fault or a joint's plane at a point), `along` metres either side of (cx, cz), from y0 to y1. */
  | { readonly kind: 'vein'; readonly ore: number; readonly plane: Fault; readonly cx: number; readonly cz: number; readonly along: number; readonly y0: number; readonly y1: number; readonly thick: number }
  /** A thin layer along a bed, within `reach` metres of (cx, cz). */
  | { readonly kind: 'seam'; readonly ore: number; readonly s: number; readonly cx: number; readonly cz: number; readonly reach: number; readonly thick: number }
  /** A lump. */
  | { readonly kind: 'pocket'; readonly ore: number; readonly x: number; readonly y: number; readonly z: number; readonly r: number };

/** Where water gets in. */
export interface Sink {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How much water it takes, relative. */
  readonly flow: number;
}

/** Where water comes out, on the valley side's face. */
export interface Spring {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A level: the water table at one stage, and the springs it fed then. */
export interface Stage {
  /** Height of the water table, metres. */
  readonly table: number;
  readonly springs: readonly Spring[];
}

/** The groundwater: sinks, the valley side, and the stages from the oldest (highest) to the newest (lowest, the water table today). */
export interface Groundwater {
  readonly face: Face;
  readonly sinks: readonly Sink[];
  readonly stages: readonly Stage[];
}

/** A rock block. */
export interface RockBlock {
  readonly seed: number;
  readonly rock: CaveRockDef;
  readonly across: number;
  readonly deep: number;
  readonly beds: BedTable;
  readonly joints: readonly JointSet[];
  readonly faults: readonly Fault[];
  readonly ore: readonly OreBody[];
  readonly oreDef: CaveOreDef;
  readonly water: Groundwater;
  readonly land: CaveLand;
}

/** Make the rock block of a cave of this rock and size over this land. */
export function rockBlock(seed: number, rock: CaveRockDef, size: Pick<CaveSizeDef, 'across' | 'deep'>, land: CaveLand, ore: CaveOreDef, lattice: number): RockBlock {
  const rng = new Rng(deriveSeed(seed, 'cave', 'block'));
  const { across, deep } = size;
  const beds = makeBeds(rng.fork('beds'), rock, across, deep);
  const joints = makeJoints(rng.fork('joints'), rock, across);
  const faults = makeFaults(rng.fork('faults'), rock, across, deep);
  const water = makeWater(rng.fork('water'), rock, land, across, deep, lattice);
  return { seed, rock, across, deep, beds, joints, faults, ore: makeOre(rng.fork('ore'), ore, joints, faults, across, deep), oreDef: ore, water, land };
}

// --- beds ---

function makeBeds(rng: Rng, rock: CaveRockDef, across: number, deep: number): BedTable {
  const b = rock.bedding, dip = rng.range(b.dip[0], b.dip[1]) * Math.PI / 180, dir = rng.range(0, Math.PI * 2);
  const ux = Math.cos(dir), uz = Math.sin(dir), slope = Math.tan(dip);
  // The bed coordinate s = y + slope * (x ux + z uz) runs over this much of the block.
  const reach = slope * across * (Math.abs(ux) + Math.abs(uz));
  const lo = -reach - rng.range(0, b.thickness[1]), hi = deep + reach;
  const edges: number[] = [lo], sol: number[] = [], color: number[] = [];
  while (edges[edges.length - 1] < hi) {
    const thick = rng.range(b.thickness[0], b.thickness[1]);
    const soluble = rng.chance(b.soluble);
    sol.push(soluble ? rng.range(0.7, 1) : rng.range(0.1, 0.32));
    // A soluble bed is a little thicker: the water finds its plane.
    edges.push(edges[edges.length - 1] + thick * (soluble ? 1.15 : 1));
    const c = b.colors[rng.int(0, b.colors.length - 1)], k = rng.range(0.86, 1.1);
    color.push(Math.min(255, ((c >> 16) & 255) * k), Math.min(255, ((c >> 8) & 255) * k), Math.min(255, (c & 255) * k));
  }
  return { ux, uz, slope, edges: Float64Array.from(edges), sol: Float32Array.from(sol), color: Uint8Array.from(color.map(Math.round)) };
}

/** The bed coordinate of a point. */
export const bedCoord = (b: BedTable, x: number, y: number, z: number): number => y + b.slope * (x * b.ux + z * b.uz);

/** The bed a coordinate along the beds is in. */
export function bedIndex(b: BedTable, s: number): number {
  const e = b.edges;
  let lo = 0, hi = e.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (e[mid] <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The bed at a point. */
export const bedAt = (b: BedTable, x: number, y: number, z: number): number => bedIndex(b, bedCoord(b, x, y, z));

/** How far (along the bed coordinate, metres) a point is from the nearest plane between two beds. */
export function bedEdgeDistance(b: BedTable, x: number, y: number, z: number): number {
  const s = bedCoord(b, x, y, z), i = bedIndex(b, s);
  return Math.min(s - b.edges[i], b.edges[i + 1] - s);
}

// --- joints and faults ---

function makeJoints(rng: Rng, rock: CaveRockDef, across: number): JointSet[] {
  const j = rock.joints, out: JointSet[] = [];
  let angle = rng.range(0, Math.PI);
  for (let s = 0; s < j.sets; s++) {
    if (s > 0) angle += rng.range(j.between[0], j.between[1]) * Math.PI / 180;
    const nx = Math.cos(angle), nz = Math.sin(angle), spacing = rng.range(j.spacing[0], j.spacing[1]);
    // The block's corners project onto the normal over this range.
    const u = [0, across * nx, across * nz, across * (nx + nz)], lo = Math.min(...u) - spacing, hi = Math.max(...u) + spacing;
    const planes: number[] = [];
    for (let p = lo + rng.range(0, spacing); p < hi; p += spacing * rng.range(0.5, 1.5)) planes.push(p);
    out.push({ nx, nz, planes: Float64Array.from(planes) });
  }
  return out;
}

/** The distance from a point to the nearest crack of a set. */
export function jointDistance(set: JointSet, x: number, z: number): number {
  const u = x * set.nx + z * set.nz, p = set.planes;
  let lo = 0, hi = p.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p[mid] < u) lo = mid + 1; else hi = mid;
  }
  return Math.min(Math.abs(p[lo] - u), lo > 0 ? Math.abs(p[lo - 1] - u) : Infinity);
}

function makeFaults(rng: Rng, rock: CaveRockDef, across: number, deep: number): Fault[] {
  const out: Fault[] = [], n = rng.int(rock.faults.count[0], rock.faults.count[1]);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI), tilt = rng.range(-0.3, 0.3), l = Math.hypot(1, tilt);
    out.push({ px: rng.range(0.2, 0.8) * across, py: deep / 2, pz: rng.range(0.2, 0.8) * across, nx: Math.cos(a) / l, ny: tilt / l, nz: Math.sin(a) / l });
  }
  return out;
}

/** The distance from a point to a fault's plane. */
export const faultDistance = (f: Fault, x: number, y: number, z: number): number => Math.abs((x - f.px) * f.nx + (y - f.py) * f.ny + (z - f.pz) * f.nz);

// --- ore ---

function makeOre(rng: Rng, def: CaveOreDef, joints: readonly JointSet[], faults: readonly Fault[], across: number, deep: number): OreBody[] {
  const out: OreBody[] = [], n = rng.int(def.bodies[0], def.bodies[1]);
  const total = def.ores.reduce((a, o) => a + o.weight, 0), kinds = def.kinds, kt = kinds.vein + kinds.seam + kinds.pocket;
  for (let i = 0; i < n; i++) {
    let w = rng.range(0, total), ore = 0;
    for (; ore < def.ores.length - 1; ore++) { w -= def.ores[ore].weight; if (w < 0) break; }
    const k = rng.range(0, kt), cx = rng.range(0.15, 0.85) * across, cz = rng.range(0.15, 0.85) * across;
    if (k < kinds.vein) {
      let plane: Fault;
      if (faults.length && rng.chance(0.5)) plane = faults[rng.int(0, faults.length - 1)];
      else {
        // A plane of a joint set through (cx, cz): it stands on the crack nearest it.
        const set = joints[rng.int(0, joints.length - 1)], u = cx * set.nx + cz * set.nz;
        let best = set.planes[0];
        for (const p of set.planes) if (Math.abs(p - u) < Math.abs(best - u)) best = p;
        plane = { px: set.nx * best, py: 0, pz: set.nz * best, nx: set.nx, ny: 0, nz: set.nz };
      }
      const y0 = rng.range(0.05, 0.5) * deep;
      out.push({ kind: 'vein', ore, plane, cx, cz, along: rng.range(25, 70), y0, y1: y0 + rng.range(10, 0.5 * deep), thick: rng.range(0.3, 1.2) });
    } else if (k < kinds.vein + kinds.seam) {
      out.push({ kind: 'seam', ore, s: rng.range(0.15, 0.85) * deep, cx, cz, reach: rng.range(40, 120), thick: rng.range(0.3, 0.8) });
    } else {
      out.push({ kind: 'pocket', ore, x: cx, y: rng.range(0.1, 0.9) * deep, z: cz, r: rng.range(1.5, 5) });
    }
  }
  return out;
}

/** The ore at a point (its index in the setting's ores, plus one; 0: plain rock). */
export function oreAt(b: RockBlock, x: number, y: number, z: number): number {
  for (const o of b.ore) {
    if (o.kind === 'pocket') {
      if (Math.hypot(x - o.x, y - o.y, z - o.z) < o.r) return o.ore + 1;
    } else if (o.kind === 'seam') {
      if (Math.abs(bedCoord(b.beds, x, y, z) - o.s) < o.thick / 2 && Math.hypot(x - o.cx, z - o.cz) < o.reach) return o.ore + 1;
    } else if (y >= o.y0 && y <= o.y1 && Math.abs(faultDistance(o.plane, x, y, z)) < o.thick / 2 && Math.hypot(x - o.cx, z - o.cz) < o.along) return o.ore + 1;
  }
  return 0;
}

// --- groundwater ---

const FACES: readonly Face[] = ['west', 'east', 'south', 'north'];

/** A point on a face of the block, `t` (0..1) along it. */
function onFace(face: Face, t: number, across: number): [number, number] {
  const a = t * across;
  return face === 'west' ? [0, a] : face === 'east' ? [across, a] : face === 'south' ? [a, 0] : [a, across];
}

/** The side of the block where the land is lowest on average: the valley, where the water comes out. */
export function valleyFace(land: CaveLand, across: number): Face {
  let best: Face = 'west', low = Infinity;
  for (const f of FACES) {
    let sum = 0;
    for (let i = 0; i <= 8; i++) { const [x, z] = onFace(f, i / 8, across); sum += land.surface(x, z); }
    if (sum < low) { low = sum; best = f; }
  }
  return best;
}

function makeWater(rng: Rng, rock: CaveRockDef, land: CaveLand, across: number, deep: number, lattice: number): Groundwater {
  const w = rock.water, face = valleyFace(land, across);
  // The newest water table stands about at the valley floor at the face (kept inside the block's lower half).
  let low = Infinity;
  for (let i = 0; i <= 8; i++) { const [x, z] = onFace(face, i / 8, across); low = Math.min(low, land.surface(x, z)); }
  const newest = Math.min(Math.max(low, 0.12 * deep), 0.4 * deep);
  const nStages = rng.int(w.stages[0], w.stages[1]), tables: number[] = [];
  for (let s = 0, t = newest; s < nStages; s++) { tables.unshift(t); t += rng.range(w.drop[0], w.drop[1]); }
  const topTable = tables[0], nSprings = rng.int(w.springs[0], w.springs[1]), along: number[] = [];
  for (let i = 0; i < nSprings; i++) along.push((i + rng.range(0.2, 0.8)) / nSprings);
  const stages: Stage[] = tables.map((table) => ({
    table,
    springs: along.map((t) => { const [x, z] = onFace(face, t, across); return { x, y: table, z }; }),
  }));
  // Sinks: the depressions of the land farthest from the valley face, the water gathering in them; ground flat or
  // seeded alike where the land has none.
  const grid = 14, cell = across / grid, cand: { x: number; z: number; score: number }[] = [];
  const h = (i: number, j: number) => land.surface((Math.min(grid - 1, Math.max(0, i)) + 0.5) * cell, (Math.min(grid - 1, Math.max(0, j)) + 0.5) * cell);
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    let around = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) around += h(i + a, j + b);
    const x = (i + 0.5) * cell, z = (j + 0.5) * cell, [fx, fz] = onFace(face, (face === 'west' || face === 'east' ? z : x) / across, across), far = Math.hypot(x - fx, z - fz) / across;
    if (far < 0.3) continue;
    cand.push({ x, z, score: around / 25 - h(i, j) + rng.range(0, 3) + far * 4 });
  }
  cand.sort((p, q) => q.score - p.score);
  const nSinks = Math.min(cand.length, rng.int(w.sinks[0], w.sinks[1])), sinks: Sink[] = [], apart = Math.max(across * 0.08, 3 * lattice);
  for (const c of cand) {
    if (sinks.length >= nSinks) break;
    if (sinks.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < apart)) continue;
    const top = Math.min(deep, land.surface(c.x, c.z)) - 2 * lattice;
    sinks.push({ x: c.x, y: Math.max(top, topTable + 3 * lattice), z: c.z, flow: rng.range(0.5, 1.5) });
  }
  return { face, sinks, stages };
}

/**
 * Rock on the land (D55, plan 5.6 layer 3): outcrops, boulders, erratics and fallen blocks, placed by the
 * landforms' rules (world/landforms.ts): a tor's crown of blocks and spires, a boulder field, a lone erratic,
 * blocks along a scarp's face and a ravine's walls, a ridge's crest, a sinkhole's rim. Each landform's rocks
 * come from its own seed, so every thread agrees; each is set on the ground by the shared seat
 * (@futuremagic/core seatHeight), a little sunk in. Bodies walk round them (`Rocks`).
 *
 * Record (ROCK_STRIDE floats): x, y (its foot), z, scale, yaw, kind (index into ROCK_KINDS).
 *
 * Pure, runs in workers.
 */
import { Rng, seatHeight } from '@futuremagic/core';
import { ROCK_SHAPES, rockModel, type RockShape } from '@futuremagic/rocks';
import { FORM_CELL, type Landform } from './landforms';
import type { Terrain } from './terrain';
import { FetchedCells } from './fetchedCells';

export const ROCK_STRIDE = 6;
/** Rocks of each shape, each its own seed. */
export const ROCK_VARIANTS = 3;

export interface RockKind {
  readonly shape: RockShape;
  readonly seed: number;
  /** Foot radius and height at scale 1, metres (from the model). */
  readonly foot: number;
  readonly height: number;
}

let kinds: RockKind[] | null = null;
/** Every rock model the land uses: shape by shape, ROCK_VARIANTS of each. */
export function rockKinds(): readonly RockKind[] {
  kinds ??= ROCK_SHAPES.flatMap((shape, s) => Array.from({ length: ROCK_VARIANTS }, (_, v) => {
    const seed = 7919 * (s + 1) + 104729 * (v + 1);
    const m = rockModel(shape, seed, 1);
    return { shape, seed, foot: m.foot, height: m.height };
  }));
  return kinds;
}

const kindOf = (shape: RockShape, rng: Rng): number => ROCK_SHAPES.indexOf(shape) * ROCK_VARIANTS + rng.int(0, ROCK_VARIANTS - 1);

/** Rocks lower than this (m) are stepped over, not walked round. */
export const STEP_OVER = 0.45;

/**
 * Where the rocks of one landform lie (before they are set on the ground): x, z, scale, yaw, kind. Each
 * landform's own seed, so they never move.
 */
export function rocksOf(f: Landform): number[] {
  const rock = f.def.rock ?? 0;
  if (rock <= 0) return [];
  const rng = new Rng(f.seed ^ 0x5eed);
  const out: number[] = [];
  const lay = (x: number, z: number, scale: number, shape: RockShape) => out.push(x, z, scale, rng.float() * Math.PI * 2, kindOf(shape, rng));
  // A point at (u along the axis, v across it) of the landform.
  const onAxis = (u: number, v: number): [number, number] => [f.x + u * f.ax - v * f.az, f.z + u * f.az + v * f.ax];
  const { L, W } = f;
  switch (f.shape) {
    case 'tor': {
      // Its crown: a knot of big blocks and a spire or two, smaller ones fallen round it.
      const n = 4 + Math.round(rock * 6);
      for (let k = 0; k < n; k++) {
        const a = rng.float() * Math.PI * 2, r = L * 0.3 * Math.sqrt(rng.float());
        lay(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, rng.range(1.4, 3.2) * (f.H / 18), rng.chance(0.3) ? 'spire' : 'block');
      }
      for (let k = 0; k < n; k++) {
        const a = rng.float() * Math.PI * 2, r = L * rng.range(0.35, 0.8);
        lay(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, rng.range(0.4, 1.1), rng.chance(0.5) ? 'block' : 'boulder');
      }
      break;
    }
    case 'boulders': {
      const n = 6 + Math.round((L * L) / 60);
      for (let k = 0; k < n; k++) {
        const a = rng.float() * Math.PI * 2, r = L * Math.sqrt(rng.float());
        lay(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, rng.range(0.3, 1.0) * (rng.chance(0.15) ? 1.8 : 1), rng.chance(0.8) ? 'boulder' : 'slab');
      }
      break;
    }
    case 'erratic':
      lay(f.x, f.z, rng.range(1.3, 2.4), rng.chance(0.7) ? 'boulder' : 'block');
      break;
    case 'scarp': case 'ravine': case 'ridge': case 'gully': {
      // Along the line where rock shows: a scarp's face, a ravine's walls, a ridge's crest, a gully's floor.
      const step = 9 / Math.max(0.2, rock);
      for (let u = -L * 0.8; u <= L * 0.8; u += step * rng.range(0.6, 1.4)) {
        const t = u / L, wob = L * (f.shape === 'scarp' ? 0.1 * Math.sin(t * 2 + phaseOf(f)) : 0.12 * Math.sin(t * 2.6 + phaseOf(f)));
        const side = f.shape === 'ravine' ? (rng.chance(0.5) ? 1 : -1) * W * rng.range(0.35, 0.6) : f.shape === 'ridge' ? rng.range(-0.15, 0.15) * W : f.shape === 'scarp' ? rng.range(-0.25, 0.2) * W : rng.range(-0.2, 0.2) * W;
        const [x, z] = onAxis(u, side - (f.shape === 'ridge' ? L * (0.1 * Math.sin(t * 2.2 + phaseOf(f))) : wob));
        lay(x, z, rng.range(0.6, 1.6) * (f.shape === 'gully' ? 0.6 : 1), f.shape === 'ridge' ? (rng.chance(0.4) ? 'slab' : 'block') : 'block');
      }
      break;
    }
    case 'sinkhole': {
      const n = 3 + Math.round(rock * 6);
      for (let k = 0; k < n; k++) {
        const a = rng.float() * Math.PI * 2, r = L * rng.range(0.55, 0.95);
        lay(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, rng.range(0.4, 1.1), 'block');
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** A landform's phase (as world/landforms.ts shapeAt reads it from its seed). */
const phaseOf = (f: Landform): number => (f.seed % 1000) / 159.2;

/**
 * The rocks of the landforms whose middle lies in the square [x0, x0 + size)² (ROCK_STRIDE floats each), set
 * on the ground; none in water or on a road.
 */
export function rockPlacement(t: Terrain, x0: number, z0: number, size: number): Float32Array {
  const ks = rockKinds();
  const out: number[] = [];
  for (const f of t.landforms.within(x0 + size / 2, z0 + size / 2, size * 0.71)) {
    if (f.x < x0 || f.x >= x0 + size || f.z < z0 || f.z >= z0 + size) continue;
    const rs = rocksOf(f);
    for (let k = 0; k < rs.length; k += 5) {
      const x = rs[k], z = rs[k + 1], scale = rs[k + 2], yaw = rs[k + 3], kind = rs[k + 4], m = ks[kind];
      const r = m.foot * scale;
      if (t.waterDepth(x, z) > 0 || t.roads.fromEdge(x, z) < r + 0.5 || t.townGround(x, z) !== 0) continue;
      // Set on the lowest ground under its foot, sunk in by a share of its height (it grew out of the ground).
      const y = seatHeight(t.height.bind(t), x, z, r * 0.8, r * 0.8, yaw, 0.12 * m.height * scale);
      out.push(x, y, z, scale, yaw, kind);
    }
  }
  return Float32Array.from(out);
}

/** Per landform cell: x, z, radius and top (y) of each rock a body cannot step over. */
const OBST = 4;
/** Landform cells kept: the hero's surroundings, a few times over. */
const KEEP = 64;

/**
 * Rocks as obstacles (as world/trunks.ts trees): landform cells fetched ahead from the world workers
 * (`around`) or placed here when a body gets to one first.
 */
export class Rocks {
  private readonly cells: FetchedCells;

  constructor(terrain: Terrain, fetch?: (x0: number, z0: number, size: number) => Promise<Float32Array>) {
    this.cells = new FetchedCells(FORM_CELL, KEEP, (i, j) => obstaclesOf(rockPlacement(terrain, i * FORM_CELL, j * FORM_CELL, FORM_CELL)), fetch, obstaclesOf);
  }

  /** Ask ahead for the cells around (x, z). */
  around(x: number, z: number): void {
    this.cells.around(x, z, 1);
  }

  /** Drop the cells near what `touches` names (a road was laid): a cell's rocks reach a landform's length past it. */
  forgetOver(touches: (x0: number, z0: number, x1: number, z1: number) => boolean): void {
    this.cells.forgetOver(touches, 1);
  }

  /** Does a body of radius `r` at (x, z), its feet at `y` (if known), touch a rock it cannot step over? */
  blocks(x: number, z: number, r: number, y?: number): boolean {
    const ci = Math.floor(x / FORM_CELL), cj = Math.floor(z / FORM_CELL);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const c = this.cells.cellAt(i, j);
      for (let k = 0; k < c.length; k += OBST) {
        const dx = c[k] - x, dz = c[k + 1] - z, rr = c[k + 2] + r;
        if (dx * dx + dz * dz >= rr * rr) continue;
        // Over its top (a body standing on it, or flying past) it does not block.
        if (y !== undefined && y > c[k + 3] - 0.1) continue;
        return true;
      }
    }
    return false;
  }
}

/** The rocks among placements that a body walks round: x, z, foot radius (a little in from the widest), top. */
export function obstaclesOf(d: Float32Array): Float32Array {
  const ks = rockKinds(), out: number[] = [];
  for (let k = 0; k < d.length; k += ROCK_STRIDE) {
    const m = ks[d[k + 5]], s = d[k + 3];
    const top = d[k + 1] + m.height * s;
    if (m.height * s * 0.88 < STEP_OVER) continue;
    out.push(d[k], d[k + 2], m.foot * s * 0.85, top);
  }
  return Float32Array.from(out);
}

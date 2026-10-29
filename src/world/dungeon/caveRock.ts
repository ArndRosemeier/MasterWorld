/**
 * A natural cave's rock (plan 5.6, 8: "carved as an SDF cave"; pure, runs in a worker): the dungeon's rooms
 * and ways, carved out of solid rock instead of built. The layout's space (world/dungeon/space.ts) gives the
 * floors, ceilings and the walls between ways; here its walls are thickened into rock, its corners rounded,
 * and the walls and ceilings bulge inward with noise, more in the wide caverns than in the narrow ways and
 * least at the foot of a wall, so the floor stays level where people walk and things stand. The field is
 * meshed with surface nets (@futuremagic/volume) into the building format: rock on walls and roofs, silt
 * and rock on the floors, so it draws with the town's one building shader.
 *
 * The walker reads the same field (`CaveSpace`), with the layout's own space over it for the doors that
 * are still shut, so what is seen is what is walked.
 */
import { Noise, Rng, deriveSeed, smin, smoothstep } from '@futuremagic/core';
import { DIRS } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { ScaledLayout } from './cellar';
import { CellarMat, WildMat, scaleTint, type Tint } from './meshKit';
import { brickField, fieldAt, meshField, setSample, type BrickField } from './rockMesh';
import { DungeonSpace } from './space';

/** Sample spacing of the cave's field, metres: a sixth of a cell, 0.4 m at least (a cellar-sized cave's). */
export const caveStep = (cell: number): number => Math.max(0.4, Math.min(0.6, cell / 6));
/** Half the least thickness of rock between two ways side by side, metres, for a 2 m cell. */
const SKIN = 0.15;
/** A room this many storeys high is a cavern: its roof a dome, its walls leaning in as they rise, stalactites hanging. */
const CAVERN = 3;
/** How far a cavern's walls lean in for every metre they rise above head height. */
const LEAN = 0.22;
/** A cavern's dome falls to this share of its height at its walls. */
const DOME_EDGE = 0.4;

/** The cave's rock as signed distances (positive in air), in bricks, in the dungeon's own frame. */
export type CaveField = BrickField;

/** A cavern of the layout in metres: its floor plan, floor and full height. */
interface Cavern { readonly id: number; readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number; readonly floor: number; readonly high: number }
/** A stalactite: where it hangs, how long it is and how thick at its root. */
interface Stalactite { readonly x: number; readonly z: number; readonly len: number; readonly r: number }

/** A cavern's roof over (x, z): its full height in the middle, falling towards the walls. */
function domeAt(c: Cavern, x: number, z: number): number {
  const u = (2 * x - c.x0 - c.x1) / (c.x1 - c.x0), v = (2 * z - c.z0 - c.z1) / (c.z1 - c.z0);
  return c.floor + c.high * (1 - (1 - DOME_EDGE) * Math.min(1, u * u + v * v));
}

/** The field around every room and way of the layout, a cell of rock beyond. */
export function caveField(layout: ScaledLayout, seed: number, step = caveStep(layout.scale.cell)): CaveField {
  const space = new DungeonSpace(layout, true), { cell: CELL, storey: STOREY } = layout.scale;
  // Everything that is a length in a cellar-sized cave grows with the cell.
  const g = CELL / 2;
  const noise = new Noise(deriveSeed(seed, 'cave', 'rock'));
  const [lo, hi] = layout.levels;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const k of space.grid.cells.keys()) {
    const [i, j] = k.split(',').map(Number);
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const ox = (i0 - 1) * CELL, oz = (j0 - 1) * CELL, oy = lo * STOREY - 1.2;
  const nx = Math.ceil(((i1 + 2) * CELL - ox) / step) + 1, nz = Math.ceil(((j1 + 2) * CELL - oz) / step) + 1;
  const ny = Math.ceil(((hi + 1) * STOREY + 1 - oy) / step) + 1;
  // Per cell column: the lowest and highest storey anything is on there (the solid rock between is not sampled).
  const ci = i1 - i0 + 3, cj = j1 - j0 + 3;
  const colLo = new Int16Array(ci * cj).fill(32767), colHi = new Int16Array(ci * cj).fill(-32768);
  for (const k of space.grid.cells.keys()) {
    const [i, j, l] = k.split(',').map(Number), c = (j - j0 + 1) * ci + (i - i0 + 1);
    colLo[c] = Math.min(colLo[c], l); colHi[c] = Math.max(colHi[c], l);
  }
  // The storeys to sample in a column: its own and its neighbours' (none: solid rock).
  const sLo = new Int16Array(ci * cj).fill(32767), sHi = new Int16Array(ci * cj).fill(-32768);
  for (let j = 0; j < cj; j++) for (let i = 0; i < ci; i++) for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
    const x = i + u, z = j + v;
    if (x >= 0 && z >= 0 && x < ci && z < cj) { sLo[j * ci + i] = Math.min(sLo[j * ci + i], colLo[z * ci + x]); sHi[j * ci + i] = Math.max(sHi[j * ci + i], colHi[z * ci + x]); }
  }
  // Doorways (their middles on the floor): the rock bulges least there, so every way stays wide enough to pass.
  // Each column keeps the doorways near enough to matter (the bulge is full 2.2 m from one).
  const near: number[][][] = Array.from({ length: ci * cj }, () => []);
  for (const pl of layout.links) for (const dr of pl.doors) {
    const q = [(dr.x + 0.5 + DIRS[dr.dir][0] * 0.5) * CELL, dr.level * STOREY + 1, (dr.z + 0.5 + DIRS[dr.dir][1] * 0.5) * CELL];
    const reach = Math.ceil(2.2 / CELL) + 1, a = dr.x - i0 + 1, b = dr.z - j0 + 1;
    for (let v = -reach; v <= reach; v++) for (let u = -reach; u <= reach; u++) {
      const x = a + u, z = b + v;
      if (x >= 0 && z >= 0 && x < ci && z < cj) near[z * ci + x].push(q);
    }
  }
  const fromDoor = (c: number, x: number, y: number, z: number) => {
    let best = Infinity;
    for (const q of near[c]) best = Math.min(best, Math.hypot(q[0] - x, (q[1] - y) * 0.7, q[2] - z));
    return best;
  };
  // The caverns, and the stalactites hanging from their roofs (none near the walls, where the roof is low).
  const caverns = new Map<number, Cavern>(), drips = new Map<number, Stalactite[]>();
  for (const r of layout.rooms) {
    if (r.height < CAVERN) continue;
    const c: Cavern = { id: r.id, x0: r.x * CELL, x1: (r.x + r.w) * CELL, z0: r.z * CELL, z1: (r.z + r.d) * CELL, floor: r.level * STOREY, high: r.height * STOREY };
    caverns.set(r.id, c);
    const rng = new Rng(deriveSeed(seed, 'cave', 'stalactites', r.id)), list: Stalactite[] = [];
    const n = Math.round(((c.x1 - c.x0) * (c.z1 - c.z0)) / 14);
    for (let t = 0; t < n; t++) {
      const u = rng.range(0.12, 0.88), v = rng.range(0.12, 0.88);
      list.push({ x: c.x0 + (c.x1 - c.x0) * u, z: c.z0 + (c.z1 - c.z0) * v, len: rng.range(0.8, 4.5) * rng.range(0.5, 1), r: rng.range(0.25, 0.75) });
    }
    drips.set(r.id, list);
  }
  const f = brickField(ox, oy, oz, step, nx, ny, nz);
  for (let k = 0; k < nz; k++) {
    const z = oz + k * step;
    for (let i = 0; i < nx; i++) {
      const x = ox + i * step;
      const col = Math.floor((z - oz) / CELL) * ci + Math.floor((x - ox) / CELL);
      if (sLo[col] > sHi[col]) continue;
      const ja = Math.max(0, Math.floor((sLo[col] * STOREY - 1.2 - oy) / step)), jb = Math.min(ny - 1, Math.ceil(((sHi[col] + 1) * STOREY + 1 - oy) / step));
      for (let j = ja; j <= jb; j++) {
        const y = oy + j * step;
        const p = space.parts(x, y, z, 3 * g, 0.6 * g);
        let walls = p.walls - SKIN * g, ceil = p.ceil, round = 0.2 * g;
        const own = space.own(Math.floor(x / CELL), Math.floor(z / CELL), space.levelAt(y));
        const cav = own !== undefined ? caverns.get(own) : undefined;
        let high = 0;
        if (cav) {
          // A cavern: the roof a dome, the walls leaning in above head height, so it is a hall of rock, not a box.
          const up = y - cav.floor;
          high = smoothstep(3, 9, up);
          ceil = Math.min(ceil, domeAt(cav, x, z) - y);
          // The walls lean in from their sides, not across a doorway (its opening goes on into the rock).
          const l = space.levelAt(y), ci0 = Math.floor(x / CELL), cj0 = Math.floor(z / CELL);
          const side = (d: number, i: number, j: number, k: number) => (space.opening(i, j, l, k) ? Infinity : d);
          const edge = Math.min(
            side(cav.x1 - x, cav.x1 / CELL - 1, cj0, 0), side(cav.z1 - z, ci0, cav.z1 / CELL - 1, 1),
            side(x - cav.x0, cav.x0 / CELL, cj0, 2), side(z - cav.z0, ci0, cav.z0 / CELL, 3),
          );
          if (edge < Infinity) walls = smin(walls, edge - SKIN * g - LEAN * Math.max(0, up - 3), 1.5);
        }
        if (Math.min(walls, ceil) < 1.8 * g + high * 2.5 && p.floor > -0.5) {
          // A way's rock stays close to its walls; a room's bulges (less towards its doorways, below).
          const amp = own !== undefined && own >= 0 ? 1 : 0;
          // Lumps of rock and the grain of its beds; least at the wall's foot, where things stand; big ones high in a cavern.
          const lump = noise.fbm3(x / (2.6 * g), y / (2.1 * g), z / (2.6 * g), 3) * 0.5 + 0.5;
          const bed = Math.sin(y * 2.3 + noise.fbm3(x / 9, y / 9, z / 9, 2) * 4) * (0.03 + amp * 0.04);
          const grit = noise.fbm3(x / 0.8 + 31.7, y / 0.8, z / 0.8, 2) * (0.04 + amp * 0.04);
          const foot = 0.2 + 0.8 * smoothstep(0.3, 1.6, p.floor);
          const open = 0.25 + 0.75 * smoothstep(0.8, 2.2, fromDoor(col, x, y, z));
          const crag = high * (noise.fbm3(x / 7, y / 6, z / 7 + 13.1, 3) * 0.5 + 0.5) * 2.2;
          walls -= (((0.08 + amp * 0.42) * lump * foot) * g + bed + grit + crag) * open;
          ceil -= (0.05 + amp * 0.38) * g * (noise.fbm3(x / (3.1 * g) + 7.3, y / (3.1 * g), z / (3.1 * g), 2) * 0.5 + 0.5) + grit + crag * 0.6;
          round += amp * 0.8 * g;
        }
        let d = smin(smin(walls, ceil, round), p.floor, 0.45);
        // Stalactites over a cavern's floor, from its roof down (their tips well over a body's head).
        if (cav && high > 0) for (const s of drips.get(cav.id)!) {
          const hd = Math.hypot(x - s.x, z - s.z);
          if (hd > s.r + 0.6) continue;
          const tip = domeAt(cav, s.x, s.z) - s.len, t = (y - tip) / s.len;
          const cone = t < 0 ? Math.hypot(hd, y - tip) : (hd - s.r * Math.min(1, t)) * 0.85;
          d = Math.min(d, cone);
        }
        setSample(f, i, j, k, d);
      }
    }
  }
  return f;
}

/** The field at a point (trilinear); solid rock outside it. */
export const caveAt = (f: CaveField, x: number, y: number, z: number): number => fieldAt(f, x, y, z);

/**
 * A cave's space to walk in: its rock, and the layout's doors still shut (a grate, a wedged boulder, a hidden
 * way). Nothing else of the layout's space walls it in, so where the rock is open one walks.
 */
export class CaveSpace extends DungeonSpace {
  constructor(layout: ScaledLayout, readonly rock: CaveField) {
    super(layout);
  }

  override sdf(x: number, y: number, z: number): number {
    return Math.min(caveAt(this.rock, x, y, z), this.shut(x, y, z));
  }
}

/** The rock as it is (grey with a little ochre), and silt on the floors. */
const ROCK: Tint = [168, 160, 148], SILT: Tint = [150, 132, 110];

/** The cave's rock as one mesh in the building format (its own frame). */
export function caveShell(f: CaveField, layout: ScaledLayout, seed: number): BuildingMesh {
  const space = new DungeonSpace(layout, true);
  const noise = new Noise(deriveSeed(seed, 'cave', 'tint'));
  return meshField(f, {
    // Level floors gather silt in patches; the rest is bare rock.
    mat: (x, _y, z, up) => (up > 0.8 && noise.fbm3(x / 3.5, 0.5, z / 3.5, 2) > -0.15 ? CellarMat.Earth : WildMat.Rock),
    tint: (x, y, z, m) => {
      // Damp darkens the foot of the walls, the beds of the rock run in bands, and some stretches are darker.
      const floor = Math.max(0, space.parts(x, y + 0.05, z, 3).floor);
      const band = 0.9 + 0.1 * Math.sin(y * 1.7 + noise.fbm3(x / 6, y / 6, z / 6, 2) * 3);
      const s = (0.62 + 0.38 * smoothstep(0, 0.9, floor)) * band * (0.85 + 0.3 * (noise.fbm3(x / 5, y / 5, z / 5, 2) * 0.5 + 0.5));
      return scaleTint(m === WildMat.Rock ? ROCK : SILT, s);
    },
  });
}

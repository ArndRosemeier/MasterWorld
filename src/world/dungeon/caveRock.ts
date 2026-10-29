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
import { Noise, deriveSeed, smin, smoothstep } from '@futuremagic/core';
import { DIRS } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { ScaledLayout } from './cellar';
import { CellarMat, WildMat, scaleTint, type Tint } from './meshKit';
import { fieldAt, meshField, type Field } from './rockMesh';
import { DungeonSpace } from './space';

/** Sample spacing of the cave's field, metres. */
export const CAVE_STEP = 0.4;
/** Half the least thickness of rock between two ways side by side, metres. */
const SKIN = 0.15;

/** The cave's rock as signed distances on a grid (positive in air), in the dungeon's own frame. */
export type CaveField = Field;

/** The field around every room and way of the layout, a cell of rock beyond. */
export function caveField(layout: ScaledLayout, seed: number, step = CAVE_STEP): CaveField {
  const space = new DungeonSpace(layout, true), { cell: CELL, storey: STOREY } = layout.scale;
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
  // Per cell column: anything there on any storey (the solid rock between is not sampled).
  const ci = i1 - i0 + 3, cj = j1 - j0 + 3;
  const used = new Uint8Array(ci * cj);
  for (let j = 0; j < cj; j++) for (let i = 0; i < ci; i++) {
    for (let l = lo; l <= hi; l++) if (space.grid.owner(i + i0 - 1, j + j0 - 1, l) !== undefined) used[j * ci + i] = 1;
  }
  const near = (i: number, j: number) => {
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const u = i + a, v = j + b;
      if (u >= 0 && v >= 0 && u < ci && v < cj && used[v * ci + u]) return true;
    }
    return false;
  };
  // Doorways (their middles on the floor): the rock bulges least there, so every way stays wide enough to pass.
  const doors = layout.links.flatMap((pl) => pl.doors.map((dr) => [(dr.x + 0.5 + DIRS[dr.dir][0] * 0.5) * CELL, dr.level * STOREY + 1, (dr.z + 0.5 + DIRS[dr.dir][1] * 0.5) * CELL]));
  const fromDoor = (x: number, y: number, z: number) => {
    let best = Infinity;
    for (const q of doors) best = Math.min(best, Math.hypot(q[0] - x, (q[1] - y) * 0.7, q[2] - z));
    return best;
  };
  const d = new Float32Array(nx * ny * nz).fill(-1);
  for (let k = 0; k < nz; k++) {
    const z = oz + k * step;
    for (let i = 0; i < nx; i++) {
      const x = ox + i * step;
      if (!near(Math.floor((x - ox) / CELL), Math.floor((z - oz) / CELL))) continue;
      for (let j = 0; j < ny; j++) {
        const y = oy + j * step;
        const p = space.parts(x, y, z, 3, 0.6);
        let walls = p.walls - SKIN, ceil = p.ceil, round = 0.2;
        if (Math.min(walls, ceil) < 1.8 && p.floor > -0.5) {
          // A way's rock stays close to its walls; a room's bulges (less towards its doorways, below).
          const own = space.grid.owner(Math.floor(x / CELL), Math.floor(z / CELL), space.levelAt(y));
          const amp = own !== undefined && own >= 0 ? 1 : 0;
          // Lumps of rock and the grain of its beds; least at the wall's foot, where things stand.
          const lump = noise.fbm3(x / 2.6, y / 2.1, z / 2.6, 3) * 0.5 + 0.5;
          const bed = Math.sin(y * 2.3 + noise.fbm3(x / 9, y / 9, z / 9, 2) * 4) * (0.03 + amp * 0.04);
          const grit = noise.fbm3(x / 0.8 + 31.7, y / 0.8, z / 0.8, 2) * (0.04 + amp * 0.04);
          const foot = 0.2 + 0.8 * smoothstep(0.3, 1.6, p.floor);
          const open = 0.25 + 0.75 * smoothstep(0.8, 2.2, fromDoor(x, y, z));
          walls -= ((0.08 + amp * 0.42) * lump * foot + bed + grit) * open;
          ceil -= (0.05 + amp * 0.38) * (noise.fbm3(x / 3.1 + 7.3, y / 3.1, z / 3.1, 2) * 0.5 + 0.5) + grit;
          round += amp * 0.8;
        }
        d[i + nx * (j + ny * k)] = smin(smin(walls, ceil, round), p.floor, 0.45);
      }
    }
  }
  return { ox, oy, oz, step, nx, ny, nz, d };
}

/** The field at a point (trilinear); solid rock outside it. */
export const caveAt = (f: CaveField, x: number, y: number, z: number): number => fieldAt(f, x, y, z);

/** A cave's space to walk in: its rock, and the layout's doors still shut (a door, a grate, a hidden way). */
export class CaveSpace extends DungeonSpace {
  constructor(layout: ScaledLayout, readonly rock: CaveField) {
    super(layout);
  }

  override sdf(x: number, y: number, z: number): number {
    return Math.min(super.sdf(x, y, z), caveAt(this.rock, x, y, z));
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

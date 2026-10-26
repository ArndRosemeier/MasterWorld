/**
 * A town's ground for the terrain shader (render/materials/townGround.ts TOWN_MASKS), one texel a square
 * metre: two masks side by side, the ground (R street, G market, B yard, A under a building) and the
 * farmland (R a track, G a field, B its crop index times CROP_STEP, A the way its rows run). Pure: the
 * start town's masks are baked at load, a settlement's in a worker when the hero comes near it.
 */
import { CROPS } from '@futuremagic/settlement';
import { TOWN_RASTER, TownGround, type Town } from './town';

/** The crop index's step in the farmland mask's blue channel. */
export const CROP_STEP = 20;

/** The farmland at a cell: whether it is a track, and the field there (crop index, rows), if any. */
type FieldCell = { path: boolean; crop: number; rows: number } | null;

/** The town's masks, `w` × `h` texels each from its raster's corner (cut there if the town is bigger). */
export function townMaskData(town: Town, w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * 2 * h * 4);
  bakeMasks(data, w, h, Math.min(town.nx, w), Math.min(town.nz, h), ...townCells(town));
  return data;
}

/** The two masks (each `w` × `h` texels, side by side) over the first `nx` × `nz` cells. */
function bakeMasks(data: Uint8Array, w: number, h: number, nx: number, nz: number, ground: (i: number, j: number) => number, field: (i: number, j: number) => FieldCell): void {
  const has = new Uint8Array(w * h);
  const texel = (i: number, j: number, half: number) => (i + half * w + j * w * 2) * 4;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const g = ground(i, j), o = texel(i, j, 0);
    if (g === 2) data[o] = 255; else if (g === 3) data[o + 1] = 255; else if (g === 1) data[o + 2] = 255; else if (g === 4) data[o + 3] = 255;
    const f = field(i, j), q = texel(i, j, 1);
    if (!f) continue;
    if (f.path) data[q] = 255;
    if (f.crop >= 0) {
      data[q + 1] = 255;
      data[q + 2] = f.crop * CROP_STEP;
      data[q + 3] = Math.round((((f.rows % Math.PI) + Math.PI) % Math.PI) / Math.PI * 255);
      has[i + j * w] = 1;
    }
  }
  // Spread crop and rows two cells out from every field.
  for (let pass = 0; pass < 2; pass++) {
    const was = has.slice();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (was[i + j * w]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || !was[a + b * w]) continue;
        const o = texel(i, j, 1), q = texel(a, b, 1);
        data[o + 2] = data[q + 2]; data[o + 3] = data[q + 3];
        has[i + j * w] = 1;
        break;
      }
    }
  }
}

/** A town's ground and farmland per cell of its raster. */
function townCells(town: Town): [(i: number, j: number) => number, (i: number, j: number) => FieldCell] {
  const cellAt = (i: number, j: number): [number, number] => [town.x0 + (i + 0.5) * TOWN_RASTER, town.z0 + (j + 0.5) * TOWN_RASTER];
  return [
    (i, j) => town.groundAt(...cellAt(i, j)),
    (i, j) => {
      const [x, z] = cellAt(i, j), f = town.fieldAt(x, z), path = town.groundAt(x, z) === TownGround.Path;
      return f || path ? { path, crop: f ? CROPS.indexOf(f.crop) : -1, rows: f?.rows ?? 0 } : null;
    },
  ];
}

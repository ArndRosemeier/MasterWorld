/**
 * Props made in Blender from AssetGenerator specs (public/props/cellar.fmpk, `npm run props`, decoded by
 * @futuremagic/props) stamped into a building mesh (pure): each material slot picks a layer of the town's
 * texture array (wood gets oak grain, rope straw, the rest the near-plain plaster), and the tint brings the
 * baked colour and occlusion back, so the props draw with the one building shader.
 */
import type { PropModel } from '@futuremagic/props';
import { BuildingMat as M, type MeshKit } from './meshKit';

export type PropModels = ReadonlyMap<string, PropModel>;

/**
 * Mean linear albedo (times the shader's occlusion term) of the layers props use, so tint = colour / mean.
 * Measured from @futuremagic/texgen (test/cellarProps.test.ts checks them).
 */
export const LAYER_MEAN: Readonly<Record<number, readonly [number, number, number]>> = {
  [M.Plaster]: [0.78, 0.761, 0.714],
  [M.Oak]: [0.1, 0.0559, 0.0306],
  [M.Thatch]: [0.248, 0.16, 0.0554],
};

/** The layer for a material slot, by the words in its name (spec material names, or a baked `<asset>_<slot>_<look>`). */
export function slotLayer(name: string): number {
  if (/rope|straw/.test(name)) return M.Thatch;
  if (/wood|timber|stave|plank|frame|board|top|ends|trim/.test(name) && !/iron/.test(name)) return M.Oak;
  return M.Plaster;
}

export interface Stamp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** About +y, as the props' yaw (the model's front is +z). */
  readonly yaw: number;
  /** Per axis (model frame). */
  readonly scale?: readonly [number, number, number];
  /** Brightness factor on the baked colour (variety between pieces). */
  readonly shade?: number;
  /** Lay it on its side (a cask): turns the model about its own z by this much, about its centre. */
  readonly roll?: number;
  /** Grain on side faces runs up (staves, doors) rather than across (crates, benches). */
  readonly across?: boolean;
  /** Round (barrels, urns): side faces take their u around the axis, so they have no seams. */
  readonly round?: boolean;
}

const SRGB = 1 / 2.2;

/** Put `model` into `kit` at `s`. */
export function stampModel(kit: MeshKit, model: PropModel, s: Stamp): void {
  const n = model.positions.length / 3;
  const [sx, sy, sz] = s.scale ?? [1, 1, 1];
  const c = Math.cos(s.yaw), si = Math.sin(s.yaw);
  const roll = s.roll ?? 0, cr = Math.cos(roll), sr = Math.sin(roll);
  const cy = (model.min[1] + model.max[1]) / 2;
  const pos = new Float32Array(3 * n), nor = new Float32Array(3 * n), uv = new Float32Array(2 * n);
  const mat = new Uint8Array(n), tint = new Uint8Array(3 * n);
  const layers = model.slotNames.map(slotLayer);
  const shade = s.shade ?? 1;
  for (let i = 0; i < n; i++) {
    // Model frame (scaled), then the roll about z through the middle, then yaw and place.
    let px = model.positions[3 * i] * sx, py = model.positions[3 * i + 1] * sy, pz = model.positions[3 * i + 2] * sz;
    let nx = model.normals[3 * i] / sx, ny = model.normals[3 * i + 1] / sy, nz = model.normals[3 * i + 2] / sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // Texture coordinates in the model's own frame, so they stay on the piece however it stands.
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = px; v = pz; } else {
      const h = s.round ? Math.atan2(pz, px) * Math.max(0.05, Math.hypot(px, pz)) : ax > az ? pz : px;
      [u, v] = s.across ? [h, py] : [py, h];
    }
    uv[2 * i] = u; uv[2 * i + 1] = v;
    if (roll) {
      const ry = py - cy * sy;
      [px, py] = [px * cr - ry * sr, px * sr + ry * cr + cy * sy];
      [nx, ny] = [nx * cr - ny * sr, nx * sr + ny * cr];
    }
    pos[3 * i] = s.x + px * c + pz * si; pos[3 * i + 1] = s.y + py; pos[3 * i + 2] = s.z - px * si + pz * c;
    nor[3 * i] = nx * c + nz * si; nor[3 * i + 1] = ny; nor[3 * i + 2] = -nx * si + nz * c;
    const layer = layers[model.slots[i]] ?? M.Plaster;
    mat[i] = layer;
    const mean = LAYER_MEAN[layer];
    for (let k = 0; k < 3; k++) tint[3 * i + k] = Math.min(255, Math.round(255 * Math.pow(Math.max(0, model.colors[3 * i + k] * shade / mean[k]), SRGB)));
  }
  if (roll) {
    // Rolled over, it rests on its lowest point.
    let low = Infinity;
    for (let i = 0; i < n; i++) low = Math.min(low, pos[3 * i + 1]);
    for (let i = 0; i < n; i++) pos[3 * i + 1] += s.y - low;
  }
  kit.append(pos, nor, uv, mat, tint, model.indices);
}

// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Smoke rising from a burning place (C10: a raided farm's barn): soft puffs placed on the GPU round up to
 * SMOKE_COLUMNS columns, each puff rising, widening and thinning on a loop of its own, leaning with the wind.
 * One shader for every column; the columns are uniforms (origin-relative, pinned, render/origin.ts). The puffs'
 * placement is `puffMaterial`, which the volcanoes' steam and ash (materials/volcano.ts) use too.
 */
import { DoubleSide, MeshBasicNodeMaterial, Vector4, type Node } from 'three/webgpu';
import { attribute, cameraPosition, cross, float, fract, int, mix, normalize, positionGeometry, pow, sin, smoothstep, uniform, uniformArray, vec3, vec4 } from 'three/tsl';
import { WEATHER } from './weather';
import { inRenderGroup } from '../renderGroup';

/** Columns drawn at once, and puffs in each. */
export const SMOKE_COLUMNS = 4;
export const SMOKE_PUFFS = 72;
/** How high a column rises (m) and the puffs' size (m); how fast its puffs climb (m/s). */
export const SMOKE_HIGH = 90;
export const SMOKE_SIZE = 2.5;
const RISE = 2.4;

/** Each column: its foot (x, y, z, origin-relative) and its shape (x: how high it rises, y: how thick it is, 0: none, z: the puffs' size); written by the view. */
export const SMOKE_FEET: readonly Vector4[] = Array.from({ length: SMOKE_COLUMNS }, () => new Vector4());
export const SMOKE_SHAPE: readonly Vector4[] = Array.from({ length: SMOKE_COLUMNS }, () => new Vector4());

export const SMOKE = inRenderGroup({
  columns: uniformArray(SMOKE_FEET as Vector4[], 'vec4'),
  shape: uniformArray(SMOKE_SHAPE as Vector4[], 'vec4'),
  /** Seconds (real time, wrapped). */
  time: uniform(0),
});

/** Columns of puffs as uniforms: each column's foot (x, y, z origin-relative; w: 0 or 1, what the look makes of it) and shape (as SMOKE_SHAPE; w free), and the clock. */
export interface PuffSet { readonly columns: Node; readonly shape: Node; readonly time: Node }
/** How a column's puffs move: their life (s); spread and size as shares of the column's size, at birth and per unit of age; the wind's lean; a billow. */
export interface PuffSpec { readonly life: number; readonly spread: readonly [number, number]; readonly size: readonly [number, number]; readonly wind: readonly [number, number]; readonly sway: number }
/** What a puff looks like (its age `t`, its soft round falloff, its column's thickness, `ash` the foot's w, the column's `shape`): colour and opacity. */
export type PuffLook = (p: { t: Node; soft: Node; thick: Node; ash: Node; shape: Node }) => { color: Node; alpha: Node };

/**
 * Soft puffs placed on the GPU round the columns of `set` (instanced, `pPuff`: three random numbers and the column): each rising
 * its column's height over its life, widening and leaning with the wind more the higher it gets, turned to face the camera.
 * The smoke over a raided barn and the volcanoes' steam and ash differ in their sets, spec and look.
 */
export function puffMaterial(set: PuffSet, spec: PuffSpec, look: PuffLook): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, side: DoubleSide });
  const puff = attribute('pPuff', 'vec4'), idx = int(puff.w);
  const foot = set.columns.element(idx), shape = set.shape.element(idx);
  const t = fract(set.time.div(spec.life).add(puff.x));
  const high = shape.x, thick = shape.y.min(1), size0 = shape.z;
  const spread = t.mul(size0.mul(spec.spread[1])).add(size0.mul(spec.spread[0]));
  const lean = vec3(WEATHER.windDir.x, 0, WEATHER.windDir.y).mul(WEATHER.wind.mul(spec.wind[0]).add(spec.wind[1]).mul(t.mul(t)).mul(high.div(60).max(0.5)));
  const sway = vec3(sin(t.mul(9.0).add(puff.y.mul(40.0))), 0, sin(t.mul(8.0).add(puff.z.mul(40.0)))).mul(t.mul(size0).mul(spec.sway));
  const centre = foot.xyz.add(vec3(puff.y.sub(0.5).mul(spread), t.mul(high), puff.z.sub(0.5).mul(spread))).add(lean).add(sway);
  const size = t.mul(size0.mul(spec.size[1])).add(size0.mul(spec.size[0])).mul(thick.sign());
  // Turned to face the camera.
  const toCam = normalize(cameraPosition.sub(centre));
  const side = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, side);
  m.positionNode = centre.add(side.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const r2 = positionGeometry.x.mul(positionGeometry.x).add(positionGeometry.y.mul(positionGeometry.y));
  const soft = smoothstep(1.0, 0.15, r2);
  const { color, alpha } = look({ t, soft, thick, ash: foot.w, shape });
  m.colorNode = vec4(color, 1);
  m.opacityNode = alpha;
  return m;
}

/**
 * Charcoal at the fire, a brown-grey above: in quickly, thinning as it rises. Daylight checks (C12) found a pale, thin
 * column read as cloud: it is dark and dense enough to read as fire smoke.
 */
export function createSmokeMaterial(): MeshBasicNodeMaterial {
  return puffMaterial(SMOKE, { life: SMOKE_HIGH / RISE, spread: [0.4, 2.8], size: [1, 2.8], wind: [20, 8 / 3], sway: 0 }, ({ t, soft, thick }) => ({
    color: WEATHER.light.mul(vec3(1, 0.93, 0.85)).mul(mix(float(0.1), float(0.42), t.sqrt())),
    alpha: soft.mul(smoothstep(0, 0.06, t)).mul(pow(float(1).sub(t), 1.1)).mul(thick).mul(0.85),
  }));
}

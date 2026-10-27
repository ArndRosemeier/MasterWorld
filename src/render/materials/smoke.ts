// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Smoke rising from a burning place (C10: a raided farm's barn): soft puffs placed on the GPU round up to
 * SMOKE_COLUMNS columns, each puff rising, widening and thinning on a loop of its own, leaning with the wind.
 * One shader for every column; the columns are uniforms (origin-relative, pinned, render/origin.ts).
 */
import { DoubleSide, MeshBasicNodeMaterial, Vector4 } from 'three/webgpu';
import { attribute, cameraPosition, cross, float, fract, int, mix, normalize, positionGeometry, pow, smoothstep, uniform, uniformArray, vec3, vec4 } from 'three/tsl';
import { WEATHER } from './weather';

/** Columns drawn at once, and puffs in each. */
export const SMOKE_COLUMNS = 4;
export const SMOKE_PUFFS = 72;
/** How high a column rises (m) and how fast its puffs climb (m/s). */
const HIGH = 90, RISE = 2.4;

/** Each column: its foot (x, y, z, origin-relative) and how thick it is (0: none); written by the view. */
export const SMOKE_FEET: readonly Vector4[] = Array.from({ length: SMOKE_COLUMNS }, () => new Vector4());

export const SMOKE = {
  columns: uniformArray(SMOKE_FEET as Vector4[], 'vec4'),
  /** Seconds (real time, wrapped). */
  time: uniform(0),
};

export function createSmokeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, side: DoubleSide });
  const puff = attribute('pPuff', 'vec4'); // three random numbers, the column
  const col = SMOKE.columns.element(int(puff.w)), thick = col.w;
  const t = fract(SMOKE.time.mul(RISE / HIGH).add(puff.x));
  // Rising, spreading and leaning with the wind more the higher it gets.
  const spread = t.mul(14).add(1.2);
  const lean = vec3(WEATHER.windDir.x, 0, WEATHER.windDir.y).mul(WEATHER.wind.mul(30).add(4).mul(t.mul(t)));
  const centre = col.xyz.add(vec3(puff.y.sub(0.5).mul(spread), t.mul(HIGH), puff.z.sub(0.5).mul(spread))).add(lean);
  const size = t.mul(11).add(2.2).mul(thick.min(1).sign());
  // Turned to face the camera.
  const toCam = normalize(cameraPosition.sub(centre));
  const side = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, side);
  m.positionNode = centre.add(side.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  // A soft round puff: in quickly, thinning as it rises; dark at the fire, greyer above.
  const r2 = positionGeometry.x.mul(positionGeometry.x).add(positionGeometry.y.mul(positionGeometry.y));
  const soft = smoothstep(1.0, 0.15, r2);
  const a = soft.mul(smoothstep(0, 0.06, t)).mul(pow(float(1).sub(t), 1.6)).mul(thick.min(1)).mul(0.5);
  m.colorNode = vec4(WEATHER.light.mul(mix(float(0.28), float(0.75), t)), 1);
  m.opacityNode = a;
  return m;
}

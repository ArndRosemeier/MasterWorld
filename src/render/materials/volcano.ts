// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * What an active volcano looks like (K7d, docs/design/volcanoes.md; drawn by render/volcano/VolcanoView.ts):
 *  - lava (`VOLCANO_LAVA`): the lake in the crater and the flows down the flank. A dark crust in plates, cracked, the cracks
 *    glowing orange to yellow-white (HDR: the post chain's bloom does the rest); the plates drift (on the lake slowly, on a
 *    flow downstream) and the cracks open and close; a flow has a molten core near its head and pulses of heat running down it;
 *    its edges chill to dark levees. Lit by itself, not by the sun.
 *  - sulphur: a yellow crust frayed at its rim round a vent (`VOLCANO_CRUST`, a decal laid on the ground) and crystals standing
 *    on it (`VOLCANO_SULPHUR`).
 *  - steam and ash (`createSteamMaterial`): puffs placed on the GPU round up to STEAM_COLUMNS columns, white steam at a vent,
 *    a dark ash plume over a lake, lit from below by the lava at its foot.
 * All of it late: nothing here is needed in the first seconds (built under the shader cap when first added, docs/SHADERS.md).
 * Patterns read WORLD (the floating origin).
 */
import { DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Vector4 } from 'three/webgpu';
import { abs, attribute, cameraPosition, cross, float, fract, int, length, max, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionGeometry, pow, sin, smoothstep, uniform, uniformArray, vec2, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';
import { WORLD } from '../origin';
import { WEATHER } from './weather';

/** The volcano's clock (seconds; it moves the lava's plates and the steam's puffs). */
export const LAVA = { time: uniform(0) };

const CRUST = vec3(0.02, 0.016, 0.015);
const DEEP = vec3(0.7, 0.07, 0.006), ORANGE = vec3(3.4, 0.82, 0.07), YELLOW = vec3(7.0, 3.6, 0.9);

/**
 * Attributes: `uv` (a flow: metres along it from its head and -1..1 across; the lake: 0 and how far out to its edge, 0..1),
 * `fx` (x: 1 for a flow, 0 for the lake; y: how hot, 0..1; z: a flow's half width, m; w: a phase of its own).
 */
export const VOLCANO_LAVA = defineKind('volcano lava', ['position', 'uv', 'fx'], () => {
  const m = new MeshBasicNodeMaterial({ fog: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uv = attribute('uv', 'vec2'), fx = attribute('fx', 'vec4');
  const flow = fx.x, heat = fx.y, half = fx.z, ph = fx.w, t = LAVA.time;
  const across = abs(uv.y).mul(flow);
  // The plates' space: on a flow, metres along and across, carried downstream; on the lake, the world point, stirred slowly.
  const qFlow = vec2(uv.x.sub(t.mul(0.6)), uv.y.mul(half));
  const qLake = WORLD.xz.add(vec2(sin(t.mul(0.043).add(ph)), sin(t.mul(0.037).add(ph.mul(2.3)))).mul(8)).add(vec2(t.mul(0.16), t.mul(-0.09)));
  const q = mix(qLake, qFlow, flow);
  // Two layers of plates, the finer one drifting its own way: where their edges run, the crust is cracked.
  const a = mx_worley_noise_vec2(q.mul(0.15)), b = mx_worley_noise_vec2(q.mul(0.41).add(vec2(5.3, t.mul(0.07))));
  const d1 = a.y.sub(a.x), d2 = b.y.sub(b.x);
  const crack1 = float(1).sub(smoothstep(0.0, 0.085, d1)), crack2 = float(1).sub(smoothstep(0.0, 0.1, d2));
  const soft = float(1).sub(smoothstep(0.0, 0.42, d1));
  const crack = max(crack1, crack2.mul(0.65));
  // Thin spots in the crust where it glows through, coming and going.
  const thin = smoothstep(0.52, 0.86, mx_noise_float(vec3(q.mul(0.085), t.mul(0.05).add(ph))));
  // Pulses of heat running down a flow; the lake breathes.
  const pulse = mix(float(0.88).add(sin(t.mul(0.5).add(ph.mul(5.0)).add(WORLD.x.mul(0.013))).mul(0.12)), float(0.62).add(sin(uv.x.mul(0.1).sub(t.mul(1.35)).add(ph.mul(6.0))).mul(0.38)), flow);
  const h = heat.mul(pulse);
  // A flow's open channel near its head: molten, streaked along it, brightest in the middle.
  const streak = mx_noise_float(vec3(uv.x.mul(0.35).sub(t.mul(1.1)), uv.y.mul(3.0), t.mul(0.2)));
  const core = float(1).sub(smoothstep(0.0, 0.62, across)).mul(pow(heat, 2.2)).mul(streak.mul(0.35).add(0.65)).mul(flow);
  let col = CRUST.add(DEEP.mul(pow(soft, 2.0).mul(0.55).add(0.08)).mul(h)).add(ORANGE.mul(crack.mul(h.mul(0.75).add(0.25)).add(thin.mul(0.22).mul(h)))).add(YELLOW.mul(pow(crack1, 3.0)).mul(h).mul(h));
  col = mix(col, ORANGE.mul(1.3).add(YELLOW.mul(streak.mul(0.3).add(0.3))), core.mul(0.85));
  // The chilled edge: a flow's levees are dark crust.
  const edge = smoothstep(0.62, 0.95, across);
  col = col.mul(float(1).sub(edge.mul(0.88)));
  m.colorNode = col;
  // A ragged edge: the lava's rim frays into the ground.
  const fray = mx_noise_float(vec3(WORLD.xz.mul(0.9), 3.0)).mul(0.12);
  m.opacityNode = float(1).sub(smoothstep(0.86, 1.0, across.add(fray.mul(flow))));
  return m;
}, { cast: false, receive: false }, true);

/**
 * Sulphur's crust round a vent: a yellow skin laid on the ground, thick and orange-yellow at the vent, thinning to pale
 * powder at a frayed rim. Attributes: `uv` the disc's coordinates (-1..1), `fx.x` a phase of its own.
 */
export const VOLCANO_CRUST = defineKind('volcano crust', ['position', 'normal', 'uv', 'fx'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uv = attribute('uv', 'vec2'), fx = attribute('fx', 'vec4');
  const p = WORLD, r = length(uv);
  const grain = mx_noise_float(p.mul(vec3(2.6, 2.6, 2.6)).add(fx.x)), clot = mx_noise_float(p.mul(0.55).add(fx.x.mul(3.0)));
  const rimFray = r.add(clot.mul(0.28)).add(grain.mul(0.1));
  const yellow = vec3(0.78, 0.62, 0.05), pale = vec3(0.86, 0.8, 0.34), orange = vec3(0.7, 0.34, 0.04);
  let col = mix(yellow, pale, smoothstep(-0.2, 0.4, clot.add(grain.mul(0.4))));
  col = mix(col, orange, smoothstep(0.55, 0.0, r).mul(0.55).mul(smoothstep(-0.3, 0.3, clot)));
  col = mix(col, vec3(0.62, 0.6, 0.5), smoothstep(0.72, 1.0, rimFray).mul(0.7));
  m.colorNode = col.mul(0.9);
  m.opacityNode = float(1).sub(smoothstep(0.62, 0.98, rimFray));
  m.roughnessNode = float(0.5).add(grain.mul(0.15));
  return m;
}, { cast: false, receive: true }, true);

/** Sulphur crystals and crust-covered rock standing on it: yellow, mottled, a little waxy. Attributes: `tint` is not used; `fx.x` a phase. */
export const VOLCANO_SULPHUR = defineKind('volcano sulphur', ['position', 'normal', 'fx'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0 });
  const fx = attribute('fx', 'vec4'), p = WORLD;
  const mott = mx_noise_float(p.mul(3.1).add(fx.x)), clot = mx_noise_float(p.mul(0.9).add(fx.x.mul(2.0)));
  let col = mix(vec3(0.72, 0.56, 0.03), vec3(0.9, 0.82, 0.28), smoothstep(-0.3, 0.5, mott));
  col = mix(col, vec3(0.74, 0.36, 0.05), smoothstep(0.3, 0.7, clot).mul(0.5));
  col = mix(col, vec3(0.5, 0.46, 0.38), fx.y);
  m.colorNode = col;
  m.emissiveNode = col.mul(0.05);
  return m;
}, { cast: true, receive: true }, true);

/** Columns of steam and ash drawn at once, and puffs in each. */
export const STEAM_COLUMNS = 32;
export const STEAM_PUFFS = 36;
/** How long a puff takes to rise (s). */
const LIFE = 18;

/** Each column: its foot (x, y, z origin-relative; w: 0 steam, 1 ash) and its shape (x: height, y: thickness 0..1, z: size m, w: how much the lava lights its foot, 0..1). */
export const STEAM_FEET: readonly Vector4[] = Array.from({ length: STEAM_COLUMNS }, () => new Vector4());
export const STEAM_SHAPE: readonly Vector4[] = Array.from({ length: STEAM_COLUMNS }, () => new Vector4());
export const STEAM = { feet: uniformArray(STEAM_FEET as Vector4[], 'vec4'), shape: uniformArray(STEAM_SHAPE as Vector4[], 'vec4'), time: uniform(0) };

/** The steam's puffs: instanced, `pPuff` three random numbers and the column (as the smoke's, materials/smoke.ts). */
export function createSteamMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, side: DoubleSide });
  const puff = attribute('pPuff', 'vec4'), idx = int(puff.w);
  const foot = STEAM.feet.element(idx), shape = STEAM.shape.element(idx);
  const t = fract(STEAM.time.div(LIFE).add(puff.x)), ash = foot.w;
  const high = shape.x, thick = shape.y.min(1), size0 = shape.z;
  // Rising, spreading, leaning with the wind more the higher it gets, and billowing a little.
  const spread = t.mul(size0.mul(1.3)).add(size0.mul(0.4));
  const wind = vec3(WEATHER.windDir.x, 0, WEATHER.windDir.y).mul(WEATHER.wind.mul(40).add(10).mul(t.mul(t)).mul(high.div(60).max(0.5)));
  const swirl = vec3(sin(t.mul(9.0).add(puff.y.mul(40.0))), 0, sin(t.mul(8.0).add(puff.z.mul(40.0)))).mul(t.mul(size0).mul(0.5));
  const centre = foot.xyz.add(vec3(puff.y.sub(0.5).mul(spread), t.mul(high), puff.z.sub(0.5).mul(spread))).add(wind).add(swirl);
  const size = t.mul(size0.mul(1.6)).add(size0.mul(0.45)).mul(thick.sign());
  const toCam = normalize(cameraPosition.sub(centre));
  const side = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, side);
  m.positionNode = centre.add(side.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const r2 = positionGeometry.x.mul(positionGeometry.x).add(positionGeometry.y.mul(positionGeometry.y));
  const soft = smoothstep(1.0, 0.1, r2);
  const a = soft.mul(smoothstep(0, 0.05, t)).mul(pow(float(1).sub(t), 1.25)).mul(thick).mul(mix(float(0.5), float(0.78), ash));
  // White steam; ash a dirty grey, darker low and paler as it thins. Where the lava lights its foot, an orange glow.
  const steamCol = WEATHER.light.mul(vec3(0.95, 0.96, 1.0)).mul(mix(float(0.55), float(0.9), t.sqrt()));
  const ashCol = WEATHER.light.mul(vec3(1.0, 0.92, 0.84)).mul(mix(float(0.1), float(0.34), t.sqrt()));
  const glow = vec3(2.6, 0.9, 0.22).mul(shape.w).mul(float(1).sub(smoothstep(0.0, 0.4, t))).mul(soft);
  m.colorNode = vec4(mix(steamCol, ashCol, ash).add(glow), 1);
  m.opacityNode = a;
  return m;
}

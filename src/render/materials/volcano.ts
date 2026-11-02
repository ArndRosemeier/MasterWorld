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
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Vector4 } from 'three/webgpu';
import { abs, attribute, cameraPosition, cross, float, fract, int, length, max, mix, modelWorldMatrix, mx_noise_float, mx_worley_noise_vec2, normalize, positionGeometry, positionLocal, pow, sin, smoothstep, toneMappingExposure, uniform, uniformArray, vec2, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';
import { WORLD } from '../origin';
import { puffMaterial } from './smoke';
import { WEATHER } from './weather';

/** The volcano's clock (seconds; it moves the lava's plates and the steam's puffs). */
export const LAVA = { time: uniform(0) };

/**
 * How far (m) a vertex of the lava or the sulphur crust is lifted over the ground it was laid on, by its distance from the eye: the
 * meshes lie on the near ground as it is drawn (2 m between its vertices), but the ground chunks further out are coarser and
 * their vertices stand higher over a channel cut a metre and a half deep, so unlifted the lava sank into them and vanished by 300 m.
 */
const farLift = () => {
  const far = length(modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz.sub(cameraPosition));
  return smoothstep(45, 300, far).mul(1.3).add(smoothstep(300, 1500, far).mul(3.0));
};

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
  // (A flow is lifted by its distance; the lake's disc lies flat at its level.)
  m.positionNode = positionLocal.add(vec3(0, farLift().mul(flow), 0));
  const across = abs(uv.y).mul(flow);
  // The plates' space: on a flow, metres along and across, carried downstream; on the lake, the world point, stirred slowly.
  const qFlow = vec2(uv.x.sub(t.mul(0.6)), uv.y.mul(half));
  const qLake = WORLD.xz.add(vec2(sin(t.mul(0.043).add(ph)), sin(t.mul(0.037).add(ph.mul(2.3)))).mul(8)).add(vec2(t.mul(0.16), t.mul(-0.09)));
  const q0 = mix(qLake, qFlow, flow);
  // Warped, so the plates are slabs of every shape and not a honeycomb; some cracks open wider than others.
  const q = q0.add(vec2(mx_noise_float(vec3(q0.mul(0.045), ph)), mx_noise_float(vec3(q0.mul(0.045).add(7.3), ph))).mul(5.5));
  // Two layers of plates, the finer one drifting its own way: where their edges run, the crust is cracked.
  const a = mx_worley_noise_vec2(q.mul(0.095)), b = mx_worley_noise_vec2(q.mul(0.27).add(vec2(5.3, t.mul(0.07))));
  const d1 = a.y.sub(a.x), d2 = b.y.sub(b.x);
  const crack1 = float(1).sub(smoothstep(0.0, 0.085, d1)), crack2 = float(1).sub(smoothstep(0.0, 0.1, d2));
  const soft = float(1).sub(smoothstep(0.0, 0.42, d1));
  const wide = mx_noise_float(vec3(q.mul(0.06), 2.0)).mul(0.5).add(0.5);
  const crack = max(crack1.mul(wide.mul(0.7).add(0.5)), crack2.mul(0.65).mul(wide));
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
  // Lit by itself: the eye's exposure (the night's, a cave's) is taken out, so lava reads orange and not white in the dark.
  m.colorNode = col.div(toneMappingExposure);
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
  m.positionNode = positionLocal.add(vec3(0, farLift(), 0));
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

/** Halos of lava light over a lake (it lights the haze and the ash above it): drawn at once, and their feet (origin-relative x, y, z; w the radius, 0: none). */
export const GLOW_MAX = 8;
export const GLOW_FEET: readonly Vector4[] = Array.from({ length: GLOW_MAX }, () => new Vector4());
/** `power`: how strong they are now (the dark brings them out). */
export const GLOW = { feet: uniformArray(GLOW_FEET as Vector4[], 'vec4'), power: uniform(0.2) };

/** A soft orange halo, a camera-facing quad per instance (`pGlow`: its index in GLOW_FEET), added to the picture. */
export function createGlowMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const foot = GLOW.feet.element(int(attribute('pGlow', 'float'))), r = foot.w;
  const toCam = normalize(cameraPosition.sub(foot.xyz));
  const side = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, side);
  m.positionNode = foot.xyz.add(side.mul(positionGeometry.x.mul(r))).add(up.mul(positionGeometry.y.mul(r)));
  const r2 = positionGeometry.x.mul(positionGeometry.x).add(positionGeometry.y.mul(positionGeometry.y));
  // Fading as the eye comes into it (its light is then the lava's own, not a haze).
  const near = smoothstep(r.mul(0.5), r.mul(1.7), length(cameraPosition.sub(foot.xyz)));
  const fall = pow(smoothstep(1.0, 0.0, r2), 3.2).mul(near);
  m.colorNode = vec4(vec3(1.0, 0.27, 0.04).mul(fall).mul(GLOW.power).div(toneMappingExposure).mul(r.sign()), 1);
  m.opacityNode = float(1);
  return m;
}

/** Columns of steam and ash drawn at once, and puffs in each. */
export const STEAM_COLUMNS = 32;
export const STEAM_PUFFS = 36;
/** How long a puff takes to rise (s). */
const LIFE = 18;

/** Each column: its foot (x, y, z origin-relative; w: 0 steam, 1 ash) and its shape (x: height, y: thickness 0..1, z: size m, w: how much the lava lights its foot, 0..1). */
export const STEAM_FEET: readonly Vector4[] = Array.from({ length: STEAM_COLUMNS }, () => new Vector4());
export const STEAM_SHAPE: readonly Vector4[] = Array.from({ length: STEAM_COLUMNS }, () => new Vector4());
export const STEAM = { columns: uniformArray(STEAM_FEET as Vector4[], 'vec4'), shape: uniformArray(STEAM_SHAPE as Vector4[], 'vec4'), time: uniform(0) };

/** The steam's puffs (materials/smoke.ts puffMaterial): white steam; ash a dirty grey, darker low and paler as it thins; where the lava lights its foot, an orange glow. */
export function createSteamMaterial(): MeshBasicNodeMaterial {
  return puffMaterial(STEAM, { life: LIFE, spread: [0.4, 1.3], size: [0.45, 1.6], wind: [40, 10], sway: 0.5 }, ({ t, soft, thick, ash, shape }) => {
    const steamCol = WEATHER.light.mul(vec3(0.95, 0.96, 1.0)).mul(mix(float(0.55), float(0.9), t.sqrt()));
    const ashCol = WEATHER.light.mul(vec3(1.0, 0.92, 0.84)).mul(mix(float(0.1), float(0.34), t.sqrt()));
    const glow = vec3(2.6, 0.9, 0.22).div(toneMappingExposure).mul(GLOW.power.mul(2.2)).mul(shape.w).mul(float(1).sub(smoothstep(0.0, 0.4, t))).mul(soft);
    return {
      color: mix(steamCol, ashCol, ash).add(glow),
      alpha: soft.mul(smoothstep(0, 0.05, t)).mul(pow(float(1).sub(t), 1.25)).mul(thick).mul(mix(float(0.5), float(0.78), ash)),
    };
  });
}

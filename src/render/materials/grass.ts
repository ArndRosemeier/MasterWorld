// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Grass, blade by blade: one shader for every patch of blades around the camera (GrassView). A patch is
 * a fixed set of blades at seeded spots in a 4 m square; the vertex shader puts each where the grass
 * mask (world/grass.ts) says: on the ground, as dense, tall and dry as the land there, bent by its own
 * lean and the wind. Blades thin out with distance (each has a rank; the far patches draw only the first
 * quarter) and grow wider to keep the cover, then fade into the ground's own grass texture.
 */
import { DoubleSide, MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  attribute, cameraPosition, cameraViewMatrix, cos, cross, dot, float, fract, length, max, mix, mx_noise_float, normalize, positionGeometry,
  pow, sin, smoothstep, step, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { FloatMask, inside, sampleMask } from './masks';
import { WATER } from './waterInputs';
import { WEATHER } from './weather';
import { ORIGIN } from '../origin';

/** Side of a patch, metres, and blades in it (the near density: 48 a square metre). */
export const PATCH = 4;
export const BLADES = 768;
/** Segments per blade (2 vertices each, and the tip). */
export const SEGMENTS = 4;
/** Full density within NEAR_FULL m, a quarter by NEAR_END (where far patches take over), none by REACH. */
export const NEAR_FULL = 7, NEAR_END = 20, REACH = 48;
/** Side of a tuft's cell, metres. */
const TUFT = 0.32;

export const GRASS = {
  /** Ground height, density, blade height, dryness (world/grass.ts), 128 m around the camera. */
  mask: new FloatMask(128, 256, [-1e4, 0, 0, 0]),
  time: uniform(0),
  /** Wind strength, 0 calm .. 1 a stiff breeze. */
  wind: uniform(0.5),
};

export function createGrassMaterial(): MeshPhysicalNodeMaterial {
  // Physical for its weak specular: blades seen edge-on far away must not mirror the bright sky.
  const m = new MeshPhysicalNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0, specularIntensity: 0.15 });
  const blade = attribute('gBlade', 'vec4'); // x, z in the patch; rank 0..1; a random number
  const patch = attribute('gPatch', 'vec2'); // the patch's minimum corner (world)
  const side = positionGeometry.x, t = positionGeometry.y; // across the blade -1..1; along it 0..1

  // Grass grows in tufts: each blade is drawn towards the centre of its tuft (a cell of TUFT metres), and
  // a tuft grows or not as a whole, mostly.
  // The tuft grid is turned off the world axes and its centres scattered over the whole cell, so tufts
  // never line up in rows.
  const spot = patch.add(blade.xy);
  const rot = (v, s) => vec2(v.x.mul(0.866).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(0.866)));
  const cell = rot(spot, 0.5).div(TUFT).floor();
  const th = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453));
  const centre = rot(cell.add(vec2(th, fract(th.mul(7.31).add(0.13)))).mul(TUFT), -0.5);
  const xz = mix(spot, centre, 0.45);
  const g = sampleMask(GRASS.mask, xz);
  const r1 = blade.w, r2 = mix(th, fract(r1.mul(91.7).add(blade.z.mul(13.3))), 0.3), r3 = fract(r1.mul(53.1).add(0.37)), r4 = fract(r1.mul(17.9).add(0.71));
  // Placed in the world (xz, the mask, the tufts); drawn relative to the floating origin (render/origin.ts), so the
  // blade's own small offsets are added to a small number. The mesh is pinned (GrassView).
  const xzRel = xz.sub(ORIGIN.node.xz);
  const d = length(xzRel.sub(cameraPosition.xz));
  const keep = mix(float(1), float(0.25), smoothstep(NEAR_FULL, NEAR_END, d));
  const fade = float(1).sub(smoothstep(REACH * 0.7, REACH, d));
  // A blade grows if its rank is within what this distance keeps, and its roll within the density here.
  const live = step(blade.z, keep).mul(step(r2, g.y.sqrt())).mul(step(0.0, inside(GRASS.mask, xz)));
  // Lying snow buries most of the grass (the tallest blades still poke through).
  const height = g.z.mul(mix(0.55, 1.35, r3)).mul(WEATHER.lying.mul(mix(0.95, 0.5, r3)).oneMinus()).mul(smoothstep(0.0, 0.3, g.y).mul(0.5).add(0.5)).mul(fade).mul(live);
  const width = mix(0.011, 0.022, r4).mul(pow(keep, -0.5)).mul(d.div(40).add(1)).mul(live);

  // The blade's frame: it faces `f` and leans that way, its width runs along `tg`.
  const yaw = r1.mul(6.2832);
  const f = vec3(cos(yaw), 0, sin(yaw)), tg = vec3(sin(yaw).negate(), 0, cos(yaw));
  const lean = mix(0.15, 0.6, r4);
  // Wind (the weather's): gusts roll across the field downwind, blades flutter on top.
  const wd = WEATHER.windDir;
  const gust = mx_noise_float(xz.sub(WEATHER.drift).mul(0.07)).mul(0.5).add(0.5);
  const sway = GRASS.wind.mul(gust.mul(0.55).add(sin(GRASS.time.mul(2.6).add(r1.mul(6.28)).add(dot(xz, normalize(WATER.wind)).mul(0.35))).mul(0.08)));
  const push = vec3(wd.x, 0, wd.y).mul(sway).add(f.mul(lean));
  const t2 = t.mul(t);
  const base = vec3(xzRel.x, g.x.sub(0.04), xzRel.y);
  const pos = base.add(tg.mul(side.mul(width).mul(pow(float(1).sub(t), 0.85)))).add(vec3(0, t, 0).mul(height)).add(push.mul(t2.mul(height)));
  m.positionNode = pos;

  // Normal: across the spine and the width, rounded across the blade, turned to the viewer (both sides lit
  // as the front), and towards straight up far away so distant grass shades like the ground.
  const spine = normalize(vec3(0, 1, 0).add(push.mul(t.mul(2))));
  let n = normalize(cross(tg, spine).add(tg.mul(side.mul(0.45))));
  const toCam = cameraPosition.sub(base);
  n = n.mul(dot(n, toCam).sign().add(0.5).sign());
  n = normalize(mix(n, vec3(0, 1, 0), smoothstep(6, 30, d).mul(0.45).add(0.2)));
  const vN = varying(n, 'vGrassN');
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(vN, 0)).xyz);

  // Colour: lush to straw by the land's dryness, each blade a little different; dark at the root.
  const lush = mix(vec3(0.04, 0.095, 0.02), vec3(0.075, 0.14, 0.03), r3);
  const straw = mix(vec3(0.24, 0.2, 0.085), vec3(0.33, 0.28, 0.13), r4);
  const dry = g.w.add(r2.sub(0.5).mul(0.25)).clamp(0, 1);
  // Tips lighter and a touch yellower (older growth).
  const tip = mix(vec3(1), vec3(1.15, 1.12, 0.92), t.mul(t));
  const root = mix(float(0.35), float(1), smoothstep(0.0, 0.55, t));
  // Rain darkens the blades a little.
  const col = varying(mix(lush, straw, dry).mul(tip).mul(root).mul(mix(float(1), float(0.72), WEATHER.wet)), 'vGrassCol');
  m.colorNode = vec4(col, 1);
  m.roughnessNode = mix(float(0.9), float(0.72), WEATHER.wet);
  // Light through the blades when looking towards the sun.
  const back = pow(max(dot(normalize(cameraPosition.sub(pos)).negate(), WATER.sunDir), 0), 4);
  m.emissiveNode = col.mul(WATER.sunColor).mul(back.mul(0.35).mul(varying(t, 'vGrassT')));
  return m;
}

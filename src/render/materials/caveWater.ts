// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * A natural cave's water and daylight (plan P1, world/dungeon/caveFeatures.ts). Its pools and stream: dark, still
 * water that shows the lantern and the day as a glint, rippled a little (the stream runs along its course, the
 * pools are stirred by drips). Its shafts: the day falling down a chimney in the roof, a soft beam brightest in
 * its middle and at its top, with dust turning in it. Both are late kinds (built under the shader cap when the
 * first cave is built, not in the warm-up): nothing above ground needs them.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, type Mesh } from 'three/webgpu';
import { abs, cameraViewMatrix, dot, float, mix, mx_noise_float, normalize, normalView, positionView, pow, sin, smoothstep, step, uv, vec3, vec4 } from 'three/tsl';
import { defineKind, kindMesh } from '../materials';
import { WORLD } from '../origin';
import { WEATHER } from './weather';
import type { CaveFeatures } from '../../world/dungeon/caveFeatures';

export const CAVE_WATER = defineKind('cave water', ['position', 'normal', 'uv'], () => {
  const m = new MeshPhysicalNodeMaterial({ color: new Color(0x123036), roughness: 0.14, metalness: 0, transparent: true, depthWrite: false, specularIntensity: 1 });
  const t = WEATHER.time;
  // uv.x: along the stream (m), or out from a pool's middle (0) to its rim (1); uv.y: 1 on a stream, 0 on a pool.
  const flow = uv().y;
  const p = WORLD.xz;
  const ripple = mx_noise_float(vec3(uv().x.mul(2.4).sub(t.mul(flow.mul(1.6))).add(p.x.mul(1.7)), p.y.mul(1.7), t.mul(0.35)));
  const drip = sin(p.x.mul(3.1).add(p.y.mul(2.3)).add(t.mul(2.2))).mul(0.25);
  const n = ripple.add(drip.mul(float(1).sub(flow))).mul(mix(float(0.05), float(0.14), flow));
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(normalize(vec3(n, 1, n.mul(0.7))), 0)).xyz);
  // Seen steeply it is clear over the stones; seen low it shows only the dark and the glint. A pool thins out to
  // nothing at its rim, so its shore is the wet stone, not the edge of a disc.
  const view = normalize(positionView.negate());
  const shore = mix(smoothstep(1, 0.55, uv().x), float(1), flow);
  const facing = abs(dot(view, normalView));
  m.opacityNode = mix(float(0.9), float(0.45), pow(facing, 1.5)).mul(shore);
  // Underground the sky is not there to mirror: seen low, a faint sheen of the cave's own light marks the surface,
  // rippled with it, so the pool reads as water and not as a dark stain.
  m.emissiveNode = vec3(0.035, 0.06, 0.065).mul(pow(float(1).sub(facing), 3)).mul(float(1).add(n.mul(6))).mul(shore);
  return m;
}, { cast: false, receive: true }, true);

export const SHAFT = defineKind('cave shaft', ['position', 'normal', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const q = uv(), t = WEATHER.time;
  // Brightest down its middle (the side of the cone facing the eye), fading towards the floor and its rim.
  const face = pow(abs(dot(normalize(positionView.negate()), normalView)), 1.6);
  const down = smoothstep(0, 0.35, q.y).mul(mix(float(0.55), float(1), q.y));
  const motes = smoothstep(0.62, 0.9, mx_noise_float(vec3(WORLD.x.mul(2.2), WORLD.y.mul(2.2).add(t.mul(0.12)), WORLD.z.mul(2.2).add(t.mul(0.05)))));
  // The disc of day at the top (uv.y over 1) is far brighter than the beam.
  const glow = face.mul(down).mul(float(0.16).add(motes.mul(0.22))).mul(mix(float(1), float(5), step(1.2, q.y)));
  m.colorNode = vec3(0.78, 0.86, 1.0).mul(glow);
  return m;
}, { cast: false, receive: false }, true);

/** Sides round a pool's rim, a shaft's cone. */
const RIM = 28, SIDES = 18;
/** A drowned storey's sheet reaches this far past its outermost halls (m): over the ways out of them. */
const FLOOD_PAD = 30;

/** A cave's pools and stream as one mesh (its frame, placed at x, y, z), or null if it has none. */
export function caveWaterMesh(f: CaveFeatures, x: number, y: number, z: number): Mesh | null {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const p of f.pools) {
    // The middle, a ring halfway out (so the shore fades over its outer half), and the rim.
    const o = pos.length / 3;
    pos.push(p.x, p.top, p.z); uvs.push(0, 0);
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
      pos.push(p.x + c * p.r * 0.55, p.top, p.z + n * p.r * 0.55, p.x + c * p.r, p.top, p.z + n * p.r); uvs.push(0.55, 0, 1, 0);
      const i = o + 1 + k * 2, j = o + 1 + ((k + 1) % RIM) * 2;
      idx.push(o, j, i, i, j, i + 1, i + 1, j, j + 1);
    }
  }
  for (const s of f.streams) {
    let run = 0;
    s.pts.forEach(([px, pz], i) => {
      const [ax, az] = s.pts[Math.max(0, i - 1)], [bx, bz] = s.pts[Math.min(s.pts.length - 1, i + 1)];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      if (i > 0) run += Math.hypot(px - s.pts[i - 1][0], pz - s.pts[i - 1][1]);
      const o = pos.length / 3, w = s.w * 0.95;
      pos.push(px - (dz / l) * w, s.top, pz + (dx / l) * w, px + (dz / l) * w, s.top, pz - (dx / l) * w);
      uvs.push(run, 1, run, 1);
      if (i > 0) idx.push(o - 2, o, o - 1, o - 1, o, o + 1);
    });
  }
  if (f.flood !== null) {
    // A drowned storey's still surface: one sheet over the whole cave (the rock hides it but where it stands open).
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const h of f.halls.values()) { x0 = Math.min(x0, h.x0); x1 = Math.max(x1, h.x1); z0 = Math.min(z0, h.z0); z1 = Math.max(z1, h.z1); }
    const o = pos.length / 3, P = FLOOD_PAD;
    pos.push(x0 - P, f.flood, z0 - P, x1 + P, f.flood, z0 - P, x0 - P, f.flood, z1 + P, x1 + P, f.flood, z1 + P);
    uvs.push(0, 0, 0, 0, 0, 0, 0, 0);
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  if (!idx.length) return null;
  return named(kindMesh(geometry(pos, uvs, idx), CAVE_WATER, x, y, z), 'cave water');
}

/** A cave's shafts of daylight as one mesh: a cone from the shaft's top down to the floor, and the day's disc at its top. */
export function caveShaftMesh(f: CaveFeatures, x: number, y: number, z: number): Mesh | null {
  if (!f.shafts.length) return null;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const s of f.shafts) {
    const top = s.top - 0.6, foot = s.floor + 0.05, r0 = s.r * 0.8, r1 = s.r * 1.6;
    const o = pos.length / 3;
    for (let k = 0; k <= SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
      pos.push(s.x + c * r0, top, s.z + n * r0, s.x + c * r1, foot, s.z + n * r1);
      uvs.push(k / SIDES, 1, k / SIDES, 0);
      if (k > 0) { const b = o + (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    }
    // The day seen up the shaft: a bright disc just under its top.
    const d = pos.length / 3;
    pos.push(s.x, top + 0.3, s.z); uvs.push(0.5, 1.6);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      pos.push(s.x + Math.cos(a) * s.r * 1.2, top + 0.3, s.z + Math.sin(a) * s.r * 1.2); uvs.push(0.5, 1.6);
      idx.push(d, d + 1 + k, d + 1 + ((k + 1) % SIDES));
    }
  }
  return named(kindMesh(geometry(pos, uvs, idx), SHAFT, x, y, z), 'cave shafts');
}

function geometry(pos: number[], uvs: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function named(m: Mesh, name: string): Mesh {
  m.name = name;
  return m;
}

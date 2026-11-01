// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The aura round a creature in a fight (src/sim/aura.ts): one shader for every creature, rat to giant. A
 * camera-facing quad (upright, turned about the vertical) stands a little behind the creature and shows a soft
 * ring of light, brightest just outside the silhouette, its edge shimmering; the body hides the middle of it, so
 * it reads as a halo. Colour is the creature's health, strength is faint or strong: all per-instance data, so
 * a new creature is never a new shader. Added to what is behind it (no shadows), depth-tested (walls hide it).
 */
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, atan, cameraPosition, clamp, cross, exp, float, instancedDynamicBufferAttribute, length, mix, mx_noise_float, normalize, positionGeometry, pow, sin, smoothstep, time, toneMappingExposure, uv, vec3 } from 'three/tsl';
import { defineKind } from '../materials';
import { dyn } from './spellFx';

/** Auras drawn at once, at most (the mesh always draws this many; spare ones have no size). */
export const AURA_CAP = 48;

/** The instance data, four floats each. */
export const AURA_DATA = {
  /** x, y, z (the middle of the ellipse, relative to the floating origin), strength (0..1). */
  at: dyn(AURA_CAP),
  /** Half width, half height (m), a seed, the brightness for its health. */
  size: dyn(AURA_CAP),
  /** The health colour (linear), the last unused. */
  tint: dyn(AURA_CAP),
};

export const AURA = defineKind('aura', ['position', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false, blending: AdditiveBlending });
  const at = instancedDynamicBufferAttribute(AURA_DATA.at, 'vec4');
  const size = instancedDynamicBufferAttribute(AURA_DATA.size, 'vec4');
  const tint = instancedDynamicBufferAttribute(AURA_DATA.tint, 'vec4');

  m.positionNode = Fn(() => {
    const toEye = normalize(cameraPosition.sub(at.xyz));
    // Upright: turned about the vertical to face the eye, and a little behind the body, so the body covers the middle.
    const right = normalize(cross(vec3(0, 1, 0), toEye).add(vec3(1e-5, 0, 0)));
    const c = at.xyz.sub(vec3(toEye.x, 0, toEye.z).mul(size.x.mul(0.3)));
    const p = positionGeometry.xy;
    return c.add(right.mul(p.x.mul(size.x))).add(vec3(0, 1, 0).mul(p.y.mul(size.y)));
  })();

  const k = at.w, seed = size.z;
  const q = uv().mul(2.0).sub(1.0);
  const r0 = length(q), ang = atan(q.y, q.x);
  // The edge shimmers: slow waves round the ring, out of step from one creature to the next.
  const n = mx_noise_float(vec3(ang.mul(2.0).add(seed.mul(17.0)), r0.mul(2.5).sub(time.mul(0.9)), time.mul(0.35).add(seed.mul(9.0))));
  const r = r0.add(n.mul(0.1));
  // Brightest just outside the silhouette (about 0.6 of the quad's half size), gone before the quad's edge.
  const ring = exp(pow(r.sub(0.62).div(0.26), float(2)).mul(-1.0));
  const inner = smoothstep(0.0, 0.5, r).mul(0.35).mul(float(1.0).sub(smoothstep(0.6, 1.0, r)));
  const glow = clamp(ring.add(inner), 0.0, 1.0).mul(float(1.0).sub(smoothstep(0.8, 1.0, r0)));
  // The strong one breathes and runs hot-white along its ring.
  const strong = smoothstep(0.55, 1.0, k);
  const pulse = float(1.0).add(sin(time.mul(3.2).add(seed.mul(6.0))).mul(0.2).mul(strong));
  const hot = mix(tint.xyz.mul(size.w), vec3(1.0, 1.0, 1.0), strong.mul(ring).mul(0.22));
  // Held at the same brightness whatever the eye's exposure (daylight closes it, night opens it).
  m.colorNode = hot.mul(3.0).div(toneMappingExposure);
  m.opacityNode = glow.mul(k).mul(pulse);
  return m;
}, { cast: false, receive: false }, true);

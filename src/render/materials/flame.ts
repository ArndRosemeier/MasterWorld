// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Torch flames: two crossed quads per flame, glowing (added to what is behind, no shadows). The quads'
 * uv runs 0..1 across and up; `color.r` is the flame's own seed, so each flickers out of step.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, type Mesh } from 'three/webgpu';
import { abs, attribute, dot, float, max, normalFlat, positionViewDirection, mix, pow, sin, smoothstep, toneMappingExposure, uv, vec3 } from 'three/tsl';
import { defineKind, kindMesh } from '../materials';
import { WEATHER } from './weather';

export const FLAME = defineKind('flame', ['position', 'uv', 'color'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const seed = attribute('color', 'vec3').x.mul(40.0);
  const t = WEATHER.time;
  const q = uv();
  const up = q.y;
  // Tongues: waves running up the flame bend it more the higher they go, and the top tears into licks that
  // rise and fall out of step (two flames never burn alike).
  const rise = up.mul(9.0).sub(t.mul(13.0)).add(seed);
  const bend = sin(rise).mul(0.07).add(sin(rise.mul(1.9).add(1.3)).mul(0.04)).add(sin(t.mul(5.0).add(seed)).mul(0.05)).mul(up.mul(up).mul(1.6).add(up.mul(0.2)));
  const x = abs(q.x.sub(0.5).sub(bend)).mul(2.0);
  const lick = float(0.78).add(sin(t.mul(11.0).add(seed).add(q.x.mul(14.0))).mul(0.12)).add(sin(t.mul(23.0).add(seed.mul(1.7))).mul(0.06));
  const h = up.div(lick);
  const width = pow(max(float(1.0).sub(h), 0.0), 0.6).mul(smoothstep(0.0, 0.16, up)).mul(0.95);
  // (Above a lick's tip the width is nought, where smoothstep's edges meet: cut there, not filled.)
  const body = smoothstep(width, width.mul(0.25), x).mul(smoothstep(0.0, 0.03, width));
  // Blue at the root, the yellow-white heart low and inside, orange to deep red out at the edges and tips.
  const heart = smoothstep(width.mul(0.55), 0.0, x).mul(smoothstep(0.7, 0.1, h));
  const edge = smoothstep(0.35, 1.0, h).add(smoothstep(width.mul(0.4), width, x)).min(1.0);
  const fire = mix(vec3(1.0, 0.32, 0.03), vec3(0.65, 0.08, 0.01), edge);
  const root = smoothstep(0.1, 0.0, up).mul(0.35);
  const col = mix(mix(fire, vec3(1.0, 0.66, 0.2), heart.mul(0.85)), vec3(0.3, 0.3, 0.9), root);
  // Held at the same brightness whatever the eye's exposure (night opens it about 3x and burned the flame white).
  // Each of the crossed quads fades as it turns edge-on (else it shows as a bright seam down the middle).
  const facing = smoothstep(0.12, 0.55, abs(dot(normalFlat, positionViewDirection)));
  m.colorNode = col.mul(body).mul(facing).mul(2.0).div(toneMappingExposure);
  m.opacityNode = body.mul(facing);
  return m;
}, { cast: false, receive: false });

/** Half width and height of a flame (m); its base sits this far under the flame point. */
const W = 0.09, H = 0.34, BASE = 0.1;

/** The flames at `spots` (positions relative to x, y, z) as one mesh. */
export function flameMesh(spots: readonly { x: number; y: number; z: number }[], x: number, y: number, z: number): Mesh {
  const n = spots.length * 2;
  const pos = new Float32Array(n * 4 * 3), uvs = new Float32Array(n * 4 * 2), col = new Float32Array(n * 4 * 3), idx: number[] = [];
  let v = 0;
  spots.forEach((s, k) => {
    const seed = ((k * 0.618034) % 1);
    for (const [ax, az] of [[W, 0], [0, W]]) {
      const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
      for (const [a, b] of corners) {
        pos.set([s.x + ax * a, s.y - BASE + H * b, s.z + az * a], v * 3);
        uvs.set([(a + 1) / 2, b], v * 2);
        col.set([seed, 0, 0], v * 3);
        v++;
      }
      const o = v - 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = kindMesh(g, FLAME, x, y, z);
  mesh.name = 'flames';
  mesh.renderOrder = 10;
  return mesh;
}

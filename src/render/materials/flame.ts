// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Torch flames: two crossed quads per flame, glowing (added to what is behind, no shadows). The quads'
 * uv runs 0..1 across and up; `color.r` is the flame's own seed, so each flickers out of step.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, MeshBasicNodeMaterial, type Mesh } from 'three/webgpu';
import { abs, attribute, float, mix, pow, sin, smoothstep, uv, vec3 } from 'three/tsl';
import { defineKind, kindMesh } from '../materials';
import { WEATHER } from './weather';

export const FLAME = defineKind('flame', ['position', 'uv', 'color'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const seed = attribute('color', 'vec3').x.mul(40.0);
  const t = WEATHER.time;
  const q = uv();
  const up = q.y;
  // The tip sways and licks; the body narrows upward like a drop.
  const sway = sin(t.mul(9.0).add(seed)).mul(0.12).add(sin(t.mul(23.0).add(seed.mul(1.7))).mul(0.05)).mul(up.mul(up));
  const x = abs(q.x.sub(0.5).sub(sway)).mul(2.0);
  const width = pow(float(1.0).sub(up), 0.55).mul(smoothstep(0.0, 0.18, up)).mul(0.9);
  const body = smoothstep(width, width.mul(0.35), x);
  const core = smoothstep(width.mul(0.5), 0.0, x).mul(smoothstep(0.75, 0.15, up));
  const lick = float(0.85).add(sin(t.mul(17.0).add(seed.mul(2.3))).mul(0.15));
  const col = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.82, 0.45), core);
  m.colorNode = col.mul(body).mul(lick).mul(2.2);
  m.opacityNode = body;
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

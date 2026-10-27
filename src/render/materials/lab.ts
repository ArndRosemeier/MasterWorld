// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot:spellfx).
/**
 * The spell lab's stand-ins (spell-lab.html, src/lab/spellLab.ts): a meadow floor and grey dummies for caster and
 * foe, lit like the game. Only the lab imports this, so the game never warms these up.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, mix, mx_noise_float, positionGeometry, vec3 } from 'three/tsl';
import { defineKind } from '../materials';

export const LAB_FLOOR = defineKind('lab floor', ['position', 'normal', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95 });
  const p = positionGeometry;
  const n = mx_noise_float(p.xz.mul(0.7)).mul(0.5).add(0.5).mul(0.6).add(mx_noise_float(p.xz.mul(3.1)).mul(0.5).add(0.5).mul(0.4));
  m.colorNode = mix(vec3(0.16, 0.22, 0.07), vec3(0.32, 0.3, 0.12), n).mul(attribute('color', 'vec3'));
  return m;
});

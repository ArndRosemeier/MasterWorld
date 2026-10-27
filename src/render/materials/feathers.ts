// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The feathers of a change of shape (bird form): glowing feathers that swirl round the hero, ward-blue at the
 * quill, brass at the tip, added to what is behind them (no shadows). One quad per feather (uv 0..1 across and
 * along); `FEATHER_GLOW` fades them all in and out without a new shader.
 */
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, mix, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { defineKind } from '../materials';

/** How bright the feathers are, 0..1 (the change sets it every frame). */
export const FEATHER_GLOW = uniform(0);

export const FEATHER = defineKind('feather swirl', ['position', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const q = uv();
  const across = abs(q.x.sub(0.5)).mul(2.0), along = q.y;
  // A feather's outline: widest a third of the way up, a point at the tip, the quill down the middle.
  const width = sin(along.mul(3.1416)).mul(smoothstep(0.0, 0.35, along)).mul(0.95);
  const vane = smoothstep(width, width.mul(0.55), across);
  const quill = smoothstep(0.1, 0.0, across).mul(smoothstep(0.0, 0.15, along)).mul(0.7);
  const col = mix(vec3(0.56, 0.89, 1.0), vec3(1.0, 0.82, 0.45), along);
  const glow = vane.mul(0.75).add(quill);
  m.colorNode = col.mul(glow).mul(FEATHER_GLOW).mul(1.8);
  m.opacityNode = glow.mul(FEATHER_GLOW).mul(float(1.0));
  return m;
}, { cast: false, receive: false });

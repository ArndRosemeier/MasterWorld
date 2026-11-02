// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The swirls of a change of shape, added to what is behind them (no shadows), one quad per piece (uv 0..1 across and
 * along): for bird form glowing feathers, ward-blue at the quill, brass at the tip; for otter form (S6) silvery
 * bubbles, a bright rim and a glint. `FEATHER_GLOW` and `BUBBLE_GLOW` fade them in and out without a new shader.
 */
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, length, mix, sin, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl';
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
}, { cast: false, receive: false }, true);

/** How bright the bubbles are, 0..1 (the change sets it every frame). */
export const BUBBLE_GLOW = uniform(0);

export const BUBBLE = defineKind('bubble swirl', ['position', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const r = length(uv().sub(0.5)).mul(2.0);
  // A thin bright rim, a faint inside, and a glint up to one side.
  const rim = smoothstep(0.62, 0.86, r).mul(smoothstep(1.0, 0.9, r));
  const glint = smoothstep(0.24, 0.0, length(uv().sub(vec2(0.36, 0.66))));
  const body = smoothstep(1.0, 0.0, r).mul(0.12);
  const light = rim.add(glint).add(body);
  m.colorNode = mix(vec3(0.62, 0.86, 0.95), vec3(1.0, 1.0, 1.0), glint).mul(light).mul(BUBBLE_GLOW).mul(1.5);
  m.opacityNode = light.mul(BUBBLE_GLOW);
  return m;
}, { cast: false, receive: false }, true);

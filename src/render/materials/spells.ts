// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Spells as the eye sees them (plan 10, C2): glowing shapes in their school's colour, added to what is behind
 * them (no shadows). One shader for every spell: each instance is a sphere scaled into an orb, a burst or a
 * flat ring, and its colour (instanceColor, dimmed to fade it) is all that differs. Brightest where the
 * surface faces the eye, soft at the rim; a faint band of light runs over it so it seems to move.
 */
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, clamp, normalView, sin, time, uv, vec3 } from 'three/tsl';
import { defineKind } from '../materials';

export const SPELL_GLOW = defineKind('spell glow', ['position', 'normal', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  m.blending = AdditiveBlending;
  const face = clamp(abs(normalView.z), 0.0, 1.0);
  const core = face.mul(face).mul(face);
  const band = sin(uv().y.mul(18.0).add(time.mul(6.0))).mul(0.5).add(0.5).mul(0.35);
  // The instance colour multiplies this (three's instanceColor), so a dimmed colour is a fading spell.
  m.colorNode = vec3(core.mul(1.6).add(band.mul(face)));
  return m;
}, { cast: false, receive: false });

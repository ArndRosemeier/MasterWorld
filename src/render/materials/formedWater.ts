// @ts-nocheck -- TSL node math; checked by rendering it (npm run preview:caves, and npm run shot on the GPU).
/**
 * The water of a formed cave (D63, K3): the outside water's own surface, underground. It reads the same inputs the
 * outside water reads from its masks (depth, speed, direction) from its mesh instead (world/cave/waterMesh.ts), and
 * calls the same ripple and streak code (waterSurface.ts), the same clock, colours and absorption (WATER), so what
 * improves the outside water improves this. What differs: no sky to mirror (the lantern's glint on the ripples is
 * lit by the scene), shallows are clear (the silt and stones show through) and deeper water darkens with its depth.
 * A late kind: built under the shader cap when the first formed cave is built.
 */
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { abs, attribute, cameraViewMatrix, clamp, dot, exp, float, length, max, mix, normalize, normalView, positionView, pow, smoothstep, uv, vec2, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';
import { WORLD } from '../origin';
import { WATER } from './waterInputs';
import { rippleSlope, streakFoam } from './waterSurface';

export const FORMED_WATER = defineKind('formed water', ['position', 'normal', 'uv', 'tint'], () => {
  const W = WATER;
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, specularIntensity: 1, ior: 1.33 });
  const depth = uv().x, speed = uv().y, flow = attribute('tint', 'vec3').xy;
  const fdir = flow.div(max(length(flow), 0.001));
  const running = smoothstep(0.05, 0.3, speed);
  const p = WORLD.xz, t = W.time, camDist = length(positionView);
  // The ripples of the outside water, calmer at the banks (no depth, no wave); the surface leans with them.
  const slope = rippleSlope(p, { t, wind: W.wind, speed, running, fdir }).mul(smoothstep(0.0, 0.1, depth)).mul(1.8);
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(normalize(vec3(slope.x, 1, slope.y)), 0)).xyz);
  // Clear in the shallows, dark and tinted in the deep: the outside water's absorption and its shallow and deep colours.
  const facing = clamp(abs(dot(normalize(positionView.negate()), normalView)), 0.2, 1);
  const path = depth.div(facing);
  const trans = exp(W.absorb.mul(path).mul(2.2).negate());
  // Underground there is no sky to light the body, so the outside colours are lifted: the lantern lights a clear teal
  // and the rest is the glint of its ripples. The surface reads over the silt in the shallows too (it is never invisible).
  const body = mix(W.shallow, W.deep, smoothstep(0.0, 0.5, depth)).mul(W.ambient.mul(0.5).add(0.12)).mul(5.5).add(vec3(0.02, 0.04, 0.05));
  // White water: streaks and churn where it runs fast, a thin rim where it laps the bank.
  const rim = float(1).sub(smoothstep(0.0, 0.05, depth)).mul(0.55);
  const foam = clamp(streakFoam(p, { t, speed, fdir, camDist }).mul(running).mul(smoothstep(0.02, 0.12, depth)).add(rim), 0, 1);
  m.colorNode = mix(body, vec3(0.78, 0.84, 0.86), foam.mul(0.85));
  const murk = float(1).sub(trans.x.add(trans.y).add(trans.z).div(3));
  m.opacityNode = max(clamp(murk.mul(0.5).add(0.5), 0, 0.92), foam.mul(0.85)).mul(smoothstep(0.0, 0.02, depth.add(0.02)));
  m.emissiveNode = body.mul(0.12).add(foam.mul(vec3(0.12, 0.14, 0.15)));
  return m;
}, { cast: false, receive: true }, true);

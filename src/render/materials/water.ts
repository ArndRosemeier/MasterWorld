// @ts-nocheck -- three's TSL typings infer vector widths poorly for this much shader math; checked by rendering it (npm run shot).
/**
 * The water surface: one shader for seas (and later lakes), drawn on a camera-centred radial mesh.
 * Gerstner waves (vertex), fine ripples (fragment), refraction of what lies below with absorption by
 * depth, the sky's reflection from the environment map, sun glints, shore and crest foam, and from below
 * a Snell window. Ported from Xenoworld's Liquids.ts to TSL.
 */
import { DoubleSide, MeshBasicNodeMaterial, type Texture } from 'three/webgpu';
import {
  Fn, abs, atan, cameraPosition, cos, clamp, cross, dot, exp, float, frontFacing, fwidth, length, max, mix, mx_noise_float, normalize, pmremTexture,
  positionLocal, positionWorld, pow, fract, reflect, screenUV, select, sin, floor, smoothstep, texture, varying, vec2, vec3, vec4, viewportSharedTexture,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { defineKind } from '../materials';
import { WATER, waterAt } from './waterInputs';
import { WAVES, waveMotion } from '../../world/swell';
import { WEATHER, fullSky, rainRings } from './weather';
import { EYE, WORLD } from '../origin';

let envTex: Texture | null = null;
/** Seconds a running water's pattern is carried before it fades back (flow map cycle). */
const FLOW_CYCLE = 1.6;
/** Above this height (m) still water is a lake, not the sea, and has no surf. */
const SEA_SURF_TOP = 3;
/** How white the wet rim at a still water's edge is (0..1). */
const WET_RIM = 0.2;
/** Running water's foam streaks lie along one of this many fixed directions (the two nearest the current, blended). */
const STREAK_DIRS = 12;
/** The sky's environment map (SkyView), before the warm-up builds the water. */
export function useWaterEnvironment(t: Texture): void { envTex = t; }

export const WATER_KIND = defineKind('water', ['position'], () => {
  if (!envTex) throw new Error('water material built before the sky environment');
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: true, side: DoubleSide, fog: true });
  const W = WATER;

  // --- Vertex: Gerstner waves, faded out in shallows and far away.
  // The vertex in the world (the mesh's centre is a world point), and its distance from the camera (the mesh is
  // drawn relative to the floating origin, render/origin.ts, as cameraPosition is).
  const wp = positionLocal.add(W.center);
  const here = waterAt(wp.xz);
  const depthV = here.y;
  const dist = length(positionLocal.xz.add(W.center.xz.sub(EYE.xz)));
  // Waves on the sea; lakes get small ones, rivers none (their surface moves by its flow).
  const sea = float(1).sub(smoothstep(0.5, 2.0, abs(here.x)));
  const still = float(1).sub(smoothstep(0.05, 0.3, length(here.zw)));
  const k = W.amp.mul(smoothstep(0.3, 9.0, depthV)).mul(float(1).sub(smoothstep(250.0, 800.0, dist))).mul(mix(float(0.12), float(1), sea)).mul(still);
  const wd = normalize(W.wind), wpp = vec2(wd.y.negate(), wd.x);
  let disp: Node<'vec3'> = vec3(0), tan: Node<'vec3'> = vec3(1, 0, 0), bin: Node<'vec3'> = vec3(0, 0, 1);
  // The same waves the swimmers ride (world/swell.ts).
  for (const [along, across, steep0, wl] of WAVES) {
    const { k: kk, c } = waveMotion(wl);
    const d = normalize(wd.mul(along).add(wpp.mul(across))), steep = k.mul(steep0);
    const f = dot(d, wp.xz).sub(W.time.mul(c)).mul(kk);
    const s = sin(f), co = f.cos(), a = steep.div(kk);
    tan = tan.add(vec3(d.x.mul(d.x).mul(steep).mul(s).negate(), d.x.mul(steep).mul(co), d.x.mul(d.y).mul(steep).mul(s).negate()));
    bin = bin.add(vec3(d.x.mul(d.y).mul(steep).mul(s).negate(), d.y.mul(steep).mul(co), d.y.mul(d.y).mul(steep).mul(s).negate()));
    disp = disp.add(vec3(d.x.mul(a).mul(co), a.mul(s), d.y.mul(a).mul(co)));
  }
  m.positionNode = positionLocal.add(disp).add(vec3(0, here.x, 0));
  // Slope of the surface itself (a river's fall): the level's gradient from the masks, a metre apart.
  const slope = vec2(waterAt(wp.xz.add(vec2(1, 0))).x.sub(here.x), waterAt(wp.xz.add(vec2(0, 1))).x.sub(here.x)).mul(float(1).sub(still));
  const vN = varying(normalize(cross(bin, tan).add(vec3(slope.x.negate(), 0, slope.y.negate()))), 'vWaterN');
  const vFall = varying(smoothstep(0.6, 2.0, length(slope)), 'vWaterFall');
  const vFlow = varying(here.zw, 'vWaterFlow');
  const vCrest = varying(disp.y.div(max(0.05, k.mul(2.2))), 'vWaterCrest');

  // --- Fragment.
  m.colorNode = Fn(() => {
    // The world point for the masks and ripples; the view ray in origin-relative terms (exact near the camera).
    const p = WORLD;
    // Depth per fragment (the mesh is coarse far out, shores need the detail).
    const vDepth = waterAt(p.xz).y;
    const V = normalize(cameraPosition.sub(positionWorld));
    const camDist = length(cameraPosition.sub(positionWorld));
    const fade = float(1).sub(smoothstep(40.0, 300.0, camDist));
    const t = W.time;
    // Running water (rivers, brooks) and its way downstream; still water (sea, lakes) has none.
    const speed = length(vFlow);
    const running = smoothstep(0.05, 0.3, speed);
    const fdir = vFlow.div(max(speed, 0.001));
    const across = vec2(fdir.y.negate(), fdir.x);
    // The current carries its pattern downstream in two layers half a cycle apart, each pulled back when it fades
    // out (a flow map): drift that grew without end would tear the pattern apart where the speed changes.
    const phaseA = fract(t.div(FLOW_CYCLE)), phaseB = fract(t.div(FLOW_CYCLE).add(0.5));
    const layerB = abs(phaseA.mul(2).sub(1));
    const carried = (ph: Node<'float'>) => speed.mul(ph.sub(0.5)).mul(FLOW_CYCLE);
    const e = 0.04;
    // Ripples: the slope of small waves (metres of height), finer ones faster. Still water: three octaves drifting
    // with the wind. Running water: two, drawn out along the current (it streams in lines) and carried by it.
    const oct: [number, number, number][] = [[0.6, 0.035, 0.35], [1.9, 0.012, 0.7], [5.2, 0.004, 1.3]];
    const hStill = (q: Node<'vec2'>) => {
      let sum: Node<'float'> = float(0);
      oct.forEach(([sc, amp, sp], i) => {
        sum = sum.add(mx_noise_float(vec3(q.add(W.wind.mul(t.mul(sp * 0.6))).mul(sc).add(i * 13.7), t.mul(sp * 0.5))).mul(amp));
      });
      return sum;
    };
    // (Carried, not turned to the current: world coordinates turned by a direction that bends across a brook
    // swing by hundreds of metres, which tore the pattern into blocks.)
    const hRun = (q: Node<'vec2'>, ph: Node<'float'>, seed: number) => {
      const f = q.sub(fdir.mul(carried(ph)));
      let sum: Node<'float'> = float(0);
      oct.slice(0, 2).forEach(([sc, amp, sp], i) => {
        sum = sum.add(mx_noise_float(vec3(f.mul(sc * 0.9).add(i * 13.7 + seed), t.mul(sp * 0.8))).mul(amp));
      });
      return sum;
    };
    const slopeOf = (h: (q: Node<'vec2'>) => Node<'float'>) => {
      const h0 = h(p.xz);
      return vec2(h0.sub(h(p.xz.add(vec2(e, 0)))), h0.sub(h(p.xz.add(vec2(0, e))))).div(e);
    };
    // Faster water is rougher. (Blended, not branched: an If here turned rivers opaque on WebGPU, the refraction
    // read below lost its view of the bed.)
    const choppy = mix(float(1.4), float(2.2), smoothstep(1.0, 3.0, speed));
    const runSlope = mix(slopeOf((q) => hRun(q, phaseA, 0)), slopeOf((q) => hRun(q, phaseB, 5.3)), layerB).mul(choppy);
    const rippled = mix(slopeOf(hStill), runSlope, running);
    // Raindrops ring the surface near the camera.
    const rings = rainRings(p.xz).mul(smoothstep(12.0, 50.0, camDist).oneMinus());
    const faded = rippled.mul(fade).add(rings);
    const ripple = vec3(faded.x, 0, faded.y);
    const up = frontFacing;
    const N0 = normalize(vN.add(ripple)).toVar();
    const N = select(up, N0, N0.negate());
    const ndv = clamp(dot(N, V), 0, 1);
    // A wind-roughened sea is no mirror: at grazing angles its facets tilt toward the viewer, so the
    // reflection never reaches full strength and comes from higher, bluer sky than the pale horizon.
    const rough = smoothstep(20.0, 400.0, camDist);
    const fres = float(0.02).add(pow(float(1).sub(ndv), 5).mul(0.98)).min(mix(float(0.55), float(0.45), rough));
    const depth = max(vDepth, 0);
    const sunUp = clamp(W.sunDir.y.mul(3).add(0.2), 0, 1);

    // What lies below, bent by the waves, dimmed and tinted by the water it passes through.
    const path = depth.div(max(ndv, 0.25)).min(80);
    const refrUV = screenUV.add(N.xz.mul(0.035).mul(fade).mul(smoothstep(0.0, 1.5, depth)));
    const below = viewportSharedTexture(refrUV).rgb;
    const trans = exp(W.absorb.mul(path).negate());
    // Wind and rain stir the water grey (silt, spray, no sun through it).
    const stirred = WEATHER.wind.mul(WEATHER.rain).mul(0.75);
    const tint = mix(W.shallow, W.deep, smoothstep(0.0, 30.0, depth));
    const body = mix(tint, vec3(dot(tint, vec3(0.3, 0.5, 0.2))).mul(0.8), stirred).mul(W.ambient.add(W.sunColor.mul(0.3).mul(sunUp)));
    const water = below.mul(trans).add(body.mul(vec3(1).sub(trans)));
    // Light through the crests.
    const crestLit = W.shallow.mul(W.sunColor).mul(0.35).mul(max(vCrest, 0)).mul(sunUp);

    // The sky and the sun in it.
    const R = reflect(V.negate(), N);
    const Rup = normalize(vec3(R.x, max(abs(R.y), mix(float(0.12), float(0.25), rough)), R.z));
    // The env copy of the sky is drawn with less colour (weather.ts ENV_SATURATION): the mirror gives it back.
    const sky = fullSky(pmremTexture(envTex!, Rup, mix(float(0.06), float(0.2), rough)).rgb).mul(W.env);
    const rs = max(dot(R, W.sunDir), 0);
    const spec = pow(rs, 900).mul(30).add(pow(rs, 80).mul(0.6));
    const refl = sky.add(W.sunColor.mul(spec).mul(sunUp));
    let col = mix(water.add(crestLit), refl, fres);

    // Foam: bands rolling onto the shore, a wet rim at the waterline, whitecaps on the crests.
    const n = mx_noise_float(vec3(p.xz.mul(0.45), t.mul(0.3))).mul(0.5).add(0.5);
    // Surf rolls in only on still water; a river shows its wet rim and streaks drawn out by the current.
    const still = running.oneMinus();
    // Near the shore by distance, not depth alone: over a wide shallow shelf (a lake's flat edge) a depth test turned
    // a band tens of metres wide white. The metres to the shore: depth over how fast it deepens across the pixels.
    const deepens = fwidth(depth).div(max(fwidth(p.x).add(fwidth(p.z)), 1e-3));
    const nearShore = float(1).sub(smoothstep(2.0, 7.0, depth.div(max(deepens, 0.02))));
    const shore = float(1).sub(smoothstep(0.0, 1.6, depth)).mul(still).mul(nearShore);
    // Surf rolls in from the sea only: a lake has no breakers, and over its long flat shelves the bands stood still as
    // one solid white strip along the shore (gate W). The sea's surface is at 0 m, a lake's well above it.
    const surf = shore.mul(smoothstep(SEA_SURF_TOP, 0.5, p.y));
    // Streaks: noise stretched along the flow and carried with it (in the same two layers as the ripples). Stretched
    // along one of STREAK_DIRS fixed directions, the two either side of the current blended: turning the world
    // coordinates by the current itself (which bends across a narrow brook) tore them into blocks.
    const turns = atan(fdir.y, fdir.x).div(Math.PI * 2 / STREAK_DIRS), turn0 = floor(turns), turnW = fract(turns);
    const dirAt = (k: Node<'float'>) => vec2(cos(k.mul(Math.PI * 2 / STREAK_DIRS)), sin(k.mul(Math.PI * 2 / STREAK_DIRS)));
    const sideways = dot(p.xz, across);
    // Each layer is made foam first and then blended: blending the noise would lower its contrast mid-cycle, and the
    // foam would pulse with the cycle instead of drifting. Streaks lie along the current; where it rushes (a steep
    // brook, below a fall) finer churned water breaks white, carried the same way.
    const rush = smoothstep(1.3, 3.2, speed);
    const runFoamAlong = (d: Node<'vec2'>, ph: Node<'float'>, seed: number) => {
      const down = dot(p.xz, d).sub(carried(ph)), sideways = dot(p.xz, vec2(d.y.negate(), d.x));
      const streak = mx_noise_float(vec3(down.mul(0.12).add(seed), sideways.mul(1.1), t.mul(0.2))).mul(0.5).add(0.5);
      const churn = mx_noise_float(vec3(down.mul(0.45).add(seed), sideways.mul(1.3), t.mul(0.5))).mul(0.5).add(0.5);
      // Seen from the bank the reflected sky drowns the ripples: the streaks carry the current there.
      return smoothstep(0.69, 0.92, streak).mul(mix(float(0.6), float(0.38), smoothstep(8.0, 60.0, camDist))).add(rush.mul(smoothstep(0.55, 0.85, churn.mul(0.7).add(streak.mul(0.4)))).mul(0.7));
    };
    // (One seed for both: a direction's streaks must be the same whichever side of the blend it is on, or they
    // jump where the current turns past one of the fixed directions.)
    const runFoam = (ph: Node<'float'>, seed: number) => mix(runFoamAlong(dirAt(turn0), ph, seed), runFoamAlong(dirAt(turn0.add(1)), ph, seed), turnW);
    const runningFoam = mix(runFoam(phaseA, 0), runFoam(phaseB, 7.1), layerB).mul(running);
    // The falling sheet: streaks stretched down the fall, rushing.
    const sheet = mx_noise_float(vec3(sideways.mul(1.4), p.y.mul(0.18).add(t.mul(3.0)), t.mul(0.4))).mul(0.35)
      .add(mx_noise_float(vec3(sideways.mul(4.0), p.y.mul(0.5).add(t.mul(6.0)), 3.1)).mul(0.15)).add(0.5);
    const bands = sin(depth.mul(4.2).sub(t.mul(1.7)).add(n.mul(5))).mul(0.5).add(0.5);
    const foam = clamp(
      surf.mul(smoothstep(0.45, 0.85, bands.mul(n.mul(0.8).add(0.6))))
        // The wet rim, on still water only: running water's depth comes from masks too coarse for a brook, which is
        // shallow all across and would turn white; its edge is where the surface meets the bank.
        // Faint: at 0.6 it drew every lake's flat shore as a hard white line (gate W shots).
        .add(float(1).sub(smoothstep(0.0, 0.3, depth)).mul(WET_RIM).mul(still).mul(nearShore))
        .add(smoothstep(0.55, 1.0, vCrest).mul(smoothstep(0.45, 0.75, n)).mul(0.7))
        // Streaks and white water on running water (the falling sheet itself is all foam, below).
        .add(runningFoam),
      0, 1);
    const foamCol = W.ambient.mul(1.1).add(W.sunColor.mul(0.5).mul(sunUp));
    col = mix(col, foamCol, foam.mul(0.85));
    // The falling sheet: torn white streaks over the dark water body behind them.
    col = mix(col, foamCol.mul(0.8), vFall.mul(mix(float(0.3), float(0.95), smoothstep(0.3, 0.75, sheet))));

    // From below: a bright Snell window overhead, the dark of total internal reflection around it.
    const window = smoothstep(0.55, 0.75, ndv);
    const under = mix(W.deep.mul(W.ambient).mul(2), sky.mul(0.9).add(W.sunColor.mul(pow(max(dot(V.negate(), W.sunDir), 0), 40)).mul(2)), window);
    return vec4(select(up, col, under), 1);
  })();
  // Dry land under a wave's edge: nothing. Running water has no waves: its banks hide it, so it is cut only
  // well under them (where its surface sinks past lower ground), else the masks' 2 m samples cut a brook into steps.
  m.alphaTestNode = null;
  const dryBelow = mix(float(-0.2), float(-0.75), smoothstep(0.05, 0.3, length(vFlow)));
  // (A falling sheet stays whole: it hangs over its own lip.)
  m.opacityNode = select(waterAt(WORLD.xz).y.lessThan(dryBelow).and(vFall.lessThan(0.3)), float(0), float(1));
  m.alphaTest = 0.5;
  return m;
}, { cast: false, receive: false });

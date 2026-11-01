// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot, npm run preview:caves).
/**
 * The moving surface of water, shared: the ripples (still water drifts with the wind, running water streams in lines
 * and is carried by the current) and the white streaks and churn of fast water. The outside water (water.ts) and
 * the water in formed caves (formedWater.ts) both call these, so a better ripple or a better rapid shows in both.
 * Moved out of water.ts unchanged.
 */
import { abs, atan, cos, dot, float, floor, fract, mix, mx_noise_float, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Seconds a running water's pattern is carried before it fades back (flow map cycle). */
export const FLOW_CYCLE = 1.6;
/** Running water's foam streaks lie along one of this many fixed directions (the two nearest the current, blended). */
export const STREAK_DIRS = 12;

/**
 * The current carries its pattern downstream in two layers half a cycle apart, each pulled back when it fades
 * out (a flow map): drift that grew without end would tear the pattern apart where the speed changes.
 */
export function flowLayers(t: Node<'float'>, speed: Node<'float'>) {
  const phaseA = fract(t.div(FLOW_CYCLE)), phaseB = fract(t.div(FLOW_CYCLE).add(0.5));
  const layerB = abs(phaseA.mul(2).sub(1));
  const carried = (ph: Node<'float'>) => speed.mul(ph.sub(0.5)).mul(FLOW_CYCLE);
  return { phaseA, phaseB, layerB, carried };
}

/** The ripples at a world point `p` (xz): the slope of small waves; `running` (0..1) blends still water into running water. */
export function rippleSlope(p: Node<'vec2'>, a: { t: Node<'float'>; wind: Node<'vec2'>; speed: Node<'float'>; running: Node<'float'>; fdir: Node<'vec2'> }): Node<'vec2'> {
  const { t, wind, speed, running, fdir } = a;
  const { phaseA, phaseB, layerB, carried } = flowLayers(t, speed);
  const e = 0.04;
  // Ripples: the slope of small waves (metres of height), finer ones faster. Still water: three octaves drifting
  // with the wind. Running water: two, drawn out along the current (it streams in lines) and carried by it.
  const oct: [number, number, number][] = [[0.6, 0.035, 0.35], [1.9, 0.012, 0.7], [5.2, 0.004, 1.3]];
  const hStill = (q: Node<'vec2'>) => {
    let sum: Node<'float'> = float(0);
    oct.forEach(([sc, amp, sp], i) => {
      sum = sum.add(mx_noise_float(vec3(q.add(wind.mul(t.mul(sp * 0.6))).mul(sc).add(i * 13.7), t.mul(sp * 0.5))).mul(amp));
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
    const h0 = h(p);
    return vec2(h0.sub(h(p.add(vec2(e, 0)))), h0.sub(h(p.add(vec2(0, e))))).div(e);
  };
  // Faster water is rougher. (Blended, not branched: an If here turned rivers opaque on WebGPU, the refraction
  // read below lost its view of the bed.)
  const choppy = mix(float(1.4), float(2.2), smoothstep(1.0, 3.0, speed));
  const runSlope = mix(slopeOf((q) => hRun(q, phaseA, 0)), slopeOf((q) => hRun(q, phaseB, 5.3)), layerB).mul(choppy);
  return mix(slopeOf(hStill), runSlope, running);
}

/** The white of fast water at a world point `p` (xz): streaks along the current and, where it rushes, churn. Multiply by `running`. */
export function streakFoam(p: Node<'vec2'>, a: { t: Node<'float'>; speed: Node<'float'>; fdir: Node<'vec2'>; camDist: Node<'float'> }): Node<'float'> {
  const { t, speed, fdir, camDist } = a;
  const { phaseA, phaseB, layerB, carried } = flowLayers(t, speed);
  // Streaks: noise stretched along the flow and carried with it (in the same two layers as the ripples). Stretched
  // along one of STREAK_DIRS fixed directions, the two either side of the current blended: turning the world
  // coordinates by the current itself (which bends across a narrow brook) tore them into blocks.
  const turns = atan(fdir.y, fdir.x).div(Math.PI * 2 / STREAK_DIRS), turn0 = floor(turns), turnW = fract(turns);
  const dirAt = (k: Node<'float'>) => vec2(cos(k.mul(Math.PI * 2 / STREAK_DIRS)), sin(k.mul(Math.PI * 2 / STREAK_DIRS)));
  // Each layer is made foam first and then blended: blending the noise would lower its contrast mid-cycle, and the
  // foam would pulse with the cycle instead of drifting. Streaks lie along the current; where it rushes (a steep
  // brook, below a fall) finer churned water breaks white, carried the same way.
  const rush = smoothstep(1.3, 3.2, speed);
  const runFoamAlong = (d: Node<'vec2'>, ph: Node<'float'>, seed: number) => {
    const down = dot(p, d).sub(carried(ph)), sideways = dot(p, vec2(d.y.negate(), d.x));
    const streak = mx_noise_float(vec3(down.mul(0.12).add(seed), sideways.mul(1.1), t.mul(0.2))).mul(0.5).add(0.5);
    const churn = mx_noise_float(vec3(down.mul(0.45).add(seed), sideways.mul(1.3), t.mul(0.5))).mul(0.5).add(0.5);
    // Seen from the bank the reflected sky drowns the ripples: the streaks carry the current there.
    return smoothstep(0.69, 0.92, streak).mul(mix(float(0.6), float(0.38), smoothstep(8.0, 60.0, camDist))).add(rush.mul(smoothstep(0.55, 0.85, churn.mul(0.7).add(streak.mul(0.4)))).mul(0.7));
  };
  // (One seed for both: a direction's streaks must be the same whichever side of the blend it is on, or they
  // jump where the current turns past one of the fixed directions.)
  const runFoam = (ph: Node<'float'>, seed: number) => mix(runFoamAlong(dirAt(turn0), ph, seed), runFoamAlong(dirAt(turn0.add(1)), ph, seed), turnW);
  return mix(runFoam(phaseA, 0), runFoam(phaseB, 7.1), layerB);
}

/**
 * The sea's swell (plan 6): the Gerstner waves the water shader draws (render/materials/water.ts), and their
 * height at a point, so what floats (a swimmer) rides the same waves the player sees. Pure.
 */
import { smoothstep } from '@futuremagic/core';

const G = 9.81;

/**
 * The waves: direction as parts along and across the wind, steepness, wavelength (m). Longest first; the
 * shader and `swellHeight` both read this table.
 */
export const WAVES: readonly (readonly [along: number, across: number, steep: number, length: number])[] = [
  [1, 0, 0.13, 58], [1, 0.6, 0.11, 31], [1, -0.7, 0.09, 17], [0.3, 1, 0.07, 9], [0.5, -1, 0.05, 5.3],
];

/** A wave's number and speed (deep water). */
export const waveMotion = (length: number): { k: number; c: number } => {
  const k = (2 * Math.PI) / length;
  return { k, c: Math.sqrt(G / k) };
};

/**
 * How strong the waves are at a point (the shader's `k`): `amp` (weather), less in shallows and on lakes
 * (`level` far from the sea's 0), none on running rivers (`flow`, m/s), fading out `dist` m from the camera.
 */
export function swellScale(amp: number, level: number, depth: number, flow: number, dist = 0): number {
  const sea = 1 - smoothstep(0.5, 2, Math.abs(level));
  const still = 1 - smoothstep(0.05, 0.3, flow);
  return amp * smoothstep(0.3, 9, depth) * (1 - smoothstep(250, 800, dist)) * (0.12 + 0.88 * sea) * still;
}

/** The swell's height over the calm level at (x, z), time `t` (s), wind direction (unit x, z), strength `scale`. */
export function swellHeight(x: number, z: number, t: number, windX: number, windZ: number, scale: number): number {
  let y = 0;
  for (const [along, across, steep, length] of WAVES) {
    // Across the wind: the wind turned a quarter (as the shader's vec2(-wind.z, wind.x)).
    const dx = along * windX - across * windZ, dz = along * windZ + across * windX, n = Math.hypot(dx, dz);
    const { k, c } = waveMotion(length);
    y += ((steep * scale) / k) * Math.sin(((dx * x + dz * z) / n - t * c) * k);
  }
  return y;
}

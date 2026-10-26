/**
 * The horizon map: for each point of a square around the camera, how high the land rises toward each of
 * eight compass directions (the elevation angle of its skyline). The sun is hidden where it stands below
 * that skyline: hills and mountains shade the valleys at low sun, far beyond the sun's shadow map.
 * Pure, so it runs in a worker and in tests.
 */
export const HORIZON_DIRS = 8;
/** The steps outward along each direction, in grid cells: dense near, sparse far. */
const STEPS = [1, 2, 3, 4, 6, 8, 11, 16, 22, 32, 45, 64, 90, 128];
/** Metres the eye sits above the smoothed ground (the grid misses small knolls). */
const LIFT = 3;

export interface HorizonSpec {
  /** World position of the square's minimum corner, and its side, metres. */
  x0: number;
  z0: number;
  size: number;
  /** Cells a side. */
  res: number;
}

/** Direction `d`'s unit vector on the ground (x, z): 0 is +x, counter-clockwise seen from above (toward +z). */
export function horizonDir(d: number): [number, number] {
  const a = (d / HORIZON_DIRS) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * Skyline angles, `res * res * HORIZON_DIRS` bytes (directions 0..3 then 4..7 per cell, two RGBA planes):
 * the angle above level ground in 0..90 degrees as 0..255 (land below level reads 0).
 */
export function horizonMap(height: (x: number, z: number) => number, spec: HorizonSpec): Uint8Array {
  const { x0, z0, size, res } = spec;
  const cell = size / res;
  const h = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) h[j * res + i] = height(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
  const heightAt = (x: number, z: number): number => {
    const fx = Math.min(res - 1, Math.max(0, x)), fz = Math.min(res - 1, Math.max(0, z));
    const i = Math.min(res - 2, Math.floor(fx)), j = Math.min(res - 2, Math.floor(fz));
    const u = fx - i, v = fz - j, k = j * res + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + res] * (1 - u) + h[k + res + 1] * u) * v;
  };
  const plane = res * res * 4;
  const out = new Uint8Array(plane * 2);
  for (let d = 0; d < HORIZON_DIRS; d++) {
    const [dx, dz] = horizonDir(d);
    const o = (d < 4 ? 0 : plane) + (d & 3);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const y0 = h[j * res + i] + LIFT;
      let best = 0;
      for (const s of STEPS) {
        const x = i + dx * s, z = j + dz * s;
        if (x < 0 || z < 0 || x > res - 1 || z > res - 1) break;
        const t = (heightAt(x, z) - y0) / (s * cell);
        if (t > best) best = t;
      }
      out[o + (j * res + i) * 4] = Math.round((Math.atan(best) / (Math.PI / 2)) * 255);
    }
  }
  return out;
}

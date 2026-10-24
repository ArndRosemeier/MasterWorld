/**
 * Which terrain chunks to draw for a camera position: a quadtree of square chunks, split while the camera
 * is closer than `SPLIT` chunk sizes. Pure, so it is tested headless.
 */

/** Side of the finest chunk, metres; with 64 segments a vertex every 2 m. */
export const CHUNK0 = 128;
export const SEGS = 64;
/** Level of the root chunks (128 m × 2^8 ≈ 33 km). */
export const ROOT_LEVEL = 8;
/** Split a chunk while the camera is closer than this many chunk sizes. */
export const SPLIT = 1.3;

export interface ChunkKey {
  level: number;
  x: number;
  z: number;
}

export const chunkSize = (level: number): number => CHUNK0 * 2 ** level;
export const chunkId = (k: ChunkKey): string => `${k.level}:${k.x}:${k.z}`;

/** Distance from a point to a chunk's footprint, counting the height above the ground too. */
function distanceTo(k: ChunkKey, cx: number, cz: number, above: number): number {
  const s = chunkSize(k.level), x0 = k.x * s, z0 = k.z * s;
  const dx = Math.max(x0 - cx, 0, cx - (x0 + s)), dz = Math.max(z0 - cz, 0, cz - (z0 + s));
  return Math.hypot(dx, dz, Math.max(0, above));
}

/** The chunks to draw: leaves of the quadtree over the 3 × 3 roots around the camera. */
export function selectChunks(cx: number, cz: number, above: number, minLevel = 0): ChunkKey[] {
  const out: ChunkKey[] = [];
  const rs = chunkSize(ROOT_LEVEL), rx = Math.floor(cx / rs), rz = Math.floor(cz / rs);
  const visit = (k: ChunkKey): void => {
    if (k.level > minLevel && distanceTo(k, cx, cz, above) < chunkSize(k.level) * SPLIT) {
      const l = k.level - 1;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visit({ level: l, x: k.x * 2 + i, z: k.z * 2 + j });
    } else out.push(k);
  };
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) visit({ level: ROOT_LEVEL, x: rx + i, z: rz + j });
  return out;
}

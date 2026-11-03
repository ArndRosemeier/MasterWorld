/**
 * A pit in the land (docs/design/caves.md "Ways in"; pure): a sinkhole, a doline, a place where a cave's roof fell in. From a spot
 * on the land the search walks downhill to the lowest ground near it; if that ground is ringed by higher land all round (a hollow, not a valley
 * that runs on) it is a pit, and the way in is the foot of its wall: low on the wall, where the ground still rises on into the hill, its
 * mouth turned into the wall. The hero walks down into the pit to the cave, as down into a doline to a swallow hole.
 */

/** A pit's wall: where a mouth stands at its foot, which way it faces (a walker's yaw: forward is (−sin, −cos)), and how deep the pit is (m). */
export interface PitWall {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly depth: number;
}

/** How far each downhill step looks (m), the most steps, and the ring that must stand higher all round (m out, m up). */
const LOOK = 30, STEPS = 6, RING = 16, DEEP = 3;
/** The wall's gentlest and steepest walked slope, the rise it must keep to (m over 14 m), and how high up it a mouth may stand (m over the floor). */
const GENTLE = 0.15, STEEP = 0.5, RISE = 3, FOOT = 3;

/** The pit that (x, z) drains into, as the mouth site at its wall's foot, or null (no hollow near, or no wall that can be walked). */
export function pitWall(height: (x: number, z: number) => number, x: number, z: number): PitWall | null {
  let px = x, pz = z, ph = height(px, pz);
  for (let n = 0; n < STEPS; n++) {
    let bx = px, bz = pz, bh = ph;
    for (let a = 0; a < 8; a++) {
      const qx = px + Math.cos(a * Math.PI / 4) * LOOK, qz = pz + Math.sin(a * Math.PI / 4) * LOOK, qh = height(qx, qz);
      if (qh < bh) { bh = qh; bx = qx; bz = qz; }
    }
    if (bh >= ph - 0.5) break;
    px = bx; pz = bz; ph = bh;
  }
  // The floor: the steps are coarse, so look closer round the end of the walk, ever closer (8, 4, 2 m).
  for (const r of [8, 4, 2]) {
    for (let a = 0; a < 8; a++) {
      const qx = px + Math.cos(a * Math.PI / 4) * r, qz = pz + Math.sin(a * Math.PI / 4) * r, qh = height(qx, qz);
      if (qh < ph) { ph = qh; px = qx; pz = qz; }
    }
  }
  let rim = Infinity;
  for (let a = 0; a < 8; a++) rim = Math.min(rim, height(px + Math.cos(a * Math.PI / 4) * RING, pz + Math.sin(a * Math.PI / 4) * RING) - ph);
  if (rim < DEEP) return null;
  let best: PitWall | null = null, score = -Infinity;
  for (let a = 0; a < 16; a++) {
    const ux = Math.cos(a * Math.PI / 8), uz = Math.sin(a * Math.PI / 8);
    for (const d of [4, 6, 8, 10, 12]) {
      const sx = px + ux * d, sz = pz + uz * d, sh = height(sx, sz), g = (height(sx + ux * 3, sz + uz * 3) - height(sx - ux * 3, sz - uz * 3)) / 6, rise = height(sx + ux * 14, sz + uz * 14) - sh;
      if (g < GENTLE || g > STEEP || rise < RISE || sh - ph > FOOT) continue;
      // The foot of a wall that rises on: the more it rises and the lower down it stands, the better.
      const s = rise - 0.8 * (sh - ph);
      if (s > score) { score = s; best = { x: sx, z: sz, yaw: Math.atan2(-ux, -uz), depth: rim }; }
    }
  }
  return best;
}

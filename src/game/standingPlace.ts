/**
 * Where the hero stands to talk to or trade with someone out of doors: in front of them, a step and a
 * half off, but clear of walls and posts by a body's width, so that the talk's shot over the hero's
 * shoulder is not filled by a building's corner. Pure.
 */

/** Tried in turn: straight in front, then ever further round to either side (rad off the facing). */
const TURNS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];
/** Distance (m) in front, and how far walls must stay off. */
const DIST = 1.6, CLEAR = 0.9;

/**
 * The place (x, z) in front of someone at (x, z) facing `dir` (xz atan2) where nothing `blocked` (a body
 * of radius r touching a wall) is within CLEAR, and nothing `inWay` (a fixture at a point) stands between
 * them; straight in front when nowhere is.
 */
export function standingPlace(x: number, z: number, dir: number, blocked: (x: number, z: number, r: number) => boolean, inWay?: (x: number, z: number) => boolean): { x: number; z: number } {
  for (const t of TURNS) {
    const px = x + Math.cos(dir + t) * DIST, pz = z + Math.sin(dir + t) * DIST;
    if (blocked(px, pz, CLEAR)) continue;
    // Nothing between the two (a stall's counter and its wares, a hen coop: the talk's shot looked across it).
    if (inWay && [0.2, 0.35, 0.5, 0.65, 0.8].some((k) => inWay(x + (px - x) * k, z + (pz - z) * k))) continue;
    return { x: px, z: pz };
  }
  return { x: x + Math.cos(dir) * DIST, z: z + Math.sin(dir) * DIST };
}

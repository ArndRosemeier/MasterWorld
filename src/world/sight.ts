/**
 * Line of sight over the land (D66, K9; pure): whether the ground lets an eye at one point see a spot at another, or hides it behind a rise.
 * The ground between is sampled every few metres against the straight line from eye to spot; trees and houses do not block it (they are
 * not the ground), a rise of a metre or more over the line does.
 */

/** Metres between samples of the ground along the line. */
const STEP = 4;
/** How far the ground may stand over the line before it hides the spot (m). */
const SLACK = 0.6;

/** Can the eye at (ax, ay, az) see the spot (bx, by, bz) over the ground `height`? */
export function seesOver(height: (x: number, z: number) => number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / STEP);
  // (The ends are not tested: the eye stands on the ground and the spot's face is on it.)
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (height(ax + (bx - ax) * t, az + (bz - az) * t) > ay + (by - ay) * t + SLACK) return false;
  }
  return true;
}

/**
 * The throat of a formed cave (D63, phase K5): where a spring's mouth is joined to the land by a portal (game/portal.ts,
 * app/portals.ts). The mouth on the land (world/dungeon/caveMouth.ts) draws an arch; the cave carves the same arch
 * (world/dungeon/caveThroat.ts `throatAir`, same noise from the cave's seed) into the end of its mouth passage, so the two
 * sides of the portal are one passage. Behind the portal plane the rock is closed round the arch for a metre and a bit,
 * so the window shows a wall of rock with a hole, not an open hall. Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { BrickField } from '../dungeon/rockMesh';
import { fieldAt } from '../dungeon/rockMesh';
import { THROAT_BEYOND, THROAT_OPENING, throatAir, throatNoise, type ThroatFrame } from '../dungeon/caveThroat';
import { putSample, sampleRange } from './carve';
import type { Skeleton } from './skeleton';

/** How far from the mouth passage's first point (the spring) along its way out the portal plane stands (m). */
const PLANE_OUT = 6;
/** How far the arch goes on into the cave from the plane (m), and how far the closing plug of rock goes past the arch (m). */
const IN = 4, PLUG = 1.6;

/** The seed a cave's throat noise is made from (the mouth on the land makes its own side from it too). */
export const throatSeed = (cave: number): number => deriveSeed(cave, 'cave');

/** The floor under (x, z) near `y`: down from a head's height over it, through the air first met, to the rock; null: none within `most` metres. */
function floorNear(f: BrickField, x: number, y: number, z: number, most = 6): number | null {
  let air = false;
  for (let d = -1.3; d < most; d += 0.1) {
    const solid = fieldAt(f, x, y - d, z, -1) <= 0;
    if (!solid) air = true;
    else if (air) return y - d + 0.1;
  }
  return null;
}

/** The plane's candidates along a mouth (metres from its spring): the nominal one first, then the others. */
const SPOTS = [PLANE_OUT, 5, 7, 4, 3, 8, 2];
/** The ground the arch's end must open on: level ground (steps of at most `STEP` between 1 m squares) with head room, counted out to `REACH` m, at most `ENOUGH` squares. */
const STEP = 0.8, REACH = 12, ENOUGH = 70, HEAD = 2.2;

/** How deep a floor is looked for under a square (m): further down it is a pit. */
const EDGE = 8;

/** How much level ground with head room lies round (x, z) at floor `y`, in squares of 1 m up to `ENOUGH`, less the drops met on the way (edges of squares, 3 each, at most 20). */
function levelGround(f: BrickField, x0: number, y0: number, z0: number): number {
  const seen = new Map<number, number>(), squareAt = (i: number, k: number): number => (i + 64) * 256 + (k + 64);
  seen.set(squareAt(0, 0), y0);
  let edges = 0;
  const queue: [number, number][] = [[0, 0]];
  for (let n = 0; n < queue.length && seen.size < ENOUGH; n++) {
    const [i, k] = queue[n], y = seen.get(squareAt(i, k))!;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nk = k + dk;
      if (Math.hypot(ni, nk) > REACH || seen.has(squareAt(ni, nk))) continue;
      const x = x0 + ni, z = z0 + nk, fl = floorNear(f, x, y + STEP, z, EDGE);
      // Air under a square that goes down past a step is a drop (an edge), not ground: counted against the spot.
      if (fl === null || fl < y - STEP) { if (fieldAt(f, x, y + 1, z, -1) > 0.1) edges++; continue; }
      if (fl > y + STEP || fieldAt(f, x, fl + HEAD, z, -1) <= 0.1) continue;
      seen.set(squareAt(ni, nk), fl); queue.push([ni, nk]);
    }
  }
  return seen.size - 3 * Math.min(edges, 20);
}

/**
 * Where a mouth's portal plane stands, in the cave's frame: on the floor of the mouth passage, facing out to the day (a
 * walker's yaw: forward is (−sin yaw, −cos yaw), so the way in is forward). The hero arrives on that floor and must be able
 * to walk back to it, so the spot is chosen: along each mouth, the one whose arch opens on the most level ground (steps
 * the hero walks, not drops); the nearest to the nominal one wins among equals. Null when the cave has no mouth.
 */
export function throatFrame(f: BrickField, sk: Skeleton): ThroatFrame | null {
  let best: { frame: ThroatFrame; ground: number } | null = null;
  for (const c of sk.conduits) {
    if (c.kind !== 'mouth') continue;
    const a = c.points[0], b = c.points[c.points.length - 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    SPOTS.forEach((s, rank) => {
      if (s > len + 2) return;
      const x = a.x + dx * s, z = a.z + dz * s, y = floorNear(f, x, a.y + 0.5 * a.B, z, a.B + a.D + 2);
      if (y === null) return;
      const ground = levelGround(f, x - dx * IN, y, z - dz * IN) - rank * 2;
      if (!best || ground > best.ground) best = { frame: { x, y, z, yaw: Math.atan2(dx, dz) }, ground };
    });
  }
  return best ? best.frame : null;
}

/** The rock round the arch that closes it (m beyond its half width), and how far the floor under it goes down (m). */
const WALL = 1.3, SOLE = 1.5, HALF = THROAT_OPENING.halfWidth - 0.3;

/**
 * Carve the throat's arch into the field at the frame and close the rock round it behind the plane. The arch has a floor of
 * its own (solid under it) and walls of its own (solid beside and over it, from a metre in from its inner end), so it is a
 * tunnel whatever lay there: the hero never arrives over a pit, and the camera has rock to keep out of.
 */
export function stampThroat(f: BrickField, t: ThroatFrame, cave: number): void {
  const noise = throatNoise(throatSeed(cave)), sin = Math.sin(t.yaw), cos = Math.cos(t.yaw);
  const reach = IN + 2, [i0, i1] = sampleRange(f, t.x - reach, t.x + reach, 'x'), [k0, k1] = sampleRange(f, t.z - reach, t.z + reach, 'z'), [j0, j1] = sampleRange(f, t.y - SOLE - 0.5, t.y + 5, 'y');
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const rx = f.ox + i * f.step - t.x, ry = f.oy + j * f.step - t.y, rz = f.oz + k * f.step - t.z;
    // The portal's frame: u across, v up from the floor, w along it (w > 0 towards the day, behind the plane).
    const w = rx * sin + rz * cos, u = rx * cos - rz * sin;
    if (Math.abs(u) > 4 || w > THROAT_BEYOND + PLUG || w < -IN) continue;
    if (w > THROAT_BEYOND) { putSample(f, i, j, k, -1, true); continue; }
    const air = Math.min(throatAir(noise, u, ry, w), THROAT_BEYOND - w, w + IN);
    if (air > 0) { putSample(f, i, j, k, air); continue; }
    // Behind the plane the rock is closed round the arch.
    if (w >= 0) { putSample(f, i, j, k, Math.max(air, -1), true); continue; }
    // On into the cave: the floor under the arch and its walls, but for the last metre where the passage takes over.
    if (Math.abs(u) > HALF + WALL || w < -IN + 1) continue;
    if (ry < 0) { if (ry > -SOLE) putSample(f, i, j, k, Math.max(ry, -1), true); }
    else putSample(f, i, j, k, Math.max(air, -1), true);
  }
}

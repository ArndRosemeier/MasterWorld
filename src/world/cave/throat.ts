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
import { THROAT_BEYOND, throatAir, throatNoise, type ThroatFrame } from '../dungeon/caveThroat';
import { putSample, sampleRange } from './carve';
import type { Skeleton } from './skeleton';

/** How far from the mouth passage's first point (the spring) along its way out the portal plane stands (m). */
const PLANE_OUT = 6;
/** How far the arch goes on into the cave from the plane (m), and how far the closing plug of rock goes past the arch (m). */
const IN = 4, PLUG = 1.6;

/** The seed a cave's throat noise is made from (the mouth on the land makes its own side from it too). */
export const throatSeed = (cave: number): number => deriveSeed(cave, 'cave');

/**
 * Where the first mouth's portal plane stands, in the cave's frame: on the floor of the mouth passage, facing in (a
 * walker's yaw: forward is (−sin yaw, −cos yaw)). Null when the cave has no mouth.
 */
export function throatFrame(f: BrickField, sk: Skeleton): ThroatFrame | null {
  const c = sk.conduits.find((k) => k.kind === 'mouth');
  if (!c) return null;
  const a = c.points[0], b = c.points[c.points.length - 1];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1, dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
  const x = a.x + dx * PLANE_OUT, z = a.z + dz * PLANE_OUT;
  // The floor: down the column from inside the passage to the first rock.
  let y = a.y + 0.5 * a.B;
  for (let d = 0; d < a.B + a.D + 4; d += 0.1) {
    if (fieldAt(f, x, a.y + a.B * 0.5 - d, z, -1) <= 0) { y = a.y + a.B * 0.5 - d + 0.1; break; }
  }
  return { x, y, z, yaw: Math.atan2(dx, dz) };
}

/** Carve the throat's arch into the field at the frame, and close the rock round it behind the plane. */
export function stampThroat(f: BrickField, t: ThroatFrame, cave: number): void {
  const noise = throatNoise(throatSeed(cave)), sin = Math.sin(t.yaw), cos = Math.cos(t.yaw);
  const reach = IN + 2, [i0, i1] = sampleRange(f, t.x - reach, t.x + reach, 'x'), [k0, k1] = sampleRange(f, t.z - reach, t.z + reach, 'z'), [j0, j1] = sampleRange(f, t.y - 1.5, t.y + 5, 'y');
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const rx = f.ox + i * f.step - t.x, ry = f.oy + j * f.step - t.y, rz = f.oz + k * f.step - t.z;
    // The portal's frame: u across, v up from the floor, w along it (w > 0 towards the day, behind the plane).
    const w = rx * sin + rz * cos, u = rx * cos - rz * sin;
    if (Math.abs(u) > 4 || w > THROAT_BEYOND + PLUG || w < -IN) continue;
    if (w > THROAT_BEYOND) { putSample(f, i, j, k, -1, true); continue; }
    const air = Math.min(throatAir(noise, u, ry, w), THROAT_BEYOND - w, w + IN);
    if (air > 0) putSample(f, i, j, k, air);
    // Behind the plane the rock is closed round the arch.
    else if (w >= 0) putSample(f, i, j, k, Math.max(air, -1), true);
  }
}

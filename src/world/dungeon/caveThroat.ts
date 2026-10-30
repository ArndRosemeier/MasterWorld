/**
 * A cave's throat (pure): the stretch of passage where its mouth on the land is joined to its first passage
 * below by a portal (game/portal.ts, app/portals.ts). The mouth's way in (caveMouth.ts) runs into it, and the
 * cave's rock (caveRock.ts) carves the same throat out of the wall of its entrance room, so the two sides of
 * the portal are one passage: the same arch, the same lumps on its walls, the same level floor and the same
 * darkening, wherever each side stands.
 *
 * In the portal's frame: u across, v up from the throat's floor, w along it (w > 0 towards the day, the
 * mouth's side; w < 0 on into the cave).
 */
import { DIRS, LayoutGrid } from '@futuremagic/dungeon';
import { Noise, deriveSeed, smoothstep } from '@futuremagic/core';
import type { Cellar } from './cellar';
import { onLand } from './site';

/** A frame on its floor (x, y, z; yaw as a walker's), as a portal's side stands (game/portal.ts). */
export interface ThroatFrame { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

/** The throat's arch: half its width, its height over the floor, and how high its widest point stands (m). */
const HALF = 1.45, HIGH = 2.55, MID = 0.75;
/** The opening of the portal in it: a little bigger than the arch, so its edge lies in the rock all round. */
export const THROAT_OPENING = { halfWidth: HALF + 0.3, height: HIGH + 0.3 };
/** How far the throat goes on past the portal on each side before the side's own rock takes over (m). */
export const THROAT_BEYOND = 1.2;
/** How dark the throat's rock is at the portal (its tint times this): the day reaches no further in. */
export const THROAT_DARK = 0.12;
/** Over how many metres past the portal a cave's own rock gets its colour back. */
const LIGHT_BACK = 5;

/** The throat's air at (u, v, w) of the portal's frame: positive inside the arch and over its floor. Endless along w. */
export function throatAir(noise: Noise, u: number, v: number, w: number): number {
  // The arch as a squashed circle (distance roughly in metres near its wall), cut by the flat floor.
  const arch = HALF * (1 - Math.hypot(u / HALF, (v - MID) / (HIGH - MID)));
  const lumps = noise.fbm3(u / 1.3 + 3.7, v / 1.3, w / 1.3, 2) * 0.16 * smoothstep(0.2, 0.9, v);
  return Math.min(arch + lumps, v);
}

/** The noise of a cave's throat (both sides make it from the cave's seed). */
export const throatNoise = (cave: number): Noise => new Noise(deriveSeed(cave, 'cave', 'throat'));

/**
 * How dark the throat's rock is at `w` (tint factor) on the cave's side: as dark as the mouth's at the portal,
 * its own colour again a few metres on in.
 */
export function throatShade(w: number): number {
  return THROAT_DARK + (1 - THROAT_DARK) * smoothstep(0, -LIGHT_BACK, w);
}

/**
 * Where the throat leaves a cave's entrance room: its way out (the hatch) stands against a wall facing into
 * the room; the portal stands a metre into the rock behind that wall, facing in (its -z into the room). Null
 * when the rock behind is not free (another room or way lies there): such a cave keeps the old way in.
 */
export function caveThroat(c: Pick<Cellar, 'layout' | 'hatch' | 'form'>): ThroatFrame | null {
  const L = c.layout, h = c.hatch, { cell, storey } = L.scale;
  // Facing into the room: forward (-sin, -cos); the wall is behind, `inset` back, and the portal a metre beyond it.
  const [fx, fz] = onLand({ x: 0, z: 0, yaw: h.yaw }, 0, -1), back = c.form.space.inset + 1;
  const dir = DIRS.findIndex(([a, b]) => Math.abs(a + fx) < 0.5 && Math.abs(b + fz) < 0.5);
  if (dir < 0 || !wayOutFree(new LayoutGrid(L), Math.floor(h.x / cell), Math.floor(h.z / cell), Math.round(h.y / storey), dir)) return null;
  return { x: h.x - fx * back, y: h.y, z: h.z - fz * back, yaw: h.yaw };
}

/** For the way out of a carved cave: the two cells beyond the wall side `dir` of cell (i, j) on storey l (and over it) are free. */
export function wayOutFree(grid: { readonly cells: { has(key: string): boolean } }, i: number, j: number, l: number, dir: number): boolean {
  const [dx, dz] = DIRS[dir];
  for (let n = 1; n <= 2; n++) for (const s of [l, l + 1]) if (grid.cells.has(`${i + dx * n},${j + dz * n},${s}`)) return false;
  return true;
}

/**
 * A solution cave formed whole (D63, phase K2; pure, runs in a worker): the rock block over a land, the solution former
 * and the carver, with what each took (the mesh is made apart: it is the slow part, and the game makes it per brick).
 */
import type { CaveSizeDef, CavesDef } from '../../setting/contract';
import type { BrickField } from '../dungeon/rockMesh';
import { rockBlock, type CaveLand, type RockBlock } from './block';
import { carveSkeleton, type FormedField } from './carve';
import { clearOpened, concede, type Opened } from './concede';
import { dressCave, type Dressing } from './dress';
import type { Reading } from './reader';
import { rockById, sizeFor } from './choose';
import { previewLand } from './land';
import type { Skeleton } from './skeleton';
import { formSolution } from './solution';
import { stampThroat, throatFrame } from './throat';

export interface FormedCave {
  readonly block: RockBlock;
  readonly skeleton: Skeleton;
  readonly field: FormedField;
  /** Milliseconds each stage took. */
  readonly ms: { readonly block: number; readonly form: number; readonly carve: number; readonly total: number };
}

/** Form a cave of this rock and size (a size id; none: drawn by the seed; `own`: a size of its own, for tests) over a land (none: the made-up preview land). */
export function formCave(caves: CavesDef, seed: number, rockId: string, sizeId?: string, land?: (across: number, deep: number) => CaveLand, since: () => number = Date.now, own?: CaveSizeDef): FormedCave {
  const t0 = since(), size = own ?? (sizeId ? caves.sizes.find((s) => s.id === sizeId) ?? sizeFor(caves, seed) : sizeFor(caves, seed));
  const block = rockBlock(seed, rockById(caves, rockId), size, land ? land(size.across, size.deep) : previewLand(seed, size.across, size.deep), caves.ore, size.step);
  const t1 = since(), formed = formSolution(block, caves, size.scale, size.step, since), t2 = since(), field = carveSkeleton(formed, block, caves, size.field);
  // The first mouth is the way in from the land: its throat is cut as a portal's arch (K5) and the plane noted in the skeleton.
  const throat = throatFrame(field as BrickField, formed);
  if (throat) stampThroat(field as BrickField, throat, seed);
  const skeleton = throat ? { ...formed, throat } : formed, t3 = since();
  return { block, skeleton, field, ms: { block: t1 - t0, form: t2 - t1, carve: t3 - t2, total: t3 - t0 } };
}

/** Dress a formed cave (silt, stream, rocks, drips and formations): edits its field, so mesh it after. */
export const dressFormed = (c: FormedCave, caves: CavesDef): Dressing => dressCave(c.skeleton, c.block, c.field as BrickField, caves);

/** A cave read: its network, the ways the concession cut, and its dressing without what those cut through. */
export interface FormedRead {
  readonly reading: Reading;
  readonly opened: readonly Opened[];
  readonly dressing: Dressing;
  /** Milliseconds the reading and concession took. */
  readonly ms: number;
}

/** Read a dressed cave and open what is cut off (K4): edits its field, so mesh it after. */
export function readFormed(c: FormedCave, caves: CavesDef, dressing: Dressing): FormedRead {
  const done = concede(c.field as BrickField, c.skeleton, caves, dressing);
  return { reading: done.reading, opened: done.opened, dressing: clearOpened(dressing, done.opened), ms: done.ms };
}

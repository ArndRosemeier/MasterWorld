/**
 * How a kind of dungeon takes shape (plan 8: "each kind has its own space rules"; C6c: kinds are data). The
 * setting's lore says what a kind is (`CellarLore.form`, its `DungeonSpace`); these read it. Pure.
 */
import type { DungeonSpace } from '../../setting/contract';

/** The deepest storey a place's graph may reach, with or without an older layer below. */
export const depthOf = (s: DungeonSpace, older: boolean): number => s.depth[older ? 1 : 0];

/** The entrance room's size, cells: under a house its footprint (`hu`, `hv` half extents, metres). */
export function entranceOf(s: DungeonSpace, place: { readonly hu: number; readonly hv: number }): readonly [number, number] {
  if (s.entrance !== 'footprint') return s.entrance;
  return [Math.max(2, Math.min(5, Math.floor(place.hu))), Math.max(2, Math.min(5, Math.floor(place.hv)))];
}

/**
 * How each kind of dungeon takes shape (plan 8: "each kind has its own space rules"; pure). The setting's
 * lore says what a place is and what happened there; these say how big it may grow, which way it goes
 * (a cellar down under its house, a tower up), how its way out looks and whether its rock is carved
 * (a natural cave) or built.
 */
import type { DungeonProp } from '../../setting/contract';
import type { DungeonTemplate } from '../decisions';

export interface KindShape {
  /** Half extent of the layout grid, cells (a tower stands on a small foot). */
  readonly radius: number;
  /** Most rooms in all. */
  readonly maxRooms: number;
  /** Deepest storey the graph may reach, with or without an older layer below. */
  depth(older: boolean): number;
  /**
   * Storeys the rooms climb as the way goes on (a tower: the further and tenser a room, the higher it lies,
   * the goal near the top). 0: they stay where the graph put them.
   */
  readonly rise: number;
  /** The way back out, standing in the entrance room (a ladder up to a hatch, a passage, a mouth; a tower's door). */
  readonly way: DungeonProp;
  /** How far props stand in from a wall's line, metres (a cave's rock bulges into the room). */
  readonly inset: number;
  /** The entrance room's size, cells: under a house its footprint (`hu`, `hv` half extents, metres). */
  entrance(place: { readonly hu: number; readonly hv: number }): readonly [number, number];
  /** Its rock is carved (a signed distance field meshed with surface nets), not built of walls and floors. */
  readonly carved: boolean;
  /** Wall torches by its doors (a natural cave has none: the lantern is all the light there is). */
  readonly torches: boolean;
}

const footprint = (p: { readonly hu: number; readonly hv: number }): [number, number] => [Math.max(2, Math.min(5, Math.floor(p.hu))), Math.max(2, Math.min(5, Math.floor(p.hv)))];

const CELLAR: KindShape = { radius: 16, maxRooms: 11, depth: (older) => (older ? -1 : 0), rise: 0, way: 'ladder', inset: 0.55, entrance: footprint, carved: false, torches: true };

export const KIND_SHAPES: Readonly<Record<DungeonTemplate, KindShape>> = {
  cellar: CELLAR,
  barrow: CELLAR,
  // Water and rock: a storey below always (the water went down), the way up to the mouth a rock step with a ladder.
  cave: { ...CELLAR, maxRooms: 12, depth: () => -1, inset: 0.95, entrance: () => [3, 3], carved: true, torches: false },
  // A small foot and storeys going up, a cellar under its foot (an older layer's vault, if it has one).
  tower: { ...CELLAR, radius: 7, maxRooms: 10, depth: () => -1, rise: 2, way: 'door', entrance: () => [3, 3] },
};

export const shapeOf = (kind: DungeonTemplate): KindShape => KIND_SHAPES[kind];

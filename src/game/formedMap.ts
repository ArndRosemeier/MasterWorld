/**
 * A formed cave as the hero knows it, for the minimap below ground (D63, phase K5; pure): the 3 m squares of floor the
 * lantern has shown (a clear line from the hero's eye), by storey of 4 m. Same shape as game/dungeonMap.ts `DungeonSeen`,
 * which paints a built dungeon's cells; the keys are saved the same way ("i,j,storey").
 */
import type { FormedGround } from '../sim/formedGround';
import { SeenCells } from './dungeonMap';

/** The squares the map is made of (m), the storey's height (m) and how far the lantern shows (m). */
export const SQUARE = 3, STOREY = 4, LANTERN = 10;

export class FormedSeen extends SeenCells {
  private at = '';

  constructor(private readonly ground: FormedGround) {
    super();
  }

  /** The hero stands at (x, y, z) in the cave's frame (feet). */
  see(x: number, y: number, z: number): void {
    const here = `${Math.floor(x / SQUARE)},${Math.floor(z / SQUARE)},${Math.round(y / STOREY)}`;
    if (here === this.at) return;
    this.at = here;
    for (const p of this.ground.lit(x, y, z, LANTERN)) this.note(Math.floor(p.x / SQUARE), Math.floor(p.z / SQUARE), Math.round(p.y / STOREY));
  }
}

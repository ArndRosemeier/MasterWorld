/**
 * A formed cave as a dungeon's space (D63, phase K5), for the parts of the game that ask a `DungeonSpace` (the visit's walk
 * world, the hero's light, the HUD): its rock is the carved field and its floors come from it; the cellar layout beneath is
 * only the story's rooms (they have no doors here: a natural cave has none), and a room's place is its home in the cave.
 */
import { DungeonSpace, type SpaceEvent } from '../world/dungeon/space';
import type { ScaledLayout } from '../world/dungeon/cellar';
import { fieldAt, type BrickField } from '../world/dungeon/rockMesh';
import type { FormedGround } from './formedGround';

/** A room's home counts as the hero's place within this far of it (m). */
const NEAR_HOME = 14;

export class FormedSpace extends DungeonSpace {
  constructor(layout: ScaledLayout, readonly field: BrickField, readonly ground: FormedGround, private readonly homes: readonly { readonly x: number; readonly y: number; readonly z: number }[]) {
    super(layout);
  }

  override sdf(x: number, y: number, z: number): number { return fieldAt(this.field, x, y, z, -1); }

  override floorAt(x: number, z: number, y: number): number | null { return this.ground.floorAt(x, z, y); }

  /** One storey: the cave has no storeys of its own. */
  override levelAt(): number { return 0; }

  /** The room whose home is nearest to the hero (within `NEAR_HOME`), else none. */
  override ownerAt(x: number, y: number, z: number): number | undefined {
    let best: number | undefined, bd = NEAR_HOME;
    this.homes.forEach((h, i) => { const d = Math.hypot(h.x - x, h.z - z) + Math.abs(h.y - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Nothing is touched in a natural cave: no keys, no bars, no hidden doors. */
  override touch(): SpaceEvent[] { return []; }

  override unbar(): number[] { return []; }
}

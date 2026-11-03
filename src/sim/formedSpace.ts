/**
 * A formed cave as a dungeon's space (D63, phase K5), for the parts of the game that ask a `DungeonSpace` (the visit's walk
 * world, the hero's light, the HUD): its rock is the carved field and its floors come from it; the cellar layout beneath is
 * only the story's rooms (they have no doors here: a natural cave has none), and a room's place is its home in the cave.
 */
import { DungeonSpace, KEY_REACH, type SpaceEvent } from '../world/dungeon/space';
import { lockBox, shutAir, type CaveLock } from '../world/cave/locks';
import type { ScaledLayout } from '../world/dungeon/cellar';
import { fieldAt, type BrickField } from '../world/dungeon/rockMesh';
import type { CaveWaterAt } from '../world/cave/water';
import type { FormedGround } from './formedGround';

/** A room's home counts as the hero's place within this far of it (m). */
const NEAR_HOME = 14;
/** A shut lock is touched from this far off its box (m). */
const TOUCH = 1.6;
/** A lock that is opening stays solid this long (s), the time its piece takes on screen (CellarView: stones and boulders 0.9, a grate 1.2), so the hero waits for it and is never inside it. */
const OPENING = { oneway: 0.9, secret: 0.9, locked: 1.2 } as const;

/** Where a formed cave drips and runs (cave metres), for its sounds (K5): the drips that fall, and points along its streams. */
export interface CaveSounds {
  readonly drips: readonly (readonly [number, number, number])[];
  readonly streams: readonly (readonly [number, number, number])[];
}

export class FormedSpace extends DungeonSpace {
  constructor(layout: ScaledLayout, readonly field: BrickField, readonly ground: FormedGround, private readonly homes: readonly { readonly x: number; readonly y: number; readonly z: number }[], readonly sounds: CaveSounds = { drips: [], streams: [] }, readonly locks: readonly CaveLock[] = [], /** Where its streams and pools stand (cave metres), for the walker: none, none in it. */ readonly water: CaveWaterAt | null = null) {
    super(layout);
    this.shutNow = locks;
    this.ground.holdShut(locks);
  }

  override sdf(x: number, y: number, z: number): number { return shutAir(fieldAt(this.field, x, y, z, -1), this.shutNow, x, y, z); }

  /** The locks still shut. */
  private shutNow: readonly CaveLock[];

  override floorAt(x: number, z: number, y: number): number | null { return this.ground.floorAt(x, z, y); }

  /** One storey: the cave has no storeys of its own. */
  override levelAt(): number { return 0; }

  /** The room whose home is nearest to the hero (within `NEAR_HOME`), else none. */
  override ownerAt(x: number, y: number, z: number): number | undefined {
    let best: number | undefined, bd = NEAR_HOME;
    this.homes.forEach((h, i) => { const d = Math.hypot(h.x - x, h.z - z) + Math.abs(h.y - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Where room `room`'s key lies: on the floor at its home. */
  override keyAt(room: number): [number, number, number] {
    const h = this.homes[room];
    return [h.x, h.y, h.z];
  }

  /**
   * The body at (x, y, z) this frame (K6): a key is picked up where it lies (at its room's home), a wedged boulder is levered out from
   * its near side, a locked grate opens with its key and stacked stones are found by lingering by them. Returns what happened.
   */
  override touch(x: number, y: number, z: number, dt: number): SpaceEvent[] {
    const out: SpaceEvent[] = [];
    for (const [link, left] of this.unlatching) {
      if (left > dt) this.unlatching.set(link, left - dt);
      else { this.unlatching.delete(link); this.openLink(link); }
    }
    for (const l of this.locks) {
      if (l.kind === 'locked' && l.key !== undefined && !this.keys.has(l.key)) {
        const [kx, ky, kz] = this.keyAt(l.key);
        if (Math.hypot(kx - x, kz - z) < KEY_REACH && Math.abs(ky - y) < 1.5) { this.keys.add(l.key); out.push({ kind: 'key', link: l.link }); }
      }
      if (this.open.has(l.link) || this.unlatching.has(l.link) || lockBox(l, x, y + 0.9, z) > TOUCH) continue;
      const near = (x - l.x) * l.tx + (z - l.z) * l.tz < 0;
      if (l.kind === 'oneway' && near) this.unlatch(l, 'unbarred', out);
      else if (l.kind === 'locked' && l.key !== undefined && this.keys.has(l.key)) this.unlatch(l, 'unlocked', out);
      else if (l.kind === 'secret') {
        const t = (this.lingered.get(l.link) ?? 0) + dt;
        this.lingered.set(l.link, t);
        if (t > 1.5) this.unlatch(l, 'found', out);
      }
    }
    return out;
  }

  /** The locks being opened, and the seconds still to go before each stops being solid. */
  private readonly unlatching = new Map<number, number>();

  /** A lock opened: it is seen opening, and once its piece is done it is no longer solid and the creatures may go through. */
  private unlatch(l: CaveLock, kind: SpaceEvent['kind'], out: SpaceEvent[]): void {
    this.unlatching.set(l.link, OPENING[l.kind as keyof typeof OPENING] ?? 0.9);
    out.push({ kind, link: l.link });
  }

  override openLink(link: number): void {
    super.openLink(link);
    this.shutNow = this.locks.filter((k) => !this.open.has(k.link));
    this.ground.holdShut(this.shutNow);
  }

  /** Locks whose stones the hero has lingered by (s). */
  private readonly lingered = new Map<number, number>();

  override unbar(): number[] { return []; }
}

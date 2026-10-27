/**
 * Down in a cellar and back up (plan 7: a space of its own, deep under its house). Under a house one climbs
 * down through the hatch in its room and up the ladder again (app/hatchClimb.ts: the hero is seen on the
 * rungs, the screen dark only while the head passes through the floor); a barrow is walked into, its way
 * out walked to (a short fade). Inside, the walker walks the cellar's space, the sky is off and the hero's
 * lantern is lit; doors, bars and hidden ways are seen opening (CellarView), a key lying on a floor is knelt to
 * and picked up, and the things worth reading speak through short notes.
 */
import type { PointLight } from 'three/webgpu';
import { dungeonWorld } from '../game/dungeonWorld';
import type { WalkWorld } from '../game/walker';
import type { CellarView } from '../render/dungeon/CellarView';
import type { SkyView } from '../render/sky';
import type { WarmLights } from '../render/warmLights';
import { torchSpots } from '../world/dungeon/torches';
import { CELL, STOREY, type Cellar } from '../world/dungeon/cellar';
import { DungeonSpace, keySpot, type SpaceEvent } from '../world/dungeon/space';
import { SearchKneel } from './searchKneel';
import { WalkTo } from './walkTo';
import { Fade } from './fade';
import type { Notes } from './notes';
import type { CellarDiff } from './saveGame';
import type { Player } from './player';
import type { Ladder } from '@futuremagic/figure';
import type { TownBuilding } from '@futuremagic/settlement';

export class CellarVisit {
  inside = false;
  readonly space: DungeonSpace;
  readonly world: WalkWorld;
  private readonly fade = new Fade();
  private cooldown = 0;
  private readonly read = new Set<number>();
  /** Called after going down or coming up (the game autosaves then). */
  onSwap: (() => void) | null = null;
  /** Down (true) or up again (false), as the view swaps: the game leaves the land above out of the frame meanwhile. */
  onDepth: ((below: boolean) => void) | null = null;
  /** The house above, whose hatch the ladder climbs up to (null: a barrow's way out, walked to). */
  above: { readonly town: string; readonly house: TownBuilding } | null = null;

  constructor(
    readonly cellar: Cellar,
    /** Where the hero comes out when there is no room above (`up`): a house's door, a barrow's forecourt (x, z, yaw). */
    private readonly house: { readonly door: readonly [number, number, number] },
    private readonly view: CellarView,
    private readonly player: Player,
    private readonly lantern: PointLight,
    private readonly warm: WarmLights,
    private readonly sky: SkyView,
    private readonly notes: Notes,
    /** Its space, if not the layout's own (a cave's carved rock). */
    space?: DungeonSpace,
  ) {
    this.space = space ?? new DungeonSpace(cellar.layout);
    this.world = dungeonWorld(this.space, view.origin);
  }

  /** Go down (now: at once, no fade); `room` to stand in the middle of that room instead of at the ladder. */
  async enter(now = false, room?: number, before?: () => void): Promise<void> {
    await this.fade.swap(now, () => {
      before?.();
      this.goIn();
      const O = this.view.origin, h = this.cellar.hatch;
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      // Some kinds bring the hero in the middle of the entrance room (world/dungeon/kinds.ts).
      if (room === undefined && this.cellar.form.space.arriveMid) room = this.cellar.graph.entrance;
      if (room !== undefined && this.cellar.layout.rooms[room]) {
        const r = this.cellar.layout.rooms[room];
        this.player.teleport(O.x + (r.x + r.w / 2) * CELL, O.y + r.level * STOREY, O.z + (r.z + r.d / 2) * CELL, h.yaw);
      } else this.player.teleport(O.x + h.x - fx * 1.0, O.y + h.y, O.z + h.z - fz * 1.0, h.yaw);
    });
    if (!now) this.onSwap?.();
  }

  /** Down here now (the climb has the hero on the ladder; the screen is dark). */
  arrive(): void {
    this.goIn();
  }

  /** Up out of here now (the climb goes on up through the hatch above; the screen is dark). */
  depart(): void {
    this.goOut();
  }

  /** The ladder up to the hatch, in the world (rungs 0.32 m apart: world/dungeon/cellarMesh.ts). */
  get ladder(): Ladder {
    const O = this.view.origin, h = this.cellar.hatch, fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    const y = O.y + h.y;
    return { x: O.x + h.x - fx * 0.15, z: O.z + h.z - fz * 0.15, nx: fx, nz: fz, lo: y + 0.3, hi: y + 0.3 + 7 * 0.32, floor: y, halfWidth: 0.3, rim: false, rung: 0.32 };
  }

  /** The hero stands at the foot of the ladder up (to climb it: E). */
  get atLadder(): boolean {
    if (!this.inside || !this.above) return false;
    const l = this.ladder, w = this.player.walker.pos;
    return Math.hypot(w.x - l.x, w.z - l.z) < 1.4 && Math.abs(w.y - l.floor) < 0.8;
  }

  private goIn(): void {
    this.inside = true;
    this.view.group.visible = true;
    this.sky.indoors = true;
    this.onDepth?.(true);
    const O = this.view.origin;
    this.warm.lightTorches(torchSpots(this.cellar).map((t) => ({ x: O.x + t.x, y: O.y + t.y, z: O.z + t.z })));
  }

  private goOut(): void {
    this.inside = false;
    this.view.group.visible = false;
    this.sky.indoors = false;
    this.onDepth?.(false);
    this.lantern.intensity = 0;
    this.warm.lightTorches(null);
    this.cooldown = 2;
  }

  /** Out of a barrow's way, onto its forecourt. */
  async leave(): Promise<void> {
    await this.fade.swap(false, async () => {
      this.goOut();
      // Seen walking out of the doorway onto the forecourt (facing `yaw`, away from the place).
      const [x, z, yaw] = this.house.door, fx = -Math.sin(yaw), fz = -Math.cos(yaw), p = this.player;
      p.teleport(x - fx * WALK_OUT, undefined, z - fz * WALK_OUT, yaw);
      const walk = new WalkTo(p.walker.pos, { x: x + fx * 0.6, z: z + fz * 0.6 }, null, () => { if (p.puppet === walk) p.puppet = null; });
      p.puppet = walk;
    });
    this.onSwap?.();
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.fade.busy || this.player.offFoot) return;
    const w = this.player.walker, O = this.view.origin;
    // The way down is the hatch in the house's room (InteriorVisit).
    if (!this.inside) return;
    this.view.step(dt);
    if (this.kneel?.done) { if (this.player.puppet === this.kneel) this.player.puppet = null; this.kneel = null; }
    // The lantern, held up and a little ahead.
    this.lantern.intensity = 8;
    this.lantern.position.set(w.pos.x - Math.sin(w.yaw) * 0.4, w.pos.y + 1.9, w.pos.z - Math.cos(w.yaw) * 0.4);
    const lx = w.pos.x - O.x, ly = w.pos.y - O.y, lz = w.pos.z - O.z;
    for (const e of this.space.touch(lx, ly, lz, dt)) this.event(e);
    // Things worth reading, when close.
    for (const p of this.cellar.props) {
      if (p.clue === undefined || this.read.has(p.clue) || Math.hypot(p.x - lx, p.z - lz) > 1.5 || Math.abs(p.y - ly) > 1.5) continue;
      this.read.add(p.clue);
      this.notes.say(this.cellar.clues[p.clue].text, 9);
    }
    // A barrow's way out is walked to; a house's ladder is climbed (app/hatchClimb.ts).
    const h = this.cellar.hatch;
    if (!this.above && this.cooldown === 0 && Math.hypot(h.x - lx, h.z - lz) < 0.75 && Math.abs(h.y - ly) < 1) void this.leave();
  }

  /** What changed down here, for the save. */
  get diff(): CellarDiff {
    return { open: [...this.space.open], keys: [...this.space.keys], read: [...this.read] };
  }

  /** Lay a saved state over the fresh cellar. */
  restore(d: CellarDiff): void {
    for (const k of d.keys) { this.space.keys.add(k); this.view.keyTaken(k); }
    for (const l of d.open) { this.space.open.add(l); this.view.opened(l); }
    for (const r of d.read) this.read.add(r);
  }

  /** The house's door above, or the barrow's forecourt (x, z, yaw). */
  get houseDoor(): readonly [number, number, number] { return this.house.door; }

  /** Where the hero is, for the HUD. */
  get summary(): string {
    if (!this.inside) return '';
    const w = this.player.walker, O = this.view.origin;
    const owner = this.space.grid.owner(Math.floor((w.pos.x - O.x) / CELL), Math.floor((w.pos.z - O.z) / CELL), this.space.levelAt(w.pos.y - O.y));
    const r = owner !== undefined && owner >= 0 ? this.cellar.rooms[owner] : null;
    return r ? `below: ${r.use.name} (room ${r.id}, ${r.beat}, tension ${r.tension.toFixed(2)})` : 'below: a passage';
  }

  private event(e: SpaceEvent): void {
    // A way that opens is seen opening (CellarView), away from the hero: no line says so.
    const w = this.player.walker.pos, O = this.view.origin;
    if (e.kind !== 'key') { this.view.opened(e.link, [w.x - O.x, w.z - O.z]); return; }
    // A key lying there: the hero kneels to it and picks it up (unless something else plays the hero now).
    const room = this.cellar.layout.links.find((pl) => pl.link.id === e.link)?.link.key;
    if (room === undefined) return;
    const [kx, , kz] = keySpot(this.cellar.layout, room), p = this.player;
    if (p.puppet) { this.view.keyTaken(room); return; }
    const kneel = new SearchKneel(w, p.walker.yaw, { x: O.x + kx, z: O.z + kz }, null, () => this.view.keyTaken(room));
    p.puppet = kneel;
    this.kneel = kneel;
  }
  /** The hero kneeling to pick up a key (null: not). */
  private kneel: SearchKneel | null = null;
}

/** A place on the land is walked out of from this far inside its doorway, metres. */
const WALK_OUT = 1.0;

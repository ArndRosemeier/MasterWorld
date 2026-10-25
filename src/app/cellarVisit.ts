/**
 * Going down into the cellar and back up (plan 7, D38: a space of its own behind a door, a short fade).
 * Walk into the cellar house's door to go down; walk to the ladder under the hatch to come up. Inside,
 * the walker walks the cellar's space, the sky is off and the hero's lantern is lit; keys, bars, hidden
 * doors and the things worth reading speak through short notes.
 */
import { angleDiff } from '@futuremagic/core';
import type { PointLight } from 'three/webgpu';
import type { TownBuilding } from '@futuremagic/settlement';
import { dungeonWorld } from '../game/dungeonWorld';
import type { WalkWorld } from '../game/walker';
import type { CellarView } from '../render/dungeon/CellarView';
import type { SkyView } from '../render/sky';
import { CELL, STOREY, type Cellar } from '../world/dungeon/cellar';
import { DungeonSpace, type SpaceEvent } from '../world/dungeon/space';
import { Fade } from './fade';
import type { Notes } from './notes';
import type { CellarDiff } from './saveGame';
import type { Player } from './player';

export class CellarVisit {
  inside = false;
  readonly space: DungeonSpace;
  readonly world: WalkWorld;
  private readonly fade = new Fade();
  private cooldown = 0;
  private readonly read = new Set<number>();
  /** Called after going down or coming up (the game autosaves then). */
  onSwap: (() => void) | null = null;

  constructor(
    readonly cellar: Cellar,
    private readonly house: TownBuilding,
    private readonly view: CellarView,
    private readonly player: Player,
    private readonly lantern: PointLight,
    private readonly sky: SkyView,
    private readonly notes: Notes,
  ) {
    this.space = new DungeonSpace(cellar.layout);
    this.world = dungeonWorld(this.space, view.origin);
  }

  /** Go down (now: at once, no fade); `room` to stand in the middle of that room instead of at the ladder. */
  async enter(now = false, room?: number): Promise<void> {
    await this.fade.swap(now, () => {
      this.inside = true;
      this.view.group.visible = true;
      this.sky.indoors = true;
      const O = this.view.origin, h = this.cellar.hatch;
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      if (room !== undefined && this.cellar.layout.rooms[room]) {
        const r = this.cellar.layout.rooms[room];
        this.player.teleport(O.x + (r.x + r.w / 2) * CELL, O.y + r.level * STOREY, O.z + (r.z + r.d / 2) * CELL, h.yaw);
      } else this.player.teleport(O.x + h.x - fx * 1.0, O.y + h.y, O.z + h.z - fz * 1.0, h.yaw);
      this.notes.say(`You climb down into the cellar of ${this.cellar.house}.`);
    });
    if (!now) this.onSwap?.();
  }

  /** Back up through the hatch, out of the house's door. */
  async leave(): Promise<void> {
    await this.fade.swap(false, () => {
      this.inside = false;
      this.view.group.visible = false;
      this.sky.indoors = false;
      this.lantern.intensity = 0;
      const [x, z, yaw] = this.house.door;
      this.player.teleport(x - Math.sin(yaw) * 0.6, undefined, z - Math.cos(yaw) * 0.6, yaw);
      this.cooldown = 2;
    });
    this.onSwap?.();
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.fade.busy || this.player.flying) return;
    const w = this.player.walker, O = this.view.origin;
    if (!this.inside) {
      // Into the house's door: down to the cellar.
      const [x, z, yaw] = this.house.door;
      const speed = w.groundSpeed;
      if (this.cooldown === 0 && Math.hypot(w.pos.x - x, w.pos.z - z) < 0.9 && speed > 0.5 && Math.abs(angleDiff(w.yaw, yaw + Math.PI)) < 1.1) void this.enter();
      return;
    }
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
    const h = this.cellar.hatch;
    if (this.cooldown === 0 && Math.hypot(h.x - lx, h.z - lz) < 0.75 && Math.abs(h.y - ly) < 1) void this.leave();
  }

  /** What changed down here, for the save. */
  get diff(): CellarDiff {
    return { open: [...this.space.open], keys: [...this.space.keys], read: [...this.read] };
  }

  /** Lay a saved state over the fresh cellar. */
  restore(d: CellarDiff): void {
    for (const k of d.keys) this.space.keys.add(k);
    for (const l of d.open) { this.space.open.add(l); this.view.opened(l); }
    for (const r of d.read) this.read.add(r);
  }

  /** The house's door above (x, z, yaw). */
  get houseDoor(): readonly [number, number, number] { return this.house.door; }

  /** Where the hero is, for the HUD. */
  get summary(): string {
    if (!this.inside) return '';
    const w = this.player.walker, O = this.view.origin;
    const owner = this.space.grid.owner(Math.floor((w.pos.x - O.x) / CELL), Math.floor((w.pos.z - O.z) / CELL), this.space.levelAt(w.pos.y - O.y));
    const r = owner !== undefined && owner >= 0 ? this.cellar.rooms[owner] : null;
    return r ? `cellar: ${r.use.name} (room ${r.id}, ${r.beat}, tension ${r.tension.toFixed(2)})` : 'cellar: a passage';
  }

  private event(e: SpaceEvent): void {
    this.view.opened(e.link);
    const piece = e.link === this.cellar.pieceLink && this.cellar.setPiece.id === 'bricked-wall';
    const text = { key: 'You find a key on a nail by the door.', unlocked: 'The key turns, stiffly. The door gives.', unbarred: 'You lift the bar from its brackets. The way back is open.', found: piece ? 'The pale bricks give under your shoulder: a way through.' : 'A draught from the wall: a hidden door.' }[e.kind];
    this.notes.say(text);
  }
}


/**
 * Going into a building and out again (D38: a space of its own behind each door, a short fade). Walk
 * into a door to go in; walk back out through it to leave. Inside, the walker walks the room (its walls,
 * ceiling and furniture), the sky is off and one warm light hangs under the ceiling.
 */
import type { PointLight } from 'three/webgpu';
import { planInterior, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import { interiorWorld, roomFrame, type RoomFrame } from '../game/interiorWorld';
import type { WalkWorld } from '../game/walker';
import { ROOM_DEPTH, type InteriorView } from '../render/town/InteriorView';
import type { SkyView } from '../render/sky';
import { Fade, Note } from './fade';
import type { Player } from './player';

/** What a room is called when one walks in. */
const NAMES: Partial<Record<TownBuilding['kind'], string>> = { inn: 'the inn', smithy: 'the smithy', bakery: 'the bakery', temple: 'the temple', hall: 'the hall', mill: 'the mill', workshop: 'a workshop', stable: 'the stable' };

interface Room { b: TownBuilding; plan: InteriorPlan; frame: RoomFrame; world: WalkWorld }

export class InteriorVisit {
  private room: Room | null = null;
  private readonly fade = new Fade();
  private readonly note = new Note();
  private cooldown = 0;

  constructor(
    private readonly buildings: readonly TownBuilding[],
    /** Doors that lead elsewhere (the cellar house). */
    private readonly skip: ReadonlySet<number>,
    private readonly view: InteriorView,
    private readonly player: Player,
    private readonly light: PointLight,
    private readonly sky: SkyView,
  ) {}

  get inside(): boolean { return this.room !== null; }
  get world(): WalkWorld | null { return this.room?.world ?? null; }
  /** The building the player is in (-1: outside). */
  get building(): number { return this.room?.b.id ?? -1; }

  /** Into `b` (now: at once, no fade). */
  async enter(b: TownBuilding, now = false): Promise<void> {
    await this.fade.swap(now, async () => {
      const plan = planInterior(b), y = b.floorY + ROOM_DEPTH, frame = roomFrame(b, { x: b.cx, z: b.cz });
      await this.view.show(plan, b, y);
      this.room = { b, plan, frame, world: interiorWorld(plan, frame, y) };
      this.sky.indoors = true;
      // A light under the ceiling, nearer the back.
      const [lx, lz] = frame.toWorld(0, plan.hb * 0.2);
      this.light.position.set(lx, y + plan.height - 0.35, lz);
      this.light.intensity = 10;
      // Just inside the door, facing in (the walker's forward is (-sin yaw, -cos yaw)).
      const [x, z] = frame.toWorld(0, -plan.hb + 0.7);
      this.player.teleport(x, y, z, Math.atan2(-b.vx, -b.vz));
      this.note.say(`You step into ${NAMES[b.kind] ?? 'the house'}.`, 3);
    });
  }

  /** Back out of the door. */
  async leave(): Promise<void> {
    const r = this.room;
    if (!r) return;
    await this.fade.swap(false, () => {
      this.room = null;
      this.view.hide();
      this.sky.indoors = false;
      this.light.intensity = 0;
      const [x, z] = r.b.door;
      this.player.teleport(x, undefined, z, Math.atan2(r.b.vx, r.b.vz));
      this.cooldown = 1.5;
    });
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.note.update(dt);
    if (this.fade.busy || this.player.flying || this.cooldown > 0) return;
    const w = this.player.walker;
    const speed = Math.hypot(w.vel.x, w.vel.z);
    if (speed < 0.5) return;
    const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
    if (!this.room) {
      // Into a door: walking at it, facing in (along the building's v).
      for (const b of this.buildings) {
        if (this.skip.has(b.id) || Math.abs(b.door[0] - w.pos.x) > 1 || Math.abs(b.door[1] - w.pos.z) > 1) continue;
        if (Math.hypot(b.door[0] - w.pos.x, b.door[1] - w.pos.z) < 0.9 && fx * b.vx + fz * b.vz > 0.5) { void this.enter(b); return; }
      }
      return;
    }
    // Out of the door: at it, facing out.
    const { plan, frame, b } = this.room;
    const [a, bb] = frame.toRoom(w.pos.x, w.pos.z);
    if (Math.abs(a) < plan.doorW && bb < -plan.hb + 0.5 && fx * b.vx + fz * b.vz < -0.5) void this.leave();
  }

  get summary(): string {
    return this.room ? `in ${this.room.b.kind} #${this.room.b.id}` : '';
  }
}

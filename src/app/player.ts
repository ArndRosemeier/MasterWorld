/**
 * The player: the hero walking the land (Walker, HeroCamera, HeroView), riding a horse (Steed, HorseView),
 * or flying the free camera to look around (F, `?fly`). The hero waits where it was left while the camera
 * flies; landing puts it on the ground under the camera. The mount key gets on the nearest horse within
 * reach, and off again on its left.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { Walker, type WalkWorld } from '../game/walker';
import { nearestSteed, type Steed } from '../game/horse';
import type { HeroAction, HeroView } from '../render/hero/HeroView';
import type { HorseView } from '../render/horse/HorseView';
import { FlyCamera } from './flyCamera';
import { HeroCamera } from './heroCamera';
import { lookFromDegrees } from './look';

export class Player {
  readonly walker: Walker;
  readonly heroCam: HeroCamera;
  readonly fly: FlyCamera;
  /** Set once the hero's body is built. */
  hero: HeroView | null = null;
  /** In a fight: weapons drawn, and the blow (or drink, or flinch) playing; set by the fight each frame. */
  stance: { combat: boolean; action?: HeroAction } = { combat: false };
  /** The horses about, and how they are drawn (set once built; steeds[i] is drawn as horse i). */
  steeds: Steed[] = [];
  horses: HorseView | null = null;
  /** The horse the hero rides, or null on foot. */
  riding: Steed | null = null;
  private paused = false;
  private readonly seat = new Vector3();
  private flyingNow: boolean;
  private readonly head = new Vector3();

  constructor(private readonly camera: PerspectiveCamera, canvas: HTMLElement, private readonly world: WalkWorld, flying: boolean) {
    this.walker = new Walker(world);
    this.heroCam = new HeroCamera(camera, canvas, world);
    this.fly = new FlyCamera(camera, canvas, world.height);
    this.flyingNow = flying;
    this.applyInput();
  }

  get flying(): boolean { return this.flyingNow; }

  set flying(on: boolean) {
    if (on === this.flying) return;
    if (on) {
      this.dismount();
      this.fly.place(this.camera.position.x, this.camera.position.z, this.camera.position.y, true);
      this.fly.takeOver();
    } else {
      // Land under the camera, looking the way it looked.
      const p = this.camera.position;
      this.walker.place(p.x, p.z);
      this.heroCam.yaw = this.walker.yaw = this.fly.yaw;
      this.heroCam.pitch = Math.min(this.fly.pitch, 0.3);
      this.heroCam.trail(this.toHead(), 0);
    }
    this.flyingNow = on;
    this.applyInput();
  }

  /** A dialog is open: no keys or mouse for the game meanwhile. */
  pause(on: boolean): void {
    this.paused = on;
    this.applyInput();
  }

  private applyInput(): void {
    this.fly.active = this.flyingNow && !this.paused;
    this.heroCam.enabled = !this.flyingNow && !this.paused;
  }

  /**
   * Go somewhere: `pos` as `x,z` (on the ground) or `x,y,z`; `look` as `yaw,pitch` in degrees (yaw 0
   * north, 90 east). Flying, the camera goes there (1.7 m over the ground for `x,z`).
   */
  goTo(pos: readonly number[], look?: readonly number[] | null): void {
    const [x, a, b] = pos;
    const y = pos.length === 3 ? a : undefined, z = pos.length === 3 ? b : a;
    if (this.flying) {
      if (y === undefined) this.fly.place(x, z, this.world.height(x, z) + 1.7);
      else this.fly.place(x, z, y, true);
      if (look) this.fly.setLook(look[0], look[1] ?? 0);
      return;
    }
    this.dismount();
    this.walker.place(x, z, y);
    if (look) ({ yaw: this.heroCam.yaw, pitch: this.heroCam.pitch } = lookFromDegrees(look[0], look[1] ?? -10));
    this.walker.yaw = this.heroCam.yaw;
    this.heroCam.trail(this.toHead(), 0);
  }

  /**
   * The mount key: on the nearest horse within reach, or off the one ridden. Returns whether anything
   * happened (no horse near, flying or swimming: nothing).
   */
  toggleMount(): boolean {
    if (this.riding) return this.dismount();
    if (this.flying || this.walker.mode !== 'ground') return false;
    const s = nearestSteed(this.steeds, this.walker.pos.x, this.walker.pos.z);
    if (!s) return false;
    this.mount(s);
    return true;
  }

  /** On horse `s` at once (wherever it is). */
  mount(s: Steed): void {
    this.dismount();
    s.ridden = true;
    this.riding = s;
    this.walker.vel.x = this.walker.vel.y = this.walker.vel.z = 0;
    // The horse keeps its heading; the camera swings round behind it.
    this.heroCam.yaw = s.yaw;
    this.hero?.snap();
  }

  /** Off the horse, onto free ground beside it (left first). */
  dismount(): boolean {
    const s = this.riding;
    if (!s) return false;
    const w = this.world;
    const spot = s.dismountSpot((x, z, r) => !w.wall?.(x, z, r) && w.waterLevel(x, z) === null);
    s.ridden = false;
    this.riding = null;
    this.walker.place(spot.x, spot.z);
    this.walker.yaw = s.yaw;
    this.hero?.snap();
    return true;
  }

  /** Stand somewhere at once, facing `yaw` (a door, a ladder): y undefined stands on the ground. */
  teleport(x: number, y: number | undefined, z: number, yaw: number): void {
    this.dismount();
    this.walker.place(x, z, y);
    this.walker.yaw = this.heroCam.yaw = yaw;
    this.heroCam.trail(this.toHead(), 0);
  }

  /** Settle again where it stands (once the water is known). */
  resettle(): void {
    if (this.flying) return;
    const p = this.walker.pos;
    this.walker.place(p.x, p.z, p.y);
    this.heroCam.trail(this.toHead(), 0);
  }

  /** A talk's view, at (x, z) over the hero's shoulder (`on`), or the view from before it again. */
  frameTalk(on: boolean, x?: number, z?: number): void {
    if (!this.flying) this.heroCam.frameTalk(on, this.toHead(), x, z);
  }

  update(dt: number): void {
    const { walker, heroCam, riding } = this;
    if (this.flying) {
      this.fly.update(dt);
      this.standBy(dt);
      return;
    }
    if (riding) {
      const { intent, facing } = heroCam.intent(dt, riding.yaw);
      riding.travel(dt, intent, facing);
      // The hero's body goes where the horse goes (for the camera, the view's URL, the cellar's door).
      walker.pos.x = riding.pos.x; walker.pos.y = riding.pos.y; walker.pos.z = riding.pos.z;
      walker.yaw = riding.yaw;
    } else {
      const { intent, facing } = heroCam.intent(dt, walker.yaw);
      walker.yaw = facing;
      walker.step(intent, dt);
    }
    this.drawBodies(dt);
    heroCam.trail(this.toHead(), dt);
  }

  /** The hero stands and breathes where it was left, and the camera is someone else's (flying, the title). */
  standBy(dt: number): void {
    const walker = this.walker;
    if (!this.riding) walker.step({ forward: 0, strafe: 0, heading: walker.yaw, walk: false, up: false, down: false }, dt);
    this.drawBodies(dt);
  }

  /** Where the camera will be behind the hero (the camera itself is left where it is). */
  heroView(): { at: [number, number, number]; look: [number, number, number] } {
    const c = this.camera, at = c.position.clone(), q = c.quaternion.clone();
    this.heroCam.trail(this.toHead(), 0);
    const d = c.getWorldDirection(this.head.clone());
    const view = { at: [c.position.x, c.position.y, c.position.z] as [number, number, number], look: [c.position.x + d.x * 10, c.position.y + d.y * 10, c.position.z + d.z * 10] as [number, number, number] };
    c.position.copy(at);
    c.quaternion.copy(q);
    return view;
  }

  /** The horses (each its own step, the ridden one moved by the rider) and the hero, drawn where they are. */
  private drawBodies(dt: number): void {
    const { walker, hero, riding, horses } = this;
    for (const s of this.steeds) if (s !== riding) s.travel(dt);
    if (horses) {
      this.steeds.forEach((s, i) => {
        if (i < horses.drawn) horses.pose(i, { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw, act: s.gait, speed: s.speed }, dt);
      });
    }
    if (!hero) return;
    const ridden = riding && horses ? horses.saddle(this.steeds.indexOf(riding), this.seat) : null;
    if (riding && ridden) {
      // Seated on the saddle: pos is the point under it, the seat its height over the horse's ground.
      hero.animateTo({ pos: { x: ridden.x, y: riding.pos.y, z: ridden.z }, vel: riding.walker.vel, yaw: riding.yaw, gait: 'ride', seat: ridden.y - riding.pos.y }, dt);
    } else {
      hero.animateTo({ pos: walker.pos, vel: walker.vel, yaw: walker.yaw, gait: walker.gait, combat: this.stance.combat, action: this.stance.action }, dt);
    }
    hero.visible = this.flying || !this.heroCam.firstPerson;
  }

  /** Where the view is, as URL parameters (`pos=x,y,z&look=yaw,pitch`, degrees), to come back to it. */
  get viewParams(): string {
    const p = this.camera.position;
    const yaw = this.flying ? this.fly.yaw : this.heroCam.yaw, pitch = this.flying ? this.fly.pitch : this.heroCam.pitch;
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    const w = this.walker.pos;
    const pos = this.flying ? `${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}` : `${w.x.toFixed(0)},${w.z.toFixed(0)}`;
    return `${this.flying ? 'fly&' : ''}pos=${pos}&look=${((-deg(yaw) % 360) + 360) % 360},${deg(pitch)}`;
  }

  private toHead(): Vector3 {
    // Riding: over the saddle, the rider's head about 0.85 m above the seat.
    if (this.riding && this.horses) {
      const seat = this.horses.saddle(this.steeds.indexOf(this.riding), this.seat);
      if (seat) return this.head.set(seat.x, seat.y + this.walker.height * 0.48, seat.z);
    }
    const w = this.walker;
    return this.head.set(w.pos.x, w.pos.y + w.height * 0.92, w.pos.z);
  }
}

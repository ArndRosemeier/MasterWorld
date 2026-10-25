/**
 * The player: the hero walking the land (Walker, HeroCamera, HeroView), or flying the free camera to look
 * around (F, `?fly`). The hero waits where it was left while the camera flies; landing puts it on the
 * ground under the camera.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { Walker, type WalkWorld } from '../game/walker';
import type { HeroView } from '../render/hero/HeroView';
import { FlyCamera } from './flyCamera';
import { HeroCamera } from './heroCamera';
import { lookFromDegrees } from './look';

export class Player {
  readonly walker: Walker;
  readonly heroCam: HeroCamera;
  readonly fly: FlyCamera;
  /** Set once the hero's body is built. */
  hero: HeroView | null = null;
  private paused = false;
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
    this.walker.place(x, z, y);
    if (look) ({ yaw: this.heroCam.yaw, pitch: this.heroCam.pitch } = lookFromDegrees(look[0], look[1] ?? -10));
    this.walker.yaw = this.heroCam.yaw;
    this.heroCam.trail(this.toHead(), 0);
  }

  /** Stand somewhere at once, facing `yaw` (a door, a ladder): y undefined stands on the ground. */
  teleport(x: number, y: number | undefined, z: number, yaw: number): void {
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

  update(dt: number): void {
    const { walker, heroCam, hero } = this;
    if (this.flying) {
      this.fly.update(dt);
      // The hero stands and breathes where it was left.
      walker.step({ forward: 0, strafe: 0, heading: walker.yaw, walk: false, up: false, down: false }, dt);
    } else {
      const { intent, facing } = heroCam.intent(dt, walker.yaw);
      walker.yaw = facing;
      walker.step(intent, dt);
    }
    if (hero) {
      hero.update({ pos: walker.pos, vel: walker.vel, yaw: walker.yaw, gait: walker.gait }, dt, (x, y, z) => walker.support(x, z, y));
      hero.visible = this.flying || !heroCam.firstPerson;
    }
    if (!this.flying) heroCam.trail(this.toHead(), dt);
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
    const w = this.walker;
    return this.head.set(w.pos.x, w.pos.y + w.height * 0.92, w.pos.z);
  }
}

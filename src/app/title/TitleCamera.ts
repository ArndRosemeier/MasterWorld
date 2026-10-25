/**
 * The camera while the title is up: the seeded orbit over the start town (route.ts), swaying a little with
 * the pointer like a window onto the world, and at the end the dive down to the camera behind the hero.
 */
import { damp, type Vec3 } from '@futuremagic/core';
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { DIVE_SECONDS, divePose, orbitPose, type Orbit, type Pose } from './route';

export class TitleCamera {
  private t = 0;
  /** How close the orbit may come (0..1), raised as the near world is ready. */
  private near = 0;
  private nearWanted = 0;
  private readonly pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private dive: { from: Pose; to: Pose; u: number; done: () => void } | null = null;
  private readonly look = new Vector3();
  private readonly side = new Vector3();
  private readonly fov: number;

  constructor(private readonly camera: PerspectiveCamera, private readonly orbit: Orbit) {
    this.fov = camera.fov;
  }

  /** The pointer over the page, -1..1 each way (the view leans towards it). */
  point(x: number, y: number): void {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** The near world is ready: the orbit may come closer. */
  closer(): void {
    this.nearWanted = 1;
  }

  /** Where the camera is now (as a pose to dive from). */
  get pose(): Pose {
    const p = this.camera.position, d = this.camera.getWorldDirection(this.look);
    return { at: [p.x, p.y, p.z], look: [p.x + d.x * 100, p.y + d.y * 100, p.z + d.z * 100] };
  }

  /** Down to `to` (the camera behind the hero); `done` when it lands. */
  diveTo(to: Pose, done: () => void): void {
    this.dive = { from: this.pose, to, u: 0, done };
  }

  get diving(): boolean { return this.dive !== null; }

  fly(dt: number): void {
    const c = this.camera;
    const d = this.dive;
    if (d) {
      d.u = Math.min(1, d.u + dt / DIVE_SECONDS);
      const p = divePose(d.from, d.to, d.u);
      this.aim(p.at, p.look, 0);
      // The view widens in the fall and settles on landing.
      c.fov = this.fov + 14 * Math.sin(Math.PI * d.u);
      c.updateProjectionMatrix();
      if (d.u >= 1) {
        this.dive = null;
        c.fov = this.fov;
        c.updateProjectionMatrix();
        d.done();
      }
      return;
    }
    this.t += dt;
    this.near += (this.nearWanted - this.near) * Math.min(1, dt / 20);
    const k = damp(2, dt);
    this.pointer.sx += (this.pointer.x - this.pointer.sx) * k;
    this.pointer.sy += (this.pointer.y - this.pointer.sy) * k;
    const p = orbitPose(this.orbit, this.t, this.near);
    this.aim(p.at, p.look, 1);
  }

  /** Puts the camera at `at` looking at `look`, leaning with the pointer by `sway`. */
  private aim(at: Vec3, look: Vec3, sway: number): void {
    const c = this.camera;
    c.position.set(at[0], at[1], at[2]);
    this.look.set(look[0], look[1], look[2]);
    if (sway) {
      // Sideways and up by the pointer: a few degrees of lean.
      const dist = c.position.distanceTo(this.look);
      this.side.subVectors(this.look, c.position).cross(c.up).normalize();
      this.look.addScaledVector(this.side, this.pointer.sx * dist * 0.06 * sway);
      this.look.y -= this.pointer.sy * dist * 0.04 * sway;
    }
    c.lookAt(this.look);
  }
}

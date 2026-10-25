/**
 * Playing the hero (D13): WASD to move, A and D turn (and strafe while the right mouse button is held),
 * Q and E strafe, Shift walks, Space jumps (rises when swimming), X dives. Right mouse button held:
 * mouse look, the hero turns with the camera; left button held: the camera alone orbits the hero; both
 * buttons: run forward. The wheel zooms, all the way into first person. The camera stays out of the
 * ground and the rock.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { clamp, damp } from '@futuremagic/core';
import type { WalkIntent, WalkWorld } from '../game/walker';

/** Turn rate of the A and D keys, rad/s. */
const TURN = 2.6;
/** Mouse look, rad per pixel. */
const LOOK = 0.0035;
/** Zoom range (m from the head); below FIRST it is first person. */
const NEAR = 0, FAR = 18, FIRST = 0.6;

export class HeroCamera {
  /** The camera's own direction (rad): yaw as the walker's, pitch up positive. */
  yaw = 0;
  pitch = -0.18;
  /** Wanted distance from the head, and the one the camera is at (pulled in by ground and rock). */
  zoom = 5;
  private dist = 5;
  private readonly keys = new Set<string>();
  private lmb = false;
  private rmb = false;
  private readonly eye = new Vector3();

  constructor(private readonly camera: PerspectiveCamera, el: HTMLElement, private readonly world: WalkWorld) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) { this.rmb = true; void el.requestPointerLock?.(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) { this.rmb = false; document.exitPointerLock?.(); }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.lmb && !this.rmb) return;
      this.yaw -= e.movementX * LOOK;
      this.pitch = clamp(this.pitch - e.movementY * LOOK, -1.45, 1.4);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = this.zoom < FIRST && e.deltaY > 0 ? FIRST + 0.9 : clamp(this.zoom * (e.deltaY < 0 ? 0.85 : 1.18), NEAR, FAR);
      if (this.zoom < FIRST + 0.05 && e.deltaY < 0) this.zoom = 0;
    }, { passive: false });
  }

  /** In first person (the hero's body is not drawn). */
  get firstPerson(): boolean { return this.zoom < FIRST; }


  /**
   * Read the keys for this frame: what the hero wants, and the facing it turns to (`facing` the current
   * one). While the right button is held the hero faces where the camera looks.
   */
  intent(dt: number, facing: number): { intent: WalkIntent; facing: number } {
    const k = this.keys, has = (c: string) => k.has(c);
    let forward = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
    if (this.lmb && this.rmb) forward = 1;
    let strafe = (has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0);
    const turnKeys = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
    if (this.rmb) {
      strafe = clamp(strafe + turnKeys, -1, 1);
      facing = this.yaw;
    } else if (turnKeys) {
      // Keyboard turning carries the camera round with the hero.
      facing -= turnKeys * TURN * dt;
      this.yaw -= turnKeys * TURN * dt;
    }
    return {
      intent: { forward, strafe, heading: facing, walk: has('ShiftLeft') || has('ShiftRight'), up: has('Space'), down: has('KeyX') },
      facing,
    };
  }

  /** Place the camera behind the hero's head (`head` the point it orbits). */
  trail(head: Vector3, dt: number): void {
    const cp = Math.cos(this.pitch);
    const dir = new Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // As far back as wanted, short of ground and rock (with a margin), eased out again after.
    let free = this.zoom;
    const steps = Math.ceil(this.zoom / 0.25);
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.zoom;
      const x = head.x - dir.x * d, y = head.y - dir.y * d, z = head.z - dir.z * d;
      const rock = this.world.rockSurface(x, y, z);
      if (y < this.world.height(x, z) + 0.35 || (rock !== null && rock < 0.35)) { free = Math.max(0, d - 0.3); break; }
    }
    this.dist = free < this.dist ? free : this.dist + (free - this.dist) * damp(3, dt);
    this.eye.copy(head).addScaledVector(dir, -this.dist);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

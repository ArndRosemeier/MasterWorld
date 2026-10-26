/**
 * Playing the hero (D13): WASD to move, A and D turn (and strafe while the right mouse button is held),
 * Q and E strafe, R autoruns, Shift walks, Space jumps (rises when swimming), X dives (all rebindable,
 * src/input/controls.ts). Right mouse button held:
 * mouse look, the hero turns with the camera; left button held: the camera alone orbits the hero; both
 * buttons: run forward. The wheel zooms, all the way into first person. The camera stays out of the
 * ground and the rock.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { clamp, damp } from '@futuremagic/core';
import type { WalkIntent, WalkWorld } from '../game/walker';
import { Controls } from '../input/controls';

/** Turn rate of the A and D keys, rad/s. */
const TURN = 2.6;
/** Mouse look, rad per pixel. */
const LOOK = 0.0035;
/** Zoom range (m from the head); below FIRST it is first person. */
const NEAR = 0, FAR = 18, FIRST = 0.6;
/** A talk's view: this far behind the head at most, looking this much down (rad). */
const TALK_ZOOM = 2.4, TALK_PITCH = -0.25;

export class HeroCamera {
  /** The camera's own direction (rad): yaw as the walker's, pitch up positive. */
  yaw = 0;
  pitch = -0.18;
  /** Wanted distance from the head, and the one the camera is at (pulled in by ground and rock). */
  zoom = 5;
  private dist = 5;
  readonly controls = new Controls();
  /** Mouse look speed (times the default) and up-down inverted (from the settings). */
  mouseSpeed = 1;
  invertMouse = false;
  private on = true;
  private lmb = false;
  private rmb = false;
  private readonly eye = new Vector3();

  constructor(private readonly camera: PerspectiveCamera, el: HTMLElement, private readonly world: WalkWorld) {
    window.addEventListener('keydown', (e) => { if (this.on && !e.repeat) this.controls.press(e.code); });
    window.addEventListener('keyup', (e) => this.controls.release(e.code));
    window.addEventListener('blur', () => this.letGo());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (!this.on) return;
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) { this.rmb = true; void el.requestPointerLock?.(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) { this.rmb = false; document.exitPointerLock?.(); }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.lmb && !this.rmb) return;
      const look = LOOK * this.mouseSpeed;
      this.yaw -= e.movementX * look;
      this.pitch = clamp(this.pitch - e.movementY * look * (this.invertMouse ? -1 : 1), -1.45, 1.4);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.on) return;
      this.zoom = this.zoom < FIRST && e.deltaY > 0 ? FIRST + 0.9 : clamp(this.zoom * (e.deltaY < 0 ? 0.85 : 1.18), NEAR, FAR);
      if (this.zoom < FIRST + 0.05 && e.deltaY < 0) this.zoom = 0;
    }, { passive: false });
  }

  /** Off while a dialog is open: keys and buttons are let go (autorun keeps going). */
  set enabled(on: boolean) {
    this.on = on;
    if (!on) this.letGo();
  }

  private letGo(): void {
    this.controls.clear();
    if (this.rmb) document.exitPointerLock?.();
    this.lmb = this.rmb = false;
  }

  /** In first person (the hero's body is not drawn). */
  /** Seen from the eyes: zoomed in, or pulled in that close by walls (a small room). */
  get firstPerson(): boolean { return this.zoom < FIRST || this.dist < FIRST; }


  /**
   * Read the keys for this frame: what the hero wants, and the facing it turns to (`facing` the current
   * one). While the right button is held the hero faces where the camera looks.
   */
  intent(dt: number, facing: number): { intent: WalkIntent; facing: number } {
    const c = this.controls;
    let forward = c.axis('back', 'forward');
    if ((this.lmb && this.rmb) || c.autorun) forward = 1;
    let strafe = c.axis('strafeLeft', 'strafeRight');
    const turnKeys = c.axis('turnLeft', 'turnRight');
    if (this.rmb) {
      strafe = clamp(strafe + turnKeys, -1, 1);
      facing = this.yaw;
    } else if (turnKeys) {
      // Keyboard turning carries the camera round with the hero.
      facing -= turnKeys * TURN * dt;
      this.yaw -= turnKeys * TURN * dt;
    }
    return {
      intent: { forward, strafe, heading: facing, walk: c.held('walk'), up: c.held('jump'), down: c.held('dive') },
      facing,
    };
  }

  /** Before a talk: the zoom and pitch it had. */
  private beforeTalk: { zoom: number; pitch: number } | null = null;

  /**
   * A talk's view (`on`), looking at (x, z) over the hero's shoulder from close behind and above, so
   * that people in between (a room's drinkers) and a counter do not hide the one talked to; off: back
   * to the view before.
   */
  frameTalk(on: boolean, head: Vector3, x = 0, z = 0): void {
    if (on) {
      this.beforeTalk ??= { zoom: this.zoom, pitch: this.pitch };
      this.yaw = Math.atan2(head.x - x, head.z - z);
      this.zoom = Math.min(this.zoom, TALK_ZOOM);
      this.pitch = TALK_PITCH;
    } else if (this.beforeTalk) {
      ({ zoom: this.zoom, pitch: this.pitch } = this.beforeTalk);
      this.beforeTalk = null;
    }
    this.dist = this.zoom;
    this.trail(head, 0);
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

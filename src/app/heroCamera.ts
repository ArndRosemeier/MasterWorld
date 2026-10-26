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
/** A talk's view (m): this far above the aim (about eye height, under a room's wall tops), and at least this far above the hero's head. */
const TALK_UP = 0.3, TALK_OVER_HEAD = 0.1;
/**
 * The shots tried for a talk, best first: back and to the right (m). Never straight behind: there the hero's
 * head (a hood, a helmet) fills the bottom middle of the frame.
 */
const TALK_SHOTS: readonly (readonly [number, number])[] = [[1.3, 0.45], [1.3, -0.45], [1.6, 0.7], [1.6, -0.7], [1.0, 0.8], [1.0, -0.8], [0.8, 0.45], [0.8, -0.45]];

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

  /** The cosine of half the frame's width, as an angle seen from the camera (a little beyond its edge). */
  private get frameCos(): number {
    const half = Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    return Math.cos(Math.min(1.5, half + 0.1));
  }

  /** In a talk: the camera holds the talk's view (`frameTalk`) instead of trailing. */
  private talking = false;
  /** The talk's shot as chosen (back, side, how much is in the way), for checks. */
  talkShot: { back: number; side: number; hits: number } | null = null;

  /**
   * A talk's view (`on`): close over the hero's right shoulder and above the heads, looking at `at` (the
   * one talked to, about chest high), so that neither people behind the hero (a room's drinkers), nor a
   * counter in front, nor the posts of an open front hide them, and as few of `others` (the people about)
   * as can be stand between. Off: trailing again as before.
   */
  frameTalk(on: boolean, head: Vector3, at?: Vector3, others: readonly { x: number; z: number }[] = []): void {
    this.talking = on && !!at;
    if (!this.talking || !at) { this.trail(head, 0); return; }
    const dx = at.x - head.x, dz = at.z - head.z, len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    // Over the right shoulder, else the shot least in the way of walls and posts: the fewest touched at
    // the camera, on the way to the hero's head (short of it: the hero may stand against a wall), and on
    // the near half of the way to the one talked to (a counter may stand in the far half).
    const hits = (x: number, z: number): number => {
      const wallHit = (px: number, pz: number, r: number) => (this.world.wall?.(px, pz, r) ? 1 : 0);
      let n = wallHit(x, z, 0.3) * 3;
      for (let t = 0.1; t < 0.75; t += 0.1) n += wallHit(x + (head.x - x) * t, z + (head.z - z) * t, 0.08) + wallHit(x + (at.x - x) * t * 0.6, z + (at.z - z) * t * 0.6, 0.08);
      // Others between the camera and the one talked to, in the frame (some way in from its edge).
      const ax = at.x - x, az = at.z - z, far = Math.hypot(ax, az);
      for (const o of others) {
        const ox = o.x - x, oz = o.z - z, d = Math.hypot(ox, oz);
        if (d > 0.3 && d < far && (ax * ox + az * oz) / (far * d) > this.frameCos) n += 10;
      }
      return n;
    };
    let back = 0, side = 0, least = Infinity;
    for (const [b, sd] of TALK_SHOTS) {
      const n = hits(head.x - fx * b - fz * sd, head.z - fz * b + fx * sd);
      if (n < least) { least = n; back = b; side = sd; }
      if (!n) break;
    }
    this.talkShot = { back, side, hits: least };
    const eye = new Vector3(head.x - fx * back - fz * side, Math.max(head.y + TALK_OVER_HEAD, at.y + TALK_UP), head.z - fz * back + fx * side);
    // Under a ceiling: down until clear of it.
    for (let i = 0; i < 8; i++) {
      const rock = (this.world.sightSurface ?? this.world.rockSurface)(eye.x, eye.y, eye.z);
      if (rock === null || rock >= 0.3) break;
      eye.y -= 0.1;
    }
    this.camera.position.copy(eye);
    this.camera.lookAt(at);
  }

  /** Place the camera behind the hero's head (`head` the point it orbits). */
  trail(head: Vector3, dt: number): void {
    if (this.talking) return;
    const cp = Math.cos(this.pitch);
    const dir = new Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // As far back as wanted, short of ground and rock (with a margin), eased out again after.
    let free = this.zoom;
    const steps = Math.ceil(this.zoom / 0.25);
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.zoom;
      const x = head.x - dir.x * d, y = head.y - dir.y * d, z = head.z - dir.z * d;
      const rock = (this.world.sightSurface ?? this.world.rockSurface)(x, y, z);
      if (y < this.world.height(x, z) + 0.35 || (rock !== null && rock < 0.35)) { free = Math.max(0, d - 0.3); break; }
    }
    this.dist = free < this.dist ? free : this.dist + (free - this.dist) * damp(3, dt);
    this.eye.copy(head).addScaledVector(dir, -this.dist);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

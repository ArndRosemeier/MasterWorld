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
/** The top of a hood or helmet above the head point (m), and how far a talk's view may rise to leave it out of the shot. */
const TALK_HEAD_TOP = 0.15, TALK_RISE = 0.8;
/**
 * The shots tried for a talk, best first: back and to the right (m). Never straight behind: there the hero's
 * head (a hood, a helmet) fills the bottom middle of the frame.
 */
const TALK_SHOTS: readonly (readonly [number, number])[] = [[1.3, 0.45], [1.3, -0.45], [1.6, 0.7], [1.6, -0.7], [1.0, 0.8], [1.0, -0.8], [0.8, 0.45], [0.8, -0.45]];

/** A held shot's distances from what it shows (m; the first the best), and its heights over its floor. */
const SHOT_OFF = [2.2, 1.8, 2.7, 1.4], SHOT_UP = [1.9, 1.6, 2.2];
/** A held shot's camera this far from any wall (m); and nothing within SHOT_NEAR of it across its frame (the turns, rad). */
const SHOT_CLEAR = 0.45, SHOT_NEAR = 1.2, SHOT_EDGES = [-0.55, -0.3, 0.3, 0.55];

/** A scene played out, seen from a held camera (HeroCamera.hold). World coordinates. */
export interface Shot {
  /** What the scene is round, on its floor (a hatch, a ladder's foot): the camera's spot is chosen for it. */
  readonly round: Vector3;
  /** Where the camera looks (the hero's chest). */
  readonly at: Vector3;
  /** How much worse it is seen from the side (dx, dz) of `round` (a lid in the way, the hero's back). */
  cost?(dx: number, dz: number): number;
}

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
    const sight = this.world.sightSurface ?? this.world.rockSurface;
    const clear = () => { const rock = sight(eye.x, eye.y, eye.z); return rock === null || rock >= 0.3; };
    // Under a ceiling: down until clear of it.
    for (let i = 0; i < 8 && !clear(); i++) eye.y -= 0.1;
    // Up while the top of the hero's head (a hood, a helmet) is in the shot, as far as the room allows: from
    // close behind, the head would fill the bottom of the frame.
    const top = new Vector3(head.x, head.y + TALK_HEAD_TOP, head.z);
    for (let i = 0; i < TALK_RISE / 0.1; i++) {
      this.aimTalk(eye, at);
      const p = top.clone().project(this.camera);
      if (p.y < -1.05 || Math.abs(p.x) > 1.05) break;
      eye.y += 0.1;
      if (!clear()) { eye.y -= 0.1; break; }
    }
    this.aimTalk(eye, at);
  }

  private aimTalk(eye: Vector3, at: Vector3): void {
    this.camera.position.copy(eye);
    this.camera.lookAt(at);
    this.camera.updateMatrixWorld();
  }

  /** A held shot (Puppet.shot): the spot chosen for the scene it shows, and where it looks (eased). */
  private held: { round: Vector3; eye: Vector3; look: Vector3 } | null = null;

  /**
   * Show a scene played out (Puppet.shot): the camera stands still at a clear spot some way off `shot.round` (a
   * hatch, a ladder's foot; y its floor), a little over head height, and follows `shot.at` with its look. A
   * room is too small to trail the hero in (the camera would be pulled into first person). Afterwards the
   * trailing camera goes on from there.
   */
  hold(shot: Shot, dt: number): void {
    this.talking = false;
    const h = this.held && this.held.round.equals(shot.round) ? this.held : (this.held = { round: shot.round.clone(), eye: this.spotFor(shot), look: shot.at.clone() });
    h.look.lerp(shot.at, dt > 0 ? damp(5, dt) : 1);
    this.camera.position.copy(h.eye);
    this.camera.lookAt(h.look);
    this.camera.updateMatrixWorld();
    const dx = h.look.x - h.eye.x, dy = h.look.y - h.eye.y, dz = h.look.z - h.eye.z, len = Math.hypot(dx, dy, dz) || 1;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.asin(dy / len);
    this.dist = Math.max(this.dist, FIRST + 0.1);
  }

  /** The held shot is over: the next one chooses its spot anew. */
  release(): void { this.held = null; }

  /** The clearest spot round `shot.round` to watch it from: out of walls, with a free line to it, best side first. */
  private spotFor(shot: Shot): Vector3 {
    const sight = this.world.sightSurface ?? this.world.rockSurface, r = shot.round;
    const open = (x: number, y: number, z: number, m: number) => { const d = sight(x, y, z); return d === null || d >= m; };
    const aim = new Vector3(r.x, r.y + 0.7, r.z);
    let best = new Vector3(r.x, r.y + SHOT_UP[0], r.z), least = Infinity;
    for (const dist of SHOT_OFF) for (const up of SHOT_UP) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const p = new Vector3(r.x + dx * dist, r.y + up, r.z + dz * dist);
      if (!open(p.x, p.y, p.z, SHOT_CLEAR) || this.world.wall?.(p.x, p.z, SHOT_CLEAR, r.y)) continue;
      let cost = shot.cost?.(dx, dz) ?? 0;
      for (let t = 0.1; t < 0.95; t += 0.1) if (!open(p.x + (aim.x - p.x) * t, p.y + (aim.y - p.y) * t, p.z + (aim.z - p.z) * t, 0.05)) cost += 10;
      // Nothing close across the frame either (a chimney breast, a wall's corner beside the camera fills a third of it).
      const ax = aim.x - p.x, az = aim.z - p.z, al = Math.hypot(ax, az) || 1;
      for (const turn of SHOT_EDGES) {
        const c = Math.cos(turn), sn = Math.sin(turn), rx = (ax * c - az * sn) / al, rz = (ax * sn + az * c) / al;
        for (let d = 0.3; d <= SHOT_NEAR; d += 0.3) {
          const x = p.x + rx * d, z = p.z + rz * d;
          if (!open(x, p.y - d * 0.4, z, 0.05) || this.world.wall?.(x, z, 0.05, r.y)) { cost += 3; break; }
        }
      }
      cost += Math.abs(dist - SHOT_OFF[0]) * 0.5 + Math.abs(up - SHOT_UP[0]);
      if (cost < least) { least = cost; best = p; }
    }
    return best;
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

/**
 * The player's body in the world (pure, no three.js): walking on the height field and over rock volumes,
 * blocked by rock walls and slopes too steep to climb, jumping and falling, wading and swimming, climbing
 * rock that offers holds (D56: up, down and along a face, over its top with a pull-up, letting go when spent).
 * The input says where the player wants to go; the walker decides where the body ends up.
 *
 * Facing (`yaw`) follows the humanoid's convention: the model's −z turned by yaw about +y, so yaw 0 faces
 * north (−z) and yaw π/2 faces west (−x).
 */
import { clamp, damp } from '@futuremagic/core';

/** What the walker needs to know of the world around it. */
export interface WalkWorld {
  /** Height field ground, metres. */
  height(x: number, z: number): number;
  /** Rock volumes with their ground as a signed distance (positive in air); null away from them. */
  rockSurface(x: number, y: number, z: number): number | null;
  /** Calm water surface level here, or null where there is no water. */
  waterLevel(x: number, z: number): number | null;
  /**
   * Built floors to stand on (steps, porches), world y, or null: climbed a step at a time, unlike a steep slope. With
   * `y` (the feet's height) a floor that has another over it (a ship's cabin under its castle's deck) is the one a step
   * over the feet or below; a floor high over the feet may be left out (a deck over a swimmer is not under them).
   */
  floor?(x: number, z: number, y?: number): number | null;
  /** What the camera keeps clear of, if not `rockSurface` (a building one is in: its doorway shut too, so the camera stays in the room). */
  sightSurface?(x: number, y: number, z: number): number | null;
  /** Walls (buildings, furniture): does a body of radius `r` at (x, z), its feet at `y` (the storey it is on), touch one? */
  wall?(x: number, z: number, r: number, y?: number): boolean;
  /** A rock face with holds to climb by at (x, z): the way into it (a unit vector); null where none (D56). */
  climbable?(x: number, z: number): { readonly nx: number; readonly nz: number } | null;
  /** The rock itself offers holds wherever it stands as a wall (a cave's broken rock): climbed by its faces in `rockSurface`. */
  rockHolds?(): boolean;
  /**
   * Living bodies (foes, wardens): does a body of radius `r` at (x, z), feet at `y`, press into one? One already
   * touching where the asker stands now, (ax, az), lets it go, so a walker is never stuck in another.
   */
  bodies?(x: number, z: number, r: number, y: number, ax: number, az: number): boolean;
}

/** What the player wants this frame. */
export interface WalkIntent {
  /** Forward (+1) and back (−1), relative to `heading`. */
  forward: number;
  /** Right (+1) and left (−1). */
  strafe: number;
  /** Which way "forward" is (rad, the yaw convention above): usually the facing. */
  heading: number;
  /** Walk instead of run. */
  walk: boolean;
  /** Jump on land; rise while swimming. */
  up: boolean;
  /** Dive while swimming. */
  down: boolean;
  /** How much of its speed the ground lets it make (0..1; a horse off the road). Default 1. */
  pace?: number;
}

/** `climb`: on a rock face; `pull`: pulling up over its top. */
export type WalkMode = 'ground' | 'air' | 'swim' | 'climb' | 'pull';

/** Speeds (m/s) and the body of something that walks (the hero's, a horse's in game/horse.ts). */
export interface WalkSpec {
  run: number; walk: number; back: number; swim: number; swimSlow: number; jump: number; gravity: number;
  height: number; radius: number; step: number; snap: number; maxSlope: number;
  /** How quickly the speed answers the input on the ground (1/s). */
  grip: number;
  /** Climbing speed up a face (m/s); none: it does not climb. */
  climb?: number;
}

/** Seconds to pull up over the top of a face (as @futuremagic/figure's ledge). */
export const PULL_UP = 1.5;
/** The top of a face comes to this share of the body's height over the feet when the pull-up starts. */
const PULL_RISE = 0.5;
/** The body hangs this far off the face (m). */
const OFF_FACE = 0.35;
/** Pushing into a climbable face this long starts a climb (s): no climb by brushing past. */
const GRIP_ON = 0.25;

/** The hero's. */
export const WALK: WalkSpec = {
  run: 5.2,
  walk: 1.7,
  /** Backwards is slower. */
  back: 0.6,
  swim: 2.3,
  swimSlow: 1.1,
  jump: 4.6,
  gravity: 9.81,
  /** Height of the body, metres (the hero sets its own). */
  height: 1.78,
  radius: 0.32,
  /** Steps up to this high are walked; drops up to `snap` are followed without falling. */
  step: 0.45,
  snap: 0.5,
  /** Ground steeper than this (rise over run) cannot be walked up. */
  maxSlope: 1.25,
  grip: 12,
  climb: 0.85,
};

export class Walker {
  readonly pos = { x: 0, y: 0, z: 0 };
  readonly vel = { x: 0, y: 0, z: 0 };
  /** Facing (rad). */
  yaw = 0;
  mode: WalkMode = 'ground';
  /** Body height, metres. */
  height: number;
  /** How long (s) the body has been asked to walk on the ground and has not got anywhere. */
  stuckFor = 0;
  /** Climbing: the way into the face (unit), the feet's height where the climb began, and the pull-up's way. */
  readonly face = { nx: 0, nz: 0, from: 0 };
  readonly pull = { t: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
  /** Climbing costs strength: asked each climbing frame with the effort (0..1); false: spent, the body lets go. */
  tire: ((dt: number, effort: number) => boolean) | null = null;
  /** Metres the body fell before it last landed (the game reads it, hurts, and sets it back to 0). */
  fell = 0;
  /** Highest point of the fall under way. */
  private airTop = -Infinity;
  /** How long it has pushed into a climbable face. */
  private pushing = 0;

  constructor(private readonly world: WalkWorld, readonly spec: WalkSpec = WALK) {
    this.height = spec.height;
  }

  /** Stand at a point, on whatever ground is there (or float, in deep water). */
  place(x: number, z: number, y?: number): void {
    const g = this.support(x, z, y ?? 1e5);
    this.pos.x = x; this.pos.z = z; this.pos.y = y ?? g;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.stuckFor = 0;
    this.mode = this.pos.y > g + 0.05 ? 'air' : 'ground';
    this.settleInWater();
  }

  /**
   * The ground under a point: the height field, or the top of rock found going down from a step above
   * `y` (so the walker can stand on an arch and walk under it).
   */
  support(x: number, z: number, y: number): number {
    const h = Math.max(this.world.height(x, z), this.world.floor?.(x, z, y) ?? -Infinity);
    let s = y + this.spec.step;
    if (s <= h) return h;
    for (let i = 0; i < 48; i++) {
      const d = this.world.rockSurface(x, s, z);
      if (d === null) return h;
      if (d < 0.03) return Math.max(h, s - d);
      s -= Math.max(0.03, d * 0.9);
      if (s <= h) return h;
    }
    return Math.max(h, s);
  }

  /** Whether a built floor at (x, z) stands over the height field there (one walks on it, not on the land below). */
  private onFloor(x: number, z: number): boolean {
    const f = this.world.floor?.(x, z) ?? null;
    return f !== null && f >= this.world.height(x, z);
  }

  /** How deep the body is in a wall at (x, z), feet at y (m; 0: clear): its radius less the widest that is clear there. */
  private wallDepth(x: number, y: number, z: number): number {
    const w = this.world.wall, r = this.spec.radius;
    if (!w || !w(x, z, r, y)) return 0;
    let lo = 0, hi = r;
    for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (w(x, z, m, y)) hi = m; else lo = m; }
    return r - lo;
  }

  /** Whether the body would be in rock at (x, z) with its feet at y. */
  private bodyInRock(x: number, y: number, z: number): boolean {
    if (this.world.wall?.(x, z, this.spec.radius, y)) return true;
    if (this.world.bodies?.(x, z, this.spec.radius, y, this.pos.x, this.pos.z)) return true;
    return this.clearance(x, y, z) < this.spec.radius;
  }

  /** How far the body's middle is from rock at (x, z), its feet at y (less than its radius: it is in it). */
  private clearance(x: number, y: number, z: number): number {
    let c = Infinity;
    for (const k of [0.75, 1.3, this.height - this.spec.radius]) {
      const d = this.world.rockSurface(x, y + k, z);
      if (d !== null) c = Math.min(c, d);
    }
    return c;
  }

  /** Where the water surface is, if the body is in it deep enough to swim; else null. */
  private swimLevel(x: number, z: number, feet: number): number | null {
    const w = this.world.waterLevel(x, z);
    return w !== null && w > feet + this.height * 0.6 ? w : null;
  }

  /** The feet's height when floating at the surface (treading water, the head out; swimming, the back at the surface). */
  private floatAt(level: number): number {
    return level - this.height * 0.56;
  }

  private settleInWater(): void {
    const w = this.swimLevel(this.pos.x, this.pos.z, this.pos.y);
    if (w !== null) {
      this.mode = 'swim';
      this.pos.y = Math.max(this.pos.y, this.floatAt(w));
    }
  }

  step(intent: WalkIntent, dt: number): void {
    dt = Math.min(dt, 0.1);
    if (this.mode === 'climb' || this.mode === 'pull') { this.climbStep(intent, dt); return; }
    const p = this.pos, v = this.vel;
    const swim = this.mode === 'swim';
    // What the input asks for, in world xz.
    const sh = Math.sin(intent.heading), ch = Math.cos(intent.heading);
    let fx = -sh * intent.forward + ch * intent.strafe, fz = -ch * intent.forward - sh * intent.strafe;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const speed = (swim ? (intent.walk ? this.spec.swimSlow : this.spec.swim) : intent.walk ? this.spec.walk : this.spec.run) * (intent.forward < 0 ? this.spec.back : 1) * (intent.pace ?? 1);
    // Quick to answer on the ground, slow to change course in the air, smooth in the water.
    const a = damp(this.mode === 'ground' ? this.spec.grip : swim ? 3.5 : 1.2, dt);
    v.x += (fx * speed - v.x) * a;
    v.z += (fz * speed - v.z) * a;

    // Across: blocked by rock (try each axis alone, to slide along a wall) and by too steep a slope. A body
    // already in something (placed against a tree) may move, so it can walk out.
    const stuck = this.bodyInRock(p.x, p.y, p.z), held = stuck ? this.clearance(p.x, p.y, p.z) : Infinity;
    const walled = stuck ? this.wallDepth(p.x, p.y, p.z) : 0;
    const tryMove = (nx: number, nz: number): boolean => {
      // Out, not further in (else it walks into the rock and up its face, or into the wall itself), unless going down
      // a step (the body sinks as it moves on: a tall head under a low edge on the way down a stair).
      if (stuck && this.clearance(nx, p.y, nz) < held - 1e-4 && !(this.mode === 'ground' && this.floorAhead(nx, nz) < p.y - 0.01)) return false;
      // In a wall (a ship's rail or hull that moved onto it): out of it, never on through it.
      if (stuck && walled > 0 && this.wallDepth(nx, p.y, nz) > walled + 1e-3) return false;
      // Going down a step the body sinks as it moves on, so the head is tested at the lower floor too
      // (else a tall body under a low edge climbs a stair it can never come down again).
      if (!stuck && this.bodyInRock(nx, p.y, nz)) {
        const ahead = this.mode === 'ground' ? this.floorAhead(nx, nz) : p.y;
        if (ahead >= p.y - 1e-3) return false;
        // Sinking up to a step (not into the step ahead's own block, nor deeper than the floor ahead).
        const low = Math.max(ahead, p.y - this.spec.step);
        if ([this.support(nx, nz, p.y), (p.y + low) / 2, low].every((y) => y >= p.y - 1e-3 || this.bodyInRock(nx, y, nz))) return false;
      }
      // In the air the body goes over an edge only with its feet near the top (a step under them): never lifted
      // onto a ledge it did not jump high enough for (the knees clear of it, the feet still under it).
      if (this.mode === 'air' && this.support(nx, nz, p.y) > p.y + this.spec.step) return false;
      if (this.mode === 'ground') {
        const run = Math.hypot(nx - p.x, nz - p.z);
        const rise = this.support(nx, nz, p.y) - p.y;
        if (run > 1e-6 && rise > this.spec.step && rise / run > this.spec.maxSlope) return false;
        // The height field alone is too steep here (a step up of slope, not a ledge), unless a floor stands
        // over it (a bridge's deck over a brook's steep bank).
        // Steep is steep whichever way one goes up it (no zigzag up a cliff): the ground's own slope there.
        const hf = this.world.height(nx, nz) - this.world.height(p.x, p.z);
        if (run > 1e-6 && hf > 0 && (hf / run > this.spec.maxSlope || (hf / run > this.spec.maxSlope * 0.25 && this.groundSlope(nx, nz) > this.spec.maxSlope)) && this.world.rockSurface(nx, p.y, nz) === null && !this.onFloor(nx, nz)) return false;
      }
      p.x = nx; p.z = nz;
      return true;
    };
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt, x0 = p.x, z0 = p.z;
    if (!tryMove(nx, nz)) {
      if (tryMove(nx, p.z)) v.z = 0;
      else if (tryMove(p.x, nz)) v.x = 0;
      else { v.x = 0; v.z = 0; }
    }
    const asked = this.mode === 'ground' && len > 0.3;
    this.stuckFor = asked && Math.hypot(p.x - x0, p.z - z0) < speed * len * dt * 0.1 ? this.stuckFor + dt : 0;
    // Pushing on into a face with holds: onto it.
    if (asked && intent.forward > 0.5 && this.stuckFor > 0 && this.spec.climb && (this.world.climbable || this.inRock())) {
      this.pushing += dt;
      if (this.pushing >= GRIP_ON && this.gripFace(-sh, -ch)) return;
    } else this.pushing = 0;

    // Up and down.
    const ground = this.support(p.x, p.z, p.y);
    if (this.mode === 'ground') {
      if (intent.up) { v.y = this.spec.jump; this.mode = 'air'; }
      else if (ground >= p.y - this.spec.snap) { p.y = ground; v.y = 0; }
      else this.mode = 'air';
    }
    if (this.mode === 'air') {
      v.y -= this.spec.gravity * dt;
      const ny = p.y + v.y * dt;
      // The head stops at rock above.
      const above = this.world.rockSurface(p.x, ny + this.height, p.z);
      if (v.y > 0 && above !== null && above < 0.1) v.y = 0;
      else p.y = ny;
      this.airTop = Math.max(this.airTop, p.y);
      if (p.y <= ground) {
        p.y = ground; v.y = 0; this.mode = 'ground';
        this.fell = Math.max(0, this.airTop - p.y);
        this.airTop = -Infinity;
      }
    }
    const level = this.world.waterLevel(p.x, p.z);
    if (this.mode !== 'swim') {
      const w = this.swimLevel(p.x, p.z, p.y);
      if (w !== null) { this.mode = 'swim'; v.y *= 0.3; }
    } else {
      const top = level === null ? -Infinity : this.floatAt(level);
      // Up and down by choice; otherwise the body floats up to the surface.
      const want = intent.up || this.surfacing ? 1.4 : intent.down ? -1.4 : p.y < top - 0.05 ? 0.8 : 0;
      v.y += (want - v.y) * damp(4, dt);
      // Under a roof (a drowned cave's): the head stops at the rock, in the air caught under it if there is any.
      const roof = v.y > 0 ? this.world.rockSurface(p.x, p.y + v.y * dt + this.height, p.z) : null;
      if (roof !== null && roof < 0.1) v.y = 0;
      p.y = Math.min(top, p.y + v.y * dt);
      if (p.y <= ground) { p.y = ground; v.y = Math.max(0, v.y); }
      // Out of the water once the ground is high enough to wade.
      if (level === null || ground > level - this.height * 0.55) { this.mode = 'ground'; p.y = Math.max(p.y, ground); v.y = 0; }
    }
    v.y = clamp(v.y, -50, 20);
  }

  /** The floor a body's width on from (nx, nz), going there from where it stands: the step down it is about to take. */
  private floorAhead(nx: number, nz: number): number {
    const p = this.pos, run = Math.hypot(nx - p.x, nz - p.z), k = run > 1e-6 ? this.spec.radius / run : 0;
    return this.support(nx + (nx - p.x) * k, nz + (nz - p.z) * k, p.y);
  }

  /** The ground's slope at (x, z) (rise over run, either way). */
  private groundSlope(x: number, z: number): number {
    const d = 0.4, h = this.world.height.bind(this.world);
    return Math.hypot(h(x + d, z) - h(x - d, z), h(x, z + d) - h(x, z - d)) / (2 * d);
  }

  /**
   * The face's foot point at the feet's height `y`, along the way in (nx, nz) from (x, z): where the ground
   * crosses `y` within a few metres either way. Null where it does not (over the top, or off the face).
   */
  private faceAt(x: number, z: number, y: number, nx: number, nz: number): [number, number] | null {
    // In rock (a cave): where the rock begins at the knees (a narrow way: not as far as its other wall).
    const rock = this.inRock();
    const above = rock ? (t: number) => -(this.world.rockSurface(x + nx * t, y + 0.5, z + nz * t) ?? -1) : (t: number) => this.world.height(x + nx * t, z + nz * t) - y;
    let lo = rock ? -1.2 : -3, hi = rock ? 1.2 : 3;
    if (above(lo) > 0 || above(hi) < 0) return null;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (above(m) > 0) hi = m; else lo = m; }
    const t = (lo + hi) / 2;
    return [x + nx * t, z + nz * t];
  }

  /** Whether the walker climbs the rock's own faces (a cave's), not the height field's. */
  private inRock(): boolean {
    return !!this.world.rockHolds?.();
  }

  /**
   * Holds at (x, z) with the feet at y: the way into the face. Out of doors the land's climbable faces; in a cave the
   * rock wherever it stands as a wall within reach (not a floor, nor a roof over the head).
   */
  private holds(x: number, z: number, y: number): { nx: number; nz: number } | null {
    if (!this.inRock()) return this.world.climbable?.(x, z) ?? null;
    const f = (px: number, py: number, pz: number) => this.world.rockSurface(px, py, pz) ?? -1, e = 0.15, h = y + 1;
    if (f(x, h, z) > 0.6) return null;
    const gx = f(x + e, h, z) - f(x - e, h, z), gy = f(x, h + e, z) - f(x, h - e, z), gz = f(x, h, z + e) - f(x, h, z - e);
    const across = Math.hypot(gx, gz);
    if (across < 1e-6 || across < 0.7 * Math.hypot(gx, gy, gz)) return null;
    return { nx: -gx / across, nz: -gz / across };
  }

  /** Onto the climbable face ahead (dx, dz: the way the body pushes), if it is one; whether it got on. */
  private gripFace(dx: number, dz: number): boolean {
    const p = this.pos, r = this.spec.radius + 0.3, fx = p.x + dx * r, fz = p.z + dz * r;
    const c = this.holds(fx, fz, p.y);
    if (!c || c.nx * dx + c.nz * dz < 0.5) return false;
    // A face, not a step or a bank one walks up: out of doors too steep a slope; in a cave rock up past the chest.
    if (this.inRock() ? (this.world.rockSurface(fx, p.y + 1.3, fz) ?? -1) > 0.3 : this.groundSlope(fx, fz) <= this.spec.maxSlope) return false;
    const at = this.faceAt(p.x, p.z, p.y + 0.4, c.nx, c.nz);
    if (!at) return false;
    this.mode = 'climb';
    this.face.nx = c.nx; this.face.nz = c.nz; this.face.from = p.y;
    p.y += 0.4;
    p.x = at[0] - c.nx * OFF_FACE; p.z = at[1] - c.nz * OFF_FACE;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = Math.atan2(-c.nx, -c.nz);
    this.pushing = 0;
    return true;
  }

  /** Let go of the face: falling, pushed off it a little. */
  private letGo(): void {
    this.mode = 'air';
    this.airTop = this.pos.y;
    this.vel.x = -this.face.nx * 1.2; this.vel.z = -this.face.nz * 1.2; this.vel.y = 0;
  }

  /** On a face (climbing up, down or along it as the keys say) or pulling up over its top. */
  private climbStep(intent: WalkIntent, dt: number): void {
    const p = this.pos, F = this.face;
    this.vel.x = this.vel.y = this.vel.z = 0;
    if (this.mode === 'pull') {
      const q = this.pull;
      q.t += dt / PULL_UP;
      const u = Math.min(1, q.t), up = Math.min(1, u / 0.6), over = Math.max(0, (u - 0.4) / 0.6);
      p.x = q.x0 + (q.x1 - q.x0) * over; p.z = q.z0 + (q.z1 - q.z0) * over; p.y = q.y0 + (q.y1 - q.y0) * up;
      if (u >= 1) { this.mode = 'ground'; p.y = this.support(p.x, p.z, p.y); }
      return;
    }
    // Spent, or jumping off: let go.
    const moving = Math.abs(intent.forward) > 0.1 || Math.abs(intent.strafe) > 0.1;
    if (intent.up || (this.tire && !this.tire(dt, moving ? 1 : 0.35))) { this.letGo(); return; }
    const v = this.spec.climb ?? 0.8;
    // The feet on the face again after the move: up or down, and along it (right of one facing it: (-nz, nx)).
    const y = p.y + intent.forward * v * dt;
    const ax = p.x + F.nx * OFF_FACE - F.nz * intent.strafe * v * 0.7 * dt, az = p.z + F.nz * OFF_FACE + F.nx * intent.strafe * v * 0.7 * dt;
    // Over the top: the ground just in from the face is up at the waist (where the hands go flat on it and
    // the body pushes up: @futuremagic/figure's ledge, so the pull-up starts where the climb left the feet)
    // and walkable.
    const rock = this.inRock(), tx = ax + F.nx * 0.9, tz = az + F.nz * 0.9;
    const top = rock ? this.support(tx, tz, y + PULL_RISE * this.height) : this.world.height(tx, tz);
    // In a cave the ledge's top is where the body fits (stood up on it, clear of the roof).
    const over = rock ? top > y && !this.bodyInRock(tx, top, tz) : this.groundSlope(tx, tz) <= this.spec.maxSlope;
    if (intent.forward > 0 && top - y < PULL_RISE * this.height && over) {
      const q = this.pull;
      this.mode = 'pull';
      q.t = 0; q.x0 = p.x; q.y0 = p.y; q.z0 = p.z; q.x1 = tx; q.z1 = tz; q.y1 = top;
      return;
    }
    // Down to the foot: off onto the ground.
    const back = this.support(p.x - F.nx * 0.3, p.z - F.nz * 0.3, y);
    if (intent.forward < 0 && back >= y - 0.25 && (rock || this.groundSlope(p.x, p.z) <= this.spec.maxSlope * 1.5)) {
      this.mode = 'ground';
      p.y = this.support(p.x, p.z, y);
      return;
    }
    const at = this.faceAt(ax, az, y, F.nx, F.nz);
    const c = at && (rock ? this.holds(at[0] - F.nx * 0.2, at[1] - F.nz * 0.2, y) : this.holds(at[0] + F.nx * 0.2, at[1] + F.nz * 0.2, y));
    // No holds at the chest, but a ledge above within the arms' reach (an opening in a cave's wall, a bench, the top):
    // the hands are on its lip, and the body goes on up by them to where it pulls itself over. Without this the
    // climber hung below the lip for good (the holds end at the chest, the pull-up starts at the waist).
    if ((!at || !c) && intent.forward > 0 && this.lipAbove(tx, tz, y)) { p.y = y; return; }
    // No holds there (the broken rock ends), or the head at the roof: the body stays where it is.
    if (!at || !c) return;
    if (rock && intent.forward > 0 && (this.world.rockSurface(at[0] - c.nx * OFF_FACE, y + this.height + 0.05, at[1] - c.nz * OFF_FACE) ?? 1) < 0.1) return;
    F.nx = c.nx; F.nz = c.nz;
    p.x = at[0] - c.nx * OFF_FACE; p.z = at[1] - c.nz * OFF_FACE; p.y = y;
    this.yaw = Math.atan2(-c.nx, -c.nz);
  }

  /** A ledge to pull up onto at (x, z), in from the face, with its top above the feet `y` and within the arms' reach. */
  private lipAbove(x: number, z: number, y: number): boolean {
    if (!this.inRock()) {
      const top = this.world.height(x, z);
      return top > y && top - y < this.height && this.groundSlope(x, z) <= this.spec.maxSlope;
    }
    const top = this.support(x, z, y + this.height);
    return top > y && top - y < this.height && !this.bodyInRock(x, top, z);
  }

  /** The gait for the animator. */
  /** Speed over the ground, m/s. */
  get groundSpeed(): number { return Math.hypot(this.vel.x, this.vel.z); }

  /** Out of breath (game/breath.ts): swimming, the body comes up whatever is pressed. */
  surfacing = false;

  /** The head is under the water (diving): the hero holds their breath (game/breath.ts). */
  get headUnder(): boolean {
    const w = this.mode === 'swim' ? this.world.waterLevel(this.pos.x, this.pos.z) : null;
    return w !== null && this.pos.y + this.height * 0.9 < w;
  }

  get gait(): 'idle' | 'walk' | 'run' | 'swim' | 'jump' | 'fall' {
    if (this.mode === 'swim') return 'swim';
    if (this.mode === 'air') return this.vel.y > 0 ? 'jump' : 'fall';
    const hs = Math.hypot(this.vel.x, this.vel.z);
    return hs < 0.15 ? 'idle' : hs < 2.6 ? 'walk' : 'run';
  }
}

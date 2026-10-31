/**
 * The bits spells are drawn with (plan 10, C4): sprites (flames, smoke and dust, sparks, glows, rings, rays,
 * circles, leaves, flakes, wisps) and solids (ice shards, rock spikes, stones, leaves, roots), each moving on its
 * own. Pure (no three.js): the spell view draws what is here, a test checks how things move. Seeded: the same
 * spells throw the same bits.
 *
 * Two ways in: `burst`/`emit` start bits that live, move and fade on their own; `hold` draws one for this frame
 * only (a bolt's core, the orb gathering at the hands), so what follows a spell needs no bookkeeping.
 */
import { Rng } from '@futuremagic/core';

/** The sprites' pictures, in the shader's order (render/materials/spellFx.ts). */
export const SPRITES = ['flame', 'puff', 'spark', 'glow', 'ring', 'ray', 'circle', 'leaf', 'flake', 'wisp', 'blaze'] as const;
export type Sprite = typeof SPRITES[number];

/** The solids' shapes (each its own mesh) and what they are made of (the shader's order). */
export const SHAPES = ['shard', 'spike', 'chunk', 'leaf', 'root'] as const;
export type Shape = typeof SHAPES[number];
export const STUFFS = ['ice', 'rock', 'wood', 'leaf', 'light'] as const;
export type Stuff = typeof STUFFS[number];

export type Vec3 = readonly [number, number, number];

/** A colour made brighter or dimmer (linear). */
export const lit = (c: Vec3, s: number): Vec3 => [c[0] * s, c[1] * s, c[2] * s];

/** A sprite in flight. Sizes are its height (m); `stretch` > 0 draws it along its velocity, that many seconds of it long. */
export interface Particle {
  sprite: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size0: number; size1: number;
  /** Colour at birth and at death (linear, may be over 1: it glows), and how see-through (0 adds light only). */
  c0: Vec3; c1: Vec3;
  cover0: number; cover1: number;
  /** Turn on screen (rad) and its speed (rad/s). */
  rot: number; spin: number;
  /** Air drag (1/s), pull down (m/s², negative rises), swirl round the vertical through `axis` (rad/s). */
  drag: number; gravity: number; swirl: number;
  axis: { x: number; z: number } | null;
  stretch: number;
  /** Drawn along this fixed way, `aspect` times as long as wide (a beam left standing), instead of its velocity. */
  way: Vec3 | null;
  aspect: number;
  /** Lies flat on the plane with this normal (rings and circles on the ground) instead of facing the eye. */
  flat: Vec3 | null;
  /** Share of its life it takes to come in (0: at once). */
  fadeIn: number;
  seed: number;
}

/** How a solid comes and goes: grows from 0 over `grow` s, stands, then shrinks or sinks over the last `fade` s. */
export interface Solid {
  shape: number; stuff: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Which way it points (unit), its roll about that (rad) and tumble (rad/s about a fixed axis). */
  dx: number; dy: number; dz: number;
  roll: number; tumble: number;
  /** Its size: across and along where it points (m). */
  width: number; length: number;
  age: number; life: number;
  grow: number; fade: number;
  /** Sinks this far into the ground while it fades (rock spikes go back down) instead of shrinking. */
  sink: number;
  gravity: number; drag: number;
  /** Stops falling at this height (lands and lies), null: falls on. */
  floor: number | null;
  /** How much it glows (0: lit only). */
  glow: number;
  seed: number;
}

/** A sprite drawn this frame only. */
export interface Held { sprite: number; x: number; y: number; z: number; size: number; c: Vec3; cover: number; rot: number; stretch: Vec3 | null; aspect: number; flat: Vec3 | null; seed: number; age: number }

/** A solid drawn this frame only. */
export interface HeldSolid { shape: number; stuff: number; x: number; y: number; z: number; dx: number; dy: number; dz: number; roll: number; width: number; length: number; glow: number; seed: number }

/** What to throw: ranges are [least, most]; one number is exact. */
export interface PuffSpec {
  sprite: Sprite;
  life: number | readonly [number, number];
  size: readonly [number, number];
  /** Scatter at birth (m): within a ball, or on a ring of this radius on the ground (`ring`). */
  spread?: number;
  ring?: boolean;
  /** Speed (m/s) out along `dir` within `cone` (rad; π: any way), and straight up on top. */
  speed?: number | readonly [number, number];
  cone?: number;
  up?: number | readonly [number, number];
  /** Out from the middle (rings: away from their centre), or in towards it (gathering). */
  outward?: boolean;
  inward?: boolean;
  color: Vec3;
  to?: Vec3;
  cover?: readonly [number, number];
  drag?: number;
  gravity?: number;
  swirl?: number;
  spin?: number;
  stretch?: number;
  flat?: boolean;
  fadeIn?: number;
}

export interface SolidSpec {
  shape: Shape;
  stuff: Stuff;
  life: number | readonly [number, number];
  width: number | readonly [number, number];
  length: number | readonly [number, number];
  grow?: number;
  fade?: number;
  sink?: number;
  spread?: number;
  ring?: boolean;
  speed?: number | readonly [number, number];
  cone?: number;
  up?: number | readonly [number, number];
  outward?: boolean;
  /** Points: up (spikes), out from the middle, along its flight, or any way. */
  point?: 'up' | 'out' | 'flight' | 'any';
  /** Leans away from upright by up to this (rad), for 'up' and 'out'. */
  lean?: number;
  tumble?: number | readonly [number, number];
  gravity?: number;
  drag?: number;
  floor?: number | null;
  glow?: number;
}

const one = (rng: Rng, v: number | readonly [number, number] | undefined, d = 0): number => v === undefined ? d : typeof v === 'number' ? v : rng.range(v[0], v[1]);

export class SpellBits {
  readonly parts: Particle[] = [];
  readonly solids: Solid[] = [];
  readonly held: Held[] = [];
  readonly heldSolids: HeldSolid[] = [];
  readonly rng: Rng;
  private readonly v: [number, number, number] = [0, 0, 0];
  private readonly waits: { at: number; fn: () => void }[] = [];
  private clock = 0;

  /** `cap`: sprites alive at once, `solidCap`: solids (the oldest go first). */
  constructor(seed: number, readonly cap = 900, readonly solidCap = 120) {
    this.rng = new Rng(seed);
  }

  /**
   * Throw `count` sprites (a fraction throws one by chance) from `at` (the middle of a ring), out along `dir`
   * (default up).
   */
  burst(spec: PuffSpec, count: number, at: Vec3, dir: Vec3 = [0, 1, 0]): void {
    const rng = this.rng;
    let n = Math.floor(count);
    if (rng.float() < count - n) n++;
    for (let i = 0; i < n; i++) {
      const [px, py, pz, ox, oz] = this.spot(spec.spread ?? 0, !!spec.ring);
      let [vx, vy, vz] = this.velocity(spec.speed, spec.cone ?? Math.PI, dir, spec.outward ? [ox, 0, oz] : null);
      if (spec.inward) {
        const l = Math.hypot(px, py, pz) || 1, v = one(rng, spec.speed);
        vx = -px / l * v; vy = -py / l * v; vz = -pz / l * v;
      }
      const up = one(rng, spec.up);
      if (this.parts.length >= this.cap) this.parts.shift();
      this.parts.push({
        sprite: SPRITES.indexOf(spec.sprite),
        x: at[0] + px, y: at[1] + py, z: at[2] + pz,
        vx, vy: vy + up, vz,
        age: 0, life: Math.max(0.02, one(rng, spec.life)),
        size0: spec.size[0] * rng.range(0.8, 1.2), size1: spec.size[1] * rng.range(0.8, 1.2),
        c0: spec.color, c1: spec.to ?? spec.color,
        cover0: spec.cover?.[0] ?? 0, cover1: spec.cover?.[1] ?? 0,
        // Flames stand up (fire rises); everything else may lie any way round.
        rot: spec.sprite === 'flame' ? rng.range(-0.2, 0.2) : rng.range(0, Math.PI * 2), spin: (spec.spin ?? 0) * rng.range(-1, 1),
        drag: spec.drag ?? 0, gravity: spec.gravity ?? 0, swirl: spec.swirl ?? 0,
        axis: spec.swirl ? { x: at[0], z: at[2] } : null,
        stretch: spec.stretch ?? 0,
        way: null, aspect: 1,
        flat: spec.flat ? [0, 1, 0] : null,
        fadeIn: spec.fadeIn ?? 0.08,
        seed: rng.float(),
      });
    }
  }

  /**
   * One sprite that stays where it is, drawn along `way` (`aspect` times as long as `size` is wide) or flat on the
   * ground (`flat`), fading from `c0` to `c1` over `life` s: a beam left standing, a scorch mark, a ring.
   */
  streak(sprite: Sprite, at: Vec3, size: readonly [number, number], life: number, c0: Vec3, c1: Vec3, opts: { way?: Vec3; aspect?: number; flat?: boolean; cover?: readonly [number, number]; fadeIn?: number; rot?: number; spin?: number } = {}): void {
    if (this.parts.length >= this.cap) this.parts.shift();
    this.parts.push({
      sprite: SPRITES.indexOf(sprite), x: at[0], y: at[1], z: at[2], vx: 0, vy: 0, vz: 0, age: 0, life,
      size0: size[0], size1: size[1], c0, c1, cover0: opts.cover?.[0] ?? 0, cover1: opts.cover?.[1] ?? 0,
      rot: opts.rot ?? this.rng.range(0, Math.PI * 2), spin: opts.spin ?? 0, drag: 0, gravity: 0, swirl: 0, axis: null, stretch: 0,
      way: opts.way ?? null, aspect: opts.aspect ?? 1, flat: opts.flat ? [0, 1, 0] : null, fadeIn: opts.fadeIn ?? 0.05, seed: this.rng.float(),
    });
  }

  /** Run `fn` in `delay` seconds (a wave going out ring by ring). */
  later(delay: number, fn: () => void): void {
    this.waits.push({ at: this.clock + delay, fn });
  }

  /** Throw sprites at `rate` a second for `dt` seconds. */
  emit(spec: PuffSpec, rate: number, dt: number, at: Vec3, dir?: Vec3): void {
    this.burst(spec, rate * dt, at, dir);
  }

  /** Throw `count` solids from `at`; `dir` is the way out (and a bolt's flight, for 'flight'). */
  throwSolids(spec: SolidSpec, count: number, at: Vec3, dir: Vec3 = [0, 1, 0]): void {
    const rng = this.rng;
    let n = Math.floor(count);
    if (rng.float() < count - n) n++;
    for (let i = 0; i < n; i++) {
      const [px, py, pz, ox, oz] = this.spot(spec.spread ?? 0, !!spec.ring);
      const [vx, vy, vz] = this.velocity(spec.speed, spec.cone ?? Math.PI, dir, spec.outward ? [ox, 0, oz] : null);
      const up = one(rng, spec.up);
      const [dx, dy, dz] = this.pointing(spec.point ?? 'any', spec.lean ?? 0, dir, ox, oz);
      if (this.solids.length >= this.solidCap) this.solids.shift();
      this.solids.push({
        shape: SHAPES.indexOf(spec.shape), stuff: STUFFS.indexOf(spec.stuff),
        x: at[0] + px, y: at[1] + py, z: at[2] + pz,
        vx, vy: vy + up, vz,
        dx, dy, dz, roll: rng.range(0, Math.PI * 2), tumble: one(rng, spec.tumble),
        width: one(rng, spec.width), length: one(rng, spec.length),
        age: 0, life: one(rng, spec.life), grow: spec.grow ?? 0, fade: spec.fade ?? 0.2, sink: spec.sink ?? 0,
        gravity: spec.gravity ?? 0, drag: spec.drag ?? 0, floor: spec.floor ?? null,
        glow: spec.glow ?? 0, seed: rng.float(),
      });
    }
  }

  /** A sprite for this frame only. `stretch`: drawn along that way (its length `aspect` times its width). */
  hold(sprite: Sprite, at: Vec3, size: number, c: Vec3, opts: { cover?: number; rot?: number; stretch?: Vec3 | null; aspect?: number; flat?: Vec3 | null; seed?: number; age?: number } = {}): void {
    this.held.push({ sprite: SPRITES.indexOf(sprite), x: at[0], y: at[1], z: at[2], size, c, cover: opts.cover ?? 0, rot: opts.rot ?? 0, stretch: opts.stretch ?? null, aspect: opts.aspect ?? 1, flat: opts.flat ?? null, seed: opts.seed ?? 0, age: opts.age ?? 0.5 });
  }

  /** A solid for this frame only, pointing along `dir` (unit). */
  holdSolid(shape: Shape, stuff: Stuff, at: Vec3, dir: Vec3, width: number, length: number, opts: { roll?: number; glow?: number; seed?: number } = {}): void {
    this.heldSolids.push({ shape: SHAPES.indexOf(shape), stuff: STUFFS.indexOf(stuff), x: at[0], y: at[1], z: at[2], dx: dir[0], dy: dir[1], dz: dir[2], roll: opts.roll ?? 0, width, length, glow: opts.glow ?? 0, seed: opts.seed ?? 0 });
  }

  /** Forget this frame's held bits (call once they are drawn). */
  clearHeld(): void {
    this.held.length = 0;
    this.heldSolids.length = 0;
  }

  /** Move everything on by dt seconds; the spent go. */
  step(dt: number): void {
    this.clock += dt;
    for (let i = 0; i < this.waits.length; i++) {
      const w = this.waits[i]!;
      if (w.at <= this.clock) { this.waits.splice(i--, 1); w.fn(); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.gravity * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      if (p.axis && p.swirl) {
        const a = p.swirl * dt, c = Math.cos(a), s = Math.sin(a);
        const rx = p.x - p.axis.x, rz = p.z - p.axis.z, vx = p.vx;
        p.x = p.axis.x + rx * c - rz * s;
        p.z = p.axis.z + rx * s + rz * c;
        p.vx = vx * c - p.vz * s;
        p.vz = vx * s + p.vz * c;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.solids.length - 1; i >= 0; i--) {
      const s = this.solids[i]!;
      s.age += dt;
      if (s.age >= s.life) { this.solids.splice(i, 1); continue; }
      s.vy -= s.gravity * dt;
      if (s.drag) { const k = Math.exp(-s.drag * dt); s.vx *= k; s.vy *= k; s.vz *= k; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.floor !== null && s.y < s.floor) { s.y = s.floor; s.vx *= 0.3; s.vz *= 0.3; s.vy = 0; s.tumble *= 0.2; }
      s.roll += s.tumble * dt;
    }
  }

  /** How big a solid stands now (0..1) and how far it has sunk (m). */
  static standing(s: Solid): { scale: number; sunk: number } {
    const grow = s.grow > 0 ? Math.min(1, s.age / s.grow) : 1;
    // A quick overshoot as it bursts out (spikes, crystals), settling back.
    const pop = s.grow > 0 && s.age < s.grow * 1.6 ? 1 + 0.12 * Math.sin(Math.min(1, s.age / (s.grow * 1.6)) * Math.PI) : 1;
    const left = s.life - s.age, going = s.fade > 0 ? Math.min(1, left / s.fade) : 1;
    if (s.sink > 0) return { scale: easeOut(grow) * pop, sunk: (1 - going) * s.sink };
    return { scale: easeOut(grow) * pop * going, sunk: 0 };
  }

  /** How far a sprite is through its life, how big and how strong it is now. */
  static now(p: Particle): { a: number; size: number; strength: number } {
    const a = p.age / p.life, fadeIn = p.fadeIn > 0 ? Math.min(1, a / p.fadeIn) : 1;
    return { a, size: p.size0 + (p.size1 - p.size0) * a, strength: fadeIn * (1 - a * a) };
  }

  private spot(spread: number, ring: boolean): [number, number, number, number, number] {
    const rng = this.rng;
    if (ring) {
      const ang = rng.range(0, Math.PI * 2), c = Math.cos(ang), s = Math.sin(ang);
      return [c * spread, 0, s * spread, c, s];
    }
    if (spread <= 0) { const ang = rng.range(0, Math.PI * 2); return [0, 0, 0, Math.cos(ang), Math.sin(ang)]; }
    const [dx, dy, dz] = rng.onSphere(this.v), r = spread * Math.cbrt(rng.float());
    const h = Math.hypot(dx, dz) || 1;
    return [dx * r, dy * r, dz * r, dx / h, dz / h];
  }

  private velocity(speed: number | readonly [number, number] | undefined, cone: number, dir: Vec3, out: Vec3 | null): [number, number, number] {
    const v = one(this.rng, speed);
    if (!v) return [0, 0, 0];
    const [x, y, z] = this.within(out ?? dir, cone);
    return [x * v, y * v, z * v];
  }

  /** A unit vector within `cone` of `d`. */
  private within(d: Vec3, cone: number): [number, number, number] {
    const rng = this.rng;
    const len = Math.hypot(d[0], d[1], d[2]) || 1, ax = d[0] / len, ay = d[1] / len, az = d[2] / len;
    if (cone >= Math.PI - 1e-3) return rng.onSphere([0, 0, 0]);
    // Rotate a random direction in the cone about +y onto d.
    const cosT = 1 - rng.float() * (1 - Math.cos(cone)), sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT)), ph = rng.range(0, Math.PI * 2);
    const lx = sinT * Math.cos(ph), ly = cosT, lz = sinT * Math.sin(ph);
    // Basis round d.
    const [ux, uy, uz] = Math.abs(ay) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    let tx = uy * az - uz * ay, ty = uz * ax - ux * az, tz = ux * ay - uy * ax;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = ay * tz - az * ty, by = az * tx - ax * tz, bz = ax * ty - ay * tx;
    return [tx * lx + ax * ly + bx * lz, ty * lx + ay * ly + by * lz, tz * lx + az * ly + bz * lz];
  }

  private pointing(how: 'up' | 'out' | 'flight' | 'any', lean: number, dir: Vec3, ox: number, oz: number): [number, number, number] {
    if (how === 'any') return this.rng.onSphere([0, 0, 0]);
    if (how === 'flight') { const l = Math.hypot(dir[0], dir[1], dir[2]) || 1; return [dir[0] / l, dir[1] / l, dir[2] / l]; }
    const tilt = this.rng.range(0, lean) + (how === 'out' ? 0.5 : 0);
    const h = Math.sin(tilt), v = Math.cos(tilt);
    if (how === 'out') return [ox * h, v, oz * h];
    const ang = this.rng.range(0, Math.PI * 2);
    return [Math.cos(ang) * h, v, Math.sin(ang) * h];
  }
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

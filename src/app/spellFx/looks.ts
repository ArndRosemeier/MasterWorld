/**
 * What each spell looks like (plan 10, C4): for every look a setting names (an ability's `look`, else its school's
 * motif), how it gathers in the caster's hands, leaves them, flies, strikes, bursts over an area, lies as a zone
 * and flares round the caster, told as bits thrown into SpellBits (particles.ts). Pure; the spell view calls in.
 *
 * Fire licks and smokes and throws embers; frost is ice that shatters, mist and snow crystals; earth breaks out of
 * the ground as rock spikes and stones in dust; life is leaves, green light and roots; light is beams and rays and
 * a white heart; shadow is smoke that swallows light, with a violet edge and curling wisps. Every caster stands on a
 * magic circle in the school's colour while a spell gathers.
 */
import type { SpellMotif } from '../../setting/contract';
import type { PuffSpec, SolidSpec, SpellBits, Vec3 } from './particles';

/** Where the caster is: feet (on the ground), the hand the spell gathers in, which way they face (unit, flat). */
export interface Caster { readonly feet: Vec3; readonly hand: Vec3; readonly facing: Vec3 }

/** Linear colours, over 1 where they glow. */
type C = Vec3;

export interface FxLook {
  /** The school's light (circles, flashes). */
  readonly light: C;
  /** Every frame while it gathers (share 0..1 of the cast; t: the view's clock). */
  gather(b: SpellBits, c: Caster, share: number, dt: number, t: number): void;
  /** Once, as it leaves the hand along `dir`. */
  release(b: SpellBits, hand: Vec3, dir: Vec3): void;
  /** Every frame a bolt flies: where it is, its way (unit), speed, from where it left the hand. */
  bolt(b: SpellBits, at: Vec3, dir: Vec3, speed: number, from: Vec3, dt: number, t: number): void;
  /** Once, where a bolt strikes (travelling along dir). */
  hit(b: SpellBits, at: Vec3, dir: Vec3, from: Vec3): void;
  /** Once, a burst over an area; `ground` is the middle on the ground. */
  area(b: SpellBits, ground: Vec3, radius: number): void;
  /** Once when a zone begins and every frame while it lies (left: seconds it has left). */
  zoneStart?(b: SpellBits, ground: Vec3, radius: number, life: number): void;
  zone(b: SpellBits, ground: Vec3, radius: number, dt: number, left: number, t: number): void;
  /** Once, round the caster (a spell on themselves). */
  flare(b: SpellBits, feet: Vec3): void;
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (c: C, k: number): C => [c[0] * k, c[1] * k, c[2] * k];
const UP: Vec3 = [0, 1, 0];
const back = (d: Vec3): Vec3 => [-d[0], -d[1], -d[2]];
/** Where a strike shows: a little back along the flight from the struck point, out of the body it struck. */
const front = (at: Vec3, dir: Vec3): Vec3 => add(at, dir, -0.4);

/** The magic circle under a caster while a spell gathers, turning, widening and brightening. */
function circle(b: SpellBits, c: Caster, share: number, t: number, light: C): void {
  const size = 1.5 + 0.7 * share;
  b.hold('circle', add(c.feet, UP, 0.04), size, scale(light, 0.45 + 0.75 * share), { flat: UP, rot: t * 0.6, cover: 0.15 * share, seed: 0.37 });
  b.hold('glow', add(c.feet, UP, 0.03), size * 1.1, scale(light, 0.12 * share), { flat: UP });
}

/** The light the hand gives off while a spell gathers. */
function handGlow(b: SpellBits, c: Caster, share: number, light: C, size = 0.35): void {
  b.hold('glow', c.hand, size * (0.5 + 0.8 * share), scale(light, 0.6 + 0.9 * share), { cover: 0 });
}

// ---------------------------------------------------------------------------------------------------- fire

const FIRE: C = [2.4, 1.0, 0.25];
const flame = (size: readonly [number, number], life: readonly [number, number], extra: Partial<PuffSpec> = {}): PuffSpec => ({ sprite: 'flame', life, size, speed: [0.05, 0.35], up: [0.6, 1.3], color: [1.3, 1.1, 1.0], cover: [1, 0.5], drag: 2.5, fadeIn: 0.12, ...extra });
const SMOKE: PuffSpec = { sprite: 'puff', life: [0.9, 1.6], size: [0.25, 0.9], up: [0.5, 1.0], speed: [0.05, 0.25], color: [0.05, 0.045, 0.04], cover: [0.6, 0], drag: 1.2, spin: 0.6, fadeIn: 0.25 };
const EMBER: PuffSpec = { sprite: 'spark', life: [0.5, 1.1], size: [0.035, 0.015], speed: [0.5, 2], up: [0.6, 1.4], gravity: -0.4, drag: 1.5, color: [4, 1.5, 0.35], stretch: 0.03 };
const FIRE_SPARK: PuffSpec = { sprite: 'spark', life: [0.3, 0.7], size: [0.04, 0.02], speed: [3, 7], gravity: 7, drag: 1, color: [5, 2.2, 0.6], stretch: 0.035 };

function fireBurst(b: SpellBits, at: Vec3, big: number): void {
  // A ball of burning gas that swells, burns out from its edge and rolls up as smoke; tongues of flame thrown out.
  b.burst({ sprite: 'blaze', life: [0.7, 1.1], size: [0.35 * big, 0.95 * big], speed: [0.6 * big, 2.2 * big], drag: 4, up: [0.3, 0.9], color: [1.2, 1.05, 0.95], cover: [0.95, 0], spin: 0.8, fadeIn: 0.05 }, 12 * big, at);
  b.burst(flame([0.3 * big, 0.12], [0.2, 0.4], { speed: [2.5, 5], drag: 3 }), 6 * big, at);
  b.burst(FIRE_SPARK, 22 * big, at);
  b.burst(EMBER, 10 * big, at);
  b.burst({ ...SMOKE, size: [0.4 * big, 1.4 * big], speed: [0.3, 1], life: [1.2, 2.2] }, 6 * big, add(at, UP, 0.2));
  b.streak('glow', at, [0.8 * big, 2.2 * big], 0.25, [2.6, 1.1, 0.3], [0, 0, 0]);
}

const fire: FxLook = {
  light: FIRE,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, FIRE);
    handGlow(b, c, share, [1.8, 0.8, 0.22], 0.45);
    b.emit(flame([0.16 + 0.12 * share, 0.05], [0.25, 0.45], { up: [0.3, 0.8], spread: 0.05 }), 26 + 30 * share, dt, c.hand);
    b.emit(EMBER, 6 + 10 * share, dt, c.hand);
    b.emit(flame([0.25, 0.08], [0.3, 0.55], { spread: 0.75 + 0.35 * share, ring: true, up: [0.5, 1.1], speed: 0 }), 22 * share, dt, c.feet);
  },
  release(b, hand, dir) {
    b.burst(flame([0.3, 0.1], [0.15, 0.3], { speed: [1, 2.5], cone: 0.6 }), 8, hand, dir);
    b.streak('glow', hand, [0.5, 1.1], 0.18, [2.4, 1.1, 0.3], [0, 0, 0]);
  },
  bolt(b, at, dir, speed, _from, dt, t) {
    b.hold('glow', at, 0.8, [1.8, 0.75, 0.2]);
    b.hold('blaze', at, 0.34, [1.25, 1.1, 1.0], { cover: 0.95, seed: (t * 0.37) % 1, age: 0.05 });
    b.hold('flame', add(at, dir, -0.18), 0.42, [1.8, 1.6, 1.5], { stretch: back(dir), aspect: 2.4, cover: 0.55, seed: 0.2, age: 0.1 });
    b.hold('flame', add(at, dir, -0.08), 0.28, [1.9, 1.8, 1.7], { stretch: back(dir), aspect: 1.6, cover: 0.6, seed: 0.6, age: 0.0 });
    const trail = Math.max(1, speed / 18);
    b.emit(flame([0.26, 0.05], [0.18, 0.32], { spread: 0.06, speed: [0.1, 0.5], up: [0.2, 0.6] }), 110 * trail, dt, at, back(dir));
    b.emit({ ...SMOKE, size: [0.12, 0.5], life: [0.5, 0.9], cover: [0.35, 0] }, 28 * trail, dt, add(at, dir, -0.3));
    b.emit({ ...EMBER, speed: [0.3, 1.2] }, 35 * trail, dt, at, back(dir));
  },
  hit(b, at, dir) { fireBurst(b, front(at, dir), 1.2); },
  area(b, ground, radius) {
    const mid = add(ground, UP, 0.6), big = Math.max(1, radius / 1.2);
    fireBurst(b, mid, big);
    b.burst({ sprite: 'blaze', life: [0.8, 1.3], size: [0.5, 1.4], spread: radius * 0.35, speed: [1.5, 4], cone: 1.3, drag: 3.5, up: [0.4, 1.2], color: [1.2, 1.05, 0.95], cover: [0.95, 0], spin: 0.7, fadeIn: 0.06 }, 14 * big, mid);
    b.burst(flame([0.6, 0.2], [0.3, 0.55], { spread: radius * 0.5, ring: true, speed: [0.5, 1.5], up: [1, 2] }), 10 * big, add(ground, UP, 0.2));
    b.streak('ring', add(ground, UP, 0.1), [0.6, radius * 2.4], 0.45, [3.5, 1.4, 0.4], [0, 0, 0], { flat: true });
    b.streak('puff', add(ground, UP, 0.03), [radius * 1.6, radius * 1.8], 4, [0.02, 0.015, 0.01], [0.02, 0.015, 0.01], { flat: true, cover: [0.7, 0], fadeIn: 0.02 });
  },
  zoneStart(b, ground, radius) {
    b.streak('puff', add(ground, UP, 0.03), [radius * 2.2, radius * 2.3], 7, [0.02, 0.015, 0.01], [0.02, 0.015, 0.01], { flat: true, cover: [0.6, 0], fadeIn: 0.05 });
  },
  zone(b, ground, radius, dt, left) {
    const k = Math.min(1, left / 0.6);
    b.emit(flame([1.1, 0.4], [0.45, 0.8], { spread: radius, ring: true, up: [1, 2], speed: [0, 0.2] }), 50 * radius * k, dt, ground);
    b.emit(flame([0.6, 0.2], [0.3, 0.55], { spread: radius, ring: true, up: [0.4, 0.9], speed: [0, 0.1] }), 30 * radius * k, dt, ground);
    // Billows of burning gas rolling up off the wall of fire, burning out to smoke as they rise.
    b.emit({ sprite: 'blaze', life: [0.6, 1.0], size: [0.45, 0.9], spread: radius, ring: true, up: [1.2, 2], speed: [0, 0.2], drag: 1, color: [1.2, 1.05, 0.95], cover: [0.9, 0], spin: 0.6, fadeIn: 0.15 }, 14 * radius * k, dt, add(ground, UP, 0.35));
    b.emit(flame([0.3, 0.08], [0.3, 0.5], { spread: radius * 0.85, up: [0.6, 1.2] }), 10 * radius * k, dt, add(ground, UP, 0.1));
    b.emit({ ...SMOKE, size: [0.5, 1.6], life: [1.5, 2.5], spread: radius, ring: true, up: [1, 1.6] }, 5 * radius * k, dt, add(ground, UP, 0.8));
    b.emit({ ...EMBER, spread: radius, ring: true }, 14 * radius * k, dt, add(ground, UP, 0.3));
    b.hold('glow', add(ground, UP, 0.05), radius * 2.6, scale(FIRE, 0.18 * k), { flat: UP });
  },
  flare(b, feet) { fireBurst(b, add(feet, UP, 1), 0.8); },
};

// ---------------------------------------------------------------------------------------------------- frost

const FROST: C = [0.9, 1.6, 2.6];
const MIST: PuffSpec = { sprite: 'puff', life: [0.8, 1.5], size: [0.3, 0.9], speed: [0.1, 0.4], drag: 1.5, color: [0.55, 0.72, 0.9], cover: [0.28, 0], spin: 0.5, fadeIn: 0.2 };
const FLAKE: PuffSpec = { sprite: 'flake', life: [0.9, 1.6], size: [0.08, 0.05], speed: [0.2, 0.9], gravity: 0.4, drag: 1.2, spin: 3, color: [1.6, 2.1, 2.8], cover: [0.3, 0] };
const GLINT: PuffSpec = { sprite: 'spark', life: [0.2, 0.45], size: [0.04, 0.02], speed: [1, 3], drag: 2, color: [3, 3.6, 4.5] };
const ICE_BITS: SolidSpec = { shape: 'chunk', stuff: 'ice', life: [0.8, 1.3], width: [0.05, 0.12], length: [0.06, 0.15], speed: [2, 5], cone: 1.4, up: [0.5, 2], gravity: 9.8, tumble: [6, 14], fade: 0.3, glow: 0.4 };
const ICE_SPLINTER: SolidSpec = { ...ICE_BITS, shape: 'shard', width: [0.03, 0.06], length: [0.12, 0.25], point: 'any' };

function shatter(b: SpellBits, at: Vec3, dir: Vec3, big: number): void {
  const floor = at[1] - 1.1;
  b.throwSolids({ ...ICE_BITS, floor }, 9 * big, at, back(dir));
  b.throwSolids({ ...ICE_SPLINTER, floor }, 6 * big, at, back(dir));
  b.burst(FLAKE, 22 * big, at);
  b.burst(GLINT, 18 * big, at);
  b.burst({ ...MIST, size: [0.4 * big, 1.2 * big], speed: [0.4, 1.2] }, 6 * big, at);
  b.streak('glow', at, [0.6, 1.6 * big], 0.22, [2.5, 3.5, 5], [0, 0, 0]);
}

const frost: FxLook = {
  light: FROST,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, FROST);
    handGlow(b, c, share, [1.4, 2.2, 3.4], 0.3);
    // Crystals growing at the hand, turning.
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.094, r = 0.12;
      const d: Vec3 = [Math.cos(a), 0.6, Math.sin(a)];
      b.holdSolid('shard', 'ice', [c.hand[0] + Math.cos(a) * r * 0.4, c.hand[1] - 0.04, c.hand[2] + Math.sin(a) * r * 0.4], d, 0.03 + 0.03 * share, 0.06 + 0.16 * share, { glow: 0.8, seed: i * 0.3 });
    }
    b.emit({ ...FLAKE, spread: 0.6, inward: true, speed: [0.6, 1.2], gravity: 0, life: [0.5, 0.8] }, 16 + 14 * share, dt, c.hand);
    b.emit({ ...MIST, spread: 0.9, ring: true, size: [0.4, 1.1], speed: [0, 0.1], cover: [0.18, 0] }, 6 * share, dt, add(c.feet, UP, 0.15));
  },
  release(b, hand, dir) {
    b.burst({ ...MIST, speed: [0.6, 1.5], cone: 0.7 }, 4, hand, dir);
    b.burst(GLINT, 8, hand);
  },
  bolt(b, at, dir, speed, _from, dt, t) {
    b.holdSolid('shard', 'ice', add(at, dir, -0.45), dir, 0.18, 0.85, { glow: 0.8, roll: t * 9, seed: 0.5 });
    b.hold('glow', at, 0.35, [1.2, 2, 3.2]);
    const trail = Math.max(1, speed / 22);
    b.emit({ ...MIST, size: [0.15, 0.55], life: [0.4, 0.8], speed: [0.05, 0.25], cover: [0.25, 0] }, 45 * trail, dt, add(at, dir, -0.3));
    b.emit({ ...FLAKE, speed: [0.1, 0.5] }, 30 * trail, dt, add(at, dir, -0.2));
    b.emit({ ...GLINT, speed: [0.2, 0.8] }, 20 * trail, dt, at);
  },
  hit(b, at, dir) { shatter(b, front(at, dir), dir, 1); },
  area(b, ground, radius) {
    // Ice bursts out of the ground in rings going out from the middle, with a wave of mist and a ring of rime.
    b.streak('ring', add(ground, UP, 0.08), [0.5, radius * 2.3], 0.5, [1.6, 2.4, 3.6], [0, 0, 0], { flat: true });
    b.streak('circle', add(ground, UP, 0.03), [radius * 2, radius * 2.05], 2.5, [0.5, 0.8, 1.3], [0, 0, 0], { flat: true, cover: [0.35, 0], fadeIn: 0.1 });
    b.burst({ ...MIST, spread: 0.3, outward: true, speed: [radius * 0.9, radius * 1.4], drag: 2, size: [0.5, 1.4], life: [0.9, 1.5] }, 20, add(ground, UP, 0.3));
    const steps = Math.max(2, Math.round(radius / 0.8));
    for (let k = 1; k <= steps; k++) {
      const r = (radius * k) / steps;
      b.later(k * 0.05, () => {
        b.throwSolids({ shape: 'shard', stuff: 'ice', life: [1.6, 2.2], width: [0.1, 0.2], length: [0.45, 0.95], spread: r, ring: true, point: 'out', lean: 0.35, grow: 0.12, fade: 0.4, glow: 0.4 }, 3 + 3.5 * r, ground);
        b.burst({ ...FLAKE, spread: r, ring: true, up: [0.5, 1.5] }, 4 + 3 * r, add(ground, UP, 0.2));
        b.burst({ ...GLINT, spread: r, ring: true }, 3 + 2 * r, add(ground, UP, 0.3));
      });
    }
    b.later(steps * 0.05 + 1.6, () => b.throwSolids({ ...ICE_BITS, spread: radius * 0.8, floor: ground[1], speed: [0.5, 2] }, 6 + radius * 2, add(ground, UP, 0.4)));
  },
  zone(b, ground, radius, dt) { b.emit({ ...MIST, spread: radius }, 4 * radius, dt, ground); },
  flare(b, feet) {
    // Rime: ice plates the body, a ring of crystals and falling snow.
    b.throwSolids({ shape: 'shard', stuff: 'ice', life: 1.6, width: [0.08, 0.14], length: [0.3, 0.55], spread: 0.42, ring: true, point: 'out', lean: 0.25, grow: 0.25, fade: 0.4, glow: 0.6 }, 9, feet);
    b.throwSolids({ shape: 'shard', stuff: 'ice', life: 1.4, width: [0.05, 0.08], length: [0.15, 0.3], spread: 0.32, ring: true, point: 'out', lean: 0.8, grow: 0.2, fade: 0.4, glow: 0.6 }, 8, add(feet, UP, 0.9));
    b.burst({ ...FLAKE, spread: 0.6, gravity: 0.6, speed: [0, 0.3] }, 30, add(feet, UP, 2));
    b.burst({ ...MIST, spread: 0.5, swirl: 2.5, size: [0.4, 1], up: [0.2, 0.6] }, 12, add(feet, UP, 0.8));
    b.streak('glow', add(feet, UP, 1), [0.8, 1.8], 0.4, [1.2, 2, 3.2], [0, 0, 0]);
  },
};

// ---------------------------------------------------------------------------------------------------- earth

const EARTH: C = [1.6, 0.95, 0.4];
const DUST: PuffSpec = { sprite: 'puff', life: [0.9, 1.8], size: [0.35, 1.1], speed: [0.2, 0.8], up: [0.2, 0.6], drag: 2, color: [0.3, 0.25, 0.18], cover: [0.7, 0], spin: 0.4, fadeIn: 0.12 };
const GRIT: SolidSpec = { shape: 'chunk', stuff: 'rock', life: [0.9, 1.5], width: [0.06, 0.16], length: [0.06, 0.16], speed: [2, 5], cone: 0.9, up: [1, 3], gravity: 9.8, tumble: [4, 10], fade: 0.3 };

const earth: FxLook = {
  light: EARTH,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, EARTH);
    handGlow(b, c, share, [1.4, 0.8, 0.35], 0.25);
    // Stones lifted off the ground circle the hand.
    for (let i = 0; i < 5; i++) {
      const a = t * 2.6 + i * 1.2566, r = 0.2 + 0.05 * Math.sin(t * 3 + i);
      const h = c.hand[1] - 0.45 * (1 - share) + 0.05 * Math.sin(t * 4 + i * 2);
      b.holdSolid('chunk', 'rock', [c.hand[0] + Math.cos(a) * r, h, c.hand[2] + Math.sin(a) * r], [Math.cos(a * 1.3), 1, Math.sin(a)], 0.05 + 0.02 * (i % 2), 0.06 + 0.02 * (i % 3), { roll: t * 5 + i, glow: 0.4 * share, seed: i * 0.21 });
    }
    b.emit({ ...DUST, spread: 0.8, ring: true, size: [0.2, 0.6], up: [0.1, 0.3], cover: [0.45, 0] }, 10 * share, dt, add(c.feet, UP, 0.05));
    b.throwSolids({ ...GRIT, spread: 0.7, ring: true, speed: [0.2, 0.6], up: [1.2, 2.2], width: [0.02, 0.05], length: [0.02, 0.05], life: 0.6 }, 6 * share * dt, c.feet);
  },
  release(b, hand, dir) {
    b.burst({ ...DUST, size: [0.2, 0.6], speed: [0.5, 1.5], cone: 0.6 }, 4, hand, dir);
  },
  bolt(b, at, dir, speed, _from, dt, t) {
    b.holdSolid('chunk', 'rock', at, dir, 0.3, 0.3, { roll: t * 8, glow: 0.5 });
    b.emit({ ...DUST, size: [0.15, 0.5], life: [0.4, 0.8] }, 30 * Math.max(1, speed / 18), dt, add(at, dir, -0.2));
  },
  hit(b, struck, dir) {
    const at = front(struck, dir);
    b.throwSolids({ ...GRIT, floor: at[1] - 1.1 }, 10, at, back(dir));
    b.burst(DUST, 8, at);
  },
  area(b, ground, radius) {
    if (radius > 3) {
      // Quake: the ground heaves in rings going out, throwing up stones and dust, a spike here and there.
      b.streak('ring', add(ground, UP, 0.08), [0.6, radius * 2.2], 0.8, [0.9, 0.6, 0.3], [0, 0, 0], { flat: true, cover: [0.5, 0] });
      const steps = 7;
      for (let k = 1; k <= steps; k++) {
        const r = (radius * k) / steps;
        b.later(k * 0.08, () => {
          b.burst({ ...DUST, spread: r, ring: true, up: [0.6, 1.4] }, 3 + 2.2 * r, add(ground, UP, 0.1));
          b.throwSolids({ ...GRIT, spread: r, ring: true, cone: 0.5, speed: [0.5, 2], up: [1.5, 3], floor: ground[1] }, 2 + 1.2 * r, ground);
          b.throwSolids({ shape: 'spike', stuff: 'rock', life: 0.8, width: [0.2, 0.35], length: [0.4, 0.8], spread: r, ring: true, point: 'up', lean: 0.5, grow: 0.08, fade: 0.35, sink: 0.9 }, 0.6 + 0.25 * r, ground);
        });
      }
      return;
    }
    // A spike of rock bursts up under the foe, smaller ones round it, the ground cracked, stones and dust thrown.
    b.streak('ring', add(ground, UP, 0.05), [radius * 1.2, radius * 1.8], 1.2, [0.04, 0.03, 0.02], [0.04, 0.03, 0.02], { flat: true, cover: [0.75, 0] });
    b.throwSolids({ shape: 'spike', stuff: 'rock', life: 1.5, width: 0.7, length: 2.2, point: 'up', lean: 0.12, grow: 0.12, fade: 0.45, sink: 1.9, glow: 0.35 }, 1, add(ground, UP, -0.15));
    b.throwSolids({ shape: 'spike', stuff: 'rock', life: [1.2, 1.5], width: [0.25, 0.38], length: [0.7, 1.15], spread: radius * 0.5, ring: true, point: 'out', lean: 0.35, grow: 0.14, fade: 0.4, sink: 1.2, glow: 0.2 }, 5, add(ground, UP, -0.1));
    b.throwSolids({ ...GRIT, floor: ground[1] }, 14, add(ground, UP, 0.3));
    b.burst({ ...DUST, spread: radius * 0.6, ring: true, outward: true, speed: [0.8, 2] }, 12, add(ground, UP, 0.15));
    b.burst({ ...DUST, size: [0.5, 1.4], up: [1, 2] }, 5, add(ground, UP, 0.5));
  },
  zone(b, ground, radius, dt) { b.emit({ ...DUST, spread: radius }, 3 * radius, dt, ground); },
  flare(b, feet) {
    // Stone skin: dust whirls round the body and stones fly in to it.
    b.burst({ ...DUST, spread: 0.65, ring: true, swirl: 4, up: [0.4, 1], size: [0.3, 0.9] }, 16, add(feet, UP, 0.2));
    b.burst({ sprite: 'spark', life: [0.3, 0.6], size: [0.05, 0.03], spread: 0.9, inward: true, speed: [1.5, 2.5], color: [1.4, 1, 0.6], stretch: 0.04 }, 24, add(feet, UP, 1));
    b.throwSolids({ ...GRIT, spread: 0.5, ring: true, speed: [0, 0.4], up: [0.5, 1.5], floor: feet[1], life: 1.2 }, 8, add(feet, UP, 0.2));
    b.streak('glow', add(feet, UP, 1), [0.9, 1.6], 0.35, [1.2, 0.8, 0.4], [0, 0, 0]);
  },
};

// ---------------------------------------------------------------------------------------------------- life

const LIFE: C = [0.6, 2.0, 0.5];
const LEAF: PuffSpec = { sprite: 'leaf', life: [1.1, 1.8], size: [0.1, 0.08], up: [0.6, 1.2], speed: [0.1, 0.3], swirl: 3, spin: 2.5, color: [0.32, 0.62, 0.2], cover: [1, 0], drag: 0.5, fadeIn: 0.1 };
const SEED: PuffSpec = { sprite: 'spark', life: [0.8, 1.5], size: [0.05, 0.02], up: [0.4, 0.9], speed: [0.05, 0.3], swirl: 2, color: [1.4, 3.2, 1.1], drag: 0.8 };

const life: FxLook = {
  light: LIFE,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, LIFE);
    handGlow(b, c, share, [0.9, 2.4, 0.7], 0.35);
    b.emit({ ...SEED, spread: 0.5, inward: true, speed: [0.5, 1], life: [0.5, 0.8], swirl: 0 }, 18 + 14 * share, dt, c.hand);
    b.emit({ ...LEAF, spread: 0.7, ring: true, up: [0.3, 0.7] }, 6 * share, dt, add(c.feet, UP, 0.1));
  },
  release(b, hand) { b.burst(SEED, 10, hand); },
  bolt(b, at, dir, speed, _from, dt) {
    b.hold('glow', at, 0.45, [0.9, 2.6, 0.7]);
    b.emit({ ...LEAF, swirl: 0, up: 0 }, 20 * Math.max(1, speed / 18), dt, add(at, dir, -0.2));
    b.emit(SEED, 30, dt, at);
  },
  hit(b, struck, dir) { const at = front(struck, dir); b.burst({ ...LEAF, swirl: 0, speed: [1, 2.5], up: [0.5, 1] }, 14, at); b.burst(SEED, 16, at); },
  area(b, ground, radius) {
    b.burst({ ...LEAF, spread: radius * 0.7, swirl: 0, speed: [1, 3], up: [1, 2] }, 18, add(ground, UP, 0.3));
    b.burst({ ...SEED, spread: radius }, 20, add(ground, UP, 0.3));
  },
  zoneStart(b, ground, radius, life) {
    // Roots: they burst out of the ground round the foe and stand, swaying, until the zone is gone.
    b.throwSolids({ shape: 'root', stuff: 'wood', life, width: [0.22, 0.34], length: [1.3, 2.0], spread: radius * 0.75, ring: true, point: 'out', lean: 0.45, grow: 0.35, fade: 0.6, sink: 1.8, glow: 0.2 }, 10, add(ground, UP, -0.1));
    b.throwSolids({ shape: 'root', stuff: 'wood', life, width: [0.12, 0.2], length: [0.8, 1.3], spread: radius * 0.4, point: 'up', lean: 0.8, grow: 0.3, fade: 0.6, sink: 1.2 }, 7, add(ground, UP, -0.05));
    b.burst({ ...DUST, spread: radius * 0.7, ring: true, color: [0.2, 0.16, 0.1] }, 12, add(ground, UP, 0.1));
    b.throwSolids({ ...GRIT, spread: radius * 0.6, ring: true, floor: ground[1] }, 8, ground);
  },
  zone(b, ground, radius, dt, left) {
    const k = Math.min(1, left / 0.6);
    b.emit({ ...LEAF, spread: radius * 0.8, swirl: 0.8, up: [0.2, 0.6] }, 3 * radius * k, dt, add(ground, UP, 0.5));
    b.emit({ ...SEED, spread: radius * 0.8 }, 8 * radius * k, dt, add(ground, UP, 0.2));
    b.hold('glow', add(ground, UP, 0.04), radius * 2.2, scale(LIFE, 0.07 * k), { flat: UP });
  },
  flare(b, feet) {
    // Mend, regrowth: leaves spiral up round the body in green light, seeds of light rise.
    b.burst({ ...LEAF, spread: 0.55, ring: true }, 22, add(feet, UP, 0.1));
    b.throwSolids({ shape: 'leaf', stuff: 'leaf', life: [1.1, 1.6], width: [0.1, 0.16], length: [0.14, 0.22], spread: 0.6, ring: true, up: [0.8, 1.4], speed: [0.1, 0.3], tumble: [2, 4], fade: 0.4, glow: 0.4 }, 8, add(feet, UP, 0.2));
    b.burst({ ...SEED, spread: 0.5, ring: true, up: [0.8, 1.5] }, 30, add(feet, UP, 0.2));
    b.burst({ sprite: 'glow', life: [0.8, 1.2], size: [0.5, 0.2], spread: 0.3, up: [0.9, 1.4], color: [0.5, 1.4, 0.4], fadeIn: 0.2 }, 10, add(feet, UP, 0.3));
    b.streak('ring', add(feet, UP, 0.06), [0.3, 2.2], 0.6, [0.8, 2.4, 0.7], [0, 0, 0], { flat: true });
  },
};

// ---------------------------------------------------------------------------------------------------- light

const LIGHT: C = [2.6, 2.2, 1.3];
const SPARKLE: PuffSpec = { sprite: 'spark', life: [0.3, 0.6], size: [0.045, 0.02], speed: [1, 3], drag: 2.5, color: [4, 3.4, 2], stretch: 0.02 };

function radiantBurst(b: SpellBits, at: Vec3, big: number): void {
  b.streak('glow', at, [1.0 * big, 2.4 * big], 0.25, [6, 5.2, 3.4], [0, 0, 0]);
  b.streak('ring', at, [0.3, 1.8 * big], 0.3, [3, 2.6, 1.6], [0, 0, 0]);
  b.burst({ sprite: 'ray', life: [0.16, 0.28], size: [0.07, 0.04], speed: [6 * big, 10 * big], drag: 3, color: [4, 3.4, 2.2], stretch: 0.06 }, 12 * big, at);
  b.burst(SPARKLE, 18 * big, at);
}

const light: FxLook = {
  light: LIGHT,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, LIGHT);
    handGlow(b, c, share, [3.2, 2.8, 1.8], 0.45);
    b.hold('glow', c.hand, 0.12 + 0.12 * share, [6, 5.5, 4.5]);
    // Rays drawn in to the hand.
    b.emit({ sprite: 'ray', life: [0.2, 0.35], size: [0.05, 0.02], spread: 0.9, inward: true, speed: [2.5, 4], color: [3, 2.6, 1.6], stretch: 0.08 }, 20 + 20 * share, dt, c.hand);
  },
  release(b, hand) { b.streak('glow', hand, [0.4, 1.2], 0.15, [6, 5, 3], [0, 0, 0]); b.burst(SPARKLE, 10, hand); },
  bolt(b, at, dir, _speed, from, dt) {
    // A lance of sunlight from the hand to its head: a beam with a white heart.
    const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2], len = Math.hypot(dx, dy, dz);
    if (len > 0.05) {
      const mid: Vec3 = [from[0] + dx / 2, from[1] + dy / 2, from[2] + dz / 2];
      b.hold('ray', mid, 0.3, [3, 2.5, 1.4], { stretch: [dx, dy, dz], aspect: len / 0.3, cover: 0.05, seed: 0.3 });
      b.hold('ray', mid, 0.1, [5, 4.6, 3.6], { stretch: [dx, dy, dz], aspect: len / 0.1, seed: 0.7 });
    }
    b.hold('glow', at, 0.6, [5, 4.4, 2.8]);
    b.emit({ ...SPARKLE, speed: [0.2, 0.8] }, 60, dt, at, back(dir));
  },
  hit(b, struck, dir, from) {
    const at = front(struck, dir);
    // The beam stands a moment and fades.
    const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2], len = Math.hypot(dx, dy, dz);
    if (len > 0.05) b.streak('ray', [from[0] + dx / 2, from[1] + dy / 2, from[2] + dz / 2], [0.26, 0.06], 0.45, [4, 3.5, 2.3], [0, 0, 0], { way: [dx, dy, dz], aspect: len / 0.18 });
    radiantBurst(b, at, 1);
  },
  area(b, ground, radius) {
    const mid = add(ground, UP, 1);
    radiantBurst(b, mid, Math.max(1, radius / 3));
    b.streak('ring', add(ground, UP, 0.1), [0.5, radius * 2.3], 0.45, [4, 3.4, 2], [0, 0, 0], { flat: true });
    b.streak('ray', add(ground, UP, 2.5), [1.2, 0.3], 0.55, [3.5, 3, 1.9], [0, 0, 0], { way: UP, aspect: 4.5 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.burst({ sprite: 'ray', life: [0.22, 0.32], size: [0.12, 0.05], speed: [radius * 3, radius * 4], cone: 0.05, drag: 3, color: [3.5, 3, 1.8], stretch: 0.07 }, 1, add(ground, UP, 0.4), [Math.cos(a), 0.05, Math.sin(a)]);
    }
  },
  zoneStart(b, ground, radius) {
    b.streak('circle', add(ground, UP, 0.03), [radius * 2, radius * 2.02], 1.2, [2, 1.7, 1], [0, 0, 0], { flat: true, cover: [0.1, 0], spin: 0.3 });
  },
  zone(b, ground, radius, dt, left) {
    // Dawn: warm light on the ground, motes rising and soft rays falling from above.
    const k = Math.min(1, left / 0.8);
    b.hold('glow', add(ground, UP, 0.04), radius * 2.4, scale(LIGHT, 0.22 * k), { flat: UP });
    b.emit({ ...SPARKLE, spread: radius * 0.9, speed: [0, 0.1], up: [0.3, 0.8], life: [1.2, 2], stretch: 0, drag: 0.3, size: [0.04, 0.02] }, 12 * radius * k, dt, add(ground, UP, 0.3));
    if (b.rng.float() < 1.4 * radius * k * dt) {
      const a = b.rng.range(0, Math.PI * 2), r = radius * 0.8 * Math.sqrt(b.rng.float());
      b.streak('ray', [ground[0] + Math.cos(a) * r, ground[1] + 2, ground[2] + Math.sin(a) * r], [0.4, 0.4], 1.4, [1.2, 1, 0.6], [0, 0, 0], { way: UP, aspect: 10, fadeIn: 0.35 });
    }
  },
  flare(b, feet) { radiantBurst(b, add(feet, UP, 1.1), 0.8); },
};

// ---------------------------------------------------------------------------------------------------- shadow

const SHADE: C = [1.1, 0.4, 2.0];
const DARK: PuffSpec = { sprite: 'puff', life: [0.6, 1.1], size: [0.25, 0.7], speed: [0.1, 0.5], drag: 2, color: [0.03, 0.01, 0.05], cover: [0.9, 0], spin: 1, fadeIn: 0.15 };
const WISP: PuffSpec = { sprite: 'wisp', life: [0.5, 0.9], size: [0.12, 0.08], speed: [0.6, 1.4], drag: 1.5, color: [1.4, 0.45, 2.6], cover: [0.6, 0], stretch: 0.35 };
const VIOLET: PuffSpec = { sprite: 'spark', life: [0.3, 0.6], size: [0.04, 0.02], speed: [0.8, 2.5], drag: 2, color: [2.2, 0.8, 4], stretch: 0.03 };

function shadowBurst(b: SpellBits, at: Vec3, big: number): void {
  b.burst({ ...DARK, speed: [1, 2.6], size: [0.4 * big, 1.1 * big] }, 12 * big, at);
  b.burst({ ...WISP, speed: [2, 4] }, 12 * big, at);
  b.burst(VIOLET, 16 * big, at);
  b.streak('glow', at, [1.4 * big, 0.4], 0.3, [1.6, 0.5, 3], [0, 0, 0]);
}

const shadow: FxLook = {
  light: SHADE,
  gather(b, c, share, dt, t) {
    circle(b, c, share, t, SHADE);
    b.hold('puff', c.hand, 0.18 + 0.25 * share, [0.02, 0.0, 0.04], { cover: 0.85, seed: t * 0.1 % 1 });
    b.hold('glow', c.hand, 0.3 + 0.4 * share, [1.2, 0.4, 2.2]);
    b.emit({ ...WISP, spread: 0.7, inward: true, speed: [0.8, 1.4], life: [0.4, 0.6] }, 14 + 10 * share, dt, c.hand);
    b.emit({ ...DARK, spread: 0.8, ring: true, size: [0.3, 0.8], up: [0.1, 0.3], cover: [0.5, 0] }, 8 * share, dt, add(c.feet, UP, 0.1));
  },
  release(b, hand, dir) { b.burst({ ...DARK, speed: [0.5, 1.5], cone: 0.6 }, 5, hand, dir); },
  bolt(b, at, dir, speed, _from, dt, t) {
    b.hold('puff', at, 0.7, [0.02, 0.0, 0.035], { cover: 1, seed: (t * 0.3) % 1 });
    b.hold('glow', at, 0.85, [1.3, 0.4, 2.4]);
    const trail = Math.max(1, speed / 16);
    b.emit({ ...DARK, size: [0.3, 0.6], life: [0.35, 0.6], speed: [0.05, 0.3] }, 50 * trail, dt, add(at, dir, -0.15));
    b.emit({ ...WISP, speed: [0.3, 0.9] }, 26 * trail, dt, at, back(dir));
    b.emit(VIOLET, 14 * trail, dt, at);
  },
  hit(b, at, dir) { shadowBurst(b, front(at, dir), 1); },
  area(b, ground, radius) { shadowBurst(b, add(ground, UP, 0.8), Math.max(1, radius / 2)); },
  zone(b, ground, radius, dt) { b.emit({ ...DARK, spread: radius }, 6 * radius, dt, ground); },
  flare(b, feet) {
    // Veil: shadow winds round the body and clings.
    b.burst({ ...DARK, spread: 0.5, ring: true, swirl: 2.8, up: [0.2, 0.6], life: [1.2, 1.8], size: [0.4, 1] }, 26, add(feet, UP, 0.3));
    b.burst({ ...WISP, spread: 0.45, ring: true, up: [0.8, 1.4], speed: [0, 0.3] }, 12, add(feet, UP, 0.4));
    b.burst(VIOLET, 14, add(feet, UP, 1));
  },
};

const BY_MOTIF: Readonly<Record<SpellMotif, FxLook>> = { flame: fire, frost, stone: earth, bloom: life, radiance: light, shade: shadow };

/** A look by its name where it has its own way, else its motif's. */
export function lookOf(motif: SpellMotif, _look?: string): FxLook {
  return BY_MOTIF[motif];
}

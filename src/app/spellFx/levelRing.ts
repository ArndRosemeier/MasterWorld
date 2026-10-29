/**
 * The level celebration (plan G3, D58): warded-brass lines flare on the ground round the hero, rise as a ring of
 * light from the feet to above the head and fade there, with brass sparks drifting up. Drawn with the spells'
 * own bits (particles.ts) and shaders, so it builds no shader of its own (F3). It follows the hero (who may
 * walk or fight on: play never stops). Pure; the spell view draws it.
 */
import { smoothstep } from '@futuremagic/core';
import type { SpellBits, Vec3 } from './particles';

/** How long it plays (s). */
export const RING_TIME = 2.4;
/** Brass, glowing (linear, over 1). */
const BRASS: Vec3 = [2.6, 1.7, 0.6];
const WHITE_BRASS: Vec3 = [4, 3.2, 1.8];
const UP: Vec3 = [0, 1, 0];
/** The ring's radius on the ground (m) and how high it rises. */
const RADIUS = 1.25;
const RISE = 2.3;
/** The brass lines standing round the ring. */
const LINES = 20;

const k = (c: Vec3, s: number): Vec3 => [c[0] * s, c[1] * s, c[2] * s];

export class LevelRing {
  private age = RING_TIME;

  /** Playing now. */
  get on(): boolean { return this.age < RING_TIME; }

  /** Begin it (again, if it was still playing: two levels at once play one ring). */
  kindle(b: SpellBits, feet: Vec3): void {
    this.age = 0;
    // The first flare: a burst of brass sparks off the ground.
    b.burst({ sprite: 'spark', life: [0.5, 0.9], size: [0.06, 0.02], spread: RADIUS, ring: true, speed: [0.3, 1], up: [1.5, 3], drag: 1.2, color: WHITE_BRASS, to: BRASS, stretch: 0.04 }, 36, [feet[0], feet[1] + 0.05, feet[2]]);
  }

  /** Every frame while it plays: drawn round `feet`. */
  rise(b: SpellBits, feet: Vec3, dt: number): void {
    if (!this.on) return;
    this.age = Math.min(RING_TIME, this.age + dt);
    const t = this.age, ground: Vec3 = [feet[0], feet[1] + 0.04, feet[2]];
    // The warded lines on the ground flare up first and die down as the ring leaves them.
    const flare = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 1.2);
    if (flare > 0) {
      b.hold('circle', ground, RADIUS * 2.2 * (0.8 + 0.2 * flare), k(BRASS, 0.5 + flare), { flat: UP, rot: t * 0.8, cover: 0.1 * flare, seed: 0.61 });
      b.hold('glow', ground, RADIUS * 2.8, k(BRASS, 0.18 * flare), { flat: UP });
    }
    // The ring rises from the feet to above the head, narrowing a little, and fades at the top.
    const up = smoothstep(0, RING_TIME * 0.8, t), fade = t > RING_TIME * 0.7 ? Math.max(0, 1 - (t - RING_TIME * 0.7) / (RING_TIME * 0.3)) : 1;
    const ringY = feet[1] + 0.05 + RISE * up, r = RADIUS * (1 - 0.25 * up);
    const at: Vec3 = [feet[0], ringY, feet[2]];
    b.hold('ring', at, r * 2.2, k(WHITE_BRASS, 0.9 * fade), { flat: UP, rot: t * 1.4, seed: 0.23 });
    b.hold('glow', at, r * 2.6, k(BRASS, 0.25 * fade), { flat: UP });
    // Brass lines of light stand from the ground to the ring, all round it.
    const tall = ringY - feet[1];
    if (tall > 0.1) {
      for (let i = 0; i < LINES; i++) {
        const a = (i / LINES) * Math.PI * 2 + t * 0.5, rr = r * (0.98 + 0.04 * Math.sin(i * 2.3));
        const mid: Vec3 = [feet[0] + Math.cos(a) * rr, feet[1] + tall / 2, feet[2] + Math.sin(a) * rr];
        b.hold('ray', mid, 0.06, k(BRASS, (0.7 + 0.3 * Math.sin(t * 9 + i)) * fade), { stretch: UP, aspect: tall / 0.06, seed: i / LINES });
      }
    }
    // Sparks drift up off the ring.
    b.emit({ sprite: 'spark', life: [0.4, 0.8], size: [0.04, 0.015], spread: r, ring: true, speed: [0, 0.2], up: [0.6, 1.4], drag: 0.8, color: WHITE_BRASS, to: BRASS, stretch: 0.03 }, 60 * fade, dt, at);
  }
}

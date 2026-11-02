/**
 * The hero passing through a portal (app/portals.ts): a brief light not of this world on the body, drawn with the
 * spells' own bits (particles.ts) and shaders, so it builds no shader of its own. A soft aura, a ring that
 * climbs the body from the feet to the head, wisps winding up it and sparks falling away, then gone, all
 * within CROSSING_TIME. Each crossing is a little different (colour phase, spin, the wisps' ways), drawn from
 * the world's seed and the crossing's number. Pure.
 */
import { hash3i, hashToFloat, smoothstep, v3lerp } from '@futuremagic/core';
import type { SpellBits, Vec3 } from './particles';
import { lit3 as glowOf, TEAL, VIOLET, WHITE } from './portalStoneFx';

const UP: Vec3 = [0, 1, 0];

/** How long the glow lasts (s), and how long it takes to come up (s). */
export const CROSSING_TIME = 1.5;
const COMES = 0.12;
/** How long the ring takes to climb the body (s), and the body's height (m) it climbs. */
const CLIMB = 0.65, HEIGHT = 1.9;
/** Wisps winding round the body. */
const WISPS = 6;

export class CrossingFx {
  /** Seconds since the last crossing started (past CROSSING_TIME: none glowing). */
  private age = CROSSING_TIME;
  /** This crossing's colour phase, spin way (±1) and wisps' offset: drawn from the seed. */
  private phase = 0;
  private way = 1;
  private offset = 0;

  constructor(private readonly seed: number) {}

  /** Glowing now. */
  get glowing(): boolean { return this.age < CROSSING_TIME; }

  /** The `n`th crossing begins (a new one while one glows starts it over). */
  flare(n: number): void {
    const roll = (k: number): number => hashToFloat(hash3i(this.seed, n, k, 0x9c05));
    this.age = 0;
    this.phase = roll(0) * Math.PI * 2;
    this.way = roll(1) < 0.5 ? -1 : 1;
    this.offset = roll(2) * Math.PI * 2;
  }

  /** The colour at a phase: drifting between violet and sea green. */
  private hue(p: number): Vec3 { return v3lerp([...VIOLET], [...TEAL], 0.5 + 0.5 * Math.sin(p + this.phase)); }

  /** Every frame: the glow on the hero standing with its feet at `feet`. */
  glow(b: SpellBits, dt: number, feet: Vec3): void {
    if (this.age >= CROSSING_TIME) return;
    this.age += dt;
    const a = this.age;
    // Quick up, slow down.
    const k = Math.min(1, a / COMES) * (1 - smoothstep(0.3, CROSSING_TIME, a));
    if (k <= 0.005) return;
    const [x, y, z] = feet, mid: Vec3 = [x, y + HEIGHT * 0.5, z];
    b.hold('glow', mid, 2.6, glowOf(this.hue(a * 3), 0.34 * k), { seed: 0.23 });
    b.hold('glow', [x, y + HEIGHT * 0.62, z], 1.1, glowOf(WHITE, 0.16 * k), { seed: 0.61 });
    // A ring climbs from the feet to the head (a plain ring: no star or sign of any faith), and a second follows it.
    for (let i = 0; i < 2; i++) {
      const c = (a - i * 0.14) / CLIMB;
      if (c <= 0 || c >= 1) continue;
      const fade = Math.sin(Math.PI * c);
      b.hold('ring', [x, y + 0.04 + c * HEIGHT, z], 0.85 - 0.2 * i, glowOf(i ? this.hue(a * 3 + 2) : WHITE, (i ? 0.8 : 1.1) * fade * k), { flat: UP, rot: this.way * a * 2.4 + i, seed: 0.41 + i * 0.3 });
    }
    // Wisps wind up the body, out of step.
    for (let i = 0; i < WISPS; i++) {
      const rise = (a * 0.9 + i / WISPS) % 1, ang = this.offset + this.way * (a * 3.2 + i * 1.7), r = 0.38 + 0.08 * Math.sin(a * 5 + i);
      b.hold('wisp', [x + Math.cos(ang) * r, y + 0.1 + rise * HEIGHT, z + Math.sin(ang) * r], 0.34, glowOf(this.hue(a * 2 + i), 0.55 * k * Math.sin(Math.PI * rise)), { rot: this.way * a + i, seed: (i * 0.137) % 1, age: rise });
    }
    // Sparks come off it and fall away.
    b.emit({ sprite: 'spark', life: [0.4, 0.9], size: [0.06, 0.012], spread: 0.35, speed: [0.1, 0.6], up: [0.1, 0.8], drag: 1.1, gravity: 1.2, color: glowOf(WHITE, 1.4), to: TEAL, stretch: 0.04 }, 60 * k, dt, mid);
  }
}

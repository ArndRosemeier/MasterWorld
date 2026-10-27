/**
 * The motes round spells (C4): sparks, flakes, grit, seeds of light, glints and wisps that each school's
 * spells shed as they gather, fly, burst and linger. Pure (no three.js): the spell view (spellView.ts) draws
 * them as small glowing dots; a test checks how they move. Seeded: the same spells shed the same motes.
 */
import { Rng } from '@futuremagic/core';
import { SPELL_MOTIFS, type SpellMotif } from '../setting/contract';

/** How a motif's motes move: lift (m/s up), pull (m/s² down), spread (m/s out), swirl (rad/s round), life (s), size (m), bright. */
export interface MoteWay { readonly lift: number; readonly pull: number; readonly spread: number; readonly swirl: number; readonly life: number; readonly size: number; readonly bright: number }

export const MOTE_WAYS: Readonly<Record<SpellMotif, MoteWay>> = {
  // Sparks leap up and die quickly.
  flame: { lift: 1.6, pull: 0, spread: 0.5, swirl: 0, life: 0.55, size: 0.05, bright: 1.6 },
  // Flakes drift down, turning.
  frost: { lift: -0.35, pull: 0, spread: 0.35, swirl: 0.6, life: 1, size: 0.035, bright: 1.4 },
  // Grit is thrown up and falls back.
  stone: { lift: 2.2, pull: 9, spread: 1.4, swirl: 0, life: 0.8, size: 0.07, bright: 0.6 },
  // Seeds of light spiral slowly up.
  bloom: { lift: 0.6, pull: 0, spread: 0.3, swirl: 2.5, life: 1.3, size: 0.045, bright: 1 },
  // Glints shoot straight out.
  radiance: { lift: 0, pull: 0, spread: 2.6, swirl: 0, life: 0.4, size: 0.03, bright: 2 },
  // Wisps sink and curl.
  shade: { lift: -0.25, pull: 0, spread: 0.4, swirl: 1, life: 1.2, size: 0.09, bright: 0.7 },
};

export interface Mote { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; readonly way: MoteWay; readonly motif: number; readonly seed: number; readonly tint: unknown }

/** The motif's place in SPELL_MOTIFS (the shader's motif number). */
export const motifIndex = (m: SpellMotif): number => SPELL_MOTIFS.indexOf(m);

export class Motes {
  readonly list: Mote[] = [];
  private readonly rng: Rng;
  private readonly dir: [number, number, number] = [0, 0, 0];

  /** `cap`: motes alive at once, at most (the oldest go first). */
  constructor(seed: number, readonly cap = 200) {
    this.rng = new Rng(seed);
  }

  /**
   * Shed motes at (x, y, z): `count` of them (a fraction sheds one by chance), scattered within `r` metres,
   * thrown out at `out` m/s more than their way spreads. `tint` rides along for the drawing.
   */
  shed(motif: SpellMotif, tint: unknown, count: number, x: number, y: number, z: number, r = 0, out = 0): void {
    const way = MOTE_WAYS[motif], rng = this.rng;
    let n = Math.floor(count);
    if (rng.float() < count - n) n++;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = rng.onSphere(this.dir);
      const at = r * Math.cbrt(rng.float()), speed = way.spread * rng.range(0.4, 1) + out;
      if (this.list.length >= this.cap) this.list.shift();
      this.list.push({
        x: x + dx * at, y: y + Math.abs(dy) * at, z: z + dz * at,
        vx: dx * speed, vy: dy * speed * 0.5 + way.lift, vz: dz * speed,
        age: 0, way, motif: motifIndex(motif), seed: rng.float(), tint,
      });
    }
  }

  /** Move them on by dt seconds; the spent go. */
  drift(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i]!, w = m.way;
      m.age += dt;
      if (m.age >= w.life) { this.list.splice(i, 1); continue; }
      m.vy -= w.pull * dt;
      if (w.swirl) {
        const a = w.swirl * dt, c = Math.cos(a), s = Math.sin(a), vx = m.vx;
        m.vx = vx * c - m.vz * s;
        m.vz = vx * s + m.vz * c;
      }
      // The air slows what was thrown (not what falls).
      const drag = Math.exp(-1.5 * dt);
      m.vx *= drag;
      m.vz *= drag;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
    }
  }
}

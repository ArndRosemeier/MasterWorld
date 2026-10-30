/**
 * The portal stone's light (app/portalStoneUse.ts), drawn with the spells' own bits (particles.ts) and shaders,
 * so it builds no shader of its own: the halo round the stone held up, the beam it sends to the floor and the
 * floor's glow fading there, a portal tearing open (or fizzling where there is no room), and the eerie border
 * of every open portal: wisps of violet and sea-green light crawling round its edge, shedding sparks. Pure.
 */
import { openingOutline, type PortalFrame, type PortalShape } from '../../game/portal';
import { v3lerp } from '@futuremagic/core';
import { onLand } from '../../world/dungeon/site';
import type { SpellBits, Vec3 } from './particles';

/** The light not of this world: violet and sea green (linear, over 1: it glows). */
const VIOLET: Vec3 = [1.1, 0.35, 2.6];
const TEAL: Vec3 = [0.25, 2.0, 1.9];
const WHITE: Vec3 = [2.6, 2.4, 3.2];
const UP: Vec3 = [0, 1, 0];
/** How long the beam stands (s), and how long the floor glows after it (s). */
export const BEAM_TIME = 0.75;
export const FLOOR_TIME = 4.5;

const lit3 = (c: Vec3, s: number): Vec3 => [c[0] * s, c[1] * s, c[2] * s];
/** The colour at a phase: drifting between violet and sea green. */
const hueAt = (p: number): Vec3 => v3lerp([...VIOLET], [...TEAL], 0.5 + 0.5 * Math.sin(p));

/** One open portal's border, as the controller hands it: its frame, shape, how it is stretched now (opening included) and how far open. */
export interface Rim { readonly frame: PortalFrame; readonly shape: PortalShape; readonly sx: number; readonly sy: number; readonly open: number }

/** A point on a frame's plane (u across, v up) in the world, `out` metres out of the plane (towards its back). */
function onPlane(f: PortalFrame, u: number, v: number, out = 0): Vec3 {
  const [x, z] = onLand(f, u, out);
  return [x, f.y + v, z];
}

export class PortalStoneFx {
  private beam: { from: Vec3; to: Vec3; age: number } | null = null;
  private fizzles: { at: Vec3; normal: Vec3; age: number }[] = [];
  private t = 0;

  /** The beam from the stone (its foot) down to the floor at `to`; the floor glows there and fades. */
  beamDown(b: SpellBits, from: Vec3, to: Vec3): void {
    this.beam = { from, to, age: 0 };
    b.burst({ sprite: 'spark', life: [0.5, 1.2], size: [0.07, 0.02], spread: 0.25, ring: true, speed: [0.4, 1.4], up: [0.4, 1.5], drag: 1.4, gravity: 1.5, color: lit3(WHITE, 1.4), to: TEAL, stretch: 0.05, outward: true }, 50, [to[0], to[1] + 0.05, to[2]]);
  }

  /** A portal tears open: a flash, and sparks thrown off its outline. */
  tearOpen(b: SpellBits, f: PortalFrame, shape: PortalShape): void {
    b.streak('glow', onPlane(f, 0, shape.height * 0.5), [shape.height * 1.6, shape.height * 0.6], 0.8, lit3(WHITE, 0.9), lit3(VIOLET, 0));
    for (const [u, v] of openingOutline(shape, 10)) {
      b.burst({ sprite: 'spark', life: [0.4, 1], size: [0.08, 0.02], spread: 0.08, speed: [0.5, 2], cone: Math.PI, drag: 1.6, gravity: -0.3, color: lit3(WHITE, 1.5), to: hueAt(u * 3 + v), stretch: 0.05 }, 4, onPlane(f, u, Math.max(0.05, v)));
    }
  }

  /** A portal closes (the old far one, or both when home moves): its light sucked in, a last flash. */
  shutDown(b: SpellBits, f: PortalFrame, shape: PortalShape): void {
    const mid = onPlane(f, 0, shape.height * 0.45);
    b.streak('glow', mid, [shape.height * 1.2, 0.05], 0.6, lit3(TEAL, 0.8), lit3(VIOLET, 0));
    for (const [u, v] of openingOutline(shape, 8)) {
      const at = onPlane(f, u, Math.max(0.05, v)), to: Vec3 = [mid[0] - at[0], mid[1] - at[1], mid[2] - at[2]];
      b.burst({ sprite: 'spark', life: [0.3, 0.6], size: [0.06, 0.01], speed: [1.5, 3], cone: 0.3, drag: 0.5, color: lit3(TEAL, 1.4), to: VIOLET, stretch: 0.06 }, 3, at, to);
    }
  }

  /** No room (or no home): a portal starts to open at `f` and fails, its light spitting out and falling. */
  fizzle(b: SpellBits, f: PortalFrame): void {
    const at = onPlane(f, 0, 1.3), back = onPlane(f, 0, 1.3, 1);
    this.fizzles.push({ at, normal: [back[0] - at[0], 0, back[2] - at[2]], age: 0 });
    b.burst({ sprite: 'spark', life: [0.4, 1.1], size: [0.07, 0.015], spread: 0.35, speed: [0.6, 2.2], cone: Math.PI, drag: 0.8, gravity: 6, color: lit3(WHITE, 1.3), to: VIOLET, stretch: 0.05 }, 70, at);
    b.burst({ sprite: 'puff', life: [0.8, 1.4], size: [0.3, 0.9], spread: 0.3, speed: [0.1, 0.4], up: [0.2, 0.5], drag: 1, color: [0.05, 0.03, 0.08], to: [0.02, 0.02, 0.03], cover: [0.5, 0] }, 8, at);
  }

  /** Every frame: the stone's halo (`stone`: where it floats and how much of it is there; null when put away), the beam, the floor, the fizzles, the borders. */
  glowFrame(b: SpellBits, dt: number, stone: { at: Vec3; there: number } | null, rims: readonly Rim[]): void {
    this.t += dt;
    const t = this.t;
    if (stone && stone.there > 0.02) {
      const a = stone.at, s = stone.there;
      b.hold('glow', a, 1.25, lit3(hueAt(t * 0.9), 0.22 * s), { seed: 0.31 });
      b.hold('glow', a, 0.7, lit3(WHITE, 0.08 * s), { seed: 0.77 });
      // Motes circle it, slowly, out of step.
      for (let i = 0; i < 5; i++) {
        const ang = t * (0.7 + i * 0.13) + i * 1.3, r = 0.36 + 0.05 * Math.sin(t * 1.7 + i);
        b.hold('spark', [a[0] + Math.cos(ang) * r, a[1] + Math.sin(t * 1.1 + i * 2) * 0.22, a[2] + Math.sin(ang) * r], 0.06, lit3(hueAt(t + i), 1.6 * s), { seed: i / 5 });
      }
      b.emit({ sprite: 'wisp', life: [0.8, 1.4], size: [0.12, 0.3], spread: 0.3, speed: [0, 0.1], up: [0.05, 0.2], drag: 0.6, swirl: 1.2, color: lit3(hueAt(t * 1.3), 0.6 * s), to: lit3(VIOLET, 0) }, 10, dt, a);
    }
    const bm = this.beam;
    if (bm) {
      bm.age += dt;
      const f = bm.from, g = bm.to, beamOn = bm.age < BEAM_TIME ? Math.min(1, bm.age / 0.08) * (1 - Math.max(0, bm.age - BEAM_TIME * 0.6) / (BEAM_TIME * 0.4)) : 0;
      if (beamOn > 0) {
        const tall = Math.max(0.05, f[1] - g[1]), mid: Vec3 = [(f[0] + g[0]) / 2, (f[1] + g[1]) / 2, (f[2] + g[2]) / 2];
        b.hold('ray', mid, 0.09, lit3(WHITE, 1.6 * beamOn), { stretch: UP, aspect: tall / 0.09, seed: 0.12 });
        b.hold('ray', mid, 0.26, lit3(hueAt(t * 4), 0.7 * beamOn), { stretch: UP, aspect: tall / 0.26, seed: 0.54 });
        b.hold('glow', f, 0.45, lit3(WHITE, 0.6 * beamOn));
      }
      // The floor takes the light: quick up, slow down.
      const fl = bm.age < 0.25 ? bm.age / 0.25 : Math.max(0, 1 - (bm.age - 0.25) / (FLOOR_TIME - 0.25));
      const glow = fl * fl * (3 - 2 * fl);
      if (glow > 0) {
        const at: Vec3 = [g[0], g[1] + 0.04, g[2]];
        // Two rings turning against each other (plain rings: no star or sign of any faith).
        b.hold('ring', at, 1.5 * (0.85 + 0.15 * glow), lit3(hueAt(t * 1.4), 0.9 * glow), { flat: UP, rot: t * 0.6, seed: 0.41 });
        b.hold('ring', at, 1.0 * (0.85 + 0.15 * glow), lit3(hueAt(t * 1.4 + 2), 0.7 * glow), { flat: UP, rot: -t * 0.9, seed: 0.83 });
        b.hold('glow', at, 2.6, lit3(hueAt(t * 1.4 + 1), 0.3 * glow), { flat: UP });
        const ring = Math.min(1, bm.age / 0.9);
        if (ring < 1) b.hold('ring', at, 0.4 + 2.4 * ring, lit3(WHITE, 1.2 * (1 - ring)), { flat: UP, rot: t, seed: 0.66 });
        b.emit({ sprite: 'spark', life: [0.4, 0.9], size: [0.05, 0.01], spread: 0.6, ring: true, speed: [0, 0.2], up: [0.4, 1], drag: 1, color: lit3(TEAL, 1.4), to: VIOLET, stretch: 0.04 }, 30 * glow, dt, at);
      }
      if (bm.age > FLOOR_TIME) this.beam = null;
    }
    for (let i = this.fizzles.length - 1; i >= 0; i--) {
      const z = this.fizzles[i]!;
      z.age += dt;
      if (z.age > 0.7) { this.fizzles.splice(i, 1); continue; }
      // A ring that tries to widen into an opening, flickers and gutters out.
      const grow = Math.min(1, z.age / 0.25), die = Math.max(0, 1 - (z.age - 0.25) / 0.45), flick = 0.6 + 0.4 * Math.sin(z.age * 90);
      b.hold('ring', z.at, 0.4 + 1.1 * grow * die, lit3(hueAt(t * 6), 1.3 * die * flick), { flat: z.normal, rot: t * 3, seed: 0.2 });
      b.hold('glow', z.at, 1.2 * grow, lit3(VIOLET, 0.4 * die * flick), { flat: z.normal });
    }
    for (const r of rims) this.edgeLight(b, dt, r);
  }

  /** An open portal's border: wisps crawl round the edge (just outside it: inside, the view beyond covers them), shedding sparks. */
  private edgeLight(b: SpellBits, dt: number, r: Rim): void {
    if (r.open <= 0.01) return;
    const t = this.t, f = r.frame, sh = r.shape, o = r.open;
    const outline = openingOutline(sh, 14).slice(1, -1);
    // Along the sides down to the floor as well as round the top.
    const pts: [number, number][] = [[sh.halfWidth, 0.05], [sh.halfWidth, (sh.height - sh.halfWidth) * 0.5], ...outline, [-sh.halfWidth, (sh.height - sh.halfWidth) * 0.5], [-sh.halfWidth, 0.05]];
    const mx = 0, my = sh.height * 0.45 * r.sy;
    pts.forEach(([u0, v0], i) => {
      const su = u0 * r.sx, sv = v0 * r.sy;
      // Out from the middle a little, wavering.
      const du = su - mx, dv = sv - my, l = Math.hypot(du, dv) || 1, wob = 0.07 + 0.05 * Math.sin(t * 3.1 + i * 1.7);
      const at = onPlane(f, su + (du / l) * wob, Math.max(0.03, sv + (dv / l) * wob));
      const ph = t * 1.6 + i * 0.55;
      b.hold('wisp', at, (0.42 + 0.12 * Math.sin(t * 2.3 + i)) * o, lit3(hueAt(ph), 0.9 * o), { rot: t * (i % 2 ? 1.3 : -1.1) + i, seed: (i * 0.137) % 1, age: (t * 0.4 + i * 0.07) % 1 });
      if (i % 3 === 0) b.hold('glow', at, 0.9 * o, lit3(hueAt(ph + 1), 0.16 * o), { seed: (i * 0.29) % 1 });
    });
    // Sparks crawl off the edge, now here, now there.
    const pick = pts[Math.floor((t * 37) % pts.length)]!;
    b.emit({ sprite: 'spark', life: [0.5, 1.1], size: [0.06, 0.01], spread: 0.1, speed: [0.1, 0.5], up: [0.1, 0.5], drag: 1.2, swirl: 0.8, color: lit3(WHITE, 1.3), to: hueAt(t), stretch: 0.04 }, 26 * o, dt, onPlane(f, pick[0] * r.sx, Math.max(0.05, pick[1] * r.sy)));
  }
}

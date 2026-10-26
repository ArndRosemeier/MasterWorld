/**
 * A barrow as it stands on the land (pure): a grassed mound ringed with kerbstones, its passage banked
 * over with earth that slopes down onto a portal of rough rock (two jambs, a lintel) and a dark way in, in
 * the building mesh format so it draws with the town's one building shader. Its own frame: the doorway at
 * the origin, the way in towards −z (turn it by the site's yaw), the ground at y 0. `inBarrowShape` says
 * where the walker cannot go (the mound, its bank and the stones).
 */
import { Rng } from '@futuremagic/core';
import { BuildingMat, CellarMat, MeshKit, WildMat, varyTint, type Tint } from './meshKit';
import type { BuildingMesh } from '@futuremagic/settlement';

/** The mound: radius and height (m), and how far behind the doorway its middle is. */
export const MOUND = { r: 7, h: 2.8, back: 9.6 } as const;
/** The stone passage: half its inner width, its height, and from where to where it runs along z (m). */
export const PASSAGE = { half: 0.6, h: 1.9, front: 0.6, end: -2.6 } as const;
/** Where in the passage the hero goes down (its frame). */
export const WAY_DOWN = { x: 0, z: -1.7 } as const;

/** The portal: the jambs' outer edge from the middle, the lintel's top (m). */
export const PORTAL = { outer: PASSAGE.half + 0.62, top: PASSAGE.h + 0.5 } as const;
/**
 * The earth banked over the passage: half its width at the foot, its height, how far back it rises from the
 * stones to its full height, and where it ends inside the mound (z) (m).
 */
export const BANK = { half: 3.1, h: 2.7, slope: 1.6, back: -6.4 } as const;

/** The land's rock and grass as they are (weathered, a little lichen), and grass worn thin and shaded by the stones. */
const ROCK: Tint = [236, 236, 226];
const GRASS: Tint = [235, 240, 222];
const WORN: Tint = [150, 140, 104];
/** The passage: dry-stone walls and flags in the daylight at its mouth, black where it goes on down. */
const DRYSTONE: Tint = [190, 182, 166];
const FLAGS: Tint = [150, 142, 128];
const DARK: Tint = [10, 9, 8];

const mix = (a: Tint, b: Tint, t: number): Tint => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as unknown as Tint;

export function barrowMesh(seed = 1): BuildingMesh {
  const k = new MeshKit(), rng = new Rng(seed);
  mound(k);
  bank(k);
  passage(k, rng);
  kerb(k, rng);
  return k.mesh();
}

/** The mound: rings of a flattened dome under grass, then a skirt into the ground (the land is never quite level). */
function mound(k: MeshKit): void {
  const seg = 28, rings = 7, start = k.mark;
  const ringPoint = (ring: number, s: number): number[] => {
    const phi = (ring / rings) * (Math.PI / 2), a = (s / seg) * Math.PI * 2;
    const r = ring > rings ? MOUND.r : MOUND.r * Math.sin(phi), y = ring > rings ? -2 : MOUND.h * Math.cos(phi);
    return [Math.cos(a) * r, y, -MOUND.back + Math.sin(a) * r];
  };
  for (let i = 0; i <= rings; i++) for (let s = 0; s < seg; s++) {
    const a = ringPoint(i, s), b = ringPoint(i + 1, s), c = ringPoint(i + 1, s + 1), d = ringPoint(i, s + 1);
    k.quad(a, d, c, b, [a, d, c, b].map(earthUv), WildMat.Grass, GRASS);
  }
  k.smoothFrom(start);
}

/** Grass on a slope: u across, v along the fall, both in metres near enough. */
const earthUv = (p: number[]): number[] => [p[0], p[2] + p[1]];

/**
 * The earth heaped over the passage and against the portal: a ridge from the mound that slopes down at the
 * front onto the jambs and the lintel, so only their faces stand out of it.
 */
function bank(k: MeshKit): void {
  const n = 16, start = k.mark;
  // A point at angle θ (0 the right foot, π the left) on the portal's outline and on the bank's full arch.
  const sink = (th: number) => 0.45 * (1 - Math.sin(th)) ** 3;
  const outline = (th: number): number[] => {
    const c = Math.cos(th), s = Math.sin(th);
    const t = Math.min(Math.abs(c) > 1e-6 ? PORTAL.outer / Math.abs(c) : Infinity, s > 1e-6 ? PORTAL.top / s : Infinity);
    return [t * c, t * s - sink(th)];
  };
  const arch = (th: number, tall: number): number[] => [BANK.half * Math.cos(th), BANK.h * tall * Math.sin(th) - sink(th)];
  // Rings from the stones back into the mound: how far up the arch each has risen (s) and how tall it stands.
  const front = PASSAGE.front - 0.15;
  const rings = [0, 0.15, 0.35, 0.6, 0.85, 1].map((s) => ({ z: front - s * BANK.slope, s, tall: 1 }))
    .concat([{ z: -3.2, s: 1, tall: 1 }, { z: -4.6, s: 1, tall: 0.95 }, { z: BANK.back, s: 1, tall: 0.85 }]);
  const ring = (r: { z: number; s: number; tall: number }): { p: number[]; t: Tint }[] => {
    const e = 1 - (1 - r.s) ** 2, out: { p: number[]; t: Tint }[] = [];
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI, o = outline(th), a = arch(th, r.tall);
      out.push({ p: [o[0] + (a[0] - o[0]) * e, o[1] + (a[1] - o[1]) * e, r.z], t: mix(WORN, GRASS, Math.min(1, r.s / 0.6)) });
    }
    // A skirt at either foot into the ground.
    const R = out[0].p, L = out[n].p;
    return [{ p: [R[0] + 0.5, -1.6, r.z], t: out[0].t }, ...out, { p: [L[0] - 0.5, -1.6, r.z], t: out[n].t }];
  };
  const all = rings.map(ring);
  for (let r = 0; r + 1 < all.length; r++) for (let i = 0; i + 1 < all[r].length; i++) {
    const a = all[r][i], b = all[r][i + 1], c = all[r + 1][i + 1], d = all[r + 1][i];
    k.quad(a.p, d.p, c.p, b.p, [a.p, d.p, c.p, b.p].map(earthUv), WildMat.Grass, [a.t, d.t, c.t, b.t]);
  }
  k.smoothFrom(start);
}

/**
 * The way in: two upright jambs and a lintel of rough rock at the mouth, a sill, then dry-stone walls under
 * capstones on a flagged floor, darkening to the black where it goes on down.
 */
function passage(k: MeshKit, rng: Rng): void {
  const { half, h, front, end } = PASSAGE, w = PORTAL.outer - half;
  const rock = (v = 0.07): Tint => varyTint(rng, ROCK, v);
  for (const side of [-1, 1]) k.stone(side * (half + w / 2), -0.45, front - 0.3, w, h + 0.45, 0.6, rng.range(-0.05, 0.05), WildMat.Rock, rock(), rng);
  k.stone(0, h - 0.02, front - 0.32, 2 * PORTAL.outer + 0.35, PORTAL.top - h + 0.02, 0.75, rng.range(-0.03, 0.03), WildMat.Rock, rock(), rng, 0.05);
  k.stone(0, -0.26, front - 0.12, 2 * half + 0.2, 0.3, 0.36, 0, WildMat.Rock, rock(), rng, 0.03);
  // Capstones over the passage behind the lintel.
  const roofFrom = front - 0.68, step = (roofFrom - end) / 3;
  for (let i = 0; i < 3; i++) {
    k.stone(rng.range(-0.08, 0.08), h + 0.02, roofFrom - step * (i + 0.5), 2 * PORTAL.outer + 0.1, 0.42, step + 0.08, rng.range(-0.06, 0.06), WildMat.Rock, rock(), rng);
  }
  // Dry-stone walls and flags, fading from the light at the mouth to the dark at the back.
  const back = end + 0.3, dim = mix(DRYSTONE, DARK, 0.85), mouth = front - 0.55;
  k.quad([-half, -0.1, back], [-half, h + 0.05, back], [-half, h + 0.05, mouth], [-half, -0.1, mouth], [[back, -0.1], [back, h], [mouth, h], [mouth, -0.1]], BuildingMat.Rubble, [dim, dim, DRYSTONE, DRYSTONE]);
  k.quad([half, -0.1, mouth], [half, h + 0.05, mouth], [half, h + 0.05, back], [half, -0.1, back], [[mouth, -0.1], [mouth, h], [back, h], [back, -0.1]], BuildingMat.Rubble, [DRYSTONE, DRYSTONE, dim, dim]);
  const dimFlags = mix(FLAGS, DARK, 0.85);
  k.quad([-half, 0.04, back], [-half, 0.04, front - 0.3], [half, 0.04, front - 0.3], [half, 0.04, back], [[-half, back], [-half, front], [half, front], [half, back]], CellarMat.Flagstone, [dimFlags, FLAGS, FLAGS, dimFlags]);
  k.quad([-half, -0.2, back], [half, -0.2, back], [half, h + 0.05, back], [-half, h + 0.05, back], [[0, 0], [1, 0], [1, 1], [0, 1]], BuildingMat.Rubble, DARK);
}

/** A ring of half-sunk kerbstones round the mound's foot, and a boulder or two holding each foot of the bank. */
function kerb(k: MeshKit, rng: Rng): void {
  // Round from one side of the bank to the other, behind; each stone along the ring (yaw a quarter turn on).
  const gap = Math.asin(BANK.half / MOUND.r) + 0.12, from = Math.PI / 2 + gap, step = (2 * Math.PI - 2 * gap) / 25, quarter = -Math.PI / 2;
  for (let i = 0; i < 26; i++) {
    const a = from + (i + rng.range(-0.25, 0.25)) * step;
    const r = MOUND.r - 0.1, x = Math.cos(a) * r, z = -MOUND.back + Math.sin(a) * r;
    k.stone(x, -0.5, z, rng.range(0.6, 1.1), rng.range(0.75, 1.2), rng.range(0.35, 0.55), quarter - a + rng.range(-0.15, 0.15), WildMat.Rock, varyTint(rng, ROCK, 0.08), rng);
  }
  for (const side of [-1, 1]) for (let j = 0; j < 2; j++) {
    const s = rng.range(0.55, 0.9);
    k.stone(side * (BANK.half - 0.35 - j * 0.5), -0.35, PASSAGE.front - 0.6 - j * 1.1 - rng.range(0, 0.3), s * 1.2, s * 0.8, s, rng.range(0, 3), WildMat.Rock, varyTint(rng, ROCK, 0.08), rng, 0.1);
  }
}

/** Is a body of radius `r` at (x, z) of the barrow's own frame inside the mound, its bank or a stone? (The passage is open.) */
export function inBarrowShape(x: number, z: number, r: number): boolean {
  const { half, front, end } = PASSAGE;
  const inPassage = Math.abs(x) < half - r && z > end + 0.3 + r && z < front + 1;
  if (inPassage) return false;
  if (Math.abs(x) < PORTAL.outer + r && z > end - r && z < front + r) return true;
  // The bank: as wide as the portal at the stones, widening to its foot's middle where it reaches full height.
  const behind = front - 0.15 - z;
  if (behind > 0 && z > BANK.back - r && Math.abs(x) < PORTAL.outer + (BANK.half - 0.6 - PORTAL.outer) * Math.min(1, behind / BANK.slope) + r) return true;
  return Math.hypot(x, z + MOUND.back) < MOUND.r + r;
}

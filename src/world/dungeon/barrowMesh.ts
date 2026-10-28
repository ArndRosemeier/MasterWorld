/**
 * A barrow as it stands on the land (pure): a grassed mound ringed with kerbstones, its passage banked
 * over with earth that slopes down onto a portal of rough rock (two jambs, a lintel) and a dark way in, in
 * the building mesh format so it draws with the town's one building shader. Its own frame: the doorway at
 * the origin, the way in towards −z (turn it by the site's yaw), the ground at the doorway at y 0, `ground` the
 * land's height in that frame (the skirts go down into it, the kerbstones lie on it). `inBarrowShape` says
 * where the walker cannot go (the mound, its bank and the stones).
 */
import { Rng, type Ground } from '@futuremagic/core';
import { BuildingMat, CellarMat, MeshKit, WildMat, varyTint, LEVEL, type PlacedMesh, type Tint } from './meshKit';

/** How far a skirt goes below the ground under it at least (m). */
const SKIRT_UNDER = 0.5;

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
const ROCK: Tint = [186, 182, 170];
const GRASS: Tint = [200, 198, 172];
const WORN: Tint = [140, 132, 100];
/** The passage: dry-stone walls and flags in the daylight at its mouth, black where it goes on down. */
const DRYSTONE: Tint = [190, 182, 166];
const FLAGS: Tint = [150, 142, 128];
const DARK: Tint = [10, 9, 8];

const mix = (a: Tint, b: Tint, t: number): Tint => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as unknown as Tint;

export function barrowMesh(seed = 1, ground: Ground = LEVEL): PlacedMesh {
  return barrowOf(seed, ground, false);
}

/**
 * A barrow long sealed (a barrow field's, B1): the same mound under grass, ringed all round with
 * kerbstones and no way in. Its own frame: the mound's middle at the origin, the ground at y 0.
 */
export function sealedBarrowMesh(seed = 1, ground: Ground = LEVEL): PlacedMesh {
  return barrowOf(seed, ground, true);
}

/** A barrow with its way in (its mound behind the doorway), or sealed (its mound's middle at the origin). */
function barrowOf(seed: number, ground: Ground, sealed: boolean): PlacedMesh {
  const k = new MeshKit(), rng = new Rng(seed);
  mound(k, ground, sealed ? 0 : MOUND.back);
  if (!sealed) { bank(k, ground); passage(k, rng); }
  kerb(k, rng, ground, sealed);
  return k.mesh();
}

/** The mound: rings of a flattened dome under grass, then a skirt into the ground (the land is never quite level). */
function mound(k: MeshKit, ground: Ground, back: number = MOUND.back): void {
  const seg = 28, rings = 7, start = k.mark;
  // Grass laid round the dome (u, along its rings) and down it (v, from the top), in metres near enough.
  const down = (Math.PI / 4) * (MOUND.r + MOUND.h);
  const ringPoint = (ring: number, s: number): { p: number[]; uv: number[] } => {
    const phi = (ring / rings) * (Math.PI / 2), a = (s / seg) * Math.PI * 2;
    const r = ring > rings ? MOUND.r : MOUND.r * Math.sin(phi), x = Math.cos(a) * r, z = -back + Math.sin(a) * r;
    const y = ring > rings ? Math.min(-2, ground(x, z) - SKIRT_UNDER) : MOUND.h * Math.cos(phi);
    return { p: [x, y, z], uv: [a * Math.max(1.5, r), ring > rings ? down + 2 : (ring / rings) * down] };
  };
  k.footed(() => {
    for (let i = 0; i <= rings; i++) for (let s = 0; s < seg; s++) {
      const q = [ringPoint(i, s), ringPoint(i, s + 1), ringPoint(i + 1, s + 1), ringPoint(i + 1, s)];
      k.quad(q[0].p, q[1].p, q[2].p, q[3].p, q.map((e) => e.uv), WildMat.Grass, GRASS);
    }
  });
  k.smoothFrom(start);
}

/**
 * The earth heaped over the passage and against the portal: a ridge from the mound that slopes down at the
 * front onto the jambs and the lintel, so only their faces stand out of it.
 */
function bank(k: MeshKit, ground: Ground): void {
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
    const skirt = (x: number) => Math.min(-1.6, ground(x, r.z) - SKIRT_UNDER);
    return [{ p: [R[0] + 0.5, skirt(R[0] + 0.5), r.z], t: out[0].t }, ...out, { p: [L[0] - 0.5, skirt(L[0] - 0.5), r.z], t: out[n].t }];
  };
  // Grass laid over the arch (u, metres along each ring from its right foot) and along the bank (v, its z).
  const all = rings.map(ring).map((pts) => {
    let run = 0;
    return pts.map((e, i) => {
      if (i) run += Math.hypot(e.p[0] - pts[i - 1].p[0], e.p[1] - pts[i - 1].p[1]);
      return { ...e, uv: [run, e.p[2]] };
    });
  });
  for (let r = 0; r + 1 < all.length; r++) for (let i = 0; i + 1 < all[r].length; i++) {
    const q = [all[r][i], all[r + 1][i], all[r + 1][i + 1], all[r][i + 1]];
    k.quad(q[0].p, q[1].p, q[2].p, q[3].p, q.map((e) => e.uv), WildMat.Grass, q.map((e) => e.t));
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
  for (const side of [-1, 1]) k.stone(side * (half + w / 2), -0.45, front - 0.3, w, h + 0.45, 0.6, rng.range(-0.05, 0.05), WildMat.Rock, rock(), rng, 0.05, 0.2);
  k.stone(0, h - 0.02, front - 0.32, 2 * PORTAL.outer + 0.35, PORTAL.top - h + 0.02, 0.75, rng.range(-0.03, 0.03), WildMat.Rock, rock(), rng, 0.05, 0.2);
  k.stone(0, -0.26, front - 0.12, 2 * half + 0.2, 0.3, 0.36, 0, WildMat.Rock, rock(), rng, 0.03, 0.2);
  // Capstones over the passage behind the lintel.
  const roofFrom = front - 0.68, step = (roofFrom - end) / 3;
  for (let i = 0; i < 3; i++) {
    k.stone(rng.range(-0.08, 0.08), h + 0.02, roofFrom - step * (i + 0.5), 2 * PORTAL.outer + 0.1, 0.42, step + 0.08, rng.range(-0.06, 0.06), WildMat.Rock, rock(), rng, 0.06, 0.2);
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
function kerb(k: MeshKit, rng: Rng, ground: Ground, sealed = false): void {
  // Round from one side of the bank to the other, behind (sealed: all round); each stone along the ring (yaw a quarter turn on).
  const gap = sealed ? 0 : Math.asin(BANK.half / MOUND.r) + 0.12, from = Math.PI / 2 + gap, count = sealed ? 30 : 26;
  const step = (2 * Math.PI - 2 * gap) / (sealed ? count : count - 1), quarter = -Math.PI / 2, back = sealed ? 0 : MOUND.back;
  for (let i = 0; i < count; i++) {
    const a = from + (i + rng.range(-0.25, 0.25)) * step;
    const r = MOUND.r - 0.1, x = Math.cos(a) * r, z = -back + Math.sin(a) * r;
    const sx = rng.range(0.7, 1.1), sy = rng.range(0.6, 0.95), sz = rng.range(0.55, 0.8), turn = quarter - a + rng.range(-0.15, 0.15), tint = varyTint(rng, ROCK, 0.08);
    k.onGround(ground, () => k.stone(x, 0, z, sx, sy, sz, turn, WildMat.Rock, tint, rng, 0.08, 0.5), 0.4);
  }
  if (sealed) return;
  for (const side of [-1, 1]) for (let j = 0; j < 2; j++) {
    const s = rng.range(0.55, 0.9);
    const z = PASSAGE.front - 0.6 - j * 1.1 - rng.range(0, 0.3), turn = rng.range(0, 3), tint = varyTint(rng, ROCK, 0.08);
    k.onGround(ground, () => k.stone(side * (BANK.half - 0.35 - j * 0.5), 0, z, s * 1.2, s * 0.8, s, turn, WildMat.Rock, tint, rng, 0.1, 0.55), 0.35);
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

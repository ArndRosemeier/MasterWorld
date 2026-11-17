/**
 * The small things on and round a structure (D69, Z4; pure): what its holders add (goblin hides, spikes and skull
 * poles, bandit barricades, palisades, lookouts and tents, the dead's graves, bones and coffins), banners, carts, cages,
 * figures on pedestals, timber on posts. Each stands on the land (MeshKit.onGround) or on a given height.
 */
import type { Ground, Rng } from '@futuremagic/core';
import { BuildingMat, CellarMat, WildMat, mixTint, scaleTint, varyTint, type MeshKit, type Tint } from '../dungeon/meshKit';
import { beam, roundPts, faceTo, prism, spire, type P2, type Site } from './masonry';

const BONE: Tint = [214, 204, 178], IRON: Tint = [62, 60, 58], ROPE: Tint = [150, 126, 92], EARTH: Tint = [104, 88, 66];

/**
 * Room for things laid out loose (graves, coffins): `free(x, z, r)` says whether a thing of radius r fits there
 * clear of those already laid, and keeps it if so; a caller tries a few spots and skips the thing if none fits.
 */
export function room(): (x: number, z: number, r: number) => boolean {
  const laid: [number, number, number][] = [];
  return (x, z, r) => {
    if (laid.some(([a, b, q]) => Math.hypot(x - a, z - b) < r + q)) return false;
    laid.push([x, z, r]);
    return true;
  };
}

/** The height things stand on at (x, z): a given floor, else the land. */
export type Floor = (x: number, z: number) => number;
export const onLand = (g: Ground): Floor => (x, z) => g(x, z);

/** A post or stake from the floor up h, leaning by (lx, lz) at its top; a point on it if `sharp`. */
export function stake(site: Site, x: number, z: number, y: number, h: number, w: number, tint: Tint, lx = 0, lz = 0): void {
  beam(site.k, [x, y - 0.4, z], [x + lx, y + h, z + lz], w, w, BuildingMat.Oak, tint);
}

/** A row of sharpened stakes from a to b on the floor, leaning out to the side `out` (a unit vector in plan). */
export function stakeRow(site: Site, a: P2, b: P2, floor: Floor, tint: Tint, h = 2.2, out: P2 = [0, 0], gap = 0.32, last = true): void {
  // (A row shorter than the gap is one stake: two would stand in each other.)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = len < gap ? 0 : Math.max(1, Math.round(len / gap));
  for (let i = 0; i <= (last || !n ? n : n - 1); i++) {
    const t = n ? i / n : 0, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, hh = h * site.rng.range(0.82, 1.08);
    stake(site, x, z, floor(x, z), hh, site.rng.range(0.14, 0.2), scaleTint(tint, site.rng.range(0.85, 1.1)), out[0] * hh * 0.35 + site.rng.range(-0.06, 0.06), out[1] * hh * 0.35 + site.rng.range(-0.06, 0.06));
  }
}

/** A palisade round a polygon of the land, with a gap where it is entered (between corners `gateAt` and the next). */
export function palisade(site: Site, pts: readonly P2[], floor: Floor, tint: Tint, gateAt = 0): void {
  for (let i = 0; i < pts.length; i++) {
    if (i === gateAt) continue;
    // (The corner's stake is the next row's first; only before the gap does a row stand its own.)
    stakeRow(site, pts[i], pts[(i + 1) % pts.length], floor, tint, site.rng.range(2.6, 3.4), [0, 0], 0.3, (i + 1) % pts.length === gateAt);
  }
}

/** A cloth on a pole: the pole, a crossbar and the cloth hanging from it, torn short at the foot if `torn`. */
export function banner(site: Site, x: number, z: number, y: number, h: number, cloth: Tint, yaw: number, torn = false): void {
  const { k, rng } = site, c = Math.cos(yaw), s = Math.sin(yaw), w = rng.range(0.7, 1.1);
  beam(k, [x, y - 0.3, z], [x, y + h, z], 0.12, 0.12, BuildingMat.Oak, [92, 70, 52]);
  beam(k, [x - c * w * 0.6, y + h - 0.2, z - s * w * 0.6], [x + c * w * 0.6, y + h - 0.2, z + s * w * 0.6], 0.07, 0.07, BuildingMat.Oak, [92, 70, 52]);
  const drop = h * rng.range(0.35, 0.5), segs = 4;
  for (let i = 0; i < segs; i++) {
    const y0 = y + h - 0.25 - (drop * i) / segs, y1 = y + h - 0.25 - (drop * (i + 1)) / segs;
    const sway0 = Math.sin(i * 1.3) * 0.08, sway1 = Math.sin((i + 1) * 1.3) * 0.08;
    const narrow = torn && i === segs - 1 ? 0.55 : 1;
    const q = [[x - c * w / 2 - s * sway0, y0, z - s * w / 2 + c * sway0], [x + c * w / 2 - s * sway0, y0, z + s * w / 2 + c * sway0], [x + c * w / 2 * narrow - s * sway1, y1, z + s * w / 2 * narrow + c * sway1], [x - c * w / 2 * narrow - s * sway1, y1, z - s * w / 2 * narrow + c * sway1]];
    faceTo(k, q, [[0, 0], [w, 0], [w, 1], [0, 1]], CellarMat.Limewash, cloth, [-s, 0, c]);
    faceTo(k, q, [[0, 0], [w, 0], [w, 1], [0, 1]], CellarMat.Limewash, scaleTint(cloth, 0.8), [s, 0, -c]);
  }
}

/** A hide stretched on a frame of two crossed poles, hung flat against a face looking along `n` (unit, in plan). */
export function pelt(site: Site, x: number, y: number, z: number, n: P2, size: number, tint: Tint): void {
  const { k, rng } = site, ux = -n[1], uz = n[0], w = size * rng.range(0.8, 1.2), h = size * rng.range(0.9, 1.3);
  const off = 0.06, ox = x + n[0] * off, oz = z + n[1] * off;
  const P = (u: number, v: number) => [ox + ux * u, y + v, oz + uz * u];
  // A ragged outline: six corners pulled in and out.
  const pts = [P(-w / 2, 0), P(w / 2 * 0.8, h * 0.05), P(w / 2, h * 0.55), P(w / 2 * 0.7, h), P(-w / 2 * 0.75, h * 0.95), P(-w / 2, h * 0.45)];
  const c = P(0, h / 2);
  for (let i = 0; i < pts.length; i++) faceTo(k, [c, pts[i], pts[(i + 1) % pts.length], pts[(i + 1) % pts.length]], [[0, 0], [1, 0], [1, 1], [1, 1]], CellarMat.Limewash, tint, [n[0], 0, n[1]]);
  beam(k, P(-w / 2 - 0.1, -0.1), P(w / 2 + 0.1, h + 0.1), 0.06, 0.06, BuildingMat.Oak, [90, 70, 52]);
  beam(k, P(w / 2 + 0.1, -0.1), P(-w / 2 - 0.1, h + 0.1), 0.06, 0.06, BuildingMat.Oak, [90, 70, 52]);
}

/** A skull (a pale knob) at a point. */
export function skull(site: Site, x: number, y: number, z: number, size = 0.24): void {
  site.k.stone(x, y, z, size * 0.8, size, size, site.rng.range(0, 6), CellarMat.Limewash, BONE, site.rng, 0.02, 0.85);
}

/** A pole with skulls and hides tied on: a goblin totem. */
export function totem(site: Site, x: number, z: number, y: number, cloth: Tint): void {
  const h = site.rng.range(4, 6.5);
  beam(site.k, [x, y - 0.5, z], [x, y + h, z], 0.3, 0.3, BuildingMat.Oak, [84, 64, 48]);
  beam(site.k, [x - 0.9, y + h - 1.1, z], [x + 0.9, y + h - 0.9, z], 0.16, 0.16, BuildingMat.Oak, [84, 64, 48]);
  for (let i = 0; i < 3; i++) skull(site, x + (i - 1) * 0.75, y + h - 0.85 - (i === 1 ? -0.2 : 0), z, 0.3);
  pelt(site, x, y + h * 0.35, z + 0.15, [0, 1], 1.2, cloth);
}

const CANVAS: Tint = [214, 198, 160], POLE: Tint = [110, 84, 62];

/**
 * A ridge tent at (x, z) of the kit's frame, drawn on y 0 (set it on the ground with MeshKit.onGround): its opening
 * towards `a` + pi (`a`: the angle from where it is entered out to it), canvas down both sides to the ground, the
 * flaps drawn back so the dark inside shows, a pole at each end a hand above the ridge. The camps' and the
 * structures' one tent.
 */
export function ridgeTent(k: MeshKit, rng: Rng, x: number, z: number, a: number, len: number, wide: number, high: number, canvas: Tint = CANVAS): void {
  // Along the ridge: from the opening to the back.
  const ax = -Math.cos(a), az = -Math.sin(a), bx = -az, bz = ax;
  const onTent = (s: number, t: number, h: number) => [x + ax * s + bx * t, h, z + az * s + bz * t];
  const L = len / 2, W = wide / 2, tint = varyTint(rng, canvas, 0.08), shade = scaleTint(tint, 0.8);
  const side = Math.hypot(W, high);
  // The two slopes, outside and in (the canvas is seen from inside through the opening).
  for (const t of [1, -1]) {
    const q = [onTent(L, t * W, 0), onTent(L, 0, high), onTent(-L, 0, high), onTent(-L, t * W, 0)], uv = [[0, 0], [0, side], [len, side], [len, 0]];
    if (t > 0) { k.quad(q[0], q[1], q[2], q[3], uv, CellarMat.Limewash, tint); k.quad(q[3], q[2], q[1], q[0], uv, CellarMat.Limewash, shade); }
    else { k.quad(q[3], q[2], q[1], q[0], uv, CellarMat.Limewash, tint); k.quad(q[0], q[1], q[2], q[3], uv, CellarMat.Limewash, shade); }
  }
  // Closed at the back; the opening's flaps drawn back to either side.
  k.tri(onTent(-L, W, 0), onTent(-L, 0, high), onTent(-L, -W, 0), CellarMat.Limewash, tint);
  k.tri(onTent(-L, -W, 0), onTent(-L, 0, high), onTent(-L, W, 0), CellarMat.Limewash, shade);
  k.tri(onTent(L, -W, 0), onTent(L, 0, high), onTent(L, -W * 0.45, 0), CellarMat.Limewash, tint);
  k.tri(onTent(L, W * 0.45, 0), onTent(L, 0, high), onTent(L, W, 0), CellarMat.Limewash, tint);
  const floor = onTent(0, 0, 0.02);
  k.box(floor[0], floor[1], floor[2], len * 0.95, 0.02, wide * 0.85, Math.atan2(-az, ax), CellarMat.Earth, [52, 46, 40]);
  for (const s of [L, -L]) { const p = onTent(s, 0, 0); k.box(p[0], p[1], p[2], 0.07, high + 0.15, 0.07, 0, BuildingMat.Oak, POLE); }
}

/** A holder's tent on the land, its opening along `yaw`, its canvas their cloth. */
export function tent(site: Site, x: number, z: number, cloth: Tint, yaw: number): void {
  const { k, rng } = site;
  k.onGround(site.ground, () => ridgeTent(k, rng, x, z, yaw, rng.range(2.6, 3.6), rng.range(2, 2.8), rng.range(1.5, 1.9), cloth), 0.05);
}

/** A wheel: a short drum about an axis (unit) through its centre. */
function cartWheel(site: Site, c: readonly number[], axis: readonly number[], r: number, w: number, tint: Tint): void {
  const n = 10, a = axis, u = Math.abs(a[1]) > 0.9 ? [1, 0, 0] : [a[2], 0, -a[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); const U = u.map((v) => v / ul);
  const V = [a[1] * U[2] - a[2] * U[1], a[2] * U[0] - a[0] * U[2], a[0] * U[1] - a[1] * U[0]];
  const P = (i: number, side: number) => { const t = (i / n) * Math.PI * 2; return [0, 1, 2].map((j) => c[j] + (U[j] * Math.cos(t) + V[j] * Math.sin(t)) * r + a[j] * side * w / 2); };
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * Math.PI * 2;
    faceTo(site.k, [P(i, -1), P(i + 1, -1), P(i + 1, 1), P(i, 1)], [[0, 0], [1, 0], [1, w], [0, w]], BuildingMat.Oak, tint, [0, 1, 2].map((j) => U[j] * Math.cos(t) + V[j] * Math.sin(t)));
    for (const side of [-1, 1]) faceTo(site.k, [c.map((v, j) => v + a[j] * side * w / 2), P(i, side), P(i + 1, side), P(i + 1, side)], [[0, 0], [1, 0], [1, 1], [1, 1]], BuildingMat.Oak, tint, a.map((v) => v * side));
  }
}

/** A cart, upright or on its side, across the way. */
export function cart(site: Site, x: number, z: number, floor: Floor, timber: Tint, yaw: number, over: boolean): void {
  const { k } = site, c = Math.cos(yaw), s = Math.sin(yaw), y = floor(x, z);
  if (!over) {
    prism(site, [[x - c * 1.6 + s * 0.8, z - s * 1.6 - c * 0.8], [x + c * 1.6 + s * 0.8, z + s * 1.6 - c * 0.8], [x + c * 1.6 - s * 0.8, z + s * 1.6 + c * 0.8], [x - c * 1.6 - s * 0.8, z - s * 1.6 + c * 0.8]], y + 0.7, y + 1.3, CellarMat.Boards, timber);
    for (const e of [-1, 1]) cartWheel(site, [x - s * e * 0.95, y + 0.62, z + c * e * 0.95], [-s, 0, c], 0.6, 0.12, scaleTint(timber, 0.8));
    beam(k, [x + c * 1.6, y + 0.8, z + s * 1.6], [x + c * 3.4, y + 0.1, z + s * 3.4], 0.12, 0.12, BuildingMat.Oak, timber);
    return;
  }
  // On its side: the bed upright along the way, a wheel up in the air.
  prism(site, [[x - c * 1.6 - s * 0.05, z - s * 1.6 + c * 0.05], [x + c * 1.6 - s * 0.05, z + s * 1.6 + c * 0.05], [x + c * 1.6 + s * 0.6, z + s * 1.6 - c * 0.6], [x - c * 1.6 + s * 0.6, z - s * 1.6 - c * 0.6]], y - 0.05, y + 1.6, CellarMat.Boards, timber);
  cartWheel(site, [x + c * 0.6 - s * 0.3, y + 1.7, z + s * 0.6 + c * 0.3], [0, 1, 0], 0.6, 0.12, scaleTint(timber, 0.8));
  cartWheel(site, [x - c * 0.9 - s * 1.0, y + 0.08, z - s * 0.9 + c * 1.0], [0, 1, 0], 0.6, 0.12, scaleTint(timber, 0.8));
}

/** A barrier across a way: crossed sharpened stakes along a log (a cheval-de-frise), crates beside it. */
export function barricade(site: Site, a: P2, b: P2, floor: Floor, timber: Tint): void {
  const { k, rng } = site, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux;
  const y = Math.min(floor(a[0], a[1]), floor(b[0], b[1]));
  beam(k, [a[0], y + 0.55, a[1]], [b[0], y + 0.55, b[1]], 0.3, 0.3, BuildingMat.Oak, timber);
  for (let t = 0.3; t < len; t += 0.7) {
    const x = a[0] + ux * t, z = a[1] + uz * t;
    // The two stakes of a cross a hand apart along the log, so their sides never lie in one plane.
    const ox = ux * 0.07, oz = uz * 0.07;
    beam(k, [x - nx * 1.1 - ox, y - 0.05, z - nz * 1.1 - oz], [x + nx * 1.1 - ox, y + 1.4, z + nz * 1.1 - oz], 0.1, 0.1, BuildingMat.Oak, scaleTint(timber, rng.range(0.85, 1.1)));
    beam(k, [x + nx * 1.1 + ox, y - 0.05, z + nz * 1.1 + oz], [x - nx * 1.1 + ox, y + 1.4, z - nz * 1.1 + oz], 0.1, 0.1, BuildingMat.Oak, scaleTint(timber, rng.range(0.85, 1.1)));
  }
}

/** A timber lookout: four posts, braces, a platform with a rail, a ladder up its side; on a floor at (x, z). */
export function lookout(site: Site, x: number, z: number, y: number, h: number, timber: Tint, cloth: Tint | null): void {
  const { k } = site, r = 1.4;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam(k, [x + dx * r * 1.15, y - 0.4, z + dz * r * 1.15], [x + dx * r, y + h + 1.1, z + dz * r], 0.2, 0.2, BuildingMat.Oak, timber);
  for (const lv of [h * 0.4, h * 0.75]) {
    beam(k, [x - r, y + lv, z - r], [x + r, y + lv, z + r], 0.1, 0.1, BuildingMat.Oak, timber);
    beam(k, [x + r, y + lv + 0.12, z - r], [x - r, y + lv + 0.12, z + r], 0.1, 0.1, BuildingMat.Oak, timber);
  }
  prism(site, [[x - r - 0.3, z - r - 0.3], [x + r + 0.3, z - r - 0.3], [x + r + 0.3, z + r + 0.3], [x - r - 0.3, z + r + 0.3]], y + h - 0.15, y + h, CellarMat.Boards, timber);
  // The rail, each side a little higher than the last where they cross at the posts.
  [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]].forEach(([a, b], i) => beam(k, [x + a[0] * r, y + h + 1 + i * 0.1, z + a[1] * r], [x + b[0] * r, y + h + 1 + i * 0.1, z + b[1] * r], 0.09, 0.09, BuildingMat.Oak, timber));
  // A ladder up the side.
  for (const e of [-0.25, 0.25]) beam(k, [x + e, y - 0.2, z - r - 1.2], [x + e, y + h, z - r - 0.35], 0.07, 0.07, BuildingMat.Oak, timber);
  if (cloth) spire(k, [[x - r - 0.4, z - r - 0.4], [x + r + 0.4, z - r - 0.4], [x + r + 0.4, z + r + 0.4], [x - r - 0.4, z + r + 0.4]], y + h + 1.9, y + h + 3.1, CellarMat.Limewash, cloth);
}

/** A cage of iron bars hanging from a beam end at (x, y, z), its floor h below. */
export function cage(site: Site, x: number, y: number, z: number, h = 1.7): void {
  const { k } = site, pts = roundPts(x, z, 0.6, 8);
  beam(k, [x, y, z], [x, y - 0.6, z], 0.04, 0.04, BuildingMat.Slate, IRON);
  for (const p of pts) beam(k, [p[0], y - 0.6, p[1]], [p[0], y - 0.6 - h, p[1]], 0.05, 0.05, BuildingMat.Slate, IRON);
  prism(site, pts, y - 0.7 - h, y - 0.6 - h, BuildingMat.Slate, IRON);
  spire(k, pts, y - 0.6, y - 0.35, BuildingMat.Slate, IRON);
}

/** A grave: a low mound of earth with a leaning stone at its head, along yaw. */
export function grave(site: Site, x: number, z: number, ground: Ground, yaw: number, stoneTint: Tint): void {
  const { k, rng } = site;
  k.onGround(ground, () => k.stone(x, 0, z, 2, 0.45, 0.9, yaw, WildMat.Grass, mixTint(EARTH, [96, 112, 66], rng.float()), rng, 0.05, 0.8), 0.25);
  const hx = x + Math.cos(yaw) * 1.2, hz = z + Math.sin(yaw) * 1.2;
  k.onGround(ground, () => k.stone(hx, 0, hz, 0.25, 1.1, 0.7, yaw + rng.range(-0.2, 0.2), BuildingMat.Ashlar, stoneTint, rng, 0.03, 0.15), 0.3);
}

/** A heap of bones: long pale sticks and a few skulls. */
export function bones(site: Site, x: number, z: number, floor: Floor): void {
  const { k, rng } = site, y = floor(x, z);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0, 0.8), l = rng.range(0.35, 0.8), t = rng.range(0, Math.PI);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, py = y + 0.04 + rng.range(0, 0.2);
    beam(k, [px - Math.cos(t) * l / 2, py, pz - Math.sin(t) * l / 2], [px + Math.cos(t) * l / 2, py + rng.range(-0.05, 0.1), pz + Math.sin(t) * l / 2], 0.06, 0.06, CellarMat.Limewash, BONE);
  }
  for (let i = 0; i < 2; i++) skull(site, x + rng.range(-0.5, 0.5), y + 0.02, z + rng.range(-0.5, 0.5), 0.22);
}

/** A coffin on a floor, its lid shoved half off. */
export function coffin(site: Site, x: number, z: number, y: number, yaw: number, timber: Tint): void {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (u: number, v: number): P2 => [x + u * c - v * s, z + u * s + v * c];
  prism(site, [P(-1, -0.3), P(-0.4, -0.38), P(1, -0.28), P(1, 0.28), P(-0.4, 0.38), P(-1, 0.3)], y - 0.02, y + 0.55, CellarMat.Boards, scaleTint(timber, 0.7));
  const L = (u: number, v: number): P2 => [x + 0.3 * c + u * c - v * s, z + 0.3 * s + u * s + v * c + 0.25];
  prism(site, [L(-1, -0.3), L(1, -0.28), L(1, 0.28), L(-1, 0.3)], y + 0.55, y + 0.62, CellarMat.Boards, scaleTint(timber, 0.85));
}

/** Rope hanging from (x, y, z) down to the floor (a rope ladder where `ladder`). */
export function rope(site: Site, x: number, y: number, z: number, down: number, ladder: boolean): void {
  const { k } = site;
  if (!ladder) { beam(k, [x, y, z], [x, y - down, z], 0.05, 0.05, CellarMat.Limewash, ROPE); return; }
  for (const e of [-0.22, 0.22]) beam(k, [x + e, y, z], [x + e, y - down, z], 0.04, 0.04, CellarMat.Limewash, ROPE);
  for (let d = 0.4; d < down; d += 0.45) beam(k, [x - 0.22, y - d, z], [x + 0.22, y - d, z], 0.05, 0.05, BuildingMat.Oak, [110, 86, 62]);
}

/** A robed figure on a pedestal (a statue on a parapet or a gate): plinth, robe narrowing up, shoulders and a head. */
export function statue(site: Site, x: number, z: number, y: number, mat: number, tint: Tint, broken: boolean): void {
  const { k, rng } = site;
  prism(site, roundPts(x, z, 0.62, 4, Math.PI / 4), y, y + 1.1, mat, tint);
  const robe = (r0: number, r1: number, y0: number, y1: number) => {
    const a = roundPts(x, z, r0, 8), b = roundPts(x, z, r1, 8);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8, m = [(a[i][0] + a[j][0]) / 2 - x, 0, (a[i][1] + a[j][1]) / 2 - z];
      faceTo(k, [[a[i][0], y0, a[i][1]], [a[j][0], y0, a[j][1]], [b[j][0], y1, b[j][1]], [b[i][0], y1, b[i][1]]], [[0, y0], [1, y0], [1, y1], [0, y1]], mat, tint, m);
    }
  };
  const top = y + 1.1 + (broken ? rng.range(0.6, 1.1) : 1.75);
  robe(0.48, 0.3, y + 1.1, top);
  if (broken) { prism(site, roundPts(x, z, 0.3, 8), top - 0.02, top, mat, tint); return; }
  robe(0.3, 0.42, top - 0.35, top);
  prism(site, roundPts(x, z, 0.42, 8), top - 0.02, top + 0.02, mat, tint);
  k.stone(x, top, z, 0.3, 0.38, 0.32, rng.range(0, 6), mat, tint, rng, 0.02, 0.9);
}

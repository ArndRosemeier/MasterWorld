/**
 * The places the VGM puts in the regions it opens (plan 5.5, B1), as they stand on the land: a camp of tents
 * round a fire, the broken walls of the old realm, a field of sealed barrows (hamlets and villages are
 * towns of their size). Each is laid out from its region decision alone (seeded), in the building mesh format so
 * it draws with the town's one building shader, with the shapes the walker cannot go through. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { distToPoly, ensureCCW, pointInPoly, rect, type BuildingMesh, type Poly } from '@futuremagic/settlement';
import type { RegionFillDef, SightShape } from '../setting/contract';
import { settles, type RegionDecision, type SightDecision } from './decisions';
import { MOUND, sealedBarrowMesh } from './dungeon/barrowMesh';
import { onLand } from './dungeon/site';
import { BuildingMat, CellarMat, MeshKit, WildMat, varyTint, type Tint } from './dungeon/meshKit';

/** What the walker cannot go through: a circle or a polygon (x, z pairs). */
export type Solid = { readonly x: number; readonly z: number; readonly r: number } | { readonly poly: Poly };

export interface SiteLayout {
  /** The site's middle and its ground height: mesh positions are relative to it. */
  readonly origin: readonly [number, number, number];
  readonly mesh: BuildingMesh;
  readonly solids: readonly Solid[];
}

export type Place = RegionFillDef['place'];

/**
 * A place laid out on the land (`height`: the ground), or null for a region with nothing on it, and for a
 * hamlet or village: those are planned as towns (world/town.ts, Terrain.addTown).
 */
export function layOutSite(d: RegionDecision, place: Place, height: (x: number, z: number) => number): SiteLayout | null {
  const s = d.site;
  if (!s || place === 'none' || settles(place)) return null;
  return laidOut({ ...s, seed: d.seed }, 'site', height, place === 'camp' ? camp : place === 'ruin' ? ruin : barrows);
}

/** How far a sight reaches from its middle (m): what it stands on, and what keeps clear of it. */
export const SIGHT_R = 6;
/** The glade round a sight (m from its middle): no tree stands there, so it is seen from a way off. */
export const SIGHT_CLEARING = 20;

/** A sight by the way (C9), laid out on the land from its decision: a ring of standing stones, a waystone, a cairn, a stash. */
export function layOutSight(d: SightDecision, shape: SightShape, height: (x: number, z: number) => number): SiteLayout {
  return laidOut({ ...d, r: SIGHT_R }, 'sight', height, shape === 'stones' ? stoneRing : shape === 'waystone' ? waystone : shape === 'stash' ? stash : cairn);
}

/** A place's pieces drawn round its middle (`draw`), seeded from it, on the land's heights. */
function laidOut(p: { x: number; z: number; yaw: number; r: number; seed: number }, salt: string, height: (x: number, z: number) => number, draw: (at: At, k: MeshKit, solids: Solid[]) => void): SiteLayout {
  const origin: [number, number, number] = [p.x, height(p.x, p.z), p.z];
  const k = new MeshKit(), solids: Solid[] = [];
  draw({ x: p.x, z: p.z, yaw: p.yaw, r: p.r, y0: origin[1], height, rng: new Rng(deriveSeed(p.seed, salt)), seed: p.seed }, k, solids);
  return { origin, mesh: k.mesh(), solids };
}

/** Is a body of radius `r` at (x, z) inside one of the solids? */
export function hitsSolid(solids: readonly Solid[], x: number, z: number, r: number): boolean {
  for (const o of solids) {
    if ('poly' in o) { if (pointInPoly(o.poly, x, z) || distToPoly(o.poly, x, z) < r) return true; }
    else if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
  }
  return false;
}

interface At {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly r: number;
  /** The ground at the middle (mesh y 0). */
  readonly y0: number;
  readonly height: (x: number, z: number) => number;
  readonly rng: Rng;
  readonly seed: number;
}

/** A point `d` metres from `at` at angle `a` (radians, atan2(z, x)). */
export const onCircle = (at: { readonly x: number; readonly z: number }, a: number, d: number): [number, number] => [at.x + Math.cos(a) * d, at.z + Math.sin(a) * d];

/** Triangles of `m` into the kit, turned by `yaw` about +y, scaled, and moved to (x, y, z). */
function appendAt(k: MeshKit, m: BuildingMesh, x: number, y: number, z: number, yaw = 0, scale = 1): void {
  const c = Math.cos(yaw), s = Math.sin(yaw), n = m.position.length;
  const p = new Float32Array(n), nn = new Float32Array(n);
  for (let i = 0; i < n; i += 3) {
    const px = m.position[i] * scale, pz = m.position[i + 2] * scale;
    p[i] = x + px * c + pz * s; p[i + 1] = y + m.position[i + 1] * scale; p[i + 2] = z - px * s + pz * c;
    const nx = m.normal[i], nz = m.normal[i + 2];
    nn[i] = nx * c + nz * s; nn[i + 1] = m.normal[i + 1]; nn[i + 2] = -nx * s + nz * c;
  }
  k.append(p, nn, m.uv, m.mat, m.tint, m.index);
}

/**
 * A hamlet (D41: a few households): a farmhouse, a barn and two or three cottages round a small green,
 * their doors to it, one storey under thatch or shingles as on a town's edge.
 */
/** Split logs stacked against a wall: a few rows of rounds, ends out. */
function stack(at: At, k: MeshKit, x: number, z: number, yaw: number): void {
  const y = at.height(x, z) - at.y0, lx = x - at.x, lz = z - at.z;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
    const u = (i - (4 - row) / 2) * 0.32;
    k.box(lx + Math.cos(yaw) * u, y + row * 0.28, lz - Math.sin(yaw) * u, 0.3, 0.28, 0.9, yaw, BuildingMat.Oak, varyTint(at.rng, [150, 118, 86], 0.12));
  }
}

const CANVAS: Tint = [214, 198, 160];
const POLE: Tint = [110, 84, 62];
const ROCK: Tint = [176, 172, 160];

/** A camp (hunters, charcoal burners, travellers): two or three ridge tents round a ring of stones, logs to sit on, a woodpile. */
function camp(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, n = r.int(2, 3);
  const fy = at.height(at.x, at.z) - at.y0;
  // The fire: a ring of stones round ash.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r.range(-0.1, 0.1);
    k.stone(Math.cos(a) * 0.7, fy - 0.12, Math.sin(a) * 0.7, r.range(0.25, 0.38), r.range(0.18, 0.28), r.range(0.22, 0.32), -a, WildMat.Rock, varyTint(r, ROCK, 0.1), r, 0.03, 0.6);
  }
  k.flat(-0.5, -0.5, 0.5, 0.5, fy + 0.03, true, CellarMat.Earth, [40, 36, 32]);
  solids.push({ x: at.x, z: at.z, r: 0.9 });
  // Logs to sit on, between the tents.
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2 + at.yaw, [lx, lz] = onCircle(at, a, 2);
    k.box(lx - at.x, at.height(lx, lz) - at.y0 - 0.08, lz - at.z, 1.6, 0.36, 0.36, -a + Math.PI / 2, BuildingMat.Oak, varyTint(r, [128, 100, 76], 0.1));
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + at.yaw + r.range(-0.2, 0.2), [tx, tz] = onCircle(at, a, r.range(4.8, 5.8));
    tent(at, k, tx, tz, a, r.range(2.4, 3), r.range(1.9, 2.3), r.range(1.4, 1.7));
    solids.push({ x: tx, z: tz, r: 1.5 });
  }
  const [wx, wz] = onCircle(at, at.yaw + Math.PI + 0.6, 7.5);
  stack(at, k, wx, wz, at.yaw);
}

/**
 * A ridge tent at (x, z): its opening towards the middle (`a`: the angle from the middle out to it), canvas
 * down both sides to the ground, a pole at each end standing a hand above the ridge.
 */
function tent(at: At, k: MeshKit, x: number, z: number, a: number, len: number, wide: number, high: number): void {
  // Along the ridge: from the opening (towards the middle) to the back.
  const ax = -Math.cos(a), az = -Math.sin(a), bx = -az, bz = ax;
  const y = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => at.height(x + ax * s * len / 2 + bx * t * wide / 2, z + az * s * len / 2 + bz * t * wide / 2))) - at.y0 - 0.05;
  const onTent = (s: number, t: number, h: number) => [x - at.x + ax * s + bx * t, y + h, z - at.z + az * s + bz * t];
  const L = len / 2, W = wide / 2, tint = varyTint(at.rng, CANVAS, 0.08);
  const shade: Tint = [Math.round(tint[0] * 0.8), Math.round(tint[1] * 0.8), Math.round(tint[2] * 0.8)];
  const side = Math.hypot(W, high);
  // The two slopes, outside and in (the canvas is seen from inside through the opening).
  for (const t of [1, -1]) {
    const q = [onTent(L, t * W, 0), onTent(L, 0, high), onTent(-L, 0, high), onTent(-L, t * W, 0)], uv = [[0, 0], [0, side], [len, side], [len, 0]];
    if (t > 0) { k.quad(q[0], q[1], q[2], q[3], uv, CellarMat.Limewash, tint); k.quad(q[3], q[2], q[1], q[0], uv, CellarMat.Limewash, shade); }
    else { k.quad(q[3], q[2], q[1], q[0], uv, CellarMat.Limewash, tint); k.quad(q[0], q[1], q[2], q[3], uv, CellarMat.Limewash, shade); }
  }
  // Closed at the back; the opening's flaps drawn back to either side, so the dark inside shows.
  k.tri(onTent(-L, W, 0), onTent(-L, 0, high), onTent(-L, -W, 0), CellarMat.Limewash, tint);
  k.tri(onTent(-L, -W, 0), onTent(-L, 0, high), onTent(-L, W, 0), CellarMat.Limewash, shade);
  k.tri(onTent(L, -W, 0), onTent(L, 0, high), onTent(L, -W * 0.45, 0), CellarMat.Limewash, tint);
  k.tri(onTent(L, W * 0.45, 0), onTent(L, 0, high), onTent(L, W, 0), CellarMat.Limewash, tint);
  const floor = onTent(0, 0, 0.02);
  k.box(floor[0], floor[1], floor[2], len * 0.95, 0.02, wide * 0.85, Math.atan2(-az, ax), CellarMat.Earth, [52, 46, 40]);
  for (const s of [L, -L]) { const p = onTent(s, 0, 0); k.box(p[0], p[1], p[2], 0.07, high + 0.15, 0.07, 0, BuildingMat.Oak, POLE); }
}

const WALL: Tint = [206, 200, 186];
const MOSS: Tint = [150, 156, 120];

/**
 * Ruins of the old realm (12.1: from before the Fading): the broken walls of a hall of dressed stone, here
 * shoulder high, there down to a course or gone, a doorway, a stump of a corner tower, fallen blocks round
 * about.
 */
function ruin(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, W = r.range(9, 13) / 2, D = r.range(7, 10) / 2, thick = 0.8;
  // A point of the hall's own frame (u across, v along) in world metres.
  const inHall = (u: number, v: number): [number, number] => onLand(at, u, v);
  const sides: [number, number, number, number][] = [[-W, -D, W, -D], [W, -D, W, D], [W, D, -W, D], [-W, D, -W, -D]];
  // The wall's height round the hall: a slow wave of decay, the doorway in the front side's middle.
  const phase = r.range(0, 6);
  let run = 0;
  for (const [u0, v0, u1, v1] of sides) {
    const len = Math.hypot(u1 - u0, v1 - v0), n = Math.max(2, Math.round(len / 1.4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, along = run + len * t;
      if (v0 === -D && v1 === -D && Math.abs(u) < 0.9) continue;
      const h = Math.max(0, 0.4 + 2.6 * (0.5 + 0.5 * Math.sin(along / 5.5 + phase)) * r.range(0.6, 1.1) - (r.chance(0.15) ? 2 : 0));
      if (h < 0.25) continue;
      const [x, z] = inHall(u, v), y = at.height(x, z) - at.y0;
      const yaw = at.yaw + Math.atan2(-(v1 - v0), u1 - u0);
      k.stone(x - at.x, y - 0.4, z - at.z, len / n + 0.04, h + 0.4, thick, yaw, BuildingMat.Ashlar, varyTint(r, h < 1 ? MOSS : WALL, 0.06), r, 0.04, 0.06);
      const hx = (len / n) / 2, hz = thick / 2, cy = Math.cos(yaw), sy = Math.sin(yaw);
      solids.push({ poly: ensureCCW(rect(x - hx * cy - hz * sy, z + hx * sy - hz * cy, cy, -sy, sy, cy, hx * 2, hz * 2)) });
    }
    run += len;
  }
  // The stump of a round tower at a back corner.
  const [tx, tz] = inHall(r.chance(0.5) ? W : -W, D);
  k.cylinder(tx - at.x, at.height(tx, tz) - at.y0 - 0.5, tz - at.z, 1.7, r.range(3.5, 5.5), 12, BuildingMat.Rubble, varyTint(r, WALL, 0.05));
  solids.push({ x: tx, z: tz, r: 1.7 });
  // Blocks fallen from the walls, half in the grass.
  for (let i = 0; i < 14; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(2, at.r - 2), [x, z] = onCircle(at, a, d);
    const sz = r.range(0.4, 0.9);
    k.stone(x - at.x, at.height(x, z) - at.y0 - sz * 0.35, z - at.z, sz * 1.4, sz, sz, r.range(0, 3), BuildingMat.Ashlar, varyTint(r, MOSS, 0.1), r, 0.08, 0.3);
  }
}

/** A barrow field: three to five sealed mounds of the old dead, of different sizes, on the rise. */
function barrows(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, n = r.int(3, 5), placed: { x: number; z: number; R: number }[] = [];
  for (let i = 0; i < n * 6 && placed.length < n; i++) {
    const scale = r.range(0.7, 1.15), R = MOUND.r * scale;
    const [x, z] = placed.length ? onCircle(at, r.range(0, Math.PI * 2), r.range(R + 2, at.r - R)) : [at.x, at.z];
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.R + R + 3)) continue;
    placed.push({ x, z, R });
    appendAt(k, sealedBarrowMesh(deriveSeed(at.seed, 'mound', i)), x - at.x, at.height(x, z) - at.y0 - 0.05, z - at.z, r.range(0, Math.PI * 2), scale);
    solids.push({ x, z, r: R * 0.95 });
  }
}

const OLD_STONE: Tint = [150, 150, 140];

/** Standing stones of the old realm in a ring, a few leaning, one fallen. */
function stoneRing(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, n = r.int(7, 9), R = r.range(3.6, 4.6), fallen = r.int(0, n - 1);
  for (let i = 0; i < n; i++) {
    const a = at.yaw + (i / n) * Math.PI * 2 + r.range(-0.08, 0.08), [x, z] = onCircle(at, a, R);
    const y = at.height(x, z) - at.y0, tint = varyTint(r, r.chance(0.4) ? MOSS : OLD_STONE, 0.08);
    if (i === fallen) { k.stone(x - at.x, y - 0.2, z - at.z, 0.7, 0.5, r.range(2, 2.6), -a, WildMat.Rock, tint, r, 0.08, 0.35); continue; }
    k.stone(x - at.x, y - 0.3, z - at.z, r.range(0.6, 0.9), r.range(1.8, 2.8), r.range(0.35, 0.5), -a + Math.PI / 2, WildMat.Rock, tint, r, 0.08, 0.25);
    solids.push({ x, z, r: 0.45 });
  }
}

/** A tall carved waystone on a footing block, where an old road once ran. */
function waystone(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, y = at.height(at.x, at.z) - at.y0;
  k.stone(0, y - 0.3, 0, 1.4, 0.6, 1.4, at.yaw, BuildingMat.Ashlar, varyTint(r, MOSS, 0.08), r, 0.05, 0.15);
  k.stone(0, y + 0.25, 0, 0.6, r.range(2.2, 2.8), 0.45, at.yaw, BuildingMat.Ashlar, varyTint(r, OLD_STONE, 0.06), r, 0.03, 0.12);
  solids.push({ x: at.x, z: at.z, r: 0.8 });
}

/** A cairn: a heap of field stones, piled to a point. */
function cairn(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, y = at.height(at.x, at.z) - at.y0;
  for (let layer = 0; layer < 5; layer++) {
    const ring = Math.max(1, 7 - layer * 2), R = 1.1 - layer * 0.25;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + layer * 0.7 + r.range(-0.2, 0.2), sz = r.range(0.35, 0.55) - layer * 0.04;
      // Laid round the heap, long side along it.
      k.stone(Math.cos(a) * R, y - 0.1 + layer * 0.32, Math.sin(a) * R, sz * 1.3, sz, sz, Math.PI / 2 - a, WildMat.Rock, varyTint(r, ROCK, 0.12), r, 0.08, 0.5);
    }
  }
  solids.push({ x: at.x, z: at.z, r: 1.3 });
}

/** A stash: a flat stone leant against a boulder, a bundle in oilcloth showing under it. */
function stash(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, y = at.height(at.x, at.z) - at.y0;
  k.stone(0, y - 0.4, 0, 1.8, 1.4, 1.5, at.yaw, WildMat.Rock, varyTint(r, MOSS, 0.1), r, 0.1, 0.55);
  // In front of the boulder (towards the way the hero comes from): the slab, and the bundle under it.
  const front = Math.PI / 2 - at.yaw, [sx, sz] = onCircle(at, front, 1.1), [bx, bz] = onCircle(at, front, 1.4);
  const fx = sx - at.x, fz = sz - at.z;
  k.box(bx - at.x, y + 0.05, bz - at.z, 0.55, 0.3, 0.4, at.yaw, CellarMat.Limewash, [92, 84, 62]);
  k.stone(fx, y - 0.05, fz, 1.2, 0.18, 0.9, at.yaw + 0.3, WildMat.Rock, varyTint(r, ROCK, 0.08), r, 0.04, 0.2);
  solids.push({ x: at.x, z: at.z, r: 1.1 });
}

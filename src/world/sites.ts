/**
 * The places the VGM puts in the regions it opens (plan 5.5, B1), as they stand on the land: a hamlet of a
 * few farms round a green, a camp of tents round a fire, the broken walls of the old realm, a field of
 * sealed barrows. Each is laid out from its region decision alone (seeded), in the building mesh format so
 * it draws with the town's one building shader, with the shapes the walker cannot go through. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { buildingMesh, distToPoly, ensureCCW, makeBuilding, pointInPoly, rect, type BuildingMesh, type Poly, type TownBuilding } from '@futuremagic/settlement';
import type { RegionFillDef } from '../setting/contract';
import type { RegionDecision } from './decisions';
import { MOUND, sealedBarrowMesh } from './dungeon/barrowMesh';
import { BuildingMat, CellarMat, MeshKit, WildMat, varyTint, type Tint } from './dungeon/meshKit';

/** What the walker cannot go through: a circle or a polygon (x, z pairs). */
export type Solid = { readonly x: number; readonly z: number; readonly r: number } | { readonly poly: Poly };

export interface SiteLayout {
  /** The site's middle and its ground height: mesh positions are relative to it. */
  readonly origin: readonly [number, number, number];
  readonly mesh: BuildingMesh;
  readonly solids: readonly Solid[];
  /** A hamlet's houses (as a town's: for doors and, later, people). */
  readonly buildings: readonly TownBuilding[];
}

export type Place = RegionFillDef['place'];

/** A place laid out on the land (`height`: the ground), or null for a region with nothing on it. */
export function layOutSite(d: RegionDecision, place: Place, height: (x: number, z: number) => number): SiteLayout | null {
  const s = d.site;
  if (!s || place === 'none') return null;
  const origin: [number, number, number] = [s.x, height(s.x, s.z), s.z];
  const at: At = { x: s.x, z: s.z, yaw: s.yaw, r: s.r, y0: origin[1], height, rng: new Rng(deriveSeed(d.seed, 'site')), seed: d.seed };
  const k = new MeshKit(), solids: Solid[] = [];
  const buildings = place === 'hamlet' ? hamlet(at, k, solids) : [];
  if (place === 'camp') camp(at, k, solids);
  else if (place === 'ruin') ruin(at, k, solids);
  else if (place === 'barrows') barrows(at, k, solids);
  return { origin, mesh: k.mesh(), solids, buildings };
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

/** A point `d` metres from the middle at angle `a` (radians, atan2(z, x)). */
const round = (at: At, a: number, d: number): [number, number] => [at.x + Math.cos(a) * d, at.z + Math.sin(a) * d];

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
function hamlet(at: At, k: MeshKit, solids: Solid[]): TownBuilding[] {
  const r = at.rng, n = r.int(3, 5);
  const site = { seed: deriveSeed(at.seed, 'hamlet'), x: at.x, z: at.z, height: at.height };
  const out: TownBuilding[] = [];
  const turn = r.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const kind = i === 0 ? 'farmhouse' : i === 2 && n > 3 ? 'barn' : 'cottage';
    const hu = kind === 'barn' ? r.range(5, 6.2) : kind === 'farmhouse' ? r.range(4.2, 5) : r.range(3, 4);
    const hv = kind === 'barn' ? r.range(3.4, 4) : r.range(2.6, 3.3);
    const a = turn + (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const reach = Math.hypot(hu, hv);
    let dist = 9 + hv + r.range(0, 4);
    // Out from the green until it stands clear of the houses already there.
    while (dist < at.r - reach * 0.5 && out.some((b) => Math.hypot(b.cx - (at.x + Math.cos(a) * dist), b.cz - (at.z + Math.sin(a) * dist)) < Math.hypot(b.hu, b.hv) + reach + 1.5)) dist += 1;
    const [cx, cz] = round(at, a, dist);
    if (out.some((b) => Math.hypot(b.cx - cx, b.cz - cz) < Math.hypot(b.hu, b.hv) + reach + 1.5)) continue;
    // v away from the green (the door faces it), u along its edge.
    const vx = Math.cos(a), vz = Math.sin(a);
    const b = makeBuilding(out.length, kind, cx, cz, -vz, vx, vx, vz, hu, hv, false, false, true, i, site, r);
    out.push(b);
    solids.push({ poly: b.poly });
    appendAt(k, buildingMesh(b, [at.x, at.y0, at.z]), 0, 0, 0);
  }
  // A woodpile by the farmhouse and a trough on the green.
  const f = out[0];
  if (f) {
    const [wx, wz] = [f.cx + f.vx * (f.hv + 1.2) - f.vz * (f.hu - 1), f.cz + f.vz * (f.hv + 1.2) + f.vx * (f.hu - 1)];
    stack(at, k, wx, wz, Math.atan2(f.vx, f.vz));
    solids.push({ x: wx, z: wz, r: 0.9 });
  }
  const ty = at.height(at.x, at.z) - at.y0;
  k.box(0, ty - 0.1, 0, 2.2, 0.75, 0.8, at.yaw, BuildingMat.Oak, [120, 96, 74]);
  solids.push({ x: at.x, z: at.z, r: 1.1 });
  return out;
}

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
    const a = ((i + 0.5) / n) * Math.PI * 2 + at.yaw, [lx, lz] = round(at, a, 2);
    k.box(lx - at.x, at.height(lx, lz) - at.y0 - 0.08, lz - at.z, 1.6, 0.36, 0.36, -a + Math.PI / 2, BuildingMat.Oak, varyTint(r, [128, 100, 76], 0.1));
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + at.yaw + r.range(-0.2, 0.2), [tx, tz] = round(at, a, r.range(4.8, 5.8));
    tent(at, k, tx, tz, a, r.range(2.4, 3), r.range(1.9, 2.3), r.range(1.4, 1.7));
    solids.push({ x: tx, z: tz, r: 1.5 });
  }
  const [wx, wz] = round(at, at.yaw + Math.PI + 0.6, 7.5);
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
  const c = Math.cos(at.yaw), s = Math.sin(at.yaw);
  // A point of the hall's own frame (u across, v along) in world metres.
  const inHall = (u: number, v: number): [number, number] => [at.x + u * c + v * s, at.z - u * s + v * c];
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
    const a = r.range(0, Math.PI * 2), d = r.range(2, at.r - 2), [x, z] = round(at, a, d);
    const sz = r.range(0.4, 0.9);
    k.stone(x - at.x, at.height(x, z) - at.y0 - sz * 0.35, z - at.z, sz * 1.4, sz, sz, r.range(0, 3), BuildingMat.Ashlar, varyTint(r, MOSS, 0.1), r, 0.08, 0.3);
  }
}

/** A barrow field: three to five sealed mounds of the old dead, of different sizes, on the rise. */
function barrows(at: At, k: MeshKit, solids: Solid[]): void {
  const r = at.rng, n = r.int(3, 5), placed: { x: number; z: number; R: number }[] = [];
  for (let i = 0; i < n * 6 && placed.length < n; i++) {
    const scale = r.range(0.7, 1.15), R = MOUND.r * scale;
    const [x, z] = placed.length ? round(at, r.range(0, Math.PI * 2), r.range(R + 2, at.r - R)) : [at.x, at.z];
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.R + R + 3)) continue;
    placed.push({ x, z, R });
    appendAt(k, sealedBarrowMesh(deriveSeed(at.seed, 'mound', i)), x - at.x, at.height(x, z) - at.y0 - 0.05, z - at.z, r.range(0, Math.PI * 2), scale);
    solids.push({ x, z, r: R * 0.95 });
  }
}

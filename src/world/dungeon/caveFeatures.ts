/**
 * What makes a carved cave natural (plan P1, D57; pure): its rooms' floors are not level but heaped with rubble,
 * stepped with beds of rock and banked up against their walls; blocks fallen from the roof lie by the walls,
 * stalagmites rise where it drips, water stands in pools and runs in a stream across a cavern's floor, and in
 * some caverns a shaft goes up through the roof to the day. caveRock.ts carves all of this into its field, the
 * walker and every creature stand on the same floor (`CaveSpace.floorAt`), and the cellar view draws the water
 * and the light falling down the shafts.
 *
 * The floor stays level where things are put down and where the hero comes and goes: round the props, the keys,
 * the hoard and the way out (`keep`), and in every doorway, so nothing floats or sinks and every way stays open.
 */
import { Noise, Rng, deriveSeed, smoothstep } from '@futuremagic/core';
import { DIRS } from '@futuremagic/dungeon';
import type { ScaledLayout } from './cellar';
import { DungeonSpace } from './space';

/** A room this many storeys high is a cavern (caveRock.ts carves its dome). */
export const CAVERN = 3;
/** How far over its rim a shaft's chimney rises above the roof (m). */
const SHAFT_UP = 9;
/** Within this of a doorway (m) the floor runs out level; it is level within the first share of it. */
const DOOR_LEVEL = 2, DOOR_FREE = 4;
/** Within this of a kept spot (m) the floor runs out level, level within the first share. */
const KEEP_LEVEL = 1.1, KEEP_FREE = 2.4;

/** A room of the cave as the floor's relief knows it (metres, the dungeon's frame). */
export interface Hall {
  readonly id: number;
  readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number;
  readonly floor: number;
  /** Its full height (m) and whether it is a cavern. */
  readonly high: number;
  readonly cavern: boolean;
  /** Its doorways' middles on its floor. */
  readonly doors: readonly (readonly [number, number])[];
}

/** Water standing in a hollow of the floor: its middle, radius, how deep and its surface. */
export interface CavePool { readonly hall: number; readonly x: number; readonly z: number; readonly r: number; readonly depth: number; readonly top: number }
/** Water running in a channel from a wall's foot into a pool: its course (x, z), half its width, its surface. */
export interface CaveStream { readonly hall: number; readonly pts: readonly (readonly [number, number])[]; readonly w: number; readonly depth: number; readonly top: number }
/** A chimney up through a cavern's roof to the day: where, its radius, the roof's height there and its top. */
export interface CaveShaft { readonly hall: number; readonly x: number; readonly z: number; readonly r: number; readonly floor: number; readonly roof: number; readonly top: number }
/** A block fallen from the roof: its middle, half its size, its turn. */
export interface CaveBlock { readonly hall: number; readonly x: number; readonly y: number; readonly z: number; readonly hx: number; readonly hy: number; readonly hz: number; readonly yaw: number }
/** A stalagmite: where it stands, its foot's height, how tall and how thick at its foot. */
export interface CaveMite { readonly hall: number; readonly x: number; readonly z: number; readonly base: number; readonly len: number; readonly r: number }

export interface CaveFeatures {
  readonly halls: ReadonlyMap<number, Hall>;
  readonly pools: readonly CavePool[];
  readonly streams: readonly CaveStream[];
  readonly shafts: readonly CaveShaft[];
  readonly blocks: readonly CaveBlock[];
  readonly mites: readonly CaveMite[];
  /** Spots kept level (x, z). */
  readonly keep: readonly (readonly [number, number])[];
  /** The noise of the floor's relief. */
  readonly noise: Noise;
  /** The water's surface over a drowned lowest storey (m; null: none). Its halls hold no pools or streams. */
  readonly flood: number | null;
}

/** A cavern's roof over (x, z): its full height in the middle, falling to this share at its walls. */
export const DOME_EDGE = 0.4;
export function domeAt(h: Hall, x: number, z: number): number {
  const u = (2 * x - h.x0 - h.x1) / (h.x1 - h.x0), v = (2 * z - h.z0 - h.z1) / (h.z1 - h.z0);
  return h.floor + h.high * (1 - (1 - DOME_EDGE) * Math.min(1, u * u + v * v));
}

/** Distance from (x, z) to a hall's walls (its rectangle's nearest side; negative outside). */
export const edgeOf = (h: Hall, x: number, z: number): number => Math.min(x - h.x0, h.x1 - x, z - h.z0, h.z1 - z);

/** Distance from (x, z) to a course of points. */
export function toCourse(pts: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

const nearestOf = (pts: readonly (readonly [number, number])[], x: number, z: number): number => {
  let best = Infinity;
  for (const [px, pz] of pts) best = Math.min(best, Math.hypot(px - x, pz - z));
  return best;
};

/**
 * How much the floor is raised (or, in water, lowered) at (x, z) of a hall, over its level, before the pools and
 * the stream are cut in: heaps, steps of rock and banks against the walls, level by the doorways and kept spots.
 */
function heaped(f: Pick<CaveFeatures, 'noise' | 'keep'>, h: Hall, x: number, z: number): number {
  const n = f.noise;
  const amp = h.cavern ? 1 : 0.4;
  // Low heaps of rubble and silt.
  const mound = Math.max(0, n.fbm2(x / 5.5, z / 5.5, 3) * 0.6 + 0.12) * 0.6;
  // Beds of rock breaking out in low steps (a short ramp at each, so they are walked).
  const t = (n.fbm2(x / 11 + 5.3, z / 11 - 2.1, 2) * 0.5 + 0.5) * 3.2;
  const steps = (Math.floor(t) + smoothstep(0.78, 1, t - Math.floor(t))) * 0.26;
  // A bank of fallen stuff against the walls, so they curve into the floor instead of standing on it.
  const e = edgeOf(h, x, z);
  const bank = smoothstep(h.cavern ? 6 : 3, 0.3, e) * (0.7 + 0.8 * (n.fbm2(x / 3.2 - 9, z / 3.2, 2) * 0.5 + 0.5)) * (h.cavern ? 1.3 : 0.8);
  let lift = (mound + (h.cavern ? steps : steps * 0.3) + bank) * amp;
  lift *= smoothstep(DOOR_LEVEL, DOOR_FREE, nearestOf(h.doors, x, z));
  lift *= smoothstep(KEEP_LEVEL, KEEP_FREE, nearestOf(f.keep, x, z));
  return lift;
}

/** The floor's height over its hall's level at (x, z): heaps and banks, the pools' hollows and the stream's bed. */
export function floorLift(f: CaveFeatures, h: Hall, x: number, z: number): number {
  let lift = heaped(f, h, x, z);
  for (const p of f.pools) {
    if (p.hall !== h.id) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r + 1.6) continue;
    lift *= smoothstep(p.r, p.r + 1.6, d);
    if (d < p.r) lift -= p.depth * (1 - (d / p.r) ** 2);
  }
  for (const s of f.streams) {
    if (s.hall !== h.id) continue;
    const d = toCourse(s.pts, x, z);
    if (d > s.w + 1) continue;
    lift *= smoothstep(s.w, s.w + 1, d);
    if (d < s.w) lift -= s.depth * (1 - (d / s.w) ** 2);
  }
  return lift;
}

/** The hall a point is in (the room owning its cell at its height), if any. */
export function hallAt(f: CaveFeatures, space: DungeonSpace, x: number, y: number, z: number): Hall | undefined {
  const C = space.scale.cell, own = space.own(Math.floor(x / C), Math.floor(z / C), space.levelAt(y));
  return own !== undefined && own >= 0 ? f.halls.get(own) : undefined;
}

/**
 * A cave's natural features from its layout and seed; `keep`: spots on its floors where things are put down (the
 * props, the keys, the hoard, the way out), kept level. Seeded: the same cave has the same features in a worker
 * and on the page. The shafts do not depend on `keep` (cellarVisit lights them from the cellar alone).
 */
export function caveFeatures(layout: ScaledLayout, seed: number, keep: readonly (readonly [number, number])[] = []): CaveFeatures {
  const { cell: C, storey: S } = layout.scale;
  const halls = new Map<number, Hall>();
  for (const r of layout.rooms) {
    const doors: [number, number][] = [];
    for (const pl of layout.links) for (const d of pl.doors) {
      if (d.room !== r.id) continue;
      doors.push([(d.x + 0.5 + DIRS[d.dir][0] * 0.5) * C, (d.z + 0.5 + DIRS[d.dir][1] * 0.5) * C]);
    }
    halls.set(r.id, { id: r.id, x0: r.x * C, x1: (r.x + r.w) * C, z0: r.z * C, z1: (r.z + r.d) * C, floor: r.level * S, high: r.height * S, cavern: r.height >= CAVERN, doors });
  }
  const noise = new Noise(deriveSeed(seed, 'cave', 'floor'));
  const flood = layout.flood ?? null;
  const f = { halls, pools: [] as CavePool[], streams: [] as CaveStream[], shafts: [] as CaveShaft[], blocks: [] as CaveBlock[], mites: [] as CaveMite[], keep, noise, flood };
  // The highest cavern always has a shaft to the day; others now and then.
  const caverns = [...halls.values()].filter((h) => h.cavern);
  const top = caverns.reduce<Hall | undefined>((a, h) => (!a || h.high > a.high ? h : a), undefined);
  for (const h of caverns) {
    const rng = new Rng(deriveSeed(seed, 'cave', 'shaft', h.id));
    if (h !== top && rng.float() > 0.4) continue;
    const x = h.x0 + (h.x1 - h.x0) * rng.range(0.3, 0.7), z = h.z0 + (h.z1 - h.z0) * rng.range(0.3, 0.7);
    const roof = domeAt(h, x, z);
    f.shafts.push({ hall: h.id, x, z, r: rng.range(1.2, 1.7), floor: h.floor, roof, top: roof + SHAFT_UP });
  }
  const clear = (h: Hall, x: number, z: number, free: number, keepFree: number) =>
    edgeOf(h, x, z) > 0.4 && nearestOf(h.doors, x, z) > free && nearestOf(keep, x, z) > keepFree;
  for (const h of halls.values()) {
    const rng = new Rng(deriveSeed(seed, 'cave', 'water', h.id)), W = h.x1 - h.x0, D = h.z1 - h.z0;
    const area = W * D;
    // Pools: one or two in a cavern (one under its shaft when it can), now and then one in a smaller room.
    const dry = flood === null || h.floor >= flood;
    const want = !dry ? 0 : h.cavern ? rng.int(1, 2) : area >= 60 && rng.float() < 0.3 ? 1 : 0;
    for (let k = 0, tries = 0; k < want && tries < 40; tries++) {
      const r = h.cavern ? rng.range(1.8, 3.6) : rng.range(1.1, 1.6);
      const shaft = f.shafts.find((s) => s.hall === h.id);
      const [x, z] = k === 0 && shaft && tries < 4
        ? [shaft.x + rng.range(-1.5, 1.5), shaft.z + rng.range(-1.5, 1.5)]
        : [h.x0 + W * rng.range(0.15, 0.85), h.z0 + D * rng.range(0.15, 0.85)];
      if (edgeOf(h, x, z) < r + 1.5 || !clear(h, x, z, r + DOOR_FREE, r + KEEP_FREE)) continue;
      if (f.pools.some((p) => p.hall === h.id && Math.hypot(p.x - x, p.z - z) < p.r + r + 2.5)) continue;
      f.pools.push({ hall: h.id, x, z, r, depth: rng.range(0.35, 0.6), top: h.floor - 0.06 });
      k++;
    }
    // A stream from the foot of a wall into a cavern's first pool, wandering a little.
    const pool = f.pools.find((p) => p.hall === h.id);
    if (h.cavern && pool && rng.float() < 0.75) {
      const sides: [number, number][] = [[h.x0 + 0.3, pool.z], [h.x1 - 0.3, pool.z], [pool.x, h.z0 + 0.3], [pool.x, h.z1 - 0.3]];
      const order = sides.map((s) => [Math.hypot(s[0] - pool.x, s[1] - pool.z), s] as const).sort((a, b) => a[0] - b[0]);
      for (const [, [wx, wz]] of order) {
        const pts: [number, number][] = [], n = 8, w = rng.range(0.35, 0.5);
        const len = Math.hypot(wx - pool.x, wz - pool.z), ax = (pool.x - wx) / len, az = (pool.z - wz) / len;
        for (let i = 0; i <= n; i++) {
          const t = i / n, wob = Math.sin(t * Math.PI) * noise.fbm2(t * 2.5 + h.id, 0.5, 2) * 2.2;
          pts.push([wx + (pool.x - wx) * t - az * wob, wz + (pool.z - wz) * t + ax * wob]);
        }
        if (pts.every(([x, z]) => nearestOf(h.doors, x, z) > w + DOOR_FREE && nearestOf(keep, x, z) > w + KEEP_FREE)) {
          f.streams.push({ hall: h.id, pts, w, depth: 0.14, top: h.floor - 0.04 });
          break;
        }
      }
    }
    if (!h.cavern) continue;
    const soaked = (x: number, z: number) => f.pools.some((p) => p.hall === h.id && Math.hypot(p.x - x, p.z - z) < p.r + 0.5) || f.streams.some((s) => s.hall === h.id && toCourse(s.pts, x, z) < s.w + 0.6);
    // Blocks fallen from the roof, lying near the walls (none in a doorway's way or on a kept spot).
    const rb = new Rng(deriveSeed(seed, 'cave', 'blocks', h.id));
    const blocks = Math.round(area / 70);
    for (let k = 0, tries = 0; k < blocks && tries < blocks * 8; tries++) {
      const side = rb.int(0, 3), out = rb.range(0.9, 3.6), along = rb.range(0.1, 0.9);
      const x = side === 0 ? h.x0 + out : side === 1 ? h.x1 - out : h.x0 + W * along;
      const z = side === 2 ? h.z0 + out : side === 3 ? h.z1 - out : h.z0 + D * along;
      const hx = rb.range(0.4, 1.1), hy = rb.range(0.35, 0.95), hz = rb.range(0.4, 1.1);
      const reach = Math.hypot(hx, hz);
      if (!clear(h, x, z, reach + DOOR_FREE, reach + KEEP_FREE) || soaked(x, z) || f.pools.some((p) => p.hall === h.id && Math.hypot(p.x - x, p.z - z) < p.r + reach + 1)) continue;
      f.blocks.push({ hall: h.id, x, y: h.floor + heaped(f, h, x, z) + hy * 0.75, z, hx, hy, hz, yaw: rb.range(0, Math.PI) });
      k++;
    }
    // Stalagmites where it drips: by the water and along the damp walls.
    const rm = new Rng(deriveSeed(seed, 'cave', 'mites', h.id));
    const mites = Math.round(area / 45);
    for (let k = 0, tries = 0; k < mites && tries < mites * 8; tries++) {
      const x = h.x0 + W * rm.range(0.06, 0.94), z = h.z0 + D * rm.range(0.06, 0.94);
      const damp = soaked(x, z) || edgeOf(h, x, z) < 3.5 || f.pools.some((p) => p.hall === h.id && Math.hypot(p.x - x, p.z - z) < p.r + 2.5);
      if (!damp || !clear(h, x, z, 1 + DOOR_FREE, 1 + KEEP_FREE)) continue;
      if (f.pools.some((p) => p.hall === h.id && Math.hypot(p.x - x, p.z - z) < p.r + 0.3) || f.streams.some((s) => s.hall === h.id && toCourse(s.pts, x, z) < s.w + 0.5)) continue;
      const base = h.floor + floorLift(f, h, x, z);
      f.mites.push({ hall: h.id, x, z, base: base - 0.1, len: rm.range(0.5, 2.3) * rm.range(0.6, 1), r: rm.range(0.22, 0.5) });
      k++;
    }
  }
  return f;
}

/** A rounded box's distance (positive outside), turned by its yaw. */
export function blockAt(b: CaveBlock, x: number, y: number, z: number): number {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
  const u = Math.abs(dx * c - dz * s) - b.hx * 0.7, v = Math.abs(y - b.y) - b.hy * 0.7, w = Math.abs(dx * s + dz * c) - b.hz * 0.7;
  const round = Math.min(b.hx, b.hy, b.hz) * 0.3;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0), Math.max(w, 0)) + Math.min(Math.max(u, v, w), 0) - round;
}

/** A stalagmite's distance (positive outside): a cone from its foot up. */
export function miteAt(m: CaveMite, x: number, y: number, z: number): number {
  const hd = Math.hypot(x - m.x, z - m.z), t = (y - m.base) / m.len;
  if (t > 1) return Math.hypot(hd, y - m.base - m.len);
  return (hd - m.r * (1 - Math.max(0, t)) ** 1.3) * 0.85;
}

/** Spots of a cellar kept level in its cave (`caveFeatures`' keep): its props, way out, keys and the middle of every room. */
export function keepSpots(c: { readonly layout: ScaledLayout; readonly props: readonly { readonly x: number; readonly z: number }[]; readonly hatch: { readonly x: number; readonly z: number } }): [number, number][] {
  const { cell } = c.layout.scale;
  return [
    ...c.props.map((p) => [p.x, p.z] as [number, number]),
    [c.hatch.x, c.hatch.z],
    ...c.layout.rooms.map((r) => [(r.x + r.w / 2) * cell, (r.z + r.d / 2) * cell] as [number, number]),
  ];
}

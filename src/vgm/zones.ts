/**
 * Zones laid out ahead (D69, Z3, Z5): the land is opened in zones, aligned squares (D16; 2 km in the classic setting), each with a name, a
 * theme and a level band that rises with distance from the start (the start's zone from level 1, each ring of zones out from it three
 * higher, so neighbours differ by at most three and every band but the first lies in eight directions round the start: a choice). The VGM
 * lays a zone out whole before the hero can see into it: the regions of its square the frontier has not opened yet (its settlements and
 * places), then its camps, densely (Z5: 25 to 40, six in ten small, three middle, one big, at least one big), each round a landmark, apart
 * from each other, clear of towns and places and far enough from every road that no camp's aggro reaches it (roads are the safe lanes).
 * Everything goes into the log, and nothing laid out is ever moved, emptied or replaced. Pure and seeded.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CampDef, CampPiece, CampsDef, SettingModule } from '../setting/contract';
import { settlementOf, sitesIn, type CampDecision, type CampPost, type Decision, type DecisionLog, type RegionDecision, type ZoneDecision } from '../world/decisions';
import { woodsOf } from '../world/flora';
import { boundsOf, keyAt, sizeOf, type RegionKey } from '../world/regions';
import type { Terrain } from '../world/terrain';
import { keyOf, regionAt, regionDecisions, regionMapOf } from './frontier';
import { round } from './roads';

export interface ZoneContext {
  readonly seed: number;
  readonly terrain: Terrain;
  readonly setting: Pick<SettingModule, 'camps' | 'regions' | 'aggro' | 'structures'>;
  readonly log: DecisionLog;
  /** Where the game started (the start zone's middle ring). */
  readonly home: { readonly x: number; readonly z: number };
  readonly hours: number;
  /** Ground camps keep away from beside what the log holds (the wild's territories). */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
}

/** What a worker needs to lay a zone out (it has the land, the setting and the seed). */
export type ZoneAsk = Omit<ZoneContext, 'seed' | 'terrain' | 'setting'> & { readonly key: RegionKey };

/** The zone square holding a point. */
export const zoneKeyAt = (c: CampsDef, x: number, z: number): RegionKey => keyAt(c.zoneLevel, x, z);

/** A zone's decision id. */
export const zoneId = (k: RegionKey): string => `zone:${k.x}:${k.z}`;

/** The zones the log has laid out. */
export const zonesOf = (log: DecisionLog): ZoneDecision[] => log.filter((d): d is ZoneDecision => d.kind === 'zone');

/** The camps the log holds (D69, Z2). */
export const campsOf = (log: DecisionLog): CampDecision[] => log.filter((d): d is CampDecision => d.kind === 'camp');

/**
 * A zone's level band (Z3): its ring round the start, counted by how far its nearest edge lies from where the game started along x or z (0 for
 * every zone within one zone's side of it, so a start town near its square's edge has easy land on both sides; 1 for the next, ...), from `first`
 * and `step` higher each ring, `width` levels wide, up to the top band. Two zones side by side are at most one ring apart.
 */
export function bandOf(c: CampsDef, k: RegionKey, home: { readonly x: number; readonly z: number }): readonly [number, number] {
  const [x0, z0, x1, z1] = boundsOf(k), gap = Math.max(x0 - home.x, home.x - x1, z0 - home.z, home.z - z1, 0);
  const ring = Math.floor(gap / sizeOf(k.level));
  const lo = Math.min(c.band.top - c.band.width + 1, c.band.first + c.band.step * ring);
  return [lo, lo + c.band.width - 1];
}

/** Metres from (x, z) to the nearest edge of a zone's square (0 inside it). */
function toSquare(k: RegionKey, x: number, z: number): number {
  const [x0, z0, x1, z1] = boundsOf(k);
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}

/** The zones not laid out yet that the hero at (x, z) is within `near` metres of, nearest first (their own zone first). */
export function zonesWanted(log: DecisionLog, c: CampsDef, hero: { readonly x: number; readonly z: number }, near: number): RegionKey[] {
  const have = new Set(zonesOf(log).map((d) => d.id)), h = zoneKeyAt(c, hero.x, hero.z), out: { k: RegionKey; d: number }[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const k = { level: c.zoneLevel, x: h.x + dx, z: h.z + dz }, d = toSquare(k, hero.x, hero.z);
    if (d <= near && !have.has(zoneId(k))) out.push({ k, d });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.k);
}

/** Candidate spots for camps are looked at this far apart (m), and kept this far inside the zone's square from its edge. */
const STEP = 40;
/** Steepest ground (rise per metre over half a camp's radius) a camp stands on. */
const STEEP = 0.42;
/** Ground this wooded (woodsOf, 0..1) or more is a wood camp's; this or less an open one's. */
const WOOD = 0.4, OPEN = 0.3;
/** A gap between camps' edges wider than this (m) is filled with a small camp (Z5: a camp within about 200 m of any point). */
const GAP = 170;

interface Spot { readonly x: number; readonly z: number; readonly woods: number; readonly road: number }

/**
 * Lays out the zone `k` whole (Z3): the regions of its square still closed (their places and settlements, as the frontier opens them), the
 * zone, and its camps; in this order, for the log. Empty when the zone is laid out already or the setting has no camps.
 */
export function layOutZone(c: ZoneContext, k: RegionKey): Decision[] {
  const def = c.setting.camps, regions = c.setting.regions;
  if (!def || zonesOf(c.log).some((d) => d.id === zoneId(k))) return [];
  const out: Decision[] = [];
  let log: DecisionLog = c.log;
  // The rest of its square opened first (D69: its settlements and places are part of its layout, and camps keep clear of them).
  if (regions) {
    const map = regionMapOf(log, regions.country), [x0, z0] = boundsOf(k), n = sizeOf(k.level) / 250;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = { x: x0 + (i + 0.5) * 250, z: z0 + (j + 0.5) * 250 };
      for (let guard = 0; guard < 4 && !map.at(p.x, p.z); guard++) {
        const r = regionAt({ seed: c.seed, terrain: c.terrain, regions, log, home: c.home, hero: p, hours: c.hours, avoid: c.avoid, map }, p);
        if (!r) break;
        map.open(keyOf(r), { fill: r.fill, decision: r.id }, () => ({ fill: regions.country, decision: r.id }));
        out.push(r);
        log = [...log, r];
      }
    }
  }
  const s = deriveSeed(c.seed, 'vgm', 'zone', k.x, k.z), rng = new Rng(s);
  const band = bandOf(def, k, c.home);
  const theme = rng.weighted(def.themes, (t) => t.weight);
  const [bx0, bz0] = boundsOf(k), side = sizeOf(k.level);
  const biome = c.terrain.biomeIdAt(bx0 + side / 2, bz0 + side / 2) ?? 'other';
  const lands = def.lands[biome] ?? def.lands.other;
  const name = rng.pick(theme.names).replace('{land}', rng.pick(lands));
  const zone: ZoneDecision = { kind: 'zone', id: zoneId(k), level: k.level, x: k.x, z: k.z, theme: theme.id, name, band, seed: s, at: c.hours };
  out.push(zone);
  out.push(...campsFor(c, k, zone, log, rng));
  return out;
}

/** The camps of a zone (Z2, Z5): sizes dealt, each placed where it fits best and farthest from the others, its posts fixed. */
function campsFor(c: ZoneContext, k: RegionKey, zone: ZoneDecision, log: DecisionLog, rng: Rng): CampDecision[] {
  const def = c.setting.camps!, t = c.terrain, theme = def.themes.find((x) => x.id === zone.theme)!;
  const spots = spotsIn(c, k, log);
  // What the camps keep clear of: towns and their fields, places, holds, other camps (their edges `apart`), the wild's grounds.
  const towns = [
    ...t.towns.map((w) => ({ x: w.decision.x, z: w.decision.z, r: w.decision.radius * 1.6 + def.town })),
    ...regionDecisions(log).flatMap((d) => { const s = c.setting.regions ? settlementOf(d, c.setting.regions.fills) : null; return s ? [{ x: s.x, z: s.z, r: s.radius * 1.6 + def.town }] : []; }),
  ];
  const placed: { x: number; z: number; r: number }[] = [...sitesIn(log, 40), ...(c.avoid ?? [])];
  const wide = c.setting.aggro.max + def.road;
  const n = rng.int(def.density.count[0], def.density.count[1]);
  const big = Math.max(1, Math.round(n * def.density.big)), middle = Math.round(n * def.density.middle);
  // One big first (every zone has one), then the rest dealt in turn by their shares, so a zone with little room still gets them in proportion.
  const left = { big: big - 1, middle, small: Math.max(0, n - big - middle) }, sizes: CampDef['size'][] = ['big'];
  for (let i = 1; i < n; i++) {
    const want = (['small', 'middle', 'big'] as const).filter((z) => left[z] > 0);
    const z = want.reduce((a, b) => (left[b] / def.density[b] > left[a] / def.density[a] ? b : a));
    left[z]--;
    sizes.push(z);
  }
  const out: CampDecision[] = [];
  const fitsSpot = (kind: CampDef, p: Spot): boolean => p.road >= kind.r + wide && (kind.habitat === 'wood' ? p.woods >= WOOD : kind.habitat === 'open' ? p.woods <= OPEN : true)
    && !towns.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + kind.r);
  const weight = (d: CampDef): number => theme.camps[d.id] ?? 0;
  /**
   * One camp of `size` (or of any size the zone's theme has, `size` null) at the spot farthest from every other camp's or place's edge (the
   * zone filled evenly), never nearer than `apart`, as the kind of that size that fits the spot (wood or open, room from the roads). Null:
   * no spot is far enough from the others, or only one farther than `most` (filling the gaps only).
   */
  const placeCamp = (size: CampDef['size'] | null, least = def.apart): CampDecision | null => {
    const kinds = def.camps.filter((d) => (size === null ? weight(d) > 0 && d.size === 'small' : d.size === size));
    if (!kinds.length) return null;
    const near = Math.min(...kinds.map((d) => d.r));
    const ranked: { p: Spot; gap: number }[] = [];
    for (const p of spots) {
      if (!kinds.some((d) => fitsSpot(d, p))) continue;
      let gap = 400;
      for (const o of placed) gap = Math.min(gap, Math.hypot(o.x - p.x, o.z - p.z) - o.r - near);
      if (gap >= least) ranked.push({ p, gap: gap + rng.float() * 30 });
    }
    ranked.sort((a, b) => b.gap - a.gap);
    for (const { p } of ranked.slice(0, 12)) {
      const fit = kinds.filter((d) => fitsSpot(d, p) && placed.every((o) => Math.hypot(o.x - p.x, o.z - p.z) - o.r - d.r >= def.apart));
      if (!fit.length) continue;
      const themed = fit.filter((d) => weight(d) > 0);
      const kind = themed.length ? rng.weighted(themed, weight) : rng.pick(fit);
      const d = campAt(c, zone, kind, p, out.length + 1);
      placed.push({ x: d.x, z: d.z, r: d.r });
      out.push(d);
      return d;
    }
    return null;
  };
  for (const size of sizes) placeCamp(size);
  // Then the gaps (Z5: some camp's edge within about 200 m of any point off the roads): small camps where the land is still empty, up to the most a zone holds.
  while (out.length < def.density.count[1] && placeCamp(null, GAP)) { /* filled one */ }
  return out;
}

/** The spots in a zone a camp might stand on: dry, gentle, inside the square, with how wooded they are and how far the nearest road is. */
function spotsIn(c: ZoneContext, k: RegionKey, log: DecisionLog): Spot[] {
  const t = c.terrain, woods = woodsOf(t), [x0, z0] = boundsOf(k), side = sizeOf(k.level), rng = new Rng(deriveSeed(c.seed, 'zone-spots', k.x, k.z));
  const lines = roadLines(t, log);
  const out: Spot[] = [];
  for (let z = z0 + STEP / 2; z < z0 + side; z += STEP) for (let x = x0 + STEP / 2; x < x0 + side; x += STEP) {
    const px = x + rng.range(-STEP * 0.4, STEP * 0.4), pz = z + rng.range(-STEP * 0.4, STEP * 0.4);
    const h = t.height(px, pz);
    if (h < 2 || t.waterDepth(px, pz, h) > 0 || t.steepness(px, pz, 8, h) > STEEP) continue;
    // Room round it on dry ground for its posts.
    let dry = true;
    for (let a = 0; a < 6 && dry; a++) {
      const qx = px + Math.cos((a * Math.PI) / 3) * 14, qz = pz + Math.sin((a * Math.PI) / 3) * 14;
      if (t.waterDepth(qx, qz) > 0 || Math.abs(t.height(qx, qz) - h) > 14 * STEEP) dry = false;
    }
    if (!dry) continue;
    out.push({ x: px, z: pz, woods: woods(px, pz), road: nearestLine(lines, px, pz) });
  }
  return out;
}

/** Every road's centre line as (x, z) pairs: the roads in the log and the towns' own roads out. */
function roadLines(t: Terrain, log: DecisionLog): number[][] {
  const out: number[][] = [];
  for (const d of log) if (d.kind === 'road') {
    const pts: number[] = [];
    for (let i = 0; i < d.pts.length; i += 3) pts.push(d.pts[i], d.pts[i + 2]);
    out.push(pts);
  }
  for (const town of t.towns) for (const s of town.plan.streets) if (s.kind === 'road') out.push([...s.pts]);
  return out;
}

/** Metres from (x, z) to the nearest of the lines. */
function nearestLine(lines: readonly number[][], x: number, z: number): number {
  let best = Infinity;
  for (const l of lines) for (let i = 0; i + 3 < l.length; i += 2) {
    const ax = l[i], az = l[i + 1], bx = l[i + 2], bz = l[i + 3];
    if (Math.min(ax, bx) - x > best || x - Math.max(ax, bx) > best || Math.min(az, bz) - z > best || z - Math.max(az, bz) > best) continue;
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, u = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return best;
}

/** A camp of `kind` at `p` (Z2): its level within the zone's band, its landmark, its posts fixed round it. */
function campAt(c: ZoneContext, zone: ZoneDecision, kind: CampDef, p: Spot, n: number): CampDecision {
  const s = deriveSeed(zone.seed, 'camp', n), rng = new Rng(s), [lo, hi] = zone.band;
  // Small camps keep to the low end of the band, big ones to the high end.
  const base = kind.size === 'small' ? lo : kind.size === 'middle' ? lo + 1 : lo + 2;
  const level = Math.min(hi, base + rng.int(0, 2));
  const landmark = landmarkOf(c.setting.structures, kind, rng);
  const t = c.terrain, posts: CampPost[] = [];
  const a0 = rng.range(0, Math.PI * 2);
  kind.posts.forEach((pd, post) => {
    const count = rng.int(pd.count[0], pd.count[1]);
    for (let i = 0; i < count; i++) {
      const lead = !!pd.leader && i === 0, lv = lead ? Math.min(hi, level + 1) : Math.max(lo, level - rng.int(0, 1));
      const creature = rng.pick(pd.creatures);
      let a = a0 + (i / count) * Math.PI * 2 + post * 0.9 + rng.range(-0.3, 0.3), d = kind.r * rng.range(pd.out[0], pd.out[1]);
      // On dry ground: drawn in towards the middle until it is.
      for (let k = 0; k < 4 && t.waterDepth(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d) > 0; k++) d *= 0.6;
      const x = round(p.x + Math.cos(a) * d), z = round(p.z + Math.sin(a) * d);
      const round_: number[] = [];
      if (pd.patrol) {
        // A fixed round about the camp (learnable): four points on its edge, walked in order.
        for (let q = 0; q < 4; q++) { a += Math.PI / 2; round_.push(round(p.x + Math.cos(a) * d), round(p.z + Math.sin(a) * d)); }
      }
      posts.push({ x, z, creature, level: lv, post, ...(lead ? { leader: true as const } : {}), ...(round_.length ? { round: round_ } : {}) });
    }
  });
  const yaw = Math.atan2(-(c.home.x - p.x), -(c.home.z - p.z));
  return { kind: 'camp', id: `camp:${zone.x}:${zone.z}:${n}`, zone: zone.id, camp: kind.id, x: round(p.x), z: round(p.z), yaw: round(yaw), r: kind.r, landmark, level, posts, seed: s, at: zone.at };
}

/** What a camp is built round (Z4): a structure kind in play if it names one, else one of its pieces. */
function landmarkOf(structures: SettingModule['structures'], kind: CampDef, rng: Rng): string {
  const kinds = Object.entries(kind.landmarks ?? {}).filter(([id]) => structures?.kinds.some((x) => x.id === id && x.play));
  if (kinds.length) return rng.weighted(kinds, (e) => e[1])[0];
  const pieces = Object.entries(kind.pieces) as [CampPiece, number][];
  return pieces.length ? rng.weighted(pieces, (e) => e[1])[0] : 'none';
}


/** A zone's square's middle (world metres). */
export function zoneMiddle(d: Pick<ZoneDecision, 'level' | 'x' | 'z'>): [number, number] {
  const [x0, z0] = boundsOf(d), s = sizeOf(d.level);
  return [x0 + s / 2, z0 + s / 2];
}

/** A zone's key. */
export const zoneKey = (d: ZoneDecision): RegionKey => ({ level: d.level, x: d.x, z: d.z });

/** The id of the zone square holding (x, z). */
export const zoneIdAt = (c: CampsDef, x: number, z: number): string => zoneId(zoneKeyAt(c, x, z));

/** The regions a zone opened (for callers that log them like the frontier's). */
export const regionsIn = (ds: readonly Decision[]): RegionDecision[] => ds.filter((d): d is RegionDecision => d.kind === 'region');

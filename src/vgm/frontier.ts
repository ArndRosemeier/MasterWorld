/**
 * The frontier (plan 4.2, 5.2, 5.5, B1): the land the hero is about to reach is opened as regions, ahead
 * of them. The start's own region (1 km round the town) opens first; after that, whenever a point ahead of
 * the hero (or close round them) lies in no open region, the VGM opens one there: an aligned square sized
 * for its fill, filled from the setting (plain country, a hamlet, a camp, ruins, a barrow field). Every
 * opening is a decision in the log, so a save replays the same regions. Pure.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { RegionFillDef, RegionsDef } from '../setting/contract';
import { harbourSpots, riverMouths } from '../world/coast';
import { HOUSE_SCALE } from '@futuremagic/settlement';
import { settlementOf, sitesIn, type DecisionLog, type RegionDecision } from '../world/decisions';
import { woodsOf } from '../world/flora';
import { bankSpots, freshWaterEdge, WATER_REACH } from '../world/freshWater';
import { RegionMap, boundsOf, keyAt, keyId, sizeOf, type RegionKey } from '../world/regions';
import type { Terrain } from '../world/terrain';
import { compass } from './dungeons';

export const FRONTIER = {
  /** The start's region: 1 km round the town (plan 6). */
  home: 2,
  /** Fill id of the start's region (the town stands there; no fill of the setting's). */
  start: 'start',
  /** Metres ahead of the hero (along the way they go) that should be open, near to far. */
  ahead: [500, 900, 1400, 2000],
  /** Turns off the way ahead that are looked along too (radians), so a slow bend finds open land. */
  spread: [0, 0.45, -0.45, 0.9, -0.9],
  /** Metres round the hero that should be open whichever way they go. */
  around: [350, 900],
} as const;

/** What an open region holds: its fill, and the decision that opened it. */
export interface RegionData {
  readonly fill: string;
  readonly decision: string;
}

export function regionDecisions(log: DecisionLog): RegionDecision[] {
  return log.filter((d): d is RegionDecision => d.kind === 'region');
}

/** The open regions as the log says (plan 5.1: replaying the log rebuilds them). */
export function regionMapOf(log: DecisionLog, country: string): RegionMap<RegionData> {
  const map = new RegionMap<RegionData>();
  for (const d of regionDecisions(log)) map.open(keyOf(d), { fill: d.fill, decision: d.id }, () => ({ fill: country, decision: d.id }));
  return map;
}

export const keyOf = (d: RegionDecision): RegionKey => ({ level: d.level, x: d.x, z: d.z });

export interface FrontierContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly terrain: Terrain;
  readonly regions: RegionsDef;
  /** Where the game started (the start's region; places lie on rings round it). */
  readonly home: { readonly x: number; readonly z: number };
  readonly hero: { readonly x: number; readonly z: number };
  /** The way the hero goes (any length; none or zero: standing). */
  readonly heading?: { readonly x: number; readonly z: number } | null;
  /** Game hours since the world began. */
  readonly hours: number;
  /** Ground places keep away from (the wild's territories), beside the towns, barrows and places in the log. */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
  /** The open regions, if the caller keeps them (else built from the log). */
  readonly map?: RegionMap<RegionData>;
}

/** What a worker needs to look for the next region (it has the land, the setting and the seed). */
export type FrontierAsk = Omit<FrontierContext, 'seed' | 'terrain' | 'regions' | 'map'>;

/** Does the land round the hero want a region opened now (nextRegion would answer one)? Cheap: no place is looked for. */
export function wantsRegion(log: DecisionLog, map: RegionMap<RegionData>, hero: { x: number; z: number }, heading?: { x: number; z: number } | null): boolean {
  return !regionDecisions(log).length || wantedPoints(hero, heading).some((p) => !map.at(p.x, p.z));
}

/** The points that should lie in open regions, most wanted first: under the hero, close round, then ahead. */
export function wantedPoints(hero: { x: number; z: number }, heading?: { x: number; z: number } | null): { x: number; z: number }[] {
  const out = [{ x: hero.x, z: hero.z }];
  const ring = (r: number) => { for (let i = 0; i < 8; i++) out.push({ x: hero.x + Math.cos((i * Math.PI) / 4) * r, z: hero.z + Math.sin((i * Math.PI) / 4) * r }); };
  ring(FRONTIER.around[0]);
  const len = heading ? Math.hypot(heading.x, heading.z) : 0;
  if (heading && len > 1e-6) {
    const a0 = Math.atan2(heading.z, heading.x);
    for (const d of FRONTIER.ahead) for (const t of FRONTIER.spread) out.push({ x: hero.x + Math.cos(a0 + t) * d, z: hero.z + Math.sin(a0 + t) * d });
  }
  ring(FRONTIER.around[1]);
  return out;
}

/** The next region to open, if the land ahead of the hero needs one now (one at a time). */
export function nextRegion(c: FrontierContext): RegionDecision | null {
  const done = regionDecisions(c.log);
  if (!done.length) {
    const k = keyAt(FRONTIER.home, c.home.x, c.home.z);
    return { kind: 'region', id: 'region-1', ...k, fill: FRONTIER.start, seed: deriveSeed(c.seed, 'vgm', 'region', 1), at: c.hours };
  }
  const map = c.map ?? regionMapOf(c.log, c.regions.country);
  for (const p of wantedPoints(c.hero, c.heading)) if (!map.at(p.x, p.z)) return openAt(c, map, p, done);
  return null;
}

/** A region opened round a point that lies in none: a fill that fits, sized for it, its place found. */
function openAt(c: FrontierContext, map: RegionMap<RegionData>, p: { x: number; z: number }, done: readonly RegionDecision[]): RegionDecision {
  const n = done.length + 1, s = deriveSeed(c.seed, 'vgm', 'region', n);
  const country = c.regions.fills.find((f) => f.id === c.regions.country)!;
  const fits = c.regions.fills.filter((f) => f.place !== 'none' && f.weight > 0 && fitsAt(c, f, p, done));
  const pool = [country, ...fits];
  const total = pool.reduce((a, f) => a + f.weight, 0);
  // The roll depends on where as well as on how many came before, so no two walks open the same order of places.
  let roll = hash2f(s, Math.floor(p.x / 250), Math.floor(p.z / 250)) * total, pick = country;
  for (const f of pool) { if ((roll -= f.weight) < 0) { pick = f; break; } }
  const base = { kind: 'region' as const, id: `region-${n}`, seed: s, at: c.hours };
  if (pick.place !== 'none') {
    // The place needs a square of its own: its size if that is free, else the largest free one round the
    // point. Open ground first: the point's square, then the free squares beside it; woodland only when
    // none of them has open ground.
    for (let level = pick.level; level >= 0; level--) {
      // A smaller square only while the place (and the fields round it) still fits in it: the capital never squeezes.
      if (sizeOf(level) < radiusOf(pick) * 5) break;
      const k = keyAt(level, p.x, p.z);
      if (!wholeFree(map, k)) continue;
      let wooded: { k: RegionKey; site: Spot } | null = null;
      for (const [dx, dz] of AROUND) {
        const q = { level, x: k.x + dx, z: k.z + dz };
        if (!wholeFree(map, q)) continue;
        const site = findSite(c, pick, q, s);
        if (site?.open) return { ...base, ...q, fill: pick.id, site: site.at };
        if (site && !wooded) wooded = { k: q, site };
      }
      if (wooded) return { ...base, ...wooded.k, fill: pick.id, site: wooded.site.at };
      break;
    }
  }
  return { ...base, ...keyAt(country.level, p.x, p.z), fill: country.id };
}

/** The point's own square first, then the eight beside it. */
const AROUND: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** Is this square free of every open region (none covers it, none lies inside it)? */
function wholeFree(map: RegionMap<RegionData>, k: RegionKey): boolean {
  const free = map.freeParts(k);
  return free.length === 1 && keyId(free[0]) === keyId(k);
}

/** A place's spot, and whether it lies on open ground. */
interface Spot { readonly at: NonNullable<RegionDecision['site']>; readonly open: boolean }

/** Whether a fill may lie round this point: its biomes, its ring round the start, and apart from others of its kind. */
function fitsAt(c: FrontierContext, f: RegionFillDef, p: { x: number; z: number }, done: readonly RegionDecision[]): boolean {
  const t = c.terrain;
  if (t.height(p.x, p.z) < 2) return false;
  if (f.biomes && !f.biomes.includes(t.biomeIdAt(p.x, p.z) ?? '')) return false;
  const d = Math.hypot(p.x - c.home.x, p.z - c.home.z);
  if (f.ring && (d < f.ring[0] || (f.ring[1] !== undefined && d > f.ring[1]))) return false;
  const apart = f.apart ?? 0;
  if (done.some((o) => o.fill === f.id && o.site && Math.hypot(o.site.x - p.x, o.site.z - p.z) < apart)) return false;
  // A harbour town needs a river's mouth (D50: the river its fresh water, the sea its harbour).
  if (f.harbour) return riverMouths(t, p.x, p.z, Math.min(sizeOf(f.level) * 1.5, 1500)).length > 0;
  // A settlement needs fresh water (D50): a brook, river or lake somewhere in the squares it may take.
  return !SETTLES[f.place] || freshWaterEdge(t, p.x, p.z, Math.min(sizeOf(f.level) * 1.5, 1500)) < Infinity;
}

/** The places people live in, which stand by fresh water (D50): their squares' banks are tried too. */
const SETTLES: Record<RegionFillDef['place'], boolean> = { none: false, waystation: true, hamlet: true, village: true, capital: true, camp: false, ruin: false, barrows: false };

/** A fill's footprint radius (m): a settlement's grows with its houses (AssetGenerator HOUSE_SCALE), a camp's or a ruin's does not. */
function radiusOf(f: RegionFillDef): number {
  return (f.radius ?? 20) * (SETTLES[f.place] ? HOUSE_SCALE : 1);
}


const woods = new WeakMap<Terrain, (x: number, z: number) => number>();

/** How steep the ground may be round a place of each kind (rise per metre over its radius). */
const STEEP: Record<RegionFillDef['place'], number> = { none: 1, waystation: 0.14, hamlet: 0.12, village: 0.1, capital: 0.08, camp: 0.16, ruin: 0.25, barrows: 0.16 };
/** Ground this wooded or less (woodsOf, 0..1) round a place counts as open. */
export const OPEN_GROUND = 0.3;
/** How much a place of each kind keeps out of thick woods (ruins do not mind: the wood grew round them). */
const OPEN: Record<RegionFillDef['place'], number> = { none: 0, waystation: 1, hamlet: 1.2, village: 1.2, capital: 1.5, camp: 0.3, ruin: 0, barrows: 0.8 };

/**
 * Where in the square a place stands: dry, gentle ground with room for its footprint, away from towns and
 * other places; the way it faces (yaw: towards the start). Null if no ground fits.
 */
function findSite(c: FrontierContext, f: RegionFillDef, k: RegionKey, s: number): Spot | null {
  const t = c.terrain, r = radiusOf(f);
  const [x0, z0] = boundsOf(k), size = sizeOf(k.level), margin = r + 12;
  const away = [
    ...(c.avoid ?? []),
    ...t.towns.map((w) => ({ x: w.decision.x, z: w.decision.z, r: w.decision.radius * 2.4 })),
    ...sitesIn(c.log, 40),
  ];
  if (f.harbour) {
    // By a river's mouth in the square, on the bank with the most dry ground (world/coast.ts), facing the start.
    for (const m of riverMouths(t, x0 + size / 2, z0 + size / 2, size * 0.75)) for (const h of harbourSpots(t, m, r)) {
      if (h.x < x0 + margin || h.x > x0 + size - margin || h.z < z0 + margin || h.z > z0 + size - margin) continue;
      if (f.ring && Math.hypot(h.x - c.home.x, h.z - c.home.z) < f.ring[0]) continue;
      if (away.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < o.r + r + 30)) continue;
      return { at: { x: h.x, z: h.z, yaw: Math.atan2(-(c.home.x - h.x), -(c.home.z - h.z)), r, harbour: h.harbour }, open: true };
    }
    return null;
  }
  const wood = woods.get(t) ?? woods.set(t, woodsOf(t)).get(t)!;
  // The best spot so far (lowest score).
  let bx = NaN, bz = NaN, low = Infinity, open = false;
  // A grid of spots through the square; a settlement also tries the banks in it, and needs water.
  const N = 7, settles = SETTLES[f.place];
  const spots: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) spots.push([
    x0 + margin + (size - 2 * margin) * ((i + hash2f(s, i, j + 40)) / N),
    z0 + margin + (size - 2 * margin) * ((j + hash2f(s, i + 40, j)) / N),
  ]);
  if (settles) for (const b of bankSpots(t, x0 + size / 2, z0 + size / 2, Math.min(size * 0.75, 750), r)) {
    if (b.x > x0 + margin && b.x < x0 + size - margin && b.z > z0 + margin && b.z < z0 + size - margin) spots.push([b.x, b.z]);
  }
  const fit: { x: number; z: number; base: number; open: boolean }[] = [];
  for (let q = 0; q < spots.length; q++) {
    const [x, z] = spots[q], i = q % N, j = Math.floor(q / N);
    const h = t.height(x, z);
    if (h < 3 || t.waterDepth(x, z, h) > 0) continue;
    if (f.ring && Math.hypot(x - c.home.x, z - c.home.z) < f.ring[0]) continue;
    if (away.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 30)) continue;
    if (f.biomes && !f.biomes.includes(t.biomeIdAt(x, z) ?? '')) continue;
    let steep = 0, ok = true;
    for (const rr of [r * 0.25, r * 0.5, r]) for (let a = 0; a < 8 && ok; a++) {
      const px = x + Math.cos((a * Math.PI) / 4) * rr, pz = z + Math.sin((a * Math.PI) / 4) * rr;
      const ph = t.height(px, pz);
      if (ph < 1.5 || t.waterDepth(px, pz, ph) > 0) ok = false;
      steep = Math.max(steep, Math.abs(ph - h) / rr);
    }
    if (!ok || steep > STEEP[f.place]) continue;
    // Open ground first (the place is seen from afar); woodland only when the square has none.
    // How wooded the place's footprint is, on the whole (its clearing opens the rest round it).
    let woods = wood(x, z);
    for (let a = 0; a < 8; a++) woods += wood(x + Math.cos((a * Math.PI) / 4) * r * 0.7, z + Math.sin((a * Math.PI) / 4) * r * 0.7);
    woods /= 9;
    const base = (woods > OPEN_GROUND ? 10 + woods : 0) + steep / STEEP[f.place] + woods * OPEN[f.place] + hash2f(s, i, j) * 0.4;
    fit.push({ x, z, base, open: woods <= OPEN_GROUND });
  }
  // The way to water only adds to a spot's rank, and is dear to look for (wide round a big place): best first,
  // until no spot left could beat the best.
  fit.sort((a, b) => a.base - b.base);
  for (const p of fit) {
    if (p.base >= low) break;
    const water = settles ? freshWaterEdge(t, p.x, p.z, r + WATER_REACH) : 0;
    if (water === Infinity) continue;
    const rank = p.base + (Math.max(0, water - r - 30) / WATER_REACH) * 0.4;
    if (rank < low) { low = rank; bx = p.x; bz = p.z; open = p.open; }
  }
  if (low === Infinity) return null;
  return { at: { x: bx, z: bz, yaw: Math.atan2(-(c.home.x - bx), -(c.home.z - bz)), r }, open };
}

/** The settlements in the log (the towns, and the hamlets and villages of regions): for roads and for whatever links places. */
export function settlementsOf(log: DecisionLog, regions?: RegionsDef): { id: string; x: number; z: number; r: number }[] {
  return log.flatMap((d) => {
    const t = d.kind === 'town' ? d : d.kind === 'region' && regions ? settlementOf(d, regions.fills) : null;
    return t ? [{ id: t.id, x: t.x, z: t.z, r: t.radius }] : [];
  });
}

/** The fill a region decision names, if the setting has it. */
export function fillOf(d: RegionDecision, regions: RegionsDef): RegionFillDef | null {
  return regions.fills.find((f) => f.id === d.fill) ?? null;
}

/** A region as the log says it: "region-7: a hamlet, 2.4 km north-east of the start (a 500 m square)". */
export function regionLine(d: RegionDecision, regions: RegionsDef, home: { readonly x: number; readonly z: number }): string {
  const size = sizeOf(d.level), name = d.fill === FRONTIER.start ? 'the start' : fillOf(d, regions)?.name ?? d.fill;
  const [x0, z0, x1, z1] = boundsOf(keyOf(d));
  const at = d.site ?? { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  const km = Math.hypot(at.x - home.x, at.z - home.z) / 1000;
  const where = km < 0.3 ? 'at the start' : `${km.toFixed(1)} km ${compass(at.x - home.x, at.z - home.z)} of the start`;
  return `${d.id}: ${name}, ${where} (a ${size >= 1000 ? `${size / 1000} km` : `${size} m`} square)`;
}

/**
 * The regions a walk of `km` from the start along `dir` (radians, atan2(z, x)) opens, asking every 25 m
 * (about five seconds of running). For checks, and for starting beside a kind of place (`until`).
 */
export function walkFrontier(c: Omit<FrontierContext, 'hero' | 'heading' | 'hours' | 'map'>, dir: number, km: number, until?: (d: RegionDecision) => boolean): RegionDecision[] {
  const out: RegionDecision[] = [];
  let log = [...c.log];
  const map = regionMapOf(log, c.regions.country);
  const heading = { x: Math.cos(dir), z: Math.sin(dir) };
  for (let m = 0; m <= km * 1000; m += 25) {
    const hero = { x: c.home.x + heading.x * m, z: c.home.z + heading.z * m };
    // A few asks a spot: the VGM opens one region at a time.
    for (let i = 0; i < 3; i++) {
      const d = nextRegion({ ...c, log, hero, heading, hours: m / 1000, map });
      if (!d) break;
      log.push(d);
      out.push(d);
      map.open(keyOf(d), { fill: d.fill, decision: d.id }, () => ({ fill: c.regions.country, decision: d.id }));
      if (until?.(d)) return out;
    }
  }
  return out;
}

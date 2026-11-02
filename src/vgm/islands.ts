/**
 * Islands as promises (S7, plan 13, D60): the islands out at sea (world/skeleton.ts `isleOf`) are no one's until the
 * VGM promises one. When a harbour master is asked for passage, the nearest island in a voyage's reach that has no
 * village yet gets one: a handful of fishers' houses round a quay on the shore facing the harbour asked from
 * (`islandFor`, a region the Builder builds like any other). Sailors talk of it as the harbour master offers passage
 * (vgm/voyages.ts), the ship sails there, and once the village stands the VGM puts a place out on the island for
 * its people to know of (`islandPlace`). Mostly a place to explore. Pure.
 */
import type { IslandsDef, VoyageDef } from '../setting/contract';
import { freeBerths, planHarbour } from '@futuremagic/settlement';
import { harbourSpots } from '../world/coast';
import { nearestFirst } from '../world/spiral';
import type { DungeonDecision, RegionDecision, TownDecision } from '../world/decisions';
import type { Isle } from '../world/skeleton';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { dungeonFor, type DungeonContext } from './dungeons';
import { radiusOf, siteRegion, type FrontierContext } from './frontier';
import { decided, seaRoute } from './voyages';

/** The islands whose middles lie within `reach` (m) of (x, z), nearest first. */
export function islandsNear(t: Terrain, d: IslandsDef, x: number, z: number, reach: readonly [number, number]): Isle[] {
  const out: Isle[] = [];
  const i0 = Math.floor((x - reach[1]) / d.cell), i1 = Math.floor((x + reach[1]) / d.cell);
  const j0 = Math.floor((z - reach[1]) / d.cell), j1 = Math.floor((z + reach[1]) / d.cell);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const isle = t.skeleton.isleOf(i, j, d), far = isle && Math.hypot(isle.x - x, isle.z - z);
    if (isle && far! >= reach[0] && far! <= reach[1]) out.push(isle);
  }
  return nearestFirst(out, x, z);
}

/** The island a point lies on (within its rise), if any. */
export function isleAt(t: Terrain, d: IslandsDef, x: number, z: number): Isle | null {
  const isle = t.skeleton.isleOf(Math.floor(x / d.cell), Math.floor(z / d.cell), d);
  return isle && Math.hypot(isle.x - x, isle.z - z) < isle.r ? isle : null;
}

/**
 * Where an island's village may stand: on its shore, facing `toward` (the harbour its ships come from) first, then
 * round the island either way; on gentle dry ground in from where the land meets the sea, the quay before it.
 */
export function islandSites(t: Terrain, isle: Isle, toward: { x: number; z: number }, r: number): NonNullable<RegionDecision['site']>[] {
  const out: NonNullable<RegionDecision['site']>[] = [];
  const a0 = Math.atan2(toward.z - isle.z, toward.x - isle.x);
  // The shore toward the harbour first, then round the island either way.
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    const a = a0 + turn, ux = Math.cos(a), uz = Math.sin(a);
    let sx = NaN, sz = NaN;
    for (let d = 0; d < isle.r * 1.3; d += 10) {
      if (t.height(isle.x + ux * d, isle.z + uz * d) <= 0) { sx = isle.x + ux * d; sz = isle.z + uz * d; break; }
    }
    if (Number.isNaN(sx)) continue;
    for (const h of harbourSpots(t, { x: sx, z: sz, fx: ux, fz: uz, half: 0 }, r)) {
      if (gentle(t, h.x, h.z, r)) out.push({ x: h.x, z: h.z, yaw: Math.atan2(-(toward.x - h.x), -(toward.z - h.z)), r, harbour: h.harbour });
    }
  }
  return out;
}

/** A berth at an island's quay takes a passage ship: this long and this deep at least (m). */
const BERTH_LENGTH = 22, BERTH_DEPTH = 2.6;

/**
 * Whether the quay a village at `site` (its seed) gets has a berth for a passage ship that its own boats leave free
 * (AssetGenerator's harbour plan).
 */
function berthFor(t: Terrain, site: NonNullable<RegionDecision['site']>, seed: number): boolean {
  const h = site.harbour && planHarbour(site.harbour, site.x, site.z, site.r, (x, z) => t.height(x, z), (x, z) => t.waterDepth(x, z));
  return !!h && freeBerths(h, seed).some((k) => h.berths[k].length >= BERTH_LENGTH && h.berths[k].depth >= BERTH_DEPTH);
}

/** How steep the dry ground round an island's village may be (rise per metre): no houses up a sea cliff. */
const STEEP = 0.12;

/** Whether the dry ground round (x, z) out to r is gentle enough for houses (the sea side is the harbour's). */
function gentle(t: Terrain, x: number, z: number, r: number): boolean {
  const h = t.height(x, z);
  if (h > 12) return false;
  for (const rr of [r * 0.5, r]) for (let a = 0; a < 8; a++) {
    const px = x + Math.cos((a * Math.PI) / 4) * rr, pz = z + Math.sin((a * Math.PI) / 4) * rr, ph = t.height(px, pz);
    if (ph > 0 && Math.abs(ph - h) / rr > STEEP) return false;
  }
  return true;
}

/**
 * The VGM's island promise (S7): the nearest island within the voyage's reach of harbour town `from` with no
 * village yet gets one, on its shore toward `from`, where the sea joins its quay to `from`'s (its region, to append
 * to the log). Null: an island village is in reach already, or no island in reach fits.
 */
export function islandFor(def: VoyageDef, c: FrontierContext, from: TownDecision, towns: readonly TownDecision[], water: (x: number, z: number) => number): RegionDecision | null {
  const isles = c.terrain.skeleton.shape.islands, fill = c.regions.fills.find((f) => f.island);
  if (!from.harbour || !isles || !fill) return null;
  if (decided(c, towns).some((t) => t.isle && Math.hypot(t.x - from.x, t.z - from.z) <= def.reach[1])) return null;
  for (const isle of islandsNear(c.terrain, isles, from.x, from.z, def.reach)) {
    for (const site of islandSites(c.terrain, isle, from, radiusOf(fill))) {
      const r = siteRegion(c, fill, site);
      if (r && berthFor(c.terrain, site, r.seed) && site.harbour && seaRoute(c.seed, water, from.harbour, site.harbour)) return r;
    }
  }
  return null;
}

/**
 * The place out on an island its village knows of (S7): for each island village that has none, a place of a kind
 * that stands on the land, on the island away from the houses (from `dungeonFor`). Null: every island village has one.
 */
export function islandPlace(c: DungeonContext & { readonly towns: readonly Town[] }): DungeonDecision | null {
  const isles = c.terrain.skeleton.shape.islands;
  if (!isles) return null;
  for (const town of c.towns) {
    const d = town.decision;
    if (!d.isle || c.log.some((x) => x.kind === 'dungeon' && x.town === d.id)) continue;
    const isle = isleAt(c.terrain, isles, d.x, d.z);
    if (!isle) continue;
    const p = dungeonFor({ purpose: 'lead', town, near: { x: isle.x, z: isle.z, ring: [0, isle.r * 0.6] } }, c);
    if (p) return p;
  }
  return null;
}

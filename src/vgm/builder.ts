/**
 * The Builder (plan 4.2), first cut: the decisions a new world starts with. The start (plan 6) is a small
 * harbour town by the river's mouth nearest the setting's start place (Arnd 2026-10-30: the start is a sea town;
 * D50: the river its fresh water), else a town by the nearest river, on gentle dry ground, with the stone arch
 * of milestone 1 a short walk outside it, and the hold of a people (plan 11.6) in the hills a walk away. Deterministic per seed; the result goes into the decision log.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import { HOUSE_SCALE } from '@futuremagic/settlement';
import type { SettingModule } from '../setting/contract';
import { sitesIn, type Decision, type DecisionLog, type HarbourAt, type TownDecision } from '../world/decisions';
import { harbourSpots, riverMouths } from '../world/coast';
import { findStart, startGround, type StartPlace } from '../world/start';
import { bankSpots, byFreshWater, freshWaterEdge, WATER_REACH } from '../world/freshWater';
import { Terrain } from '../world/terrain';
import type { HydroOptions } from '../world/hydro';
import { holdSite } from '../world/hold';
import { archNear, type ArchSite } from '../world/volumes';
import { promiseCellar, retreatSite } from './dungeons';

/** Where the start is; a sea town's shore (its harbour) when it stands by a river's mouth. */
export type Home = StartPlace & { readonly harbour?: HarbourAt };

/** A world ready to build on: the land, the log it was settled with, and where the start is. */
export interface OpenWorld {
  terrain: Terrain;
  log: DecisionLog;
  home: Home;
}

/**
 * The land of a seed and setting with the start's decisions built on it (main thread and every worker alike).
 * `hydro`: the rivers' grid; tests pass a small one (test/small.ts), the game the default.
 */
export function openWorld(seed: number, setting: SettingModule, hydro?: HydroOptions): OpenWorld {
  const terrain = new Terrain(seed, setting, hydro);
  const home = startPlace(terrain);
  const log = firstDecisions(terrain, home);
  terrain.settle(log);
  // The first promise (milestone 3): a cellar under a house of the start town, for a hint in town.
  const town = terrain.towns[0];
  const cellar = town ? promiseCellar(seed, town, log) : null;
  if (cellar) log.push(cellar);
  return { terrain, log, home };
}

/** Where a new game starts: the setting's start place, moved to the sea at the river's mouth nearest it, else to the river nearest it (D50). */
export function startPlace(t: Terrain): Home {
  const start = findStart(t.skeleton, t.setting);
  // The nearer of a river's mouth and a bare coast, ring by ring.
  for (const within of BANK_SEARCH) { const h = seaside(t, start, [within]) ?? coastside(t, start, [within]); if (h) return h; }
  return waterside(t, start);
}

/**
 * The start moved to the sea (Arnd 2026-10-30: the start town is a sea town): by the river's mouth nearest the
 * setting's start place, on the bank with the most dry ground (world/coast.ts, as the frontier's harbour towns).
 */
export function seaside(t: Terrain, start: StartPlace, rings: readonly number[] = BANK_SEARCH): Home | null {
  const want = t.setting.start;
  for (const within of rings) {
    let best: Home | null = null, low = Infinity;
    for (const m of riverMouths(t, start.x, start.z, within)) for (const h of harbourSpots(t, m, START_R, SEA_ALONG)) {
      if (!startGround(t.skeleton, want, h.x, h.z, true)) continue;
      // Its river beside it, not through it.
      const river = freshWaterEdge(t, h.x, h.z, START_R + WATER_REACH, false);
      if (river <= START_R || river > START_R + WATER_REACH) continue;
      const steep = landward(t, h);
      if (steep > want.maxSlope * 1.5) continue;
      const score = Math.hypot(h.x - start.x, h.z - start.z) / within + steep / want.maxSlope;
      if (score < low) { low = score; best = homeAt(t, h, start); }
    }
    if (best) return best;
  }
  return null;
}

/**
 * With no river reaching the sea near (a dry or cliffed coast), the start town still stands by the sea with its
 * harbour (Arnd 2026-10-31): on the coast nearest the start place where the shore comes down low and the land
 * behind is gentle, its water from wells and brooks.
 */
export function coastside(t: Terrain, start: StartPlace, rings: readonly number[] = BANK_SEARCH): Home | null {
  const want = t.setting.start;
  for (const within of rings) {
    let best: Home | null = null, low = Infinity;
    for (let a = 0; a < COAST_RAYS; a++) {
      const ux = Math.cos((a / COAST_RAYS) * Math.PI * 2), uz = Math.sin((a / COAST_RAYS) * Math.PI * 2);
      // The shore along this way: the last dry ground before the sea.
      let shore: { x: number; z: number } | null = null;
      for (let d = COAST_STEP; d <= within; d += COAST_STEP) {
        const x = start.x + ux * d, z = start.z + uz * d;
        if (t.waterDepth(x, z) > 0 && t.height(x, z) < -0.5) { shore = { x: x - ux * COAST_STEP, z: z - uz * COAST_STEP }; break; }
      }
      if (!shore) continue;
      for (const h of harbourSpots(t, { ...shore, fx: ux, fz: uz, half: 0 }, START_R, COAST_ALONG)) {
        const steep = landward(t, h);
        if (steep > want.maxSlope * 1.5) continue;
        // A low shore for its quay, not a cliff.
        const top = t.height(h.harbour.x - h.harbour.dx * 20, h.harbour.z - h.harbour.dz * 20);
        if (top > COAST_TOP) continue;
        const score = Math.hypot(h.x - start.x, h.z - start.z) / within + steep / want.maxSlope + top / COAST_TOP;
        if (score < low) { low = score; best = homeAt(t, h, start); }
      }
    }
    if (best) return best;
  }
  return null;
}

/** The ways a coast start is looked along, the step, how far along the shore and how high its quay's ground may stand (m). */
const COAST_RAYS = 48, COAST_STEP = 40, COAST_ALONG = [0, 0.6, 1.2], COAST_TOP = 8;

/** How steep a harbour town's ground rises on its landward side (the sea before it is the harbour's). */
function landward(t: Terrain, h: { x: number; z: number; harbour: HarbourAt }): number {
  const c = t.height(h.x, h.z);
  let steep = 0;
  for (let a = 0; a < 16; a++) {
    const ox = Math.cos((a * Math.PI) / 8), oz = Math.sin((a * Math.PI) / 8);
    if (ox * h.harbour.dx + oz * h.harbour.dz > 0.2) continue;
    for (const r of [START_R * 0.4, START_R * 0.8]) steep = Math.max(steep, Math.abs(t.height(h.x + ox * r, h.z + oz * r) - c) / r);
  }
  return steep;
}

const homeAt = (t: Terrain, h: { x: number; z: number; harbour: HarbourAt }, start: StartPlace): Home => ({ x: h.x, z: h.z, elevation: t.height(h.x, h.z), biome: t.biomeIdAt(h.x, h.z) ?? start.biome, harbour: h.harbour });

/** How far along the coast from a river's mouth a sea start may stand, in town radii (its river beside it, not through it). */
const SEA_ALONG = [0.9, 1.2, 1.5, 1.9, 2.4];

/** The start's decisions, chosen on the bare land (before anything is settled on it). */
export function firstDecisions(t: Terrain, home: { x: number; z: number; harbour?: HarbourAt }): Decision[] {
  const out: Decision[] = [];
  // A sea town stands where its harbour is: the arch keeps out of it.
  const sea = home.harbour ? seaTown(t, home, home.harbour) : null;
  const arch = archNear(t, home, sea ? sea.radius + 90 : 0);
  if (arch) out.push({ kind: 'volume', id: 'arch-1', site: arch });
  const town = sea ?? startTown(t, home, arch);
  if (town) out.push(town);
  // A people's own place (plan 11.6): the first hold in the hills near the start town.
  const people = t.setting.peoples.find((p) => p.hold);
  const hold = town && people ? holdSite(t, town, people.id, people.hold, deriveSeed(t.seed, 'vgm', 'hold', people.id)) : null;
  if (hold) out.push(hold);
  // The teachers who keep a place of their own past the start town's fields (C3: the warden's tower).
  for (const g of t.setting.guilds ?? []) {
    if (!town || g.near !== 'out' || !g.sizes.includes('town')) continue;
    const r = retreatSite(g.keeper, t.seed, t, town, sitesIn(out, 150));
    if (r) out.push(r);
  }
  return out;
}

const SEARCH = 1600;
const STEP = 100;
/** How far from the setting's start place the start may move to reach a river (doubling until one is found). */
const BANK_SEARCH = [6000, 12000, 24000, 48000];
/** A town's outline radius, roughly, while the start looks for a bank. */
const START_R = 75 * HOUSE_SCALE;

/**
 * The start moved to the river nearest the setting's start place (D50: a town needs fresh water): the
 * nearest gentle, dry bank spot, preferring level ground. The start place itself when no river is near.
 */
export function waterside(t: Terrain, start: StartPlace): StartPlace {
  const want = t.setting.start;
  if (byFreshWater(t, start.x, start.z, START_R, false)) return start;
  for (const within of BANK_SEARCH) {
    let best: StartPlace | null = null, bestScore = Infinity;
    for (const s of bankSpots(t, start.x, start.z, within, START_R, 2, false)) {
      const h = t.height(s.x, s.z);
      if (h < Math.max(4, want.elevation[0] * 0.5) || h > want.elevation[1] || t.waterDepth(s.x, s.z, h) > 0) continue;
      if (!startGround(t.skeleton, want, s.x, s.z)) continue;
      let steep = 0;
      for (let a = 0; a < 8; a++) {
        const px = s.x + Math.cos((a * Math.PI) / 4) * START_R * 0.8, pz = s.z + Math.sin((a * Math.PI) / 4) * START_R * 0.8;
        steep = Math.max(steep, Math.abs(t.height(px, pz) - h) / (START_R * 0.8));
      }
      if (steep > want.maxSlope * 1.5) continue;
      const score = Math.hypot(s.x - start.x, s.z - start.z) / within + steep / want.maxSlope;
      if (score < bestScore) {
        bestScore = score;
        best = { x: s.x, z: s.z, elevation: h, biome: t.biomeIdAt(s.x, s.z) ?? start.biome };
      }
    }
    if (best) return best;
  }
  return start;
}

/** The start town of about 80-120 people (D41) as a sea town, at its harbour spot. */
function seaTown(t: Terrain, home: { x: number; z: number }, harbour: HarbourAt): TownDecision {
  const seed = deriveSeed(t.seed, 'vgm', 'start-town');
  return { kind: 'town', id: 'town-1', x: home.x, z: home.z, radius: startRadius(seed), harbour };
}

/** A small town's outline: 68-76 m, times the houses' scale (AssetGenerator HOUSE_SCALE). */
const startRadius = (seed: number) => (68 + 8 * hash2f(seed, 1, 1)) * HOUSE_SCALE;

/**
 * The start town: the best spot within SEARCH metres of `home` by flatness, dry ground, fresh water within
 * reach (D50: a river or lake, not a brook; a hard rule when any is near) and nearness; clear of the arch.
 */
export function startTown(t: Terrain, home: { x: number; z: number }, arch: ArchSite | null): TownDecision | null {
  const seed = deriveSeed(t.seed, 'vgm', 'start-town');
  // A small town of about 80-120 people (D41).
  const R = startRadius(seed);
  const w = { river: 0, lake: 0 };
  // Only where the start has water near (else, on a dry seed, the old rule: the best spot without it).
  const needWater = freshWaterEdge(t, home.x, home.z, SEARCH, false) < SEARCH;
  let best: TownDecision | null = null, bestScore = Infinity;
  for (let gz = -SEARCH; gz <= SEARCH; gz += STEP) for (let gx = -SEARCH; gx <= SEARCH; gx += STEP) {
    const near = Math.hypot(gx, gz);
    if (near > SEARCH) continue;
    const x = home.x + gx, z = home.z + gz;
    if (arch && Math.hypot(x - (arch.a[0] + arch.b[0]) / 2, z - (arch.a[1] + arch.b[1]) / 2) < R + 90) continue;
    const h0 = t.height(x, z);
    if (h0 < 4 || !startGround(t.skeleton, t.setting.start, x, z)) continue;
    const water = needWater ? freshWaterEdge(t, x, z, R + WATER_REACH, false) : Infinity;
    // By the water, not over it: the river's edge out past the town's.
    if (needWater && (water > R + WATER_REACH || water <= R)) continue;
    // Dry and gentle within the inner town, mostly so out to its edge.
    let steep = 0, wet = 0, ok = true;
    for (const [r, k] of [[R * 0.45, 8], [R * 0.9, 16]] as const) for (let i = 0; i < k && ok; i++) {
      const a = (i / k) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = t.height(px, pz);
      const dry = h > 1 && t.clearOfWater(px, pz, h, w).river > 2 && w.lake > 0.5;
      if (!dry) { if (r < R * 0.5) ok = false; else wet++; }
      steep = Math.max(steep, Math.abs(h - h0) / r);
    }
    if (!ok || steep > 0.14 || wet > 5) continue;
    // Closer to the water is better, with a little room on the bank.
    const byWater = needWater ? Math.max(0, water - R - 30) / WATER_REACH : 0;
    const score = steep * 12 + wet * 0.15 + near / SEARCH + byWater * 0.4 + hash2f(seed, gx, gz) * 0.05;
    if (score < bestScore) { bestScore = score; best = { kind: 'town', id: 'town-1', x, z, radius: R }; }
  }
  return best;
}

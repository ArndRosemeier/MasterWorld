/**
 * The Builder (plan 4.2), first cut: the decisions a new world starts with. The start (plan 6) is a small
 * town by the river nearest the setting's start place (D50), on gentle dry ground, with the stone arch
 * of milestone 1 a short walk outside it, and the hold of a people (plan 11.6) in the hills a walk away. Deterministic per seed; the result goes into the decision log.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { sitesIn, type Decision, type DecisionLog, type TownDecision } from '../world/decisions';
import { findStart, startGround, type StartPlace } from '../world/start';
import { bankSpots, byFreshWater, freshWaterEdge, WATER_REACH } from '../world/freshWater';
import { Terrain } from '../world/terrain';
import type { HydroOptions } from '../world/hydro';
import { holdSite } from '../world/hold';
import { archNear, type ArchSite } from '../world/volumes';
import { promiseCellar, retreatSite } from './dungeons';

/** A world ready to build on: the land, the log it was settled with, and where the start is. */
export interface OpenWorld {
  terrain: Terrain;
  log: DecisionLog;
  home: StartPlace;
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

/** Where a new game starts: the setting's start place, moved to the river nearest it (D50). */
export function startPlace(t: Terrain): StartPlace {
  return waterside(t, findStart(t.skeleton, t.setting));
}

/** The start's decisions, chosen on the bare land (before anything is settled on it). */
export function firstDecisions(t: Terrain, home: { x: number; z: number }): Decision[] {
  const out: Decision[] = [];
  const arch = archNear(t, home);
  if (arch) out.push({ kind: 'volume', id: 'arch-1', site: arch });
  const town = startTown(t, home, arch);
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
const START_R = 75;

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

/**
 * The start town: the best spot within SEARCH metres of `home` by flatness, dry ground, fresh water within
 * reach (D50: a river or lake, not a brook; a hard rule when any is near) and nearness; clear of the arch.
 */
export function startTown(t: Terrain, home: { x: number; z: number }, arch: ArchSite | null): TownDecision | null {
  const seed = deriveSeed(t.seed, 'vgm', 'start-town');
  // A small town of about 80-120 people (D41): an outline of 68-76 m.
  const R = 68 + 8 * hash2f(seed, 1, 1);
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
    if (needWater && water > R + WATER_REACH) continue;
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

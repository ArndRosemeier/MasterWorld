/**
 * The Builder (plan 4.2), first cut: the decisions a new world starts with. The start (plan 6) is a small
 * town near the setting's start place, on gentle dry ground, ideally near a river, with the stone arch
 * of milestone 1 a short walk outside it. Deterministic per seed; the result goes into the decision log.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import type { Decision, DecisionLog, TownDecision } from '../world/decisions';
import { findStart, type StartPlace } from '../world/start';
import { Terrain } from '../world/terrain';
import { archNear, type ArchSite } from '../world/volumes';
import { promiseCellar } from './dungeons';

/** A world ready to build on: the land, the log it was settled with, and where the start is. */
export interface OpenWorld {
  terrain: Terrain;
  log: DecisionLog;
  home: StartPlace;
}

/** The land of a seed and setting with the start's decisions built on it (main thread and every worker alike). */
export function openWorld(seed: number, setting: SettingModule): OpenWorld {
  const terrain = new Terrain(seed, setting);
  const home = findStart(terrain.skeleton, setting);
  const log = firstDecisions(terrain, home);
  terrain.settle(log);
  // The first promise (milestone 3): a cellar under a house of the start town, for a hint in town.
  const town = terrain.towns[0];
  const cellar = town ? promiseCellar(seed, town, log) : null;
  if (cellar) log.push(cellar);
  return { terrain, log, home };
}

/** The start's decisions, chosen on the bare land (before anything is settled on it). */
export function firstDecisions(t: Terrain, home: { x: number; z: number }): Decision[] {
  const out: Decision[] = [];
  const arch = archNear(t, home);
  if (arch) out.push({ kind: 'volume', id: 'arch-1', site: arch });
  const town = startTown(t, home, arch);
  if (town) out.push(town);
  return out;
}

const SEARCH = 1600;
const STEP = 100;

/**
 * The start town: the best spot within SEARCH metres of `home` by flatness, dry ground, a river within
 * reach (towns grow at rivers) and nearness; clear of the arch.
 */
export function startTown(t: Terrain, home: { x: number; z: number }, arch: ArchSite | null): TownDecision | null {
  const seed = deriveSeed(t.seed, 'vgm', 'start-town');
  // A small town of about 80-120 people (D41): an outline of 68-76 m.
  const R = 68 + 8 * hash2f(seed, 1, 1);
  const w = { river: 0, lake: 0 };
  let best: TownDecision | null = null, bestScore = Infinity;
  for (let gz = -SEARCH; gz <= SEARCH; gz += STEP) for (let gx = -SEARCH; gx <= SEARCH; gx += STEP) {
    const near = Math.hypot(gx, gz);
    if (near > SEARCH) continue;
    const x = home.x + gx, z = home.z + gz;
    if (arch && Math.hypot(x - (arch.a[0] + arch.b[0]) / 2, z - (arch.a[1] + arch.b[1]) / 2) < R + 90) continue;
    const h0 = t.height(x, z);
    if (h0 < 4) continue;
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
    const river = t.clearOfWater(x, z, h0, w).river;
    const byRiver = river > R * 0.6 && river < R * 2.5 ? 1 : 0;
    const score = steep * 12 + wet * 0.15 + near / SEARCH - byRiver * 0.6 + hash2f(seed, gx, gz) * 0.05;
    if (score < bestScore) { bestScore = score; best = { kind: 'town', id: 'town-1', x, z, radius: R }; }
  }
  return best;
}

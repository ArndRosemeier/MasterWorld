/**
 * The wild round a town as the VGM places it (plan 9.3, D27, C6b): for each kind of the setting's wild, its
 * groups on a ring round the town where the land suits them, each an encounter (vgm/encounters.ts), into
 * the log as `wild` decisions, so the VGM can later add, move or drive off a group. The world simulation
 * (sim/wild.ts) lives them out. Pure and seeded: the same world places the same groups (and an older save,
 * whose log has none yet, gets the very groups it had).
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import type { Territory } from '../sim/wild';
import type { DecisionLog, WildDecision } from '../world/decisions';
import { woodsOf } from '../world/flora';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { encounterFor } from './encounters';

export interface WildContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  readonly terrain: Terrain;
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'wild' | 'encounters' | 'creatures'>;
}

/** The wild's groups round `town` the log has not got yet (all of them the first time). */
export function wildFor(c: WildContext, town: Town): WildDecision[] {
  const have = new Set(c.log.map((d) => d.id));
  return placeWild(c, town).filter((d) => !have.has(d.id));
}

/** The wild's groups the log holds round a town. */
export function wildOf(log: DecisionLog, town: string): WildDecision[] {
  return log.filter((d): d is WildDecision => d.kind === 'wild' && d.town === town);
}

/** A group as the world simulation sees it. */
export function territoryOf(d: WildDecision): Territory {
  return { kind: d.group, encounter: d.encounter, x: d.x, z: d.z, r: d.r, members: d.members, seed: d.seed, id: d.id };
}

/**
 * The groups around a town: for each kind of the setting's wild, its groups on a ring around the
 * town where the land suits them (woods, open land, by a road out), apart from each other.
 */
function placeWild(c: WildContext, town: Town): WildDecision[] {
  const out: WildDecision[] = [], seed = c.seed, terrain = c.terrain;
  const { x: tx, z: tz } = town.decision;
  const woods = woodsOf(terrain);
  const roads = town.plan.streets.filter((s) => s.kind === 'road').map((s) => {
    const n = s.pts.length;
    return Math.atan2(s.pts[n - 1] - tz, s.pts[n - 2] - tx);
  });
  for (const def of c.setting.wild) {
    for (let g = 0; g < def.groups; g++) {
      const s = deriveSeed(seed, 'wild', def.id, g);
      let best: { x: number; z: number; score: number } | null = null;
      for (let k = 0; k < 48; k++) {
        const d = def.ring[0] + (def.ring[1] - def.ring[0]) * hash2f(s, k, 1);
        let a = hash2f(s, k, 2) * Math.PI * 2;
        // By a road: along one of the roads out, a little off it.
        if (def.habitat === 'road' && roads.length) a = roads[Math.floor(hash2f(s, k, 3) * roads.length)] + (hash2f(s, k, 4) - 0.5) * 0.35;
        const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
        if (terrain.waterDepth(x, z) > 0 || terrain.height(x, z) < 2) continue;
        // Gentle enough to live on.
        const h = terrain.height(x, z), slope = terrain.steepness(x, z, 8, h);
        if (slope > 0.45) continue;
        const w = woods(x, z);
        const fit = def.habitat === 'wood' ? w : def.habitat === 'open' ? 1 - w : 0.6 + (1 - w) * 0.2;
        // Apart from the other groups, and clear of a people's hold.
        const crowd = out.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + def.range + 60) || terrain.holds.some((h) => Math.hypot(h.x - x, h.z - z) < def.range + 110) ? 1 : 0;
        const score = fit - crowd - slope + hash2f(s, k, 5) * 0.1;
        if (!best || score > best.score) best = { x, z, score };
      }
      if (!best || best.score < 0.2) continue;
      const met = encounterFor({ setting: c.setting, seed: s, of: [def.encounter], where: def.habitat });
      if (!met) continue;
      const id = town === c.towns[0] ? `${def.id}-${g + 1}` : `${town.decision.id}-${def.id}-${g + 1}`;
      out.push({ kind: 'wild', id, town: town.decision.id, group: def.id, encounter: met.encounter, x: best.x, z: best.z, r: def.range, members: met.members, seed: s, at: c.hours });
    }
  }
  return out;
}

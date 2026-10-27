/**
 * Answers to an overdue need (plan 4.1, C9): when the Director says a need is overdue, the VGM asks the
 * tools that meet it for their cheapest fitting move (`answerNeed`, the toolbox's `answer`s), here on the
 * hero's way. Discovery: a sight by the way (a ring of standing stones, a waystone, a cairn) a little off
 * the line to where the hero is going, so they come upon it. Pure, seeded.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import type { DecisionLog, SightDecision } from '../world/decisions';
import { woodsOf } from '../world/flora';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { regionDecisions } from './frontier';

/** What an answer knows: the log, the land, the hero and where they are going. */
export interface NeedContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly terrain: Terrain;
  readonly towns: readonly Town[];
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'sights'>;
  readonly hero: { readonly x: number; readonly z: number };
  /** Where the hero is going (a lead's place, a town), if the game knows; else round about them. */
  readonly toward: { readonly x: number; readonly z: number } | null;
}

/** How far ahead on the way a sight stands (m), and how far to the side of it. */
const AHEAD: readonly [number, number] = [70, 260];
const ASIDE: readonly [number, number] = [8, 22];
/** Sights keep this far apart (m), and this far from towns' edges and other places. */
const APART = 350;
const OFF_TOWN = 80;
const OFF_PLACE = 40;
/** Spots that fit to choose the most open of. */
const CHOICES = 6;

/** The sights in the log. */
export function sightsOf(log: DecisionLog): SightDecision[] {
  return log.filter((d): d is SightDecision => d.kind === 'sight');
}

/** Discovery's answer: a sight by the hero's way (null: the setting has none, or no ground fits). */
export function sightFor(c: NeedContext): SightDecision | null {
  const defs = c.setting.sights ?? [];
  if (!defs.length) return null;
  const past = sightsOf(c.log), n = past.length + 1, s = deriveSeed(c.seed, 'sight', n), r = new Rng(s);
  // Not the one met last, if there is another.
  const last = past.at(-1)?.sight, pool = defs.length > 1 ? defs.filter((d) => d.id !== last) : defs;
  const def = r.weighted(pool, (d) => d.weight ?? 1);
  const t = c.terrain, places = regionDecisions(c.log).flatMap((d) => (d.site ? [d.site] : []));
  const way = c.toward ? Math.atan2(c.toward.z - c.hero.z, c.toward.x - c.hero.x) : r.range(0, Math.PI * 2);
  const far = c.toward ? Math.hypot(c.toward.x - c.hero.x, c.toward.z - c.hero.z) - 40 : AHEAD[1];
  const woods = woodsOf(t), fits: { x: number; z: number; woods: number }[] = [];
  for (let k = 0; k < 40; k++) {
    // On the way while it can be; later tries swing wider round the hero.
    const a = way + (k < 20 ? 0 : r.range(-1, 1) * Math.min(Math.PI, (k - 19) * 0.2));
    const d = Math.min(far, r.range(AHEAD[0], AHEAD[1]));
    if (d < AHEAD[0] * 0.6) continue;
    const side = r.range(ASIDE[0], ASIDE[1]) * (r.chance(0.5) ? 1 : -1);
    const x = c.hero.x + Math.cos(a) * d - Math.sin(a) * side, z = c.hero.z + Math.sin(a) * d + Math.cos(a) * side, h = t.height(x, z);
    if (t.waterDepth(x, z, h) > 0 || h < 2 || t.steepness(x, z, 6, h) > 0.35) continue;
    if (t.roads.fromEdge(x, z) < 4) continue;
    if (c.towns.some((w) => Math.hypot(w.decision.x - x, w.decision.z - z) < w.decision.radius + OFF_TOWN)) continue;
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + OFF_PLACE)) continue;
    if (past.some((p) => Math.hypot(p.x - x, p.z - z) < APART)) continue;
    fits.push({ x, z, woods: woods(x, z) });
    if (fits.length >= CHOICES) break;
  }
  // Where it shows best: the most open of the spots that fit (it stands in a glade of its own anyway).
  const at = fits.sort((a, b) => a.woods - b.woods)[0];
  if (!at) return null;
  // Facing the way the hero comes from.
  return { kind: 'sight', id: `sight-${n}`, sight: def.id, x: at.x, z: at.z, yaw: Math.atan2(c.hero.x - at.x, c.hero.z - at.z), seed: s, at: c.hours };
}

/**
 * Answers to an overdue need (plan 4.1, C9): when the Director says a need is overdue, the VGM asks the
 * tools that meet it for their cheapest fitting move (`answerNeed`, the toolbox's `answer`s), here on the
 * hero's way. Discovery: a sight by the way (a ring of standing stones, a waystone, a cairn) a little off
 * the line to where the hero is going, so they come upon it. Reward: a find by the way (something hidden
 * under a stone), placed the same way. Challenge: an ambush, a group of the wild lying in wait ahead. People: a
 * town's traveller resting by the way. Pure, seeded.
 */
import type { Need } from './director';
import { Rng, deriveSeed } from '@futuremagic/core';
import { farmlandReach } from '@futuremagic/settlement';
import { rollLoot, type Loot } from '../game/items';
import type { SettingModule, SightDef } from '../setting/contract';
import { sitesIn, type DecisionLog, type SightDecision, type TravellerDecision, type WildDecision } from '../world/decisions';
import { buildingOf } from '../sim/people';
import { woodsOf } from '../world/flora';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { dangerAt, farFrom } from './dungeons';
import { encounterFor } from './encounters';

/** What an answer knows: the log, the land, the hero and where they are going. */
export interface NeedContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly terrain: Terrain;
  readonly towns: readonly Town[];
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'sights' | 'encounters' | 'creatures' | 'situations' | 'dungeons'>;
  /** Where the game began (danger grows with distance from it, D29); none: the first town. */
  readonly home?: { readonly x: number; readonly z: number };
  readonly hero: { readonly x: number; readonly z: number };
  /** Where the hero is going (a lead's place, a town), if the game knows; else round about them. */
  readonly toward: { readonly x: number; readonly z: number } | null;
  /** How much this player enjoys a need (C12: the player model's lean, 1 as usual); none: no lean. */
  readonly lean?: (n: Need) => number;
  /** Told how long each tool took (the hitch log): its id and ms, by `timeNow`. */
  readonly spent?: (tool: string, ms: number) => void;
  readonly timeNow?: () => number;
}

/** How far ahead on the way a sight stands (m), and how far to the side of it. */
const AHEAD: readonly [number, number] = [70, 260];
const ASIDE: readonly [number, number] = [8, 22];
/** Sights keep this far apart (m), and this far from towns' edges and other places. */
const APART = 350;
const OFF_TOWN = 80;
const OFF_PLACE = 40;
/** How far a dungeon's shell on the land reaches round its site (m): a cave's crag in a cliff some 25. */
const DUNGEON_R = 30;
/** Spots that fit to choose the most open of. */
const CHOICES = 6;
/** Steps along the straight way to a spot by the way (m), and the steepest it may climb between two (a walker goes up 1.25). */
const WAY_STEP = 2, WAY_STEEP = 1.2;

/** The sights in the log. */
export function sightsOf(log: DecisionLog): SightDecision[] {
  return log.filter((d): d is SightDecision => d.kind === 'sight');
}

/**
 * Discovery's answer, or Reward's (`need`): a sight by the hero's way, or a find (null: the setting has none
 * for that need, or no ground fits).
 */
export function sightFor(c: NeedContext, need: 'discovery' | 'reward' = 'discovery'): SightDecision | null {
  const defs = (c.setting.sights ?? []).filter((d) => (d.need ?? 'discovery') === need);
  if (!defs.length) return null;
  const past = sightsOf(c.log), n = past.length + 1, s = deriveSeed(c.seed, 'sight', n), r = new Rng(s);
  // Not the one met last, if there is another.
  const last = past.at(-1)?.sight, pool = defs.length > 1 ? defs.filter((d) => d.id !== last) : defs;
  const def = r.weighted(pool, (d) => d.weight ?? 1);
  const at = wayside(c, r, past);
  if (!at) return null;
  // Facing the way the hero comes from.
  return { kind: 'sight', id: `sight-${n}`, sight: def.id, ...(need === 'reward' ? { need } : {}), x: at.x, z: at.z, yaw: Math.atan2(c.hero.x - at.x, c.hero.z - at.z), seed: s, at: c.hours };
}

/** What a find holds (its def's `loot` table, at the danger of where it lies, D29); null for a sight that is only seen. */
export function findIn(setting: Pick<SettingModule, 'items'>, def: SightDef, d: SightDecision, home: { readonly x: number; readonly z: number }): Loot | null {
  return def.loot ? rollLoot(setting.items, def.loot, dangerAt({ decision: d }, home), new Rng(deriveSeed(d.seed, 'find'))) : null;
}

/** How far an ambush's group roams round where it lies in wait (m). */
const AMBUSH_R = 25;

/**
 * Challenge's answer: an ambush, a group of the wild (an encounter that meets Challenge, of the woods or the
 * open as the spot is, near the danger the land has there, D29) lying in wait ahead on the hero's way.
 */
export function ambushFor(c: NeedContext): WildDecision | null {
  const n = c.log.filter((d) => d.kind === 'wild' && d.group === 'ambush').length + 1, s = deriveSeed(c.seed, 'ambush', n), r = new Rng(s);
  const at = wayside(c, r, []);
  if (!at) return null;
  const home = c.home ?? c.towns[0]?.decision ?? at;
  // Its group belongs to the town nearest it.
  const town = [...c.towns].sort((a, b) => farFrom(a, at) - farFrom(b, at))[0];
  if (!town) return null;
  const met = encounterFor({ setting: c.setting, seed: s, need: 'challenge', where: at.woods > 0.5 ? 'wood' : 'open', danger: dangerAt({ decision: at }, home) });
  if (!met) return null;
  return { kind: 'wild', id: `ambush-${n}`, town: town.decision.id, group: 'ambush', encounter: met.encounter, x: at.x, z: at.z, r: AMBUSH_R, members: met.members, seed: s, at: c.hours };
}

/** How long a traveller rests by the way (game hours: a few real minutes). */
const RESTS = 2;

/** The travellers in the log. */
export function travellersOf(log: DecisionLog): TravellerDecision[] {
  return log.filter((d): d is TravellerDecision => d.kind === 'traveller');
}

/** The travellers resting by the way at game hour `hours` (of town `town`, if given). */
export function restingAt(log: DecisionLog, hours: number, town?: string): TravellerDecision[] {
  return travellersOf(log).filter((d) => hours >= d.at && hours < d.until && (town === undefined || d.town === town));
}

/**
 * People's answer: a traveller by the hero's way, the one of the nearest town with an inn (who comes and
 * goes, lodging there: sim/people.ts), resting there a while facing the way the hero comes from. Not while
 * that one rests by the way already.
 */
export function travellerFor(c: NeedContext): TravellerDecision | null {
  const past = travellersOf(c.log), n = past.length + 1, s = deriveSeed(c.seed, 'traveller', n), r = new Rng(s);
  const busy = new Set(restingAt(c.log, c.hours).map((d) => d.town));
  const at = wayside(c, r, []);
  if (!at) return null;
  const town = c.towns.filter((w) => !!buildingOf(w.plan, 'inn') && !busy.has(w.decision.id)).sort((a, b) => farFrom(a, at) - farFrom(b, at))[0];
  if (!town) return null;
  return { kind: 'traveller', id: `traveller-${n}`, town: town.decision.id, x: at.x, z: at.z, yaw: Math.atan2(c.hero.x - at.x, c.hero.z - at.z), seed: s, at: c.hours, until: c.hours + RESTS };
}

/**
 * A spot by the hero's way: ahead on the line to where they are going, a little to its side, on dry gentle
 * ground off roads, towns, places and `apart` (other sights), the most open of a few that fit.
 */
/** Can one walk straight from (ax, az) to (bx, bz): no step or wall on the way (a mesa's, D56) steeper than this? */
function straightWay(t: Terrain, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / WAY_STEP);
  let h = t.height(ax, az);
  for (let i = 1; i <= n; i++) {
    const g = t.height(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    if (Math.abs(g - h) > WAY_STEP * WAY_STEEP) return false;
    h = g;
  }
  return true;
}

function wayside(c: NeedContext, r: Rng, apart: readonly { readonly x: number; readonly z: number }[]): { x: number; z: number; woods: number } | null {
  // Clear of every place on the land: a region's site, a dungeon's shell (a cave's crag in its cliff), a hold.
  const t = c.terrain, places = sitesIn(c.log, DUNGEON_R);
  const way = c.toward ? Math.atan2(c.toward.z - c.hero.z, c.toward.x - c.hero.x) : r.range(0, Math.PI * 2);
  const far = c.toward ? Math.hypot(c.toward.x - c.hero.x, c.toward.z - c.hero.z) - 40 : AHEAD[1];
  const woods = woodsOf(t), fits: { x: number; z: number; woods: number }[] = [];
  // Out past a town's fields too (an ambush in a paddock is fenced off from the way).
  const inFields = (x: number, z: number) => c.towns.some((w) => farFrom(w, { x, z }) < w.decision.radius + Math.max(OFF_TOWN, farmlandReach(w.decision.radius) + 20));
  // Still in a town's fields, it looks ahead past them, on the way out.
  let clear = 0;
  if (c.toward) while (clear + 20 < far && inFields(c.hero.x + Math.cos(way) * clear, c.hero.z + Math.sin(way) * clear)) clear += 20;
  for (let k = 0; k < 40; k++) {
    // On the way while it can be; later tries swing wider round the hero.
    const a = way + (k < 20 ? 0 : r.range(-1, 1) * Math.min(Math.PI, (k - 19) * 0.2));
    // Past the town's fields either way (the wider tries too: in the fields nothing fits).
    const d = Math.min(far, clear + r.range(AHEAD[0], AHEAD[1]));
    if (d < AHEAD[0] * 0.6) continue;
    const side = r.range(ASIDE[0], ASIDE[1]) * (r.chance(0.5) ? 1 : -1);
    const x = c.hero.x + Math.cos(a) * d - Math.sin(a) * side, z = c.hero.z + Math.sin(a) * d + Math.cos(a) * side, h = t.height(x, z);
    if (t.waterDepth(x, z, h) > 0 || h < 2 || t.steepness(x, z, 6, h) > 0.35) continue;
    if (t.roads.fromEdge(x, z) < 4) continue;
    if (!straightWay(t, c.hero.x, c.hero.z, x, z)) continue;
    if (inFields(x, z)) continue;
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + OFF_PLACE)) continue;
    if (apart.some((p) => Math.hypot(p.x - x, p.z - z) < APART)) continue;
    fits.push({ x, z, woods: woods(x, z) });
    if (fits.length >= CHOICES) break;
  }
  // Where it shows best: the most open of the spots that fit (a sight stands in a glade of its own anyway).
  return fits.sort((a, b) => a.woods - b.woods)[0] ?? null;
}

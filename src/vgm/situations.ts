/**
 * Situations, not quests (D52, C10): the VGM stages something the hero walks into and sees. A hurt traveller
 * sits by the hero's way (People's answer, now and then instead of one resting: `hurtTravellerFor`); at dusk
 * wolves prowl outside a paddock of the town the hero is in (a Builder turn tool: `paddockWolvesFor`). Each has
 * one urgent line, its cry, called out in a speech bubble once the hero is near enough to see what it is
 * about (`criesDue`): shown first, told after. Pure, seeded.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { polyCentroid } from '@futuremagic/settlement';
import type { SettingModule, SituationDef, SituationKind } from '../setting/contract';
import type { DecisionLog, TravellerDecision, WildDecision } from '../world/decisions';
import type { Town } from '../world/town';
import { travellerFor, travellersOf, type NeedContext } from './answers';
import { encounterFor } from './encounters';

/** The setting's situation of a kind (none: it stages none such). */
export function situationOf(setting: Pick<SettingModule, 'situations'>, kind: SituationKind): SituationDef | undefined {
  return setting.situations?.find((t) => t.kind === kind);
}

/** People's answer as a situation: the traveller hurt, sitting by the way (the setting's share of travellers). */
export function hurtTravellerFor(c: NeedContext): TravellerDecision | null {
  const def = situationOf(c.setting, 'hurt-traveller');
  if (!def || !new Rng(deriveSeed(c.seed, 'hurt', travellersOf(c.log).length + 1)).chance(def.chance ?? 0)) return null;
  const d = travellerFor(c);
  return d && { ...d, situation: def.id };
}

/** What the paddock's wolves ask: the log, the hours, the town the hero is in and the setting. */
export interface PaddockContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly hours: number;
  readonly near?: Town | null;
  readonly setting: Pick<SettingModule, 'situations' | 'encounters' | 'creatures'>;
  /** Now, whatever the hour and the days between (the debug menu). */
  readonly early?: boolean;
}

/** How far the wolves roam round where they prowl (m), and how far outside the paddock's fence they are. */
const PROWL_R = 10;
const OUTSIDE = 9;

/** The wolves at the paddocks in the log (of town `town`, if given). */
export function paddockWolvesOf(log: DecisionLog, town?: string): WildDecision[] {
  return log.filter((d): d is WildDecision => d.kind === 'wild' && d.group === 'paddock' && (town === undefined || d.town === town));
}

/**
 * At dusk, wolves outside a paddock of the town the hero is in, on the side away from the houses: once a town
 * every `every` days, in the setting's hours.
 */
export function paddockWolvesFor(c: PaddockContext): WildDecision | null {
  const def = situationOf(c.setting, 'paddock-wolves'), town = c.near;
  if (!def || !town || !town.plan.paddocks.length || !def.hours || !def.encounter) return null;
  const hour = ((c.hours % 24) + 24) % 24, last = paddockWolvesOf(c.log, town.decision.id).at(-1);
  if (!c.early && (hour < def.hours[0] || hour >= def.hours[1] || (last && c.hours - last.at < (def.every ?? 1) * 24))) return null;
  const n = paddockWolvesOf(c.log).length + 1, s = deriveSeed(c.seed, 'situation', def.id, n), r = new Rng(s);
  const pd = r.pick(town.plan.paddocks), [cx, cz] = polyCentroid(pd.poly);
  let reach = 0;
  for (let i = 0; i < pd.poly.length; i += 2) reach = Math.max(reach, Math.hypot(pd.poly[i] - cx, pd.poly[i + 1] - cz));
  const a = Math.atan2(cz - town.decision.z, cx - town.decision.x), d = reach + OUTSIDE;
  const met = encounterFor({ setting: c.setting, seed: s, of: [def.encounter] });
  if (!met) return null;
  return { kind: 'wild', id: `paddock-wolves-${n}`, town: town.decision.id, group: 'paddock', situation: def.id, encounter: met.encounter, members: met.members, x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: PROWL_R, seed: s, at: c.hours };
}

/** A cry due: the situation's decision, its line, and where it is about. */
export interface Cry {
  readonly id: string;
  readonly kind: SituationKind;
  readonly text: string;
  readonly town: string;
  readonly x: number;
  readonly z: number;
}

/** How long after it begins a situation still cries (game hours): the wolves' dusk, a traveller's rest. */
const CRIES_FOR = 4;

/**
 * The cries due now: each situation going on whose cry has not been called (`cried`), with the hero within
 * its `seen` metres of it (they see it first). `alive`: whether a wild situation still has someone in it.
 */
export function criesDue(log: DecisionLog, setting: Pick<SettingModule, 'situations'>, hero: { readonly x: number; readonly z: number }, hours: number, cried: ReadonlySet<string>, alive: (id: string) => boolean = () => true): Cry[] {
  const out: Cry[] = [];
  for (const d of log) {
    if ((d.kind !== 'traveller' && d.kind !== 'wild') || !d.situation || cried.has(d.id)) continue;
    const def = setting.situations?.find((t) => t.id === d.situation);
    const on = d.kind === 'traveller' ? hours >= d.at && hours < d.until : hours >= d.at && hours < d.at + CRIES_FOR && alive(d.id);
    if (!def || !on || Math.hypot(hero.x - d.x, hero.z - d.z) > def.seen) continue;
    out.push({ id: d.id, kind: def.kind, text: def.cry, town: d.town, x: d.x, z: d.z });
  }
  return out;
}

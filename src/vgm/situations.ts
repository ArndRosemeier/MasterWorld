/**
 * Situations, not quests (D52, C10): the VGM stages something the hero walks into and sees. A hurt traveller
 * sits by the hero's way (People's answer, now and then instead of one resting: `hurtTravellerFor`); at dusk
 * wolves prowl outside a paddock of the town the hero is in (a Builder turn tool: `paddockWolvesFor`); a raided
 * farm's barn smoulders, its smoke seen over the trees from afar (`smokesAt`, from the raid itself). Each has
 * one urgent line, its cry, called out in a speech bubble once the hero is near enough to see what it is
 * about (`criesDue`): shown first, told after. The folk of a place a band took camp by the road outside the
 * nearest town (C11, vgm/events.ts `refugeOf`) and cry out to the hero too. By the sea a fisher whose boat went over
 * clings to it off the strand (S9: People's answer there, `castawayFor`) and cries out. Pure, seeded.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { polyCentroid } from '@futuremagic/settlement';
import type { SettingModule, SituationDef, SituationKind } from '../setting/contract';
import type { CastawayDecision, Decision, DecisionLog, EventDecision, StrayDecision, TravellerDecision, WildDecision } from '../world/decisions';
import type { Terrain } from '../world/terrain';
import { harbourTowns, townById, type Town } from '../world/town';
import { travellerFor, travellersOf, type NeedContext } from './answers';
import { encounterFor } from './encounters';
import type { Need } from './director';
import { openEvents, refugeOf } from './events';
import { keptOf } from './leads';
import { ringSpot } from '../world/spiral';

/** The setting's situation of a kind (none: it stages none such). */
export function situationOf(setting: Pick<SettingModule, 'situations'>, kind: SituationKind): SituationDef | undefined {
  return setting.situations?.find((t) => t.kind === kind);
}

/** People's answer as a situation: the traveller hurt, sitting by the way (the setting's share of travellers). */
export function hurtTravellerFor(c: NeedContext): TravellerDecision | null {
  const def = situationOf(c.setting, 'hurt-traveller');
  // One who enjoys meeting people meets more of them in need (C12).
  const chance = Math.min(1, (def?.chance ?? 0) * (c.lean?.('people') ?? 1));
  if (!def || !new Rng(deriveSeed(c.seed, 'hurt', travellersOf(c.log).length + 1)).chance(chance)) return null;
  const d = travellerFor(c);
  return d && { ...d, situation: def.id };
}

/** How far from the hero (m) a castaway is, how deep the water under them (m), and how near the strand (m). */
const ADRIFT: readonly [number, number] = [45, 160];
const ADRIFT_DEPTH: readonly [number, number] = [2.5, 7];
const STRAND_NEAR = 70;
/** The harbour town whose fisher it is lies within this of the hero (m); the castaway keeps this far off its harbour (its moorings). */
const FISHER_TOWN = 2500, OFF_MOORINGS = 220;

/** The castaways of the log still holding on at game hour `hours` (not brought in, no other boat yet); `all`: every one ever. */
export function castawaysAt(log: DecisionLog, hours: number, all = false): CastawayDecision[] {
  const kept = keptOf(log), out: CastawayDecision[] = [];
  for (const d of log) if (d.kind === 'castaway' && (all || (hours >= d.at && hours < d.until && !kept.has(d.id)))) out.push(d);
  return out;
}

/**
 * People's answer by the sea (S9, D52): a fisher of the nearest harbour town whose boat went over, clinging to it
 * upturned some way off the strand near the hero (the setting's share `chance` of such answers), until another
 * boat picks them up (`sure`: whatever the share, the debug menu's). Null: no harbour near, the hero not by the sea,
 * one adrift already.
 */
export function castawayFor(c: NeedContext, sure = false): CastawayDecision | null {
  const def = situationOf(c.setting, 'castaway');
  if (!def?.lasts || castawaysAt(c.log, c.hours).length) return null;
  const harbours = harbourTowns(c.towns), fromHero = (w: Town) => Math.hypot(w.decision.x - c.hero.x, w.decision.z - c.hero.z);
  const town = harbours.filter((w) => fromHero(w) < FISHER_TOWN).sort((a, b) => fromHero(a) - fromHero(b))[0];
  if (!town) return null;
  const n = castawaysAt(c.log, Infinity, true).length + 1, s = deriveSeed(c.seed, 'situation', def.id, n);
  const chance = Math.min(1, (def.chance ?? 1) * (c.lean?.('people') ?? 1));
  if (!sure && !new Rng(deriveSeed(s, 'chance')).chance(chance)) return null;
  const t = c.terrain;
  for (let k = 0; k < 48; k++) {
    const { x, z } = ringSpot(c.hero, ADRIFT, s, k), deep = -t.height(x, z);
    if (deep < ADRIFT_DEPTH[0] || deep > ADRIFT_DEPTH[1] || harbours.some((w) => Math.hypot(w.decision.x - x, w.decision.z - z) < OFF_MOORINGS)) continue;
    if (!strandNear(t, x, z)) continue;
    return { kind: 'castaway', id: `castaway-${n}`, town: town.decision.id, x, z, yaw: new Rng(s).range(0, Math.PI * 2), seed: s, at: c.hours, until: c.hours + def.lasts, situation: def.id };
  }
  return null;
}

/** Whether dry strand lies within STRAND_NEAR of (x, z), looked for in eight ways. */
function strandNear(t: Terrain, x: number, z: number): boolean {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const d of [STRAND_NEAR / 2, STRAND_NEAR]) {
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = t.height(px, pz);
      if (h > 0.3 && h < 4 && t.waterDepth(px, pz, h) === 0) return true;
    }
  }
  return false;
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
  /** How much this player enjoys a need (C12): a fighter meets wolves at the paddock more often. None: no lean. */
  readonly lean?: (n: Need) => number;
}

/** How far the wolves roam round where they prowl (m), and how far outside the paddock's fence they are. */
const PROWL_R = 10;
const OUTSIDE = 9;

/** The situations of decision kind `kind` staged in the log (in town `town`, if given): wolves at a paddock, strays. */
export function stagedOf<K extends 'wild' | 'stray'>(log: DecisionLog, kind: K, town?: string): Extract<Decision, { kind: K }>[] {
  return log.filter((d): d is Extract<Decision, { kind: K }> => d.kind === kind && !!d.situation && (town === undefined || d.town === town));
}

/**
 * At dusk, wolves outside a paddock of the town the hero is in, on the side away from the houses: once a town
 * every `every` days, in the setting's hours.
 */
export function paddockWolvesFor(c: PaddockContext): WildDecision | null {
  const def = situationOf(c.setting, 'paddock-wolves'), town = c.near;
  if (!def || !town || !town.plan.paddocks.length || !def.hours || !def.encounter) return null;
  const hour = ((c.hours % 24) + 24) % 24, last = stagedOf(c.log, 'wild', town.decision.id).at(-1);
  // A fighter meets them more often (C12: the days between shrink with how much they enjoy a fight).
  const every = ((def.every ?? 1) * 24) / (c.lean?.('challenge') ?? 1);
  if (!c.early && (hour < def.hours[0] || hour >= def.hours[1] || (last && c.hours - last.at < every))) return null;
  const n = stagedOf(c.log, 'wild').length + 1, s = deriveSeed(c.seed, 'situation', def.id, n), r = new Rng(s);
  const pd = r.pick(town.plan.paddocks), [cx, cz] = polyCentroid(pd.poly);
  let reach = 0;
  for (let i = 0; i < pd.poly.length; i += 2) reach = Math.max(reach, Math.hypot(pd.poly[i] - cx, pd.poly[i + 1] - cz));
  const a = Math.atan2(cz - town.decision.z, cx - town.decision.x), d = reach + OUTSIDE;
  const met = encounterFor({ setting: c.setting, seed: s, of: [def.encounter] });
  if (!met) return null;
  return { kind: 'wild', id: `paddock-wolves-${n}`, town: town.decision.id, group: 'paddock', situation: def.id, encounter: met.encounter, members: met.members, x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: PROWL_R, seed: s, at: c.hours };
}

/** How far from its paddock's gate a stray beast wanders (m). */
const STRAY: readonly [number, number] = [25, 45];

/** The stray going on in a town at game hour `hours` (null: none). */
export function strayAt(log: DecisionLog, town: string, hours: number): StrayDecision | null {
  return stagedOf(log, 'stray', town).find((d) => hours >= d.at && hours < d.until) ?? null;
}

/**
 * By day, one of the beasts of a paddock of the town the hero is in gets out through the gate and wanders off
 * away from the houses, onto dry ground; someone of its farm goes after it (game/township.ts). Once a town
 * every `every` days.
 */
export function strayBeastFor(c: PaddockContext & { readonly terrain?: Terrain }): StrayDecision | null {
  const def = situationOf(c.setting, 'stray-beast'), town = c.near;
  const paddocks = town?.plan.paddocks.filter((p) => p.farm >= 0 && p.animals > 0) ?? [];
  if (!def || !town || !paddocks.length || !def.hours || !def.lasts) return null;
  const hour = ((c.hours % 24) + 24) % 24, last = stagedOf(c.log, 'stray', town.decision.id).at(-1);
  if (!c.early && (hour < def.hours[0] || hour >= def.hours[1] || (last && c.hours - last.at < (def.every ?? 1) * 24))) return null;
  const n = stagedOf(c.log, 'stray').length + 1, s = deriveSeed(c.seed, 'situation', def.id, n), r = new Rng(s);
  const pd = r.pick(paddocks), [gx, gz] = pd.gate;
  const out = Math.atan2(gz - town.decision.z, gx - town.decision.x);
  for (let k = 0; k < 12; k++) {
    const a = out + r.range(-0.8, 0.8), d = r.range(STRAY[0], STRAY[1]), x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
    const h = c.terrain?.height(x, z) ?? 10;
    if (c.terrain && (c.terrain.waterDepth(x, z, h) > 0 || c.terrain.steepness(x, z, 4, h) > 0.4)) continue;
    return { kind: 'stray', id: `stray-${n}`, town: town.decision.id, paddock: pd.id, x, z, seed: s, at: c.hours, until: c.hours + def.lasts, situation: def.id };
  }
  return null;
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

/** A barn smouldering after a raid: where (its middle, world xz), and how thick its smoke is now (0..1). */
export interface Smoke {
  readonly event: string;
  readonly town: string;
  readonly x: number;
  readonly z: number;
  readonly thick: number;
}

/**
 * The barns smouldering now: each farm a raid not dealt with came down on, for the setting's `lasts` hours,
 * thinning as it burns down (C10: smoke over the trees, seen from afar, before anyone tells of it).
 */
export function smokesAt(log: DecisionLog, towns: readonly Town[], setting: Pick<SettingModule, 'situations'>, hours: number): Smoke[] {
  const def = situationOf(setting, 'raid-smoke');
  if (!def?.lasts) return [];
  const out: Smoke[] = [];
  for (const e of openEvents(log)) {
    const age = hours - e.at, at = age >= 0 && age < def.lasts ? barnOf(towns, e) : null;
    if (at) out.push({ event: e.id, town: e.town, ...at, thick: 1 - (age / def.lasts) * 0.7 });
  }
  return out;
}

/** The barn of the farm whose paddock a raid came down on (null: not a raid, or no farm works it). */
function barnOf(towns: readonly Town[], e: EventDecision): { x: number; z: number; barn: number } | null {
  const plan = e.paddock === undefined ? null : townById(towns, e.town)?.plan;
  const pd = plan?.paddocks[e.paddock!], farm = pd && pd.farm >= 0 ? plan!.farms[pd.farm] : undefined;
  const b = farm ? plan!.buildings[farm.barn] : undefined;
  return b ? { x: b.cx, z: b.cz, barn: b.id } : null;
}

/** The barns raiders fired (C10), by town, while their raid is open: drawn burnt (the smoke rises over them for a while). */
export function burntBarns(log: DecisionLog, towns: readonly Town[]): { town: string; barn: number }[] {
  return openEvents(log).flatMap((e) => { const b = barnOf(towns, e); return b ? [{ town: e.town, barn: b.barn }] : []; });
}

/** What the cries read: the log, the towns (where a raided barn stands), the hero, the hours and the cries called. */
export interface CryContext {
  readonly log: DecisionLog;
  readonly setting: Pick<SettingModule, 'situations'>;
  readonly towns: readonly Town[];
  readonly hero: { readonly x: number; readonly z: number };
  readonly hours: number;
  readonly cried: ReadonlySet<string>;
  /** Whether a wild situation still has someone in it (none: all live). */
  readonly living?: (id: string) => boolean;
}

/**
 * The cries due now: each situation going on whose cry has not been called (`cried`), with the hero within
 * its `seen` metres of it (they see it first).
 */
export function criesDue(c: CryContext): Cry[] {
  const { log, setting, hero, hours, cried } = c, alive = c.living ?? (() => true);
  const out: Cry[] = [];
  const smoke = situationOf(setting, 'raid-smoke');
  for (const s of smoke ? smokesAt(log, c.towns, setting, hours) : []) {
    if (smoke!.cry && !cried.has(s.event) && Math.hypot(hero.x - s.x, hero.z - s.z) <= smoke!.seen) out.push({ id: s.event, kind: 'raid-smoke', text: smoke!.cry, town: s.town, x: s.x, z: s.z });
  }
  const fled = situationOf(setting, 'refugees');
  for (const e of fled?.cry ? openEvents(log) : []) {
    const at = refugeOf(c.towns, e);
    if (at && !cried.has(`${e.id}/fled`) && Math.hypot(hero.x - at.x, hero.z - at.z) <= fled!.seen) out.push({ id: `${e.id}/fled`, kind: 'refugees', text: fled!.cry!, town: at.town, x: at.x, z: at.z });
  }
  const adrift = situationOf(setting, 'castaway');
  for (const d of adrift?.cry ? castawaysAt(log, hours) : []) {
    if (!cried.has(d.id) && Math.hypot(hero.x - d.x, hero.z - d.z) <= adrift!.seen) out.push({ id: d.id, kind: 'castaway', text: adrift!.cry!, town: d.town, x: d.x, z: d.z });
  }
  for (const d of log) {
    if ((d.kind !== 'traveller' && d.kind !== 'wild') || !d.situation || cried.has(d.id)) continue;
    const def = setting.situations?.find((t) => t.id === d.situation);
    const on = d.kind === 'traveller' ? hours >= d.at && hours < d.until : hours >= d.at && hours < d.at + CRIES_FOR && alive(d.id);
    if (!def?.cry || !on || Math.hypot(hero.x - d.x, hero.z - d.z) > def.seen) continue;
    out.push({ id: d.id, kind: def.kind, text: def.cry, town: d.town, x: d.x, z: d.z });
  }
  return out;
}

/**
 * Good days in the towns (C11, plan 4.5): the world is not only troubles. A town the hero did a deed for (a
 * promise kept: a place cleared, a band beaten) feasts them the next evening, so the hero's deeds cause
 * events too; and every few days a town holds its market day. Each is a decision in the ledger; the town's
 * people gather at the market for it, and know of it in talk. Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { FestivityDef, SettingModule } from '../setting/contract';
import type { TownOrder } from '../sim/townLife';
import { dungeonOf, type DecisionLog, type FestivityDecision } from '../world/decisions';
import { townById, type Town } from '../world/town';
import { eventWhere, gatherAt, promiseCalled } from './events';
import { cap, fill } from '../talk/folk';

export interface FestivityContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  /** Game hours since the world began. */
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'festivities' | 'events' | 'dungeons' | 'world'>;
  /** The town the hero is in (market days are held where the hero sees them). */
  readonly near?: Town | null;
  /** Now, whatever the day and hour (the debug menu). */
  readonly early?: boolean;
}

/** How long after a deed its town still feasts it (game hours): an old promise kept in a save makes no feast. */
const FRESH = 24;

/** The festivities in the log, oldest first. */
export function festivitiesOf(log: DecisionLog): FestivityDecision[] {
  return log.filter((d): d is FestivityDecision => d.kind === 'festivity');
}

/** The setting's festivity of a kind (none: the setting has no such days). */
const festivityOf = (setting: FestivityContext['setting'], kind: FestivityDef['kind']) => setting.festivities?.find((f) => f.kind === kind);

/** The town's next good day, if one is due: a feast for a deed, else a market day where the hero is. */
export function festivityFor(c: FestivityContext): FestivityDecision | null {
  return feastFor(c) ?? marketDayFor(c);
}

/** The town a promise belongs to (a place's household's, or an event's). */
function deedTown(log: DecisionLog, id: string): string | null {
  const p = log.find((x) => x.id === id);
  return p?.kind === 'event' ? p.town : dungeonOf(log, p)?.town ?? null;
}

/** A day's hours from game hour `from` on (the same day if at least an hour off, else the next day's). */
function nextHours(def: FestivityDef, hours: number, early: boolean | undefined): { from: number; to: number } {
  const long = def.hours[1] - def.hours[0];
  if (early) return { from: hours + 0.05, to: hours + 0.05 + long };
  let from = Math.floor(hours / 24) * 24 + def.hours[0];
  if (hours > from - 1) from += 24;
  return { from, to: from + long };
}

/** A promise the hero kept lately (not one that ran its course) whose town has not feasted it yet. */
function feastFor(c: FestivityContext): FestivityDecision | null {
  const def = festivityOf(c.setting, 'feast');
  if (!def) return null;
  const past = festivitiesOf(c.log);
  for (const k of c.log) {
    if (k.kind !== 'kept' || k.faded || c.hours - k.at > FRESH || past.some((f) => f.for === k.promise)) continue;
    const town = deedTown(c.log, k.promise);
    if (!town || !townById(c.towns, town)) continue;
    return { kind: 'festivity', id: `festivity-${festivitiesOf(c.log).length + 1}`, festivity: def.id, town, at: c.hours, ...nextHours(def, c.hours, c.early), for: k.promise };
  }
  return null;
}

/** Whether day `day` is the town's market day (each town its own turn of the setting's days). */
export function isMarketDay(seed: number, def: FestivityDef, town: string, day: number): boolean {
  const every = def.every ?? 1;
  return (day + (deriveSeed(seed, 'market', town) % every)) % every === 0;
}

/** The town the hero is in holds its market today (once a day; not after its hours). */
function marketDayFor(c: FestivityContext): FestivityDecision | null {
  const def = festivityOf(c.setting, 'market'), town = c.near?.decision.id;
  if (!def || !town) return null;
  const day = Math.floor(c.hours / 24), hour = c.hours - day * 24;
  if (!c.early && (!isMarketDay(c.seed, def, town, day) || hour >= def.hours[1])) return null;
  if (festivitiesOf(c.log).some((f) => f.town === town && f.festivity === def.id && c.hours - f.at < 20)) return null;
  const at = c.early ? nextHours(def, c.hours, true) : { from: day * 24 + def.hours[0], to: day * 24 + def.hours[1] };
  return { kind: 'festivity', id: `festivity-${festivitiesOf(c.log).length + 1}`, festivity: def.id, town, at: c.hours, ...at };
}

/** Its people gather at the market for it. */
export function festivityOrder(towns: readonly Town[], d: FestivityDecision): TownOrder | null {
  return gatherAt(towns, d.town, 16, d.from, d.to);
}

/** How a festivity is told (its setting's words filled in). */
export function festivityTold(setting: FestivityContext['setting'], log: DecisionLog, towns: readonly Town[], d: FestivityDecision): { title: string; news: string; told: string; done: string } | null {
  const def = setting.festivities?.find((f) => f.id === d.festivity), town = townById(towns, d.town);
  if (!def || !town) return null;
  const deed = d.for ? log.find((x) => x.id === d.for) : undefined;
  const place = deed?.kind === 'event' ? eventWhere(setting, log, towns, deed)?.place : promiseCalled(setting, log, towns, deed);
  const words = { town: `the ${town.decision.size ?? 'town'}`, place: place ?? 'the place' };
  const word = (s: string) => cap(fill(s, words));
  return { title: word(def.words.title), news: word(def.words.news), told: word(def.words.told), done: word(def.words.done) };
}

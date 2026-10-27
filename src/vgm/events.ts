/**
 * Story events (plan 4.2, C6): the world moves on its own when the hero leaves a thing be. An event is a
 * decision in the ledger (so a save replays it), it changes the land (who roams it), the town hears of it
 * and gathers to talk it over, and it is a lead of its own until it is dealt with. Pure.
 *
 * `spill`: a place promised long ago and never cleared: its dwellers come out and roam the land near it (a
 * cellar's into the fields past the town, a barrow's, cave's or tower's round its door).
 * `raid`: a wild group left to live near a town (bandits by a road out) comes down on a farm and drives off
 * animals from its paddock; the band that did it holds them out towards its camp. Beat it and they go home.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import { farmlandReach } from '@futuremagic/settlement';
import type { LivestockKind, SettingModule, StoryEventDef, WildDef } from '../setting/contract';
import type { Territory } from '../sim/wild';
import type { TownOrder } from '../sim/townLife';
import { dungeonOf, type DecisionLog, type EventDecision } from '../world/decisions';
import { sketchCellar } from '../world/dungeon/cellar';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { compass, houseOf, loreOf, placeOf } from './dungeons';
import { keptOf, openPromises } from './leads';
import { cap, fill } from '../talk/folk';

export interface EventsContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  readonly terrain: Terrain;
  /** Game hours since the world began. */
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'events' | 'dungeons' | 'creatures'>;
  /** The wild groups round the towns, and how many of each still live (raiders come from these). */
  readonly wild?: readonly WildGroup[];
  /** The hero is down in this dungeon now (nothing comes out under their feet). */
  readonly inside: (dungeon: string) => boolean;
  /** Ground a band keeps off (the wild's territories). */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
  /** Now, whatever the waits say (the debug menu's "a story event now"). */
  readonly early?: boolean;
  /** Only this event of the setting's (by id). */
  readonly which?: string;
}

/** A wild group round a town (sim/wild.ts placeWild) and how many of it still live. */
export interface WildGroup {
  readonly town: string;
  readonly territory: Territory;
  readonly left: number;
}

/** How far a band that came out roams, metres. */
const ROAM = 35;

/** The events in the ledger, oldest first. */
export function eventsOf(log: DecisionLog): EventDecision[] {
  return log.filter((d): d is EventDecision => d.kind === 'event');
}

/** Events not dealt with yet (their band still roams). */
export function openEvents(log: DecisionLog): EventDecision[] {
  const kept = keptOf(log);
  return eventsOf(log).filter((e) => !kept.has(e.id));
}

/** The world's next story event, if one is due now. */
export function nextEvent(c: EventsContext): EventDecision | null {
  const past = eventsOf(c.log);
  for (const def of c.setting.events ?? []) {
    if (c.which && def.id !== c.which) continue;
    const e = def.kind === 'raid' ? raid(c, def, past) : spill(c, def, past);
    if (e) return e;
  }
  return null;
}

/** No event in this town lately (the def's cooldown), unless asked for now. */
const rested = (c: EventsContext, def: StoryEventDef, past: readonly EventDecision[], town: string): boolean =>
  !!c.early || !past.some((e) => e.town === town && c.hours - e.at < def.cooldown);

/** The event's band: `count` of `kinds` in turn. */
function bandMembers(s: number, def: StoryEventDef, kinds: readonly string[]): string[] {
  const rng = new Rng(deriveSeed(s, 'members'));
  return Array.from({ length: rng.int(def.count[0], def.count[1]) }, (_, i) => kinds[i % kinds.length]);
}

/** Animals driven off by raids not dealt with yet, by paddock id, in a town. */
export function takenFrom(log: DecisionLog, town: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of openEvents(log)) if (e.town === town && e.paddock !== undefined) out.set(e.paddock, (out.get(e.paddock) ?? 0) + (e.taken ?? 0));
  return out;
}

/**
 * Raiders still living near a town, left alone long enough, come down on the farm nearest them (one with
 * animals left in its paddock) and drive some off; a band of them holds the beasts out towards their camp.
 */
function raid(c: EventsContext, def: StoryEventDef, past: readonly EventDecision[]): EventDecision | null {
  if (!c.early && c.hours < def.after) return null;
  const open = new Set(openEvents(c.log).map((e) => e.from));
  for (const g of c.wild ?? []) {
    const t = g.territory, town = c.towns.find((x) => x.decision.id === g.town);
    if (t.def.id !== def.by || g.left < 1 || open.has(t.id) || !town || !rested(c, def, past, g.town)) continue;
    const taken = takenFrom(c.log, g.town), gate = (p: { gate: readonly number[] }) => Math.hypot(p.gate[0] - t.x, p.gate[1] - t.z);
    const pd = town.plan.paddocks.filter((p) => p.animals > (taken.get(p.id) ?? 0)).sort((a, b) => gate(a) - gate(b))[0];
    if (!pd) continue;
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    // Out from the farm towards the camp, a little more than half the way.
    const at = dryNear(c, pd.gate[0] + (t.x - pd.gate[0]) * 0.55, pd.gate[1] + (t.z - pd.gate[1]) * 0.55, s);
    if (!at) continue;
    const left = pd.animals - (taken.get(pd.id) ?? 0), n = Math.min(left, 1 + Math.floor(hash2f(s, 7, 7) * 3));
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: g.town, from: t.id, x: at.x, z: at.z, r: ROAM, members: bandMembers(s, def, t.def.creatures), seed: s, at: c.hours, paddock: pd.id, taken: n };
  }
  return null;
}

/** The oldest place left open long enough comes out onto the land, if its town has had no event lately. */
function spill(c: EventsContext, def: StoryEventDef, past: readonly EventDecision[]): EventDecision | null {
  const spilled = new Set(past.map((e) => e.from));
  for (const p of openPromises(c.log)) {
    if ((!c.early && c.hours - (p.at ?? 0) < def.after) || spilled.has(p.id)) continue;
    const d = dungeonOf(c.log, p), town = d && c.towns.find((t) => t.decision.id === d.town);
    if (!d || !town || c.inside(d.id)) continue;
    if (!rested(c, def, past, d.town)) continue;
    const place = placeOf(d, c.towns);
    if (!place) continue;
    const sketch = sketchCellar(d, place, loreOf(c.setting, d.template), p.kind === 'move-in' ? p : undefined);
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    const at = bandSpot(c, d.site ?? null, houseOf(d, c.towns)?.door ?? null, town, s);
    if (!at) continue;
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: d.town, from: p.id, x: at.x, z: at.z, r: ROAM, members: bandMembers(s, def, sketch.dweller.creatures), seed: s, at: c.hours };
  }
  return null;
}

/**
 * Where a band that came out roams: a place on the land round its door, a little towards the town; a
 * cellar's out past the town's fields, the way its house lies. Dry, gentle ground off the wild's territories.
 */
function bandSpot(c: EventsContext, site: { x: number; z: number } | null, door: readonly number[] | null, town: Town, s: number): { x: number; z: number } | null {
  const t = town.decision;
  let ax: number, az: number;
  if (site) {
    const d = Math.hypot(t.x - site.x, t.z - site.z) || 1;
    ax = site.x + ((t.x - site.x) / d) * 45;
    az = site.z + ((t.z - site.z) / d) * 45;
  } else {
    const a = door ? Math.atan2(door[1] - t.z, door[0] - t.x) : hash2f(s, 1, 1) * Math.PI * 2, out = t.radius + farmlandReach(t.radius) + 30;
    ax = t.x + Math.cos(a) * out;
    az = t.z + Math.sin(a) * out;
  }
  return dryNear(c, ax, az, s);
}

/** Dry, gentle ground near (ax, az), off the wild's territories, for a band to roam. */
function dryNear(c: EventsContext, ax: number, az: number, s: number): { x: number; z: number } | null {
  const t3 = c.terrain;
  for (let k = 0; k < 32; k++) {
    const a = hash2f(s, k, 2) * Math.PI * 2, d = k === 0 ? 0 : 8 + hash2f(s, k, 3) * 40;
    const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d, h = t3.height(x, z);
    if (t3.waterDepth(x, z, h) > 0 || h < 2) continue;
    if (t3.steepness(x, z, 8, h) > 0.45) continue;
    if ((c.avoid ?? []).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + ROAM)) continue;
    return { x, z };
  }
  return null;
}

/** A band out on the land as the wild sees it (sim/wild.ts): its territory, named by the event's id. */
export function bandOf(e: EventDecision): Territory {
  const def: WildDef = { id: e.event, creatures: e.members, count: [e.members.length, e.members.length], habitat: 'open', ring: [0, 0], range: e.r, groups: 1 };
  return { def, x: e.x, z: e.z, r: e.r, members: e.members, seed: e.seed, id: e.id };
}

/** The bands of the events not dealt with yet. */
export function openBands(log: DecisionLog): Territory[] {
  return openEvents(log).map(bandOf);
}

/** How an event is told (its setting's words filled in), and where its lead points. */
export function eventTold(setting: Pick<SettingModule, 'events' | 'dungeons' | 'creatures' | 'world'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): { title: string; news: string; note: string; done: string; label: string } | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), town = towns.find((t) => t.decision.id === e.town);
  const where = def && town && (def.kind === 'raid' ? farmOf(setting, town, e) : spillOf(setting, log, towns, e));
  if (!def || !town || !where) return null;
  const lead = setting.creatures.find((x) => x.id === e.members[0]);
  const words: Record<string, string> = {
    ...where,
    creatures: lead?.plural ?? 'creatures',
    town: `the ${town.decision.size ?? 'town'}`,
    dir: compass(e.x - town.decision.x, e.z - town.decision.z),
  };
  const told = (s: string) => cap(fill(s, words));
  return { title: told(def.words.title), news: told(def.words.news), note: told(def.words.note), done: told(def.words.done), label: cap(words.creatures) };
}

/** The place a spill came out of, named. */
function spillOf(setting: Pick<SettingModule, 'dungeons'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): Record<string, string> | null {
  const from = log.find((x) => x.id === e.from), d = dungeonOf(log, from), place = d && placeOf(d, towns);
  if (!d || !place) return null;
  const sketch = sketchCellar(d, place, loreOf(setting, d.template), from?.kind === 'move-in' ? from : undefined);
  return { place: sketch.called ?? `the cellar under ${sketch.house}` };
}

/** The farm a raid came down on, and its animals, named. */
function farmOf(setting: Pick<SettingModule, 'world'>, town: Town, e: EventDecision): Record<string, string> | null {
  const pd = e.paddock === undefined ? undefined : town.plan.paddocks[e.paddock];
  if (!pd) return null;
  return { place: `the farm ${compass(pd.gate[0] - town.decision.x, pd.gate[1] - town.decision.z)} of town`, animals: HERDS[setting.world.livestock] };
}

/** The setting's livestock, as a farm's herd is called. */
const HERDS: Readonly<Record<LivestockKind, string>> = { cow: 'cattle', horse: 'horses' };

/** The town gathers at its market to talk an event over (the setting's `gather` hours), or null. */
export function gatherFor(setting: Pick<SettingModule, 'events'>, towns: readonly Town[], e: EventDecision): TownOrder | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), town = towns.find((t) => t.decision.id === e.town);
  if (!def?.gather || !town) return null;
  const [x, z] = town.plan.centre;
  return { kind: 'gather', x, z, radius: 14, from: e.at, to: e.at + def.gather };
}

/**
 * Story events (plan 4.2, C6): the world moves on its own when the hero leaves a thing be. An event is a
 * decision in the ledger (so a save replays it), it changes the land (who roams it), the town hears of it
 * and gathers to talk it over, and it is a lead of its own until it is dealt with. Pure.
 *
 * `spill`: a place promised long ago and never cleared: its dwellers come out and roam the land near it (a
 * cellar's into the fields past the town, a barrow's, cave's or tower's round its door).
 * `raid`: a wild group left to live near a town (bandits by a road out) comes down on a farm and drives off
 * animals from its paddock; the band that did it holds them out towards its camp. Beat it and they go home.
 * `take`: such a group takes a settlement near it (classic: a waystation on the road); its folk flee, a band
 * holds it, and the rest lie up in a place the VGM asks for near it (`dungeonFor`: a hideout), a lead of its
 * own. Beat the band and the folk come home; till then they camp by the road outside the band's town (`refugeOf`).
 * Left alone past its `fades` hours an event runs its course without the hero (`fadedFor`, C11): the band goes,
 * a raid's beasts with it for good.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import { farmlandReach } from '@futuremagic/settlement';
import type { LivestockKind, SettingModule, StoryEventDef } from '../setting/contract';
import type { Territory } from '../sim/wild';
import type { TownOrder } from '../sim/townLife';
import { dungeonOf, type Decision, type DecisionLog, type DungeonDecision, type EventDecision, type KeptDecision } from '../world/decisions';
import { sketchCellar } from '../world/dungeon/cellar';
import type { Terrain } from '../world/terrain';
import { townById, type Town } from '../world/town';
import { compass, dungeonFor, farFrom, houseOf, loreOf, placeOf } from './dungeons';
import { dwellersOf, keepPromise, keptOf, openPromises } from './leads';
import { encounterFor } from './encounters';
import { cap, fill } from '../talk/folk';

export interface EventsContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  readonly terrain: Terrain;
  /** Game hours since the world began. */
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'events' | 'dungeons' | 'creatures' | 'encounters'>;
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
  /** Where the game started (a lair's danger grows with distance from it, D29; none: the first town). */
  readonly home?: { readonly x: number; readonly z: number };
  /** Where the hero is (a band never leaves under their eyes); none: far from everything. */
  readonly hero?: { readonly x: number; readonly z: number };
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
    const e = def.kind === 'raid' ? raid(c, def, past) : def.kind === 'take' ? takeOver(c, def, past) : spill(c, def, past);
    if (e) return e;
  }
  return null;
}

/** The settlement an open take holds (its folk fled), by the town's id; undefined if none does. */
export function heldBy(log: DecisionLog, town: string): EventDecision | undefined {
  return openEvents(log).find((e) => e.held === town);
}

/** How far from a held settlement the band's lair lies, metres. */
const LAIR_RING: readonly [number, number] = [180, 600];

/**
 * The lair an open event's band asked for (a take's: the rest of the raiders lie up near the place they
 * hold): a place of a kind for the event's `lair` purpose, of the band's own encounter, near it. Known in
 * the band's town; a lead of its own.
 */
export function lairFor(c: EventsContext): DungeonDecision | null {
  const lairs = new Set(c.log.filter((d): d is DungeonDecision => d.kind === 'dungeon').map((d) => d.event));
  for (const e of openEvents(c.log)) {
    const def = (c.setting.events ?? []).find((x) => x.id === e.event), town = townById(c.towns, e.town);
    if (!def?.lair || lairs.has(e.id) || !town) continue;
    const ask = { purpose: def.lair, town, near: { x: e.x, z: e.z, ring: LAIR_RING }, ...(e.encounter ? { dwellers: e.encounter } : {}) };
    const d = dungeonFor(ask, { seed: c.seed, terrain: c.terrain, log: c.log, home: c.home ?? town.decision, dungeons: c.setting.dungeons, ...(c.avoid ? { avoid: c.avoid } : {}) });
    if (d) return { ...d, event: e.id, at: c.hours };
  }
  return null;
}

/**
 * Raiders still living near a town, left alone long enough, take the settlement of the event's size
 * nearest their ground (none held already); its folk flee and a band of them holds it, round its door.
 */
function takeOver(c: EventsContext, def: StoryEventDef, past: readonly EventDecision[]): EventDecision | null {
  if ((!c.early && c.hours < def.after) || !def.takes) return null;
  const open = openEvents(c.log), from = new Set(open.map((e) => e.from)), held = new Set(open.flatMap((e) => (e.held ? [e.held] : [])));
  for (const g of c.wild ?? []) {
    const t = g.territory;
    if (t.kind !== def.by || g.left < 1 || from.has(t.id) || !rested(c, def, past, g.town)) continue;
    const fromCamp = (w: Town) => farFrom(w, t);
    const target = c.towns.filter((w) => w.decision.size === def.takes && !held.has(w.decision.id) && fromCamp(w) <= (def.reach ?? Infinity)).sort((a, b) => fromCamp(a) - fromCamp(b))[0];
    if (!target) continue;
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    // Round its biggest door (the inn's): the band lounges where the folk were.
    const door = [...target.plan.buildings].sort((a, b) => b.hu * b.hv - a.hu * a.hv)[0]?.door ?? [target.decision.x, target.decision.z];
    const at = dryNear({ ...c, avoid: [] }, door[0], door[1], s);
    if (!at) continue;
    const met = bandFrom(c, def, t.encounter, s);
    if (!met) continue;
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: g.town, from: t.id, held: target.decision.id, x: at.x, z: at.z, r: HOLD, ...met, seed: s, at: c.hours };
  }
  return null;
}

/** How far from the hero a band must be to move on unseen, metres (beyond where the wild is built, app/wildLand.ts). */
const UNSEEN = 450;

/**
 * An event left alone runs its course (C11: an ignored promise resolves through an event): the oldest open
 * one older than its `fades` hours ends without the hero, unseen by them; the log keeps it as kept, faded.
 */
export function fadedFor(c: EventsContext): KeptDecision | null {
  for (const e of openEvents(c.log)) {
    const def = (c.setting.events ?? []).find((x) => x.id === e.event);
    if (!def?.fades || (!c.early && c.hours - e.at < def.fades)) continue;
    if (c.hero && Math.hypot(c.hero.x - e.x, c.hero.z - e.z) < UNSEEN + e.r) continue;
    const k = keepPromise(c.log, e.id, c.hours);
    if (k) return { ...k, faded: true };
  }
  return null;
}

/** Whether event `id` ran its course without the hero (it faded). */
export function fadedOf(log: DecisionLog, id: string): boolean {
  return log.some((d) => d.kind === 'kept' && d.promise === id && !!d.faded);
}

/** How far out along the road from the town's edge the folk of a taken place camp, metres (outside the town, app/towns.ts IN). */
const CAMP_OUT = 90;

/**
 * Where the folk of the place a take holds wait to go home (C11: a trace in the world): camped by the road
 * outside the band's town (the news says they ran there), the side the held place lies; null if not a take.
 */
export function refugeOf(towns: readonly Town[], e: EventDecision): { readonly x: number; readonly z: number; readonly town: string } | null {
  const held = e.held ? townById(towns, e.held) : undefined, town = townById(towns, e.town);
  if (!held || !town) return null;
  const t = town.decision, [cx, cz] = town.plan.centre;
  // The road out of the town that leaves it nearest the way to the held place.
  const wx = held.decision.x - t.x, wz = held.decision.z - t.z;
  let ax = wx, az = wz, best = -Infinity;
  for (const st of town.plan.streets) {
    if (st.kind !== 'road') continue;
    const n = st.pts.length, first = Math.hypot(st.pts[0] - cx, st.pts[1] - cz) > Math.hypot(st.pts[n - 2] - cx, st.pts[n - 1] - cz);
    const ex = (first ? st.pts[0] : st.pts[n - 2]) - t.x, ez = (first ? st.pts[1] : st.pts[n - 1]) - t.z;
    // How well it points the held place's way (the cosine between the two).
    const fit = (ex * wx + ez * wz) / (Math.hypot(ex, ez) * Math.hypot(wx, wz) || 1);
    if (fit > best) { best = fit; ax = ex; az = ez; }
  }
  const d = Math.hypot(ax, az) || 1, out = t.radius + CAMP_OUT;
  return { x: t.x + (ax / d) * out, z: t.z + (az / d) * out, town: held.decision.id };
}

/** How far a band holding a settlement strays from its door, metres. */
const HOLD = 16;

/** No event in this town lately (the def's cooldown), unless asked for now. */
const rested = (c: EventsContext, def: StoryEventDef, past: readonly EventDecision[], town: string): boolean =>
  !!c.early || !past.some((e) => e.town === town && c.hours - e.at < def.cooldown);

/** The event's band: of the encounter `of` (a place's dwellers, the raiders), as many as the event says. */
const bandFrom = (c: EventsContext, def: StoryEventDef, of: string, s: number) => encounterFor({ setting: c.setting, seed: s, of: [of], count: def.count });

/**
 * Animals driven off by raids, by paddock id, in a town: those not dealt with yet, and those whose raiders
 * moved on with them (a raid that faded: gone for good).
 */
export function takenFrom(log: DecisionLog, town: string): Map<number, number> {
  const out = new Map<number, number>(), kept = keptOf(log);
  for (const e of eventsOf(log)) if ((!kept.has(e.id) || fadedOf(log, e.id)) && e.town === town && e.paddock !== undefined) out.set(e.paddock, (out.get(e.paddock) ?? 0) + (e.taken ?? 0));
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
    const t = g.territory, town = townById(c.towns, g.town);
    if (t.kind !== def.by || g.left < 1 || open.has(t.id) || !town || !rested(c, def, past, g.town)) continue;
    const taken = takenFrom(c.log, g.town), gate = (p: { gate: readonly number[] }) => Math.hypot(p.gate[0] - t.x, p.gate[1] - t.z);
    const pd = town.plan.paddocks.filter((p) => p.animals > (taken.get(p.id) ?? 0)).sort((a, b) => gate(a) - gate(b))[0];
    if (!pd) continue;
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    // Out from the farm towards the camp, a little more than half the way.
    const at = dryNear(c, pd.gate[0] + (t.x - pd.gate[0]) * 0.55, pd.gate[1] + (t.z - pd.gate[1]) * 0.55, s);
    if (!at) continue;
    const left = pd.animals - (taken.get(pd.id) ?? 0), n = Math.min(left, 1 + Math.floor(hash2f(s, 7, 7) * 3));
    const met = bandFrom(c, def, t.encounter, s);
    if (!met) continue;
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: g.town, from: t.id, x: at.x, z: at.z, r: ROAM, ...met, seed: s, at: c.hours, paddock: pd.id, taken: n };
  }
  return null;
}

/** The oldest place left open long enough comes out onto the land, if its town has had no event lately. */
function spill(c: EventsContext, def: StoryEventDef, past: readonly EventDecision[]): EventDecision | null {
  const spilled = new Set(past.map((e) => e.from));
  for (const p of openPromises(c.log)) {
    if ((!c.early && c.hours - (p.at ?? 0) < def.after) || spilled.has(p.id)) continue;
    const d = dungeonOf(c.log, p), town = d && townById(c.towns, d.town);
    if (!d || !town || c.inside(d.id)) continue;
    if (!rested(c, def, past, d.town)) continue;
    const place = placeOf(d, c.towns, c.setting.dungeons);
    if (!place) continue;
    const sketch = sketchCellar(d, place, loreOf(c.setting, d.template), dwellersOf(c.log, p));
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    const at = bandSpot(c, d.site ?? null, houseOf(d, c.towns)?.door ?? null, town, s);
    if (!at) continue;
    const met = bandFrom(c, def, sketch.dweller.encounter, s);
    if (!met) continue;
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: d.town, from: p.id, x: at.x, z: at.z, r: ROAM, ...met, seed: s, at: c.hours };
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
  return { kind: e.event, encounter: e.encounter ?? '', x: e.x, z: e.z, r: e.r, members: e.members, seed: e.seed, id: e.id };
}

/** The bands of the events not dealt with yet. */
export function openBands(log: DecisionLog): Territory[] {
  return openEvents(log).map(bandOf);
}

/** How an event is told (its setting's words filled in), and where its lead points. */
export function eventTold(setting: Pick<SettingModule, 'events' | 'dungeons' | 'creatures' | 'world'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): { title: string; news: string; note: string; done: string; told: string; faded: string; label: string } | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), town = townById(towns, e.town);
  const where = eventWhere(setting, log, towns, e);
  if (!def || !town || !where) return null;
  const lead = setting.creatures.find((x) => x.id === e.members[0]);
  const words: Record<string, string> = {
    ...where,
    creatures: lead?.plural ?? 'creatures',
    town: `the ${town.decision.size ?? 'town'}`,
    dir: compass(e.x - town.decision.x, e.z - town.decision.z),
  };
  const told = (s: string) => cap(fill(s, words));
  return { title: told(def.words.title), news: told(def.words.news), note: told(def.words.note), done: told(def.words.done), told: told(def.words.told ?? def.words.news), faded: told(def.words.faded ?? def.words.done), label: cap(words.creatures) };
}

/** The place a spill came out of, named. */
function spillOf(setting: Pick<SettingModule, 'dungeons'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): Record<string, string> | null {
  const place = promiseCalled(setting, log, towns, log.find((x) => x.id === e.from));
  return place ? { place } : null;
}

/** A promised place as its town calls it ("the barrow on the hill", "the cellar under the smithy"); null if `p` is no place's promise. */
export function promiseCalled(setting: Pick<SettingModule, 'dungeons'>, log: DecisionLog, towns: readonly Town[], p: Decision | undefined): string | null {
  const d = dungeonOf(log, p), place = d && placeOf(d, towns, setting.dungeons);
  if (!d || !place) return null;
  const sketch = sketchCellar(d, place, loreOf(setting, d.template), p && dwellersOf(log, p));
  return sketch.called ?? `the cellar under ${sketch.house}`;
}

/** Where an event befell, named as its words have it (`{place}`, a raid's `{animals}`); null if it cannot be told. */
export function eventWhere(setting: Pick<SettingModule, 'events' | 'dungeons' | 'world'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): Record<string, string> | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), town = townById(towns, e.town);
  return def && town ? (def.kind === 'raid' ? farmOf(setting, town, e) : def.kind === 'take' ? heldOf(towns, e) : spillOf(setting, log, towns, e)) : null;
}

/** The settlement a take holds, named ("the waystation"). */
function heldOf(towns: readonly Town[], e: EventDecision): Record<string, string> | null {
  const w = e.held ? townById(towns, e.held) : undefined;
  return w ? { place: `the ${w.decision.size ?? 'town'}` } : null;
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
  const def = (setting.events ?? []).find((x) => x.id === e.event);
  return def?.gather ? gatherAt(towns, e.town, 14, e.at, e.at + def.gather) : null;
}

/** Everyone awake in town `id` gathers within `radius` of its market's middle from game hour `from` to `to` (null: no such town). */
export function gatherAt(towns: readonly Town[], id: string, radius: number, from: number, to: number): TownOrder | null {
  const town = townById(towns, id);
  if (!town) return null;
  const [x, z] = town.plan.centre;
  return { kind: 'gather', x, z, radius, from, to };
}

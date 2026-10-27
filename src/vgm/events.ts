/**
 * Story events (plan 4.2, C6): the world moves on its own when the hero leaves a thing be. An event is a
 * decision in the ledger (so a save replays it), it changes the land (who roams it), the town hears of it
 * and gathers to talk it over, and it is a lead of its own until it is dealt with. Pure.
 *
 * `spill`: a place promised long ago and never cleared: its dwellers come out and roam the land near it (a
 * cellar's into the fields past the town, a barrow's, cave's or tower's round its door).
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import { farmlandReach } from '@futuremagic/settlement';
import type { SettingModule, StoryEventDef, WildDef } from '../setting/contract';
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
  /** The hero is down in this dungeon now (nothing comes out under their feet). */
  readonly inside: (dungeon: string) => boolean;
  /** Ground a band keeps off (the wild's territories). */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
  /** Now, whatever the waits say (the debug menu's "a story event now"). */
  readonly early?: boolean;
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
    const e = spill(c, def, past);
    if (e) return e;
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
    if (!c.early && past.some((e) => e.town === d.town && c.hours - e.at < def.cooldown)) continue;
    const place = placeOf(d, c.towns);
    if (!place) continue;
    const sketch = sketchCellar(d, place, loreOf(c.setting, d.template), p.kind === 'move-in' ? p : undefined);
    const s = deriveSeed(c.seed, 'vgm', 'event', past.length);
    const at = bandSpot(c, d.site ?? null, houseOf(d, c.towns)?.door ?? null, town, s);
    if (!at) continue;
    const rng = new Rng(deriveSeed(s, 'members')), kinds = sketch.dweller.creatures;
    const members = Array.from({ length: rng.int(def.count[0], def.count[1]) }, (_, i) => kinds[i % kinds.length]);
    return { kind: 'event', id: `event-${past.length + 1}`, event: def.id, town: d.town, from: p.id, x: at.x, z: at.z, r: ROAM, members, seed: s, at: c.hours };
  }
  return null;
}

/**
 * Where a band that came out roams: a place on the land round its door, a little towards the town; a
 * cellar's out past the town's fields, the way its house lies. Dry, gentle ground off the wild's territories.
 */
function bandSpot(c: EventsContext, site: { x: number; z: number } | null, door: readonly number[] | null, town: Town, s: number): { x: number; z: number } | null {
  const t = town.decision, t3 = c.terrain;
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
export function eventTold(setting: Pick<SettingModule, 'events' | 'dungeons' | 'creatures'>, log: DecisionLog, towns: readonly Town[], e: EventDecision): { title: string; news: string; note: string; done: string; label: string } | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), from = log.find((x) => x.id === e.from);
  const d = dungeonOf(log, from), town = towns.find((t) => t.decision.id === e.town), place = d && placeOf(d, towns);
  if (!def || !d || !town || !place) return null;
  const sketch = sketchCellar(d, place, loreOf(setting, d.template), from?.kind === 'move-in' ? from : undefined);
  const lead = setting.creatures.find((x) => x.id === e.members[0]);
  const words: Record<string, string> = {
    creatures: lead?.plural ?? 'creatures',
    place: sketch.called ?? `the cellar under ${sketch.house}`,
    town: `the ${town.decision.size ?? 'town'}`,
    dir: compass(e.x - town.decision.x, e.z - town.decision.z),
  };
  const told = (s: string) => cap(fill(s, words));
  return { title: told(def.words.title), news: told(def.words.news), note: told(def.words.note), done: told(def.words.done), label: cap(words.creatures) };
}

/** The town gathers at its market to talk an event over (the setting's `gather` hours), or null. */
export function gatherFor(setting: Pick<SettingModule, 'events'>, towns: readonly Town[], e: EventDecision): TownOrder | null {
  const def = (setting.events ?? []).find((x) => x.id === e.event), town = towns.find((t) => t.decision.id === e.town);
  if (!def?.gather || !town) return null;
  const [x, z] = town.plan.centre;
  return { kind: 'gather', x, z, radius: 14, from: e.at, to: e.at + def.gather };
}

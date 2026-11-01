/**
 * What a household asks of the hero about its place (D62, phase Q; docs/design/vgm.md). Clearing it is one
 * verb of several: fetch one named thing out of it, and the verbs that follow. The VGM picks the kind when it
 * promises the place, from the setting's asks that fit it, and remembers what it gave (the decision log is
 * the save): never the same kind twice in a row, and a kind not given for a while weighs more. Only the thing
 * an ask names counts as done (`askMet`). Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { AskDef, SettingModule } from '../setting/contract';
import type { DecisionLog, DungeonDecision, PromiseAsk } from '../world/decisions';
import type { Item } from '../game/items';
import { cap, fill } from '../talk/folk';

/** The kind every place without an ask is: cleared (the first lead, a guild's place, new dwellers moved in). */
export const CLEAR = 'clear';

/**
 * The kinds of task given, oldest first (D62: the VGM's memory, kept in the save with the log): every
 * promise, its ask's kind, or clear when it asks nothing else.
 */
export function asksGiven(log: DecisionLog): string[] {
  const out: string[] = [];
  for (const d of log) {
    if (d.kind === 'dungeon') out.push(d.ask?.id ?? CLEAR);
    else if (d.kind === 'move-in') out.push(CLEAR);
  }
  return out;
}

/**
 * How much more a kind weighs for having waited: given never, or `since` tasks ago. The last kind given is
 * left out altogether while another fits (`askFor`).
 */
const waited = (since: number): number => 1 + Math.min(since, 6) * 0.5;

/** What fits a place: a place with dwellers or an empty one (a sight), of its kind. */
export interface AskPlace {
  readonly decision: DungeonDecision;
  /** Somebody lives there (not an empty place). */
  readonly lived: boolean;
}

/** The setting's asks a place fits. */
export function asksFitting(setting: Pick<SettingModule, 'asks'>, p: AskPlace): AskDef[] {
  return (setting.asks ?? []).filter((a) => (!a.kinds || a.kinds.includes(p.decision.template)) && (a.lived === undefined || a.lived === p.lived));
}

/**
 * What the household asks about a newly promised place: a kind that fits it, not the kind given last (while
 * another fits), weighed by how long each has waited. Null: the setting has no asks that fit (clear it).
 */
export function askFor(setting: Pick<SettingModule, 'asks'>, seed: number, log: DecisionLog, p: AskPlace): PromiseAsk | null {
  const fit = asksFitting(setting, p);
  if (!fit.length) return null;
  const given = asksGiven(log), last = given.at(-1);
  const pool = fit.length > 1 ? fit.filter((a) => a.id !== last) : fit;
  const since = (id: string) => {
    const i = given.lastIndexOf(id);
    return i < 0 ? given.length + 1 : given.length - 1 - i;
  };
  const rng = new Rng(deriveSeed(seed, 'vgm', 'ask', p.decision.id));
  const odds = pool.map((x) => x.weight * waited(since(x.id)));
  const a = rng.weighted(pool, (_, i) => odds[i]!);
  return {
    id: a.id,
    verb: a.verb,
    ...(a.things?.length ? { thing: rng.int(0, a.things.length - 1) } : {}),
    line: rng.int(0, a.words.told.length - 1),
    ...(a.verb === 'lost' && a.lost ? { who: rng.int(0, 9999), alive: rng.chance(a.lost.alive) } : {}),
  };
}

/** The setting's ask `id` as a place would carry it, its first thing and line (someone lost: found alive), for looking at it (`?ask=`). Null: no such ask. */
export function askNamed(setting: Pick<SettingModule, 'asks'>, id: string): PromiseAsk | null {
  const a = setting.asks?.find((x) => x.id === id);
  return a ? { id: a.id, verb: a.verb, line: 0, ...(a.things?.length ? { thing: 0 } : {}), ...(a.verb === 'lost' ? { who: 0, alive: true } : {}) } : null;
}

/** The setting's ask a promise carries (null: none, as in an older save or a guild's place: clear it). */
export function askDefOf(setting: Pick<SettingModule, 'asks'>, ask: PromiseAsk | undefined): AskDef | null {
  return (ask && setting.asks?.find((a) => a.id === ask.id)) || null;
}

/** The ask of promise `id` (a dungeon decision's; a move-in's dwellers are only to be cleared). */
export function askOf(log: DecisionLog, id: string): PromiseAsk | null {
  const d = log.find((x) => x.id === id);
  return d?.kind === 'dungeon' ? d.ask ?? null : null;
}

/** The verb of promise `id`: what counts as done (clear when it asks nothing else). */
export function verbOf(log: DecisionLog, id: string): string {
  return askOf(log, id)?.verb ?? CLEAR;
}

/** Names an ask's lines fill: the household's family, and who is lost (a lost person). */
export interface AskNames {
  readonly family: string;
  readonly who?: string;
}

/** The named thing of a fetch, or what is left of someone lost dead, as the household calls it. Null: none. */
export function thingOf(setting: Pick<SettingModule, 'asks'>, ask: PromiseAsk | undefined, n: AskNames): { readonly item: string; readonly name: string; readonly lore: string } | null {
  if (!ask || ask.alive) return null;
  const t = ask.thing === undefined ? undefined : askDefOf(setting, ask)?.things?.[ask.thing];
  const v = { family: n.family, who: n.who ?? '' };
  return t ? { item: t.item, name: fill(t.name, v), lore: fill(t.lore, v) } : null;
}

/** The keepsake a promise asks to be brought (a fetch's thing, a dead lost one's), as an item in the pack (null: none). */
export function keepsakeOf(setting: Pick<SettingModule, 'asks' | 'items'>, d: DungeonDecision, n: AskNames): Item | null {
  const t = thingOf(setting, d.ask, n);
  if (!t || !setting.items.items.some((x) => x.id === t.item)) return null;
  return { def: t.item, rarity: 'common', name: cap(t.name), bonuses: {}, lore: t.lore, keepsake: d.id };
}

/** Whether an ask is done by bringing something (a fetch's thing, what is left of someone lost dead). */
export function bringsBack(ask: PromiseAsk | null | undefined): boolean {
  return ask?.verb === 'fetch' || (ask?.verb === 'lost' && !ask.alive);
}

/** Whether the hero holds the keepsake of promise `id`. */
export function holdsKeepsake(pack: readonly Item[], id: string): boolean {
  return pack.some((it) => it.keepsake === id);
}

/**
 * Who of the town is lost in place `d` (D62): a child of the household (those who tell of the trouble are its
 * grown-ups), else one of the town's hands, homemakers or children from another house; a seeded pick, never one
 * lost in a place before (found or not). Never someone a map marks (a shop's keeper, a teacher): they stay at their
 * place. Null: it asks for nobody lost, or nobody fits.
 */
export function lostOne<P extends { readonly id: number; readonly home: number; readonly role: string }>(people: readonly P[], log: DecisionLog, d: DungeonDecision): P | null {
  if (d.ask?.verb !== 'lost') return null;
  const before = new Set<number>();
  for (const x of log) {
    if (x.id === d.id) break;
    if (x.kind === 'dungeon' && x.town === d.town && x.ask?.verb === 'lost') {
      const p = lostOne(people, log, x);
      if (p) before.add(p.id);
    }
  }
  const free = (p: P) => !before.has(p.id);
  const own = people.filter((p) => p.home === d.building && p.role === 'child' && free(p));
  const others = people.filter((p) => p.home !== d.building && (p.role === 'hand' || p.role === 'homemaker' || p.role === 'child') && free(p));
  const pool = own.length ? own : others;
  return pool.length ? pool[(d.ask.who ?? 0) % pool.length]! : null;
}

/** What the place shows of how its ask stands, as the game reads it. */
export interface AskState {
  /** Nobody left down there who would fight (or an empty place's end found). */
  readonly beaten: boolean;
  /** The hero holds the keepsake asked for. */
  readonly holds: boolean;
  /** The hero came up to the one who was lost, alive. */
  readonly found?: boolean;
  /** The breach is walled up (a seal). */
  readonly sealed?: boolean;
}

/**
 * Is the ask done (D62)? Only the thing it names counts: clear, the place beaten; fetch, the named thing in
 * the hero's hands (beating the place does not do it, and nor does any other thing); lost, the lost one found
 * alive, or what is left of them in the hero's hands; seal, the breach walled up (beating what came through it is not).
 */
export function askMet(ask: PromiseAsk | null | undefined, s: AskState): boolean {
  if (ask?.verb === 'fetch') return s.holds;
  if (ask?.verb === 'lost') return ask.alive ? !!s.found : s.holds;
  if (ask?.verb === 'seal') return !!s.sealed;
  return s.beaten;
}

/** The ask's words for its household, its names filled: the told line, the topic, the journal's note, the thanks, what they say to a report without the thing, and the lost one's words when found. */
export function askWords(setting: Pick<SettingModule, 'asks'>, ask: PromiseAsk | undefined, n: AskNames): { readonly told: string; readonly topic: string; readonly note: string; readonly thanks: string; readonly missing: string; readonly found: string } | null {
  const a = askDefOf(setting, ask);
  if (!a || !ask) return null;
  const thing = thingOf(setting, ask, n)?.name ?? '';
  const v = { thing, who: n.who ?? '' };
  // `{coins}`, `{name}`, `{house}` and `{place}` are left for the game to fill.
  const f = (t: string) => cap(fill(t, v)), g = (t: string) => fill(t, v);
  const dead = a.verb === 'lost' && !ask.alive ? a.lost?.dead : undefined;
  return {
    told: f(a.words.told[ask.line % a.words.told.length]!),
    topic: g(dead?.topic ?? a.words.topic),
    note: g(dead?.note ?? a.words.note),
    thanks: f(dead?.thanks ?? a.words.thanks),
    missing: f(a.words.missing ?? ''),
    found: f(a.lost?.found ?? ''),
  };
}

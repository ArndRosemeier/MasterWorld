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
  };
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

/** The named thing of a fetch, as the household calls it (`family`: their name). Null: it fetches nothing. */
export function thingOf(setting: Pick<SettingModule, 'asks'>, ask: PromiseAsk | undefined, family: string): { readonly item: string; readonly name: string; readonly lore: string } | null {
  const t = ask?.thing === undefined ? undefined : askDefOf(setting, ask)?.things?.[ask.thing];
  return t ? { item: t.item, name: fill(t.name, { family }), lore: fill(t.lore, { family }) } : null;
}

/** The keepsake a fetch asks for, as an item in the pack (null: the promise fetches nothing). */
export function keepsakeOf(setting: Pick<SettingModule, 'asks' | 'items'>, d: DungeonDecision, family: string): Item | null {
  const t = thingOf(setting, d.ask, family);
  if (!t || !setting.items.items.some((x) => x.id === t.item)) return null;
  return { def: t.item, rarity: 'common', name: cap(t.name), bonuses: {}, lore: t.lore, keepsake: d.id };
}

/** Whether the hero holds the keepsake of promise `id`. */
export function holdsKeepsake(pack: readonly Item[], id: string): boolean {
  return pack.some((it) => it.keepsake === id);
}

/** What the place shows of how its ask stands, as the game reads it. */
export interface AskState {
  /** Nobody left down there who would fight (or an empty place's end found). */
  readonly beaten: boolean;
  /** The hero holds the keepsake asked for. */
  readonly holds: boolean;
}

/**
 * Is the ask done (D62)? Only the thing it names counts: clear, the place beaten; fetch, the named thing in
 * the hero's hands (beating the place does not do it, and nor does any other thing).
 */
export function askMet(verb: string, s: AskState): boolean {
  if (verb === 'fetch') return s.holds;
  return s.beaten;
}

/** The ask's words for its household (`family`), its things named: the told line, the topic, the journal's note and the thanks. */
export function askWords(setting: Pick<SettingModule, 'asks'>, ask: PromiseAsk | undefined, family: string): { readonly told: string; readonly topic: string; readonly note: string; readonly thanks: string; readonly missing: string } | null {
  const a = askDefOf(setting, ask);
  if (!a || !ask) return null;
  const thing = thingOf(setting, ask, family)?.name ?? '';
  const f = (s: string) => cap(fill(s, { thing }));
  // The thanks keep `{coins}` (and `{place}`) for the game to fill.
  return { told: f(a.words.told[ask.line % a.words.told.length]!), topic: a.words.topic.replace('{thing}', thing), note: a.words.note.replace('{thing}', thing), thanks: f(a.words.thanks), missing: f(a.words.missing ?? '') };
}

/**
 * A favour asked on the spot (D68, phase N3; docs/design/vgm.md): when the hero talks with someone, the VGM may make
 * a task for them out of who they are. A person's pursuit or trade has things in it (a bee keeper's skep, a fisher's
 * tackle, a smith's good iron), and one of them is down in the cellar under their house: the task is a fetch of that
 * thing, and only it counts (D62). It is asked in their temperament's manner (`asking`: blurted at once, told when
 * asked for news, or hinted at until asked again). Rare, never a quest hub (D52): one open at a time, a gap between
 * them, a seeded share of the people only, and each person at most once. The task is a promise like a household's
 * (the decision log is the save); it carries the person and what it came from as its `want`. Pure.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import type { AskDef, AskThing, SettingModule } from '../setting/contract';
import type { Person } from '../sim/people';
import { personaOf } from '../talk/persona';
import type { DecisionLog, DungeonDecision, PromiseWant } from '../world/decisions';
import type { Town } from '../world/town';
import { promiseCellar } from './dungeons';
import { LEADS, openPromises } from './leads';

/** How rare a favour is: the share of people who would ask one, the game hours between favours, and how many may be open. */
export const FAVOUR = { share: 0.3, gap: 36, open: 1 } as const;

/** The ask of favours (the setting's personal ask). */
export function craftAskOf(setting: Pick<SettingModule, 'asks'>): AskDef | null {
  return setting.asks?.find((a) => a.personal) ?? null;
}

/** The favours asked so far: each person's and what it came from. */
function favoursIn(log: DecisionLog): DungeonDecision[] {
  return log.filter((d): d is DungeonDecision => d.kind === 'dungeon' && d.ask?.want?.kind === 'craft');
}

/** Whether `thing` is one that belongs to the person: of their trade, or of a pursuit they have. Which it comes from (`trade:smith`, or the pursuit's id), or null. */
export function craftOf(thing: AskThing, person: Pick<Person, 'trade'>, pursuits: readonly string[]): string | null {
  if (person.trade && thing.for?.trades?.includes(person.trade)) return `trade:${person.trade}`;
  return pursuits.find((p) => thing.for?.pursuits?.includes(p)) ?? null;
}

/** What a grown-up of the town might ask the hero to fetch, as indexes into the ask's things: those of their calling or pursuits, none an earlier favour named. */
export function craftsOf(setting: Pick<SettingModule, 'asks' | 'talk'>, log: DecisionLog, person: Pick<Person, 'seed' | 'role' | 'trade' | 'race' | 'age' | 'social' | 'diligent' | 'pious' | 'early'>): { readonly index: number; readonly craft: string }[] {
  const ask = craftAskOf(setting);
  if (!ask?.things) return [];
  const pursuits = personaOf(person, setting.talk.persona).pursuits, given = new Set(favoursIn(log).map((d) => d.ask!.thing));
  const out: { index: number; craft: string }[] = [];
  ask.things.forEach((t, index) => {
    const craft = given.has(index) ? null : craftOf(t, person, pursuits);
    if (craft) out.push({ index, craft });
  });
  return out;
}

/** Who is asking, and where they live. */
export interface FavourAsk {
  readonly town: Town;
  /** The people of the town, as the simulation has them. */
  readonly people: readonly Person[];
  /** The person the hero talks with. */
  readonly person: number;
}

export interface FavourContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly hours: number;
  readonly setting: Pick<SettingModule, 'asks' | 'talk'>;
  /** Where the game starts (the danger of a place counts from there, D29). */
  readonly home: { readonly x: number; readonly z: number };
}

/**
 * The task a person asks of the hero, if they ask one now: a cellar under their own house with their thing in it (the ask is a
 * fetch of that thing). Null: they would not ask (a child, a stranger passing through, a house with no cellar), it is too soon after
 * the last favour or another is open, they asked before or have nothing of theirs to lose, or the seed has them keep their trouble to themselves.
 */
export function favourFor(a: FavourAsk, c: FavourContext): DungeonDecision | null {
  const p = a.people.find((x) => x.id === a.person), ask = craftAskOf(c.setting);
  if (!p || !ask?.things || p.role === 'child' || p.role === 'traveller') return null;
  const asked = favoursIn(c.log);
  if (asked.some((d) => d.ask!.want!.person === p.id)) return null;
  // Rare: one open at a time, a gap after the last, and room among the leads.
  const open = openPromises(c.log);
  if (open.filter((d) => d.kind === 'dungeon' && d.ask?.want?.kind === 'craft').length >= FAVOUR.open || open.length > LEADS.max) return null;
  const last = Math.max(-Infinity, ...asked.map((d) => d.at ?? -Infinity));
  if (c.hours - last < FAVOUR.gap) return null;
  if (hash2f(deriveSeed(c.seed, 'vgm', 'favour'), p.id, 1) >= FAVOUR.share) return null;
  const mine = craftsOf(c.setting, c.log, p);
  if (!mine.length) return null;
  const rng = new Rng(deriveSeed(c.seed, 'vgm', 'favour', p.id));
  const pick = mine[rng.int(0, mine.length - 1)]!, thing = ask.things[pick.index]!;
  const cellar = promiseCellar(c.seed, a.town, c.log, c.home, 'cellar', undefined, p.home);
  if (!cellar) return null;
  const want: PromiseWant = { person: p.id, kind: 'craft', craft: pick.craft };
  return { ...cellar, at: c.hours, ask: { id: ask.id, verb: 'fetch', thing: pick.index, line: rng.int(0, (thing.told?.length ?? ask.words.told.length) - 1), want } };
}

/** Whether favour `d` reads back from the world alone (the log is the save): its person is of the town, and the thing it names is of their calling or pursuits. */
export function favourHolds(setting: Pick<SettingModule, 'asks' | 'talk'>, people: readonly Person[], d: DungeonDecision): boolean {
  const w = d.ask?.want, p = people.find((x) => x.id === w?.person), thing = d.ask?.thing === undefined ? undefined : craftAskOf(setting)?.things?.[d.ask.thing];
  return !!(w && p && thing && p.home === d.building && craftOf(thing, p, personaOf(p, setting.talk.persona).pursuits) === w.craft);
}

/** Why the VGM made a favour (its log's line): who asked, and the pursuit or trade it came from. */
export function favourWhy(d: DungeonDecision, names: { readonly person: (id: number) => string }): string {
  const w = d.ask?.want;
  return w ? `${names.person(w.person)} lost something of their ${w.craft?.startsWith('trade:') ? `trade (${w.craft.slice(6)})` : `pursuit (${w.craft})`} in ${d.id}` : d.id;
}

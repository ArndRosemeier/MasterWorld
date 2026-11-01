/**
 * Guild houses (plan 10, D49, D59): where a hero learns abilities. Every town of a guild's sizes has its house:
 * a plain house near what the guild names (the smithy, the inn, the edge), whose first grown-up becomes its
 * trainer. A trainer teaches each of its abilities for coin, once the hero is of the ability's level (there are
 * no skills: the level is the skill); the dearer ones also ask the guild's task. The task done is a good deed, once. The bard at
 * the inn knows every house. The same for every town, start town or village. Pure.
 */
import { hexToRgb } from '@futuremagic/core';
import { fill } from '../talk/folk';
import { cap } from '../talk/townTalk';
import { compass } from '../vgm/dungeons';
import { questOf, questReward } from '../vgm/quests';
import { houseShape, polyCentroid, signPlace, type TownBuilding, type TownPlan } from '@futuremagic/settlement';
import { abilityOf, guildOf, type AbilityDef, type GuildDef, type SettingModule } from '../setting/contract';
import { buildingOf, type Person } from '../sim/people';
import { dungeonOf, type DecisionLog, type RetreatDecision } from '../world/decisions';
import type { Character } from './character';
import { keeperOf } from './trade';

/** One guild's house in a town. */
export interface GuildHouse {
  readonly guild: GuildDef;
  /** Its house (for a master out on the land, `near: 'out'`: where the household lives). */
  readonly b: TownBuilding;
  /** A master's own place out on the land (C3: the warden's tower), where they stand and teach. */
  readonly out?: RetreatDecision;
}

/** Where a guild's master is found: their place out on the land, else the house. */
export const whereOf = (h: GuildHouse): { readonly x: number; readonly z: number } => h.out ?? { x: h.b.cx, z: h.b.cz };

/** Two guilds' houses stand at least this far apart where the town has room (m). */
const APART = 30;

/** The guild houses of a town (none in a town too small for any). */
export function guildHouses(plan: TownPlan, size: GuildDef['sizes'][number], setting: Pick<SettingModule, 'guilds'>, out: readonly RetreatDecision[] = []): GuildHouse[] {
  const taken = new Set<number>(), houses: GuildHouse[] = [];
  // Plain homes with somebody grown-up in them.
  const all = plan.buildings.filter((b) => (b.kind === 'house' || b.kind === 'cottage') && !b.trade && b.household >= 2);
  // In the capital the guilds keep halls: only its biggest houses (the largest third, two storeys or more).
  const area = (b: TownBuilding) => b.hu * b.hv * b.floors, cut = size === 'capital' ? all.map(area).sort((a, b) => b - a)[Math.floor(all.length / 3)] ?? 0 : 0;
  const halls = all.filter((b) => area(b) >= cut && (size !== 'capital' || b.floors >= 2));
  const homes = halls.length >= 12 ? halls : all;
  const [mx, mz] = polyCentroid(plan.market);
  for (const guild of setting.guilds ?? []) {
    if (!guild.sizes.includes(size)) continue;
    // A master out on the land teaches only where the world gave them their place; the household lives nearest it.
    const own = guild.near === 'out' ? out.find((r) => r.keeper === guild.keeper) : undefined;
    if (guild.near === 'out' && !own) continue;
    const at = own ?? anchorOf(plan, guild.near) ?? { x: mx, z: mz };
    const far = guild.near === 'edge' ? -1 : 1;
    // Not next door to another guild's house (two signs on one corner), unless nothing else is left.
    const apart = (h: TownBuilding) => houses.every((o) => Math.hypot(h.cx - o.b.cx, h.cz - o.b.cz) >= APART);
    // A guild with a sign takes a house whose front has wall free for it (the same rule as drawing it).
    const signed = (h: TownBuilding) => !guild.sign || guild.hidden || !!own || !!signPlace(h, houseShape(h))?.flat;
    const free = homes.filter((h) => !taken.has(h.id)), spaced = free.filter(apart);
    const best = [spaced.filter(signed), spaced, free.filter(signed), free].find((l) => l.length) ?? [];
    const b = best.sort((a, c) => far * (Math.hypot(a.cx - at.x, a.cz - at.z) - Math.hypot(c.cx - at.x, c.cz - at.z)) || a.id - c.id)[0];
    if (!b) continue;
    taken.add(b.id);
    houses.push({ guild, b, ...(own ? { out: own } : {}) });
  }
  return houses;
}

function anchorOf(plan: TownPlan, near: GuildDef['near']): { x: number; z: number } | null {
  if (near === 'out') return null;
  if (near === 'edge') { const [x, z] = polyCentroid(plan.market); return { x, z }; }
  const b = buildingOf(plan, near);
  return b ? { x: b.cx, z: b.cz } : null;
}

/** The shields over the guild houses' doors, by building id (colour 0..255; a hidden house has none). */
export function guildSigns(houses: readonly GuildHouse[], plan?: TownPlan, setting?: Pick<SettingModule, 'voyage'>): Map<number, [number, number, number]> {
  const out = new Map<number, [number, number, number]>();
  const rgb = (hex: string) => hexToRgb(parseInt(hex.slice(1), 16)).map((c) => Math.round(c * 255)) as [number, number, number];
  for (const { guild, b, out: away } of houses) if (guild.sign && !guild.hidden && !away) out.set(b.id, rgb(guild.sign));
  // The harbour master's hall on the quay has its shield too: where passage by ship is bought (S4).
  const hall = plan && harbourHall(plan), sign = setting?.voyage?.sign;
  if (hall && sign) out.set(hall.id, rgb(sign));
  return out;
}

/** A harbour town's harbour master's hall on the quay, if it has one. */
export const harbourHall = (plan: TownPlan): TownBuilding | undefined => plan.harbour ? plan.buildings.find((b) => b.trade === 'harbourmaster') : undefined;

/** Each house's first grown-up teaches there (not the temple's keeper; a market trader only if nobody else). */
export function staffGuilds(people: readonly Person[], houses: readonly GuildHouse[]): void {
  for (const { guild, b } of houses) {
    // A homemaker or a hand first; by the market the grown-ups may all keep stalls: then one of them.
    const home = people.filter((x) => x.home === b.id);
    const p = home.find((x) => x.role === 'homemaker' || x.role === 'hand') ?? home.find((x) => x.role === 'trader');
    if (!p) continue;
    p.role = 'trade';
    p.trade = guild.keeper;
    p.work = b.id;
    if (guild.dress && !guild.hidden) p.dress = guild.dress;
  }
}

/** The bard at the inn (D49): one who works there besides the innkeeper, else the innkeeper. */
export function bardOf(people: readonly Person[], plan: TownPlan): Person | null {
  const inn = buildingOf(plan, 'inn');
  if (!inn) return null;
  return people.find((p) => p.work === inn.id && p.role === 'hand') ?? people.find((p) => p.work === inn.id && p.role === 'trade') ?? null;
}

/** The guild a townsperson teaches for (D49), if any: by their trade. */
export function teacherOf(setting: Pick<SettingModule, 'guilds'>, p: Person): GuildDef | null {
  return guildOf(setting, keeperOf(p)) ?? null;
}

/**
 * The hero's dealings with the guilds: when each gave its task (game hours), the hidden houses the bard told
 * of, and the tasks whose thanks (a good deed) were given. Plain data.
 */
export interface GuildBookSave {
  readonly given: Readonly<Record<string, number>>;
  readonly told?: readonly string[];
  readonly thanked?: readonly string[];
}

/** One house in one town, as the book keeps it. */
export const houseIn = (town: string, guild: string): string => `${town}:${guild}`;

export class GuildBook {
  private readonly given = new Map<string, number>();
  private readonly told = new Set<string>();
  private readonly thanked = new Set<string>();

  constructor(saved?: GuildBookSave) {
    for (const k in saved?.given ?? {}) this.given.set(k, saved!.given[k]);
    for (const k of saved?.told ?? []) this.told.add(k);
    for (const k of saved?.thanked ?? []) this.thanked.add(k);
  }

  /** The bard told the way into a hidden house (`houseIn`): it goes on the map. */
  tell(house: string): void { this.told.add(house); }

  /** Whether a house shows on the hero's map: every house does, a hidden one once told of. */
  onMap(town: string, g: GuildDef): boolean { return !g.hidden || this.told.has(houseIn(town, g.keeper)); }

  /** The guild's trainer gives its task now (once). */
  assign(guild: string, hours: number): void {
    if (!this.given.has(guild)) this.given.set(guild, hours);
  }

  /** Whether the task was given. */
  asked(guild: string): boolean { return this.given.has(guild); }

  /** Whether the guild's task is done: a promise kept since it was given (out on the land, or below a house, if it asks so). */
  taskDone(g: GuildDef, log: DecisionLog): boolean {
    const from = this.given.get(g.keeper);
    if (from === undefined) return false;
    for (const d of log) {
      if (d.kind !== 'kept' || d.at < from) continue;
      const p = log.find((x) => x.id === d.promise);
      const dungeon = p && (p.kind === 'dungeon' || p.kind === 'move-in') ? dungeonOf(log, p) : null;
      if (dungeon && (!g.task.out || dungeon.site) && (!g.task.house || !dungeon.site)) return true;
    }
    return false;
  }

  /**
   * The guild's task done and not yet thanked for: true once (the trainer's people think better of the hero
   * for it: a deed counts once, D54), false ever after.
   */
  thank(g: GuildDef, log: DecisionLog): boolean {
    if (this.thanked.has(g.keeper) || !this.taskDone(g, log)) return false;
    this.thanked.add(g.keeper);
    return true;
  }

  bookSave(): GuildBookSave {
    return { given: Object.fromEntries(this.given), ...(this.told.size ? { told: [...this.told] } : {}), ...(this.thanked.size ? { thanked: [...this.thanked] } : {}) };
  }
}

/** The abilities a guild teaches, in its order. */
export function teachingsOf(setting: Pick<SettingModule, 'abilities'>, g: GuildDef): AbilityDef[] {
  return g.teaches.flatMap((id) => { const a = abilityOf(setting, id); return a ? [a] : []; });
}

/** Copper for an ability at this guild: its price at level 1 (a first lesson's, if the guild has one), n^1.5 times that at level n. */
export function abilityPrice(g: GuildDef, a: AbilityDef): number {
  const level = a.level ?? 1;
  return level <= 1 && g.first !== undefined ? g.first : Math.round(g.price * level ** 1.5);
}

/** Why an ability was not taught (null: it was): not taught here, known already, not of its level yet, the guild's task first, no ability point free (D61), the purse. */
export type TeachRefusal = 'not-taught' | 'known' | 'level' | 'task' | 'point' | 'coin' | null;

export function teachRefusal(g: GuildDef, hero: Character, a: AbilityDef, book: GuildBook, log: DecisionLog): TeachRefusal {
  if (!g.teaches.includes(a.id)) return 'not-taught';
  if (hero.knows(a.id)) return 'known';
  if (hero.level < (a.level ?? 1)) return 'level';
  if ((a.level ?? 1) >= g.task.from && !book.taskDone(g, log)) return 'task';
  if (hero.points < 1) return 'point';
  if (hero.coins < abilityPrice(g, a)) return 'coin';
  return null;
}

/** Learn an ability from this guild: the coin and an ability point go (D61), the ability goes onto the action bar. */
export function teach(g: GuildDef, hero: Character, a: AbilityDef, book: GuildBook, log: DecisionLog): TeachRefusal {
  const no = teachRefusal(g, hero, a, book, log);
  if (no) return no;
  hero.coins -= abilityPrice(g, a);
  hero.learn(a.id, 1);
  return null;
}

/**
 * The bard's answer to "where can I learn something?" (D49): a line for each guild house of the town, a hidden
 * one with its way in, which the book now knows (so it goes on the map). `keeperName`: what the house's
 * master is called, if anyone is.
 */
export function bardTells(setting: Pick<SettingModule, 'bard'>, town: { readonly id: string; readonly x: number; readonly z: number }, houses: readonly GuildHouse[], book: GuildBook, keeperName: (keeper: string) => string | null): string[] {
  const bard = setting.bard;
  if (!bard) return [];
  return houses.map(({ guild: g, out }) => {
    if (g.hidden) book.tell(houseIn(town.id, g.keeper));
    const house = cap(g.name), keeper = keeperName(g.keeper) ?? 'the master';
    const values = { house, about: g.about, keeper, way: g.way ?? '', dir: out ? compass(out.x - town.x, out.z - town.z) : '' };
    if (out && bard.tellsOut) return fill(bard.tellsOut, { ...values, house: g.name, keeper: cap(keeper) });
    return fill(g.hidden ? bard.tellsHidden : bard.tells, values);
  });
}

/**
 * Whether a guild's master speaks of their one deed now (C14): the hero is their student (has learned something
 * there), of the level it asks (D58), the deed was never asked, and its gift is not the hero's yet.
 */
export function questDue(g: GuildDef, hero: Character, log: DecisionLog): boolean {
  const q = g.quest;
  return !!q && !questOf(log, g.keeper) && g.teaches.some((id) => hero.learned.has(id)) && hero.level >= q.level && !hero.knows(q.reward);
}

/** A master's deed done (its place kept): their gift is the hero's now (once). What was given, or null. */
export function questGift(setting: Pick<SettingModule, 'guilds'>, log: DecisionLog, id: string, hero: Character): { readonly guild: GuildDef; readonly reward: string } | null {
  const r = questReward(setting, log, id);
  if (!r || hero.knows(r.reward)) return null;
  hero.learn(r.reward);
  return r;
}

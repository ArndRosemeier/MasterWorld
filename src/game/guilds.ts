/**
 * Guild houses (plan 10, D49): where a hero opens a skill and its ranks. Every town of a guild's sizes has
 * its house: a plain house near what the guild names (the smithy, the inn, the edge), whose first grown-up
 * becomes its trainer. A trainer opens a skill at rank 0 and each next rank for coin (D54: nothing rises by
 * use), once the hero's reputation (one for the whole world, game/standing.ts `renown`) is high enough, higher
 * for a dangerous skill; the third rank also asks the guild's task. The task done is a good deed, once. The bard at
 * the inn knows every house. The same for every town, start town or village. Pure.
 */
import { hexToRgb } from '@futuremagic/core';
import { fill } from '../talk/folk';
import { cap } from '../talk/townTalk';
import { compass } from '../vgm/dungeons';
import { questOf, questReward } from '../vgm/quests';
import { houseShape, polyCentroid, signPlace, type TownBuilding, type TownPlan } from '@futuremagic/settlement';
import { skillOf, type AbilityDef, type GuildDef, type SettingModule, type SkillRankDef, type TrainerDef } from '../setting/contract';
import { buildingOf, type Person } from '../sim/people';
import { dungeonOf, type DecisionLog, type RetreatDecision } from '../world/decisions';
import type { Character } from './character';

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
  const homes = plan.buildings.filter((b) => (b.kind === 'house' || b.kind === 'cottage') && !b.trade && b.household >= 2);
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
export function guildSigns(houses: readonly GuildHouse[]): Map<number, [number, number, number]> {
  const out = new Map<number, [number, number, number]>();
  for (const { guild, b, out: away } of houses) if (guild.sign && !guild.hidden && !away) out.set(b.id, hexToRgb(parseInt(guild.sign.slice(1), 16)).map((c) => Math.round(c * 255)) as [number, number, number]);
  return out;
}

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

/** Whether a teacher is a guild house's trainer (who also opens skills and ranks). */
export const isGuild = (t: TrainerDef): t is GuildDef => 'sizes' in t;

/** The guild a skill is opened at (null: none teaches it, it rises freely). */
export function guildFor(setting: Pick<SettingModule, 'guilds'>, skill: string): GuildDef | null {
  return setting.guilds?.find((g) => g.skills.includes(skill)) ?? null;
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

  /** Whether the guild's task is done: a promise kept since it was given (out on the land, if it asks so). */
  taskDone(g: GuildDef, log: DecisionLog): boolean {
    const from = this.given.get(g.keeper);
    if (from === undefined) return false;
    for (const d of log) {
      if (d.kind !== 'kept' || d.at < from) continue;
      const p = log.find((x) => x.id === d.promise);
      const dungeon = p && (p.kind === 'dungeon' || p.kind === 'move-in') ? dungeonOf(log, p) : null;
      if (dungeon && (!g.task.out || dungeon.site)) return true;
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

/** Why a rank was not opened (null: it was). */
export type RankRefusal = 'not-taught' | 'top' | 'task' | 'renown' | 'coin' | null;

/** The next rank of a skill and what it asks (null: it has none, or the hero has them all). */
export function nextRank(setting: Pick<SettingModule, 'skillRanks'>, hero: Character, skill: string): { readonly rank: number; readonly def: SkillRankDef } | null {
  const r = hero.rankOf(skill);
  if (r === null) return null;
  const def = setting.skillRanks?.[r + 1];
  return def ? { rank: r + 1, def } : null;
}

/** Copper this guild asks to open a rank (the opening may be its own price). */
export const rankPrice = (g: GuildDef, next: { readonly rank: number; readonly def: SkillRankDef }): number =>
  next.rank === 0 && g.openPrice !== undefined ? g.openPrice : next.def.price;

/** The reputation a skill's rank asks (D54): the rank's, and more for a dangerous skill. */
export function renownFor(setting: Pick<SettingModule, 'skillRanks' | 'skills'>, skill: string, rank: number): number {
  return (setting.skillRanks?.[rank]?.renown ?? 0) + (skillOf(setting, skill)?.danger ?? 0);
}

/**
 * What stands between the hero and a skill's next rank at this guild (null: nothing). `renown`: the hero's
 * reputation (Standing.renown: the same at every trainer, wherever the deeds were done).
 */
export function rankRefusal(setting: Pick<SettingModule, 'skillRanks' | 'skills'>, g: GuildDef, hero: Character, skill: string, book: GuildBook, log: DecisionLog, renown: number): RankRefusal {
  if (!g.skills.includes(skill)) return 'not-taught';
  const next = nextRank(setting, hero, skill);
  if (!next) return 'top';
  if (next.def.task && !book.taskDone(g, log)) return 'task';
  if (renown < renownFor(setting, skill, next.rank)) return 'renown';
  if (hero.coins < rankPrice(g, next)) return 'coin';
  return null;
}

/** Open a skill's next rank at this guild: the coin goes, lessons may raise the skill to the new rank's top. */
export function openRank(setting: Pick<SettingModule, 'skillRanks' | 'skills' | 'abilities'>, g: GuildDef, hero: Character, skill: string, book: GuildBook, log: DecisionLog, renown: number): RankRefusal {
  const no = rankRefusal(setting, g, hero, skill, book, log, renown);
  if (no) return no;
  const next = nextRank(setting, hero, skill)!;
  hero.coins -= rankPrice(g, next);
  if (next.rank > 0) hero.ranks.set(skill, next.rank);
  else {
    // Opening a school of magic (C3) gives its first spells with it, so the hero can cast at once.
    hero.openSkill(skill);
    for (const a of spellsOf(setting, g)) if (a.skill === skill && (a.level ?? 0) === 0) hero.learn(a.id);
  }
  return null;
}

/** The spells (taught abilities) a magic teacher teaches: its schools', lowest level first, then its others. */
export function spellsOf(setting: Pick<SettingModule, 'abilities'>, g: GuildDef): AbilityDef[] {
  if (!g.spellPrice) return [];
  const own = setting.abilities.filter((a) => a.taught && a.skill && g.skills.includes(a.skill));
  own.sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || g.skills.indexOf(a.skill!) - g.skills.indexOf(b.skill!));
  return [...own, ...setting.abilities.filter((a) => g.abilities?.includes(a.id))];
}

/** Copper for a spell at this teacher. */
export const spellPrice = (g: GuildDef, a: AbilityDef): number => Math.round((g.spellPrice ?? 0) * (1 + (a.level ?? 0) / 10));

/** Why a spell was not taught (null: it was): known already, its school not opened, not yet its level, the purse. */
export type SpellRefusal = 'not-taught' | 'known' | 'closed' | 'unearned' | 'coin' | null;

export function spellRefusal(setting: Pick<SettingModule, 'abilities'>, g: GuildDef, hero: Character, a: AbilityDef): SpellRefusal {
  if (!spellsOf(setting, g).includes(a)) return 'not-taught';
  if (hero.knows(a.id)) return 'known';
  if (a.skill && !hero.opened(a.skill)) return 'closed';
  if (a.skill && Math.floor(hero.skills.get(a.skill) ?? 0) < (a.level ?? 0)) return 'unearned';
  if (hero.coins < spellPrice(g, a)) return 'coin';
  return null;
}

/** Learn a spell from this teacher: the coin goes, the spell goes onto the action bar. */
export function learnSpell(setting: Pick<SettingModule, 'abilities'>, g: GuildDef, hero: Character, a: AbilityDef): SpellRefusal {
  const no = spellRefusal(setting, g, hero, a);
  if (no) return no;
  hero.coins -= spellPrice(g, a);
  hero.learn(a.id);
  return null;
}

/**
 * The bard's answer to "where can I learn a skill?" (D49): a line for each guild house of the town, a hidden
 * one with its way in, which the book now knows (so it goes on the map). `keeperName`: what the house's
 * master is called, if anyone is.
 */
export function bardTells(setting: Pick<SettingModule, 'bard' | 'skills'>, town: { readonly id: string; readonly x: number; readonly z: number }, houses: readonly GuildHouse[], book: GuildBook, keeperName: (keeper: string) => string | null): string[] {
  const bard = setting.bard;
  if (!bard) return [];
  const names = (ids: readonly string[]) => ids.map((id) => skillOf(setting, id)?.name.toLowerCase() ?? id).join(', ');
  return houses.map(({ guild: g, out }) => {
    if (g.hidden) book.tell(houseIn(town.id, g.keeper));
    const house = cap(g.name), keeper = keeperName(g.keeper) ?? 'the master';
    const values = { house, skills: names(g.skills), keeper, way: g.way ?? '', dir: out ? compass(out.x - town.x, out.z - town.z) : '' };
    if (out && bard.tellsOut) return fill(bard.tellsOut, { ...values, house: g.name, keeper: cap(keeper) });
    return fill(g.hidden ? bard.tellsHidden : bard.tells, values);
  });
}

/**
 * Whether a guild's master speaks of their one deed now (C14): the hero is their student (has opened a skill
 * there), their name is good enough (`renown`), the deed was never asked, and its gift is not the hero's yet.
 */
export function questDue(g: GuildDef, hero: Character, renown: number, log: DecisionLog): boolean {
  const q = g.quest;
  return !!q && !questOf(log, g.keeper) && g.skills.some((s) => hero.opened(s)) && renown >= q.renown && !hero.knows(q.reward);
}

/** A master's deed done (its place kept): their gift is the hero's now (once). What was given, or null. */
export function questGift(setting: Pick<SettingModule, 'guilds'>, log: DecisionLog, id: string, hero: Character): { readonly guild: GuildDef; readonly reward: string } | null {
  const r = questReward(setting, log, id);
  if (!r || hero.knows(r.reward)) return null;
  hero.learn(r.reward);
  return r;
}

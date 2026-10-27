/**
 * Guild houses (plan 10, D49): where a hero opens a skill and its ranks. Every town of a guild's sizes has
 * its house: a plain house near what the guild names (the smithy, the inn, the edge), whose first grown-up
 * becomes its trainer. A trainer opens a skill at rank 0, and each next rank once use has raised the skill
 * to the top of the one before (lessons stop short of it), some only after the guild's task or with enough
 * standing. Standing with a guild follows from what the hero did there: ranks opened, its task done. The
 * bard at the inn knows every house. The same for every town, start town or village. Pure.
 */
import { polyCentroid, type TownBuilding, type TownPlan } from '@futuremagic/settlement';
import type { GuildDef, SettingModule, SkillRankDef, TrainerDef } from '../setting/contract';
import { buildingOf, type Person } from '../sim/people';
import { dungeonOf, type DecisionLog } from '../world/decisions';
import type { Character } from './character';

/** One guild's house in a town. */
export interface GuildHouse {
  readonly guild: GuildDef;
  readonly b: TownBuilding;
}

/** Lessons stop this far below a rank's top: the last points of every rank come by use (D49). */
export const EARN = 5;
/** Standing a rank opened and the guild's task done bring (0..100). */
const STANDING_RANK = 4, STANDING_TASK = 15;

/** The guild houses of a town (none in a town too small for any). */
export function guildHouses(plan: TownPlan, size: GuildDef['sizes'][number], setting: Pick<SettingModule, 'guilds'>): GuildHouse[] {
  const taken = new Set<number>(), out: GuildHouse[] = [];
  // Plain homes with somebody grown-up in them.
  const homes = plan.buildings.filter((b) => (b.kind === 'house' || b.kind === 'cottage') && !b.trade && b.household >= 2);
  const [mx, mz] = polyCentroid(plan.market);
  for (const guild of setting.guilds ?? []) {
    if (!guild.sizes.includes(size)) continue;
    const at = anchorOf(plan, guild.near) ?? { x: mx, z: mz };
    const far = guild.near === 'edge' ? -1 : 1;
    const b = homes.filter((h) => !taken.has(h.id)).sort((a, c) => far * (Math.hypot(a.cx - at.x, a.cz - at.z) - Math.hypot(c.cx - at.x, c.cz - at.z)) || a.id - c.id)[0];
    if (!b) continue;
    taken.add(b.id);
    out.push({ guild, b });
  }
  return out;
}

function anchorOf(plan: TownPlan, near: GuildDef['near']): { x: number; z: number } | null {
  if (near === 'edge') { const [x, z] = polyCentroid(plan.market); return { x, z }; }
  const b = buildingOf(plan, near);
  return b ? { x: b.cx, z: b.cz } : null;
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

/** The hero's dealings with the guilds: when each gave its task (game hours), and the hidden houses the bard told of. Plain data. */
export interface GuildBookSave {
  readonly given: Readonly<Record<string, number>>;
  readonly told?: readonly string[];
}

/** One house in one town, as the book keeps it. */
export const houseIn = (town: string, guild: string): string => `${town}:${guild}`;

export class GuildBook {
  private readonly given = new Map<string, number>();
  private readonly told = new Set<string>();

  constructor(saved?: GuildBookSave) {
    for (const k in saved?.given ?? {}) this.given.set(k, saved!.given[k]);
    for (const k of saved?.told ?? []) this.told.add(k);
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

  /** Standing with a guild (0..100): the ranks it opened, and its task done. */
  standing(g: GuildDef, hero: Character, log: DecisionLog): number {
    let n = 0;
    for (const s of g.skills) n += Math.max(0, hero.rankOf(s) ?? 0) + ((hero.rankOf(s) ?? -1) >= 0 ? 1 : 0);
    return Math.min(100, n * STANDING_RANK + (this.taskDone(g, log) ? STANDING_TASK : 0));
  }

  bookSave(): GuildBookSave {
    return { given: Object.fromEntries(this.given), ...(this.told.size ? { told: [...this.told] } : {}) };
  }
}

/** Why a rank was not opened (null: it was). */
export type RankRefusal = 'not-taught' | 'top' | 'unearned' | 'task' | 'standing' | 'coin' | null;

/** The next rank of a skill and what it asks (null: it has none, or the hero has them all). */
export function nextRank(setting: Pick<SettingModule, 'skillRanks'>, hero: Character, skill: string): { readonly rank: number; readonly def: SkillRankDef } | null {
  const r = hero.rankOf(skill);
  if (r === null) return null;
  const def = setting.skillRanks?.[r + 1];
  return def ? { rank: r + 1, def } : null;
}

/** What stands between the hero and a skill's next rank at this guild (null: nothing). */
export function rankRefusal(setting: Pick<SettingModule, 'skillRanks'>, g: GuildDef, hero: Character, skill: string, book: GuildBook, log: DecisionLog): RankRefusal {
  if (!g.skills.includes(skill)) return 'not-taught';
  const next = nextRank(setting, hero, skill);
  if (!next) return 'top';
  // A next rank needs the one before reached: by use, since lessons stop short of its top.
  if (next.rank > 0 && Math.floor(hero.skills.get(skill) ?? 0) < hero.capOf(skill) - 1) return 'unearned';
  if (next.def.task && !book.taskDone(g, log)) return 'task';
  if (next.def.standing && book.standing(g, hero, log) < next.def.standing) return 'standing';
  if (hero.coins < next.def.price) return 'coin';
  return null;
}

/** Open a skill's next rank at this guild: the coin goes, the skill may grow to the new rank's top. */
export function openRank(setting: Pick<SettingModule, 'skillRanks'>, g: GuildDef, hero: Character, skill: string, book: GuildBook, log: DecisionLog): RankRefusal {
  const no = rankRefusal(setting, g, hero, skill, book, log);
  if (no) return no;
  const next = nextRank(setting, hero, skill)!;
  hero.coins -= next.def.price;
  hero.ranks.set(skill, next.rank);
  return null;
}

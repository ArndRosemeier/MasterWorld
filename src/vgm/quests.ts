/**
 * A master's one deed (C14, D52; docs/design/vgm.md): when a guild's master trusts a student enough to speak
 * of what no trainer sells, the VGM makes the place for it, of a kind the guild asks for, and its household
 * is the master's own. It is a promise like a lead (cleared, then told to the household), but what it pays is
 * the master's gift (classic: the Undercroft's bird form), not coin. Pure.
 */
import { guildOf, type GuildDef, type SettingModule } from '../setting/contract';
import type { DecisionLog, DungeonDecision } from '../world/decisions';
import type { Town } from '../world/town';
import { dungeonFor, type DungeonContext } from './dungeons';
import { keptOf } from './leads';

/** The place a guild's master asked for (null: not asked yet). */
export function questOf(log: DecisionLog, keeper: string): DungeonDecision | null {
  for (const d of log) if (d.kind === 'dungeon' && d.quest === keeper) return d;
  return null;
}

/** Who asks, and where: the guild, the master's town, their house (the household who will be told), when. */
export interface QuestAsk {
  readonly guild: GuildDef;
  readonly town: Town;
  readonly building: number;
  readonly hours: number;
}

/** The place for a master's deed (null: the guild has none, it was asked already, or no place fits). */
export function questFor(a: QuestAsk, c: DungeonContext): DungeonDecision | null {
  const q = a.guild.quest;
  if (!q || questOf(c.log, a.guild.keeper)) return null;
  const d = dungeonFor({ purpose: 'lead', town: a.town, kinds: q.kinds }, c);
  return d && { ...d, building: a.building, quest: a.guild.keeper, at: a.hours };
}

/** The guild whose master's deed promise `id` is (null: it is no such deed). */
export function questGuild(setting: Pick<SettingModule, 'guilds'>, log: DecisionLog, id: string): GuildDef | null {
  const d = log.find((x) => x.id === id);
  const guild = d?.kind === 'dungeon' ? guildOf(setting, d.quest) : undefined;
  return guild?.quest ? guild : null;
}

/** The master's gift for promise `id`, once it is kept (null: it is no deed of a master's, or not done yet). */
export function questReward(setting: Pick<SettingModule, 'guilds'>, log: DecisionLog, id: string): { readonly guild: GuildDef; readonly reward: string } | null {
  const guild = questGuild(setting, log, id);
  return guild?.quest && keptOf(log).has(id) ? { guild, reward: guild.quest.reward } : null;
}

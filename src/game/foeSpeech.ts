/**
 * What a band of foes says to the hero (D64): the one who speaks for it (the leader, else the nearest) says each turn of its stance in a
 * short line the setting gives, picked by a seed so the same band does not always say the same thing. Beasts never speak; the
 * mindless have nothing to say. Pure.
 */
import { hash2f } from '@futuremagic/core';
import type { BreakCause, CreatureDef, SettingModule, TalkTurn, WarnTurn } from '../setting/contract';
import { WARNING_STANCES } from '../setting/contract';

/**
 * What one of kind `def` says for a turn of its stance, or as its warning ends in a fight and why (none share a name):
 * a line of the setting's, picked by a seed and a count. Null: nothing, or it does not speak.
 */
export function foeLine(setting: Pick<SettingModule, 'factions'>, def: CreatureDef, what: WarnTurn | BreakCause | TalkTurn, seed: number, n: number): string | null {
  const kind = def.stance?.kind;
  if (!kind || !WARNING_STANCES.includes(kind)) return null;
  const words = setting.factions.words[kind as 'guard'];
  const by = (m: unknown): readonly string[] | undefined => (m as Partial<Record<string, readonly string[]>> | undefined)?.[what];
  const pool = by(words?.turns) ?? by(words?.breaks) ?? by(words?.talk);
  return pool?.length ? pool[Math.floor(hash2f(seed, n, 17) * pool.length) % pool.length] : null;
}

/**
 * What a humanoid foe says (D69, open question 9): one short cry in a bubble as it attacks of its own accord, from its faction's words,
 * picked by a seed so the same camp does not always shout the same thing. Nothing before the fight; beasts and the walking dead say
 * nothing. Pure.
 */
import { hash2f } from '@futuremagic/core';
import type { CreatureDef, SettingModule } from '../setting/contract';

/** The cry of one of kind `def` as it attacks: a line of its faction's, picked by a seed and a count. Null: it says nothing. */
export function foeCry(setting: Pick<SettingModule, 'factions'>, def: CreatureDef, seed: number, n: number): string | null {
  if (def.body.kind !== 'humanoid') return null;
  const pool = setting.factions.cries[def.faction];
  return pool?.length ? pool[Math.floor(hash2f(seed, n, 17) * pool.length) % pool.length] : null;
}

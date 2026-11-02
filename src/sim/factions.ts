/**
 * Who is against whom (D65): every creature and townsperson belongs to a faction, and a constant matrix says how two factions stand
 * (ally, neutral, wary, hostile; the same both ways round, a faction its own ally). Nothing here changes during play: the hero's
 * standing (game/standing.ts) is the only thing that moves. Pure.
 */
import type { CreatureDef, FactionsDef, Hostility, SettingModule } from '../setting/contract';
import type { Person } from './people';

const tables = new WeakMap<FactionsDef, Map<string, Hostility>>();
const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** How faction `a` stands towards `b` (neutral unless the matrix says otherwise; a faction is its own ally). */
export function hostility(setting: Pick<SettingModule, 'factions'>, a: string, b: string): Hostility {
  if (a === b) return 'ally';
  const f = setting.factions;
  let t = tables.get(f);
  if (!t) { t = new Map(f.matrix.map(([x, y, is]) => [key(x, y), is])); tables.set(f, t); }
  return t.get(key(a, b)) ?? 'neutral';
}

/** Are they at odds (hostile)? */
export const opposed = (setting: Pick<SettingModule, 'factions'>, a: string, b: string): boolean => hostility(setting, a, b) === 'hostile';

/** A townsperson's faction: their people's (the town's watch, R6, will be their own). */
export const factionOfPerson = (p: Pick<Person, 'race'>): string => p.race;

/** Every faction of the setting, the peoples first. */
export const factionIds = (setting: Pick<SettingModule, 'peoples' | 'factions'>): string[] => [...setting.peoples.map((p) => p.id), ...setting.factions.others.map((f) => f.id)];

/** The leader of a group (its first member's kind, as the setting's creatures name it). */
export const leadOf = (setting: Pick<SettingModule, 'creatures'>, members: readonly string[]): CreatureDef | undefined => setting.creatures.find((c) => c.id === members[0]);

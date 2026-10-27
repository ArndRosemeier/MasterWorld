/**
 * Encounters (C6b, docs/design/vgm.md 3): who the hero meets together. One definition in the setting
 * (`EncounterDef`) and one generator here: `encounterFor` picks the encounter that fits a need, a place and a
 * danger (D29: the place's, never the hero's), keeping away from what the hero met lately (plan 8.1), and
 * fills it with its members. The wild's groups (vgm/wild.ts) and the story events' bands (vgm/events.ts)
 * come from it; a dungeon's dwellers name theirs in the lore. Pure and seeded.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import type { EncounterDef, EncounterWhere, SettingModule } from '../setting/contract';
import { groupDanger } from '../sim/wild';

export interface EncounterAsk {
  readonly setting: Pick<SettingModule, 'encounters' | 'creatures'>;
  readonly seed: number;
  /** The need it should meet (none: any). */
  readonly need?: EncounterDef['need'];
  /** Where it is met (none: anywhere). */
  readonly where?: EncounterWhere;
  /** The danger it should come near (the place's, D29; none: any). */
  readonly danger?: number;
  /** Only among these encounters (by id): a caller that knows who it wants (a place's dwellers, the wild's raiders). */
  readonly of?: readonly string[];
  /** Met lately (by id, the latest last): kept away from while another fits. */
  readonly recent?: readonly string[];
  /** How many, at least and at most, within the encounter's own count (a story event's band). */
  readonly count?: readonly [number, number];
}

/** An encounter picked and filled: its id and who is in it (creature ids, the leader first). */
export interface Met {
  readonly encounter: string;
  readonly members: readonly string[];
}

/** How far off its danger may be and still fit, as a share of the danger asked. */
const FIT = 0.6;

/** The encounter that fits best, filled (null: none fits where and what was asked). */
export function encounterFor(a: EncounterAsk): Met | null {
  const fits = a.setting.encounters.filter((e) => (!a.where || e.where.includes(a.where)) && (!a.need || e.need === a.need) && (!a.of || a.of.includes(e.id)));
  if (!fits.length) return null;
  const fitOf = (e: EncounterDef, i: number): number => {
    const off = a.danger === undefined ? 0 : Math.abs(typicalDanger(a.setting, e) - a.danger) / Math.max(1, a.danger);
    // Met lately: the latest weighs most, three meetings back nothing.
    const late = a.recent?.lastIndexOf(e.id) ?? -1, ago = late < 0 ? Infinity : a.recent!.length - 1 - late;
    return off + (off > FIT ? 4 : 0) + Math.max(0, 3 - ago) + hash2f(a.seed, i, 17) * 0.25;
  };
  const best = fits.map((e, i) => ({ e, s: fitOf(e, i) })).sort((x, y) => x.s - y.s)[0].e;
  return { encounter: best.id, members: membersOf(best, a.seed, a.count) };
}

/** Who is in an encounter: its count (within `count` if given), the leader first, the others at random. */
export function membersOf(e: EncounterDef, seed: number, count?: readonly [number, number]): string[] {
  const rng = new Rng(deriveSeed(seed, 'members'));
  const lo = Math.max(e.count[0], count?.[0] ?? 0), hi = Math.max(lo, Math.min(e.count[1], count?.[1] ?? Infinity));
  const n = rng.int(lo, hi), c = e.creatures;
  return Array.from({ length: n }, (_, i) => (i === 0 ? c[0] : c[Math.min(c.length - 1, rng.int(0, c.length - 1))]));
}

/** An encounter's danger at its middling size, its leader and one of each other kind. */
export function typicalDanger(setting: Pick<SettingModule, 'creatures'>, e: EncounterDef): number {
  const n = Math.round((e.count[0] + e.count[1]) / 2);
  return groupDanger(Array.from({ length: n }, (_, i) => e.creatures[i % e.creatures.length]), setting.creatures);
}

/** The setting's encounter of this id. */
export function encounterOf(setting: Pick<SettingModule, 'encounters'>, id: string): EncounterDef | undefined {
  return setting.encounters.find((e) => e.id === id);
}

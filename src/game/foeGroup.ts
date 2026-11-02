/**
 * The foes of a fight as the group panel lists them (app/fightHud.ts): everyone hunting the hero, and the hero's
 * target even when it does not hunt yet, each with its share of health and its distance. Pure.
 */
import type { Creature } from '../sim/creatures';

/** The panel holds this many rows; the rest are counted. */
export const GROUP_MAX = 8;

export interface FoeRow {
  readonly creature: Creature;
  /** Health left, 0..1. */
  readonly frac: number;
  /** Metres from the hero. */
  readonly dist: number;
  readonly target: boolean;
}

export interface FoeGroup {
  readonly rows: readonly FoeRow[];
  /** Foes past the panel's rows. */
  readonly more: number;
}

/**
 * The group: rows in the order of the creatures' ids (it does not jump about as they move), the target always among
 * them; when there are more than `max`, the target and the nearest stay and the rest are counted in `more`.
 */
export function foeGroup(fighting: readonly Creature[], target: Creature | null, at: { readonly x: number; readonly y: number; readonly z: number }, max = GROUP_MAX): FoeGroup {
  const all = fighting.filter((c) => c.state !== 'dead');
  if (target && target.state !== 'dead' && !all.includes(target)) all.push(target);
  const rows: FoeRow[] = all.map((creature) => ({
    creature,
    frac: Math.min(1, Math.max(0, creature.health / Math.max(1, creature.def.health))),
    dist: Math.hypot(creature.x - at.x, creature.y - at.y, creature.z - at.z),
    target: creature === target,
  }));
  let shown = rows;
  if (rows.length > max) shown = [...rows].sort((a, b) => Number(b.target) - Number(a.target) || a.dist - b.dist).slice(0, max);
  shown = [...shown].sort((a, b) => a.creature.id - b.creature.id);
  return { rows: shown, more: rows.length - shown.length };
}

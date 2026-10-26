/**
 * The Builder keeps adventures coming (plan 4.1, 4.2, 11.3): there are always a few open promises in the
 * world, so after one is kept there is the next lead to hear. When fewer than `min` promises are open the
 * Builder makes one; when the Director's Purpose need is overdue it makes one more, up to `max`. A cleared
 * dungeon can be moved into again after a while (plan 8.1, repopulation), which is a promise too.
 * Everything it decides goes into the decision log, so a save replays it. Pure.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import type { Decision, DecisionLog, DungeonDecision, KeptDecision, MoveInDecision } from '../world/decisions';
import { sketchCellar } from '../world/dungeon/cellar';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { loreOf, placeOf, promiseBarrow, promiseCellar } from './dungeons';

export const LEADS = {
  /** Open promises the world always has. */
  min: 2,
  /** Open promises at most (more when Purpose is overdue, up to this). */
  max: 3,
  /** Game hours between two new promises. */
  gap: 0.5,
  /** Game hours a kept dungeon stays empty before something may move in. */
  settle: 36,
} as const;

/** Promises made (dungeons and move-ins), oldest first. */
export function promisesOf(log: DecisionLog): (DungeonDecision | MoveInDecision)[] {
  return log.filter((d): d is DungeonDecision | MoveInDecision => d.kind === 'dungeon' || d.kind === 'move-in');
}

/** Ids of the promises kept. */
export function keptOf(log: DecisionLog): Set<string> {
  return new Set(log.flatMap((d) => (d.kind === 'kept' ? [d.promise] : [])));
}

/** Promises not kept yet. */
export function openPromises(log: DecisionLog): (DungeonDecision | MoveInDecision)[] {
  const kept = keptOf(log);
  return promisesOf(log).filter((p) => !kept.has(p.id));
}

/** The promise kept, for the log; null if it already was. */
export function keepPromise(log: DecisionLog, promise: string, at: number): KeptDecision | null {
  if (keptOf(log).has(promise)) return null;
  const n = log.filter((d) => d.kind === 'kept').length + 1;
  return { kind: 'kept', id: `kept-${n}`, promise, at };
}

/** Who lives in a dungeon now: its latest move-in, if any. */
export function occupationOf(log: DecisionLog, dungeon: string): MoveInDecision | null {
  let last: MoveInDecision | null = null;
  for (const d of log) if (d.kind === 'move-in' && d.dungeon === dungeon) last = d;
  return last;
}

export interface LeadsContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  /** Where the game started (danger grows with distance from it, D29). */
  readonly home: { readonly x: number; readonly z: number };
  /** Game hours since the world began. */
  readonly hours: number;
  /** The Director's Purpose need is overdue (no goal for a while). */
  readonly purposeOverdue: boolean;
  /** The hero is down in this dungeon now (nothing moves in under their feet). */
  readonly inside: (dungeon: string) => boolean;
  readonly dungeons: SettingModule['dungeons'];
  /** The land (barrows are promised on it); none: only cellars. */
  readonly terrain?: Terrain;
  /** Ground a barrow keeps away from (the wild's territories). */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
}

/** Share of new places that are barrows, when the setting has them and none is open. */
const BARROWS = 0.4;

/** The Builder's next promise, if one is due now. */
export function nextPromise(c: LeadsContext): Decision | null {
  const open = openPromises(c.log).length;
  if (open >= LEADS.max || (open >= LEADS.min && !c.purposeOverdue)) return null;
  const last = Math.max(-Infinity, ...promisesOf(c.log).map((p) => p.at ?? -Infinity));
  if (c.hours - last < LEADS.gap) return null;
  const n = promisesOf(c.log).length;
  const s = deriveSeed(c.seed, 'vgm', 'lead', n);
  const moved = moveInto(c, s);
  // Rather a new place; a cleared one is moved into now and then (or when no place is left). Now and
  // then the new place is a barrow out on the land (one open at a time).
  const town = c.towns[0];
  const barrowOpen = openPromises(c.log).some((p) => p.kind === 'dungeon' && p.template === 'barrow');
  const barrow = town && c.terrain && c.dungeons.barrow && !barrowOpen && hash2f(s, 6, 2) < BARROWS ? promiseBarrow(c.seed, c.terrain, town, c.log, c.home, c.avoid) : null;
  const fresh = barrow ?? (town ? promiseCellar(c.seed, town, c.log, c.home) : null);
  if (moved && (!fresh || hash2f(s, 5, 1) < 0.4)) return moved;
  return fresh ? { ...fresh, at: c.hours } : null;
}

/** New dwellers for a dungeon kept long enough ago, if any fits. */
function moveInto(c: LeadsContext, s: number): MoveInDecision | null {
  const kept = c.log.filter((d): d is KeptDecision => d.kind === 'kept');
  const open = new Set(openPromises(c.log).map((p) => (p.kind === 'move-in' ? p.dungeon : p.id)));
  const ready: { d: DungeonDecision; was: string }[] = [];
  for (const d of c.log) {
    if (d.kind !== 'dungeon' || open.has(d.id) || c.inside(d.id)) continue;
    const now = occupationOf(c.log, d.id);
    const k = kept.find((x) => x.promise === (now?.id ?? d.id));
    if (!k || c.hours - k.at < LEADS.settle) continue;
    const house = placeOf(d, c.towns);
    if (!house) continue;
    const sketch = sketchCellar(d, house, loreOf(c, d.template), now ?? undefined);
    ready.push({ d, was: sketch.dweller.id });
  }
  if (!ready.length) return null;
  const pick = ready[Math.floor(hash2f(s, 2, 7) * ready.length)];
  const house = placeOf(pick.d, c.towns)!, lore = loreOf(c, pick.d.template);
  const layers = sketchCellar(pick.d, house, lore).history.map((h) => h.def.id);
  const fits = lore.dwellers.filter((w) => w.id !== pick.was && w.danger <= (pick.d.danger ?? Infinity) && (!w.with || w.with.some((x) => layers.includes(x))));
  if (!fits.length) return null;
  const dweller = fits[Math.floor(hash2f(s, 4, 3) * fits.length)];
  const n = c.log.filter((d) => d.kind === 'move-in').length + 1;
  return { kind: 'move-in', id: `move-in-${n}`, dungeon: pick.d.id, dweller: dweller.id, seed: deriveSeed(s, 'move-in'), at: c.hours };
}

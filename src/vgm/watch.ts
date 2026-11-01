/**
 * A night watch (D62, phase Q): a household whose place's dwellers come out by night asks the hero to stand by
 * their door through the night. The threat comes or it doesn't (the ask says which, seeded when it was given):
 * if it comes, a band of the dwellers comes out of the dark towards the door once the hero stands watch there
 * (`nightWatchFor`, a Builder turn tool); beaten, the watch is done. If it doesn't, the night watched through
 * does it (`NightWatch`). Only the watch counts: clearing their place is not keeping the watch. Pure, seeded.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import type { DecisionLog, DungeonDecision, WildDecision } from '../world/decisions';
import { townById, type Town } from '../world/town';
import { askDefOf } from './asks';
import { encounterFor } from './encounters';
import { openPromises } from './leads';

/** How far from the door a band that comes starts out (m), and how wide it roams (m: the door within it). */
const COMES_FROM = 40, ROAMS = 46;

/** The open promises that ask for a night watch. */
export function watchesOpen(log: DecisionLog): DungeonDecision[] {
  const open = new Set(openPromises(log).map((o) => o.id));
  return log.filter((d): d is DungeonDecision => d.kind === 'dungeon' && d.ask?.verb === 'watch' && open.has(d.id));
}

/** The household's door a watch is kept at (world xz); null: its town or house is not known. */
export function watchDoor(towns: readonly Town[], d: DungeonDecision): { readonly x: number; readonly z: number } | null {
  const b = townById(towns, d.town)?.plan.buildings[d.building];
  return b ? { x: b.door[0], z: b.door[1] } : null;
}

/** Is game hour `hours` in the night's watch, `[from, to)` (to past midnight as 24 and more)? */
export function inWatch(hours: number, w: { readonly hours: readonly [number, number] }): boolean {
  const h = ((hours % 24) + 24) % 24;
  return (h >= w.hours[0] && h < w.hours[1]) || (h + 24 >= w.hours[0] && h + 24 < w.hours[1]);
}

/** What a watch asks of the Builder's turn: the log, the towns, the hour, where the hero is, the setting. */
export interface WatchContext {
  readonly seed: number;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  readonly hours: number;
  readonly hero?: { readonly x: number; readonly z: number };
  readonly setting: Pick<SettingModule, 'asks' | 'encounters' | 'creatures'>;
}

/** The band that came on watch `id`, if one has. */
export function bandOf(log: DecisionLog, id: string): WildDecision | null {
  return log.find((d): d is WildDecision => d.kind === 'wild' && d.watch === id) ?? null;
}

/**
 * The hero stands watch at a household's door in the night's hours, and the threat comes: a band of the place's
 * dwellers out of the dark, starting off on the side towards their place (or away from the town), roaming wide
 * enough to reach the door. Once a watch. Null: no watch kept now, or nothing comes to this one.
 */
export function nightWatchFor(c: WatchContext): WildDecision | null {
  if (!c.hero) return null;
  for (const d of watchesOpen(c.log)) {
    const w = askDefOf(c.setting, d.ask)?.watch, door = watchDoor(c.towns, d);
    if (!w || !door || !d.ask?.comes || !d.ask.band || bandOf(c.log, d.id)) continue;
    if (!inWatch(c.hours, w) || Math.hypot(c.hero.x - door.x, c.hero.z - door.z) > w.near) continue;
    const s = deriveSeed(c.seed, 'watch', d.id);
    const met = encounterFor({ setting: c.setting, seed: s, of: [d.ask.band] });
    if (!met) continue;
    const town = townById(c.towns, d.town)!;
    const from = d.site ?? { x: door.x * 2 - town.decision.x, z: door.z * 2 - town.decision.z };
    const a = Math.atan2(from.z - door.z, from.x - door.x) + new Rng(s).range(-0.4, 0.4);
    const x = door.x + Math.cos(a) * COMES_FROM, z = door.z + Math.sin(a) * COMES_FROM;
    const n = c.log.filter((x) => x.kind === 'wild' && x.watch).length + 1;
    return { kind: 'wild', id: `watch-${n}`, town: d.town, group: 'watch', situation: 'night-watch', watch: d.id, encounter: met.encounter, members: met.members, x: (x + door.x) / 2, z: (z + door.z) / 2, r: ROAMS / 2 + 4, seed: s, at: c.hours };
  }
  return null;
}

/**
 * The nights watched through where nothing came (the game keeps it while it plays): each watch the hero stands at
 * from its first hour to the end of its hours, leaving the door no farther than twice `near` (a step round the house is still
 * watching). A watch whose band comes is done when the band is beaten instead.
 */
export class NightWatch {
  /** When the hero began each watch (game hours), by promise id. */
  private readonly since = new Map<string, number>();

  /** The hero at `hero` at game hour `hours`: the watches watched through just now (promise ids). */
  step(c: WatchContext): string[] {
    const out: string[] = [];
    for (const d of watchesOpen(c.log)) {
      const w = askDefOf(c.setting, d.ask)?.watch, door = watchDoor(c.towns, d);
      if (!w || !door || d.ask?.comes) continue;
      const off = c.hero ? Math.hypot(c.hero.x - door.x, c.hero.z - door.z) : Infinity;
      const began = this.since.get(d.id);
      if (began === undefined) {
        // A watch begins in its first hour: coming at three in the morning is not watching the night.
        if (inWatch(c.hours, { hours: [w.hours[0], w.hours[0] + 1] }) && off <= w.near) this.since.set(d.id, c.hours);
        continue;
      }
      if (off > w.near * 2) { this.since.delete(d.id); continue; }
      // Kept from when the hero came to the end of its hours.
      const start = ((began % 24) + 24) % 24;
      if (c.hours - began >= w.hours[1] - start) { this.since.delete(d.id); out.push(d.id); }
    }
    return out;
  }
}

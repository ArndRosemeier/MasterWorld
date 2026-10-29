/**
 * People a map mark points at stay where it is (Arnd 2026-10-29): the journal marks a building's door (the inn
 * at the start, a house with trouble in its cellar), and whoever one is sent there to find keeps to that building
 * while awake instead of going about the town, so they are there when the hero comes. Pure.
 */
import type { TownPlan } from '@futuremagic/settlement';
import type { Person } from './people';

/** A mark on the map, and (if known) who is to be found there (a cellar's household). */
export interface MapMark {
  readonly x: number;
  readonly z: number;
  readonly who?: readonly number[];
}

/** A mark this close to a building's door is that building's (m). */
const AT_DOOR = 1.5;

/**
 * Who keeps to which building: by person id, the building's index. For a mark at a door: the people named
 * (`who`, those of them who live or work there), else whoever works the trade there (the innkeeper, the smith, a temple's keeper).
 */
export function keptAt(plan: TownPlan, people: readonly Person[], marks: readonly MapMark[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of marks) {
    let best = -1, bd = AT_DOOR;
    for (const b of plan.buildings) {
      const d = Math.hypot(b.door[0] - m.x, b.door[1] - m.z);
      if (d <= bd) { bd = d; best = b.id; }
    }
    if (best < 0) continue;
    // Only those who live or work there (one told of the trouble elsewhere is not sent to wait in that house).
    const named = people.filter((p) => m.who?.includes(p.id) && (p.home === best || p.work === best));
    if (!named.length) named.push(...people.filter((p) => p.work === best && (p.role === 'trade' || p.role === 'keeper')));
    for (const p of named) if (!out.has(p.id)) out.set(p.id, best);
  }
  return out;
}

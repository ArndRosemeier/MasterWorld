/**
 * Places the hero has noticed (D66, K9; Arnd 2026-11-02: "the character subconsciously notices it and that is what the minimap displays"):
 * a fixed place the VGM put on the land (a cave, a barrow, a tower, a sight, a strand's wreck) that the hero has had in line of sight within
 * the setting's noticing range is marked on the minimap and the map, with no bubble, note or sign. Hidden places (a find by the way, a wreck
 * on the sea bed, a house under a town) are never listed, so they stay unmarked until the hero comes upon them. The ids are saved. Pure.
 */
import type { NoticingDef } from '../setting/contract';
import { seesOver } from '../world/sight';
import type { DecisionLog } from '../world/decisions';

/** A place that can be noticed. */
export interface NoticeSpot {
  /** The decision's id. */
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** The map's short name for it ("cave", "barrow", "standing stones"). */
  readonly what: string;
}

const xz = (p: { readonly x: number; readonly z: number }): { x: number; z: number } => ({ x: p.x, z: p.z });

/** The fixed places on the land in the log that the hero may notice: a dungeon's site out on the land, and a sight (not a find, not on the sea bed). */
export function noticeable(log: DecisionLog): NoticeSpot[] {
  const out: NoticeSpot[] = [];
  for (const d of log) {
    if (d.kind === 'dungeon' && d.site) out.push({ id: d.id, ...xz(d.site), what: d.template.replace(/-/g, ' ') });
    else if (d.kind === 'sight' && d.need !== 'reward' && !d.sea) out.push({ id: d.id, x: d.x, z: d.z, what: d.sight.replace(/-/g, ' ') });
  }
  return out;
}

export class Noticed {
  private readonly ids = new Set<string>();
  /** Grows by one whenever a place is noticed (the map and minimap redraw their marks then). */
  version = 0;

  constructor(saved?: readonly string[]) {
    for (const id of saved ?? []) this.ids.add(id);
  }

  noticedAlready(id: string): boolean { return this.ids.has(id); }

  /** The spots among `spots` that have been noticed. */
  of<T extends { readonly id: string }>(spots: readonly T[]): T[] { return spots.filter((s) => this.ids.has(s.id)); }

  /**
   * The hero at (x, y, z) looks: every spot in line of sight within the range (a fifth of it in the dark, `daylight` 0..1) is noticed.
   * `height`: the ground. The spots newly noticed.
   */
  glance(hero: { readonly x: number; readonly y: number; readonly z: number }, spots: readonly NoticeSpot[], height: (x: number, z: number) => number, daylight: number, n: NoticingDef): NoticeSpot[] {
    const range = n.range * (n.night + (1 - n.night) * Math.max(0, Math.min(1, daylight))), fresh: NoticeSpot[] = [];
    for (const s of spots) {
      if (this.ids.has(s.id) || Math.hypot(s.x - hero.x, s.z - hero.z) > range) continue;
      if (!seesOver(height, hero.x, hero.y + n.eye, hero.z, s.x, height(s.x, s.z) + n.face, s.z)) continue;
      this.ids.add(s.id); this.version++; fresh.push(s);
    }
    return fresh;
  }

  keep(): string[] { return [...this.ids]; }
}

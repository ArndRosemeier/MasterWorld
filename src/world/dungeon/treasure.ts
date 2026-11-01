/**
 * What a cellar holds and how dangerous it is (plan 4.1, 8, D29): its danger is fixed when it is
 * outlined, from who lives there, never from the player. Its treasure lies in the chests that stand in
 * it and in the dwellers' hoard in their lair. Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { CreatureDef } from '../../setting/contract';
import type { Cellar } from './cellar';

export interface Hoard {
  /** Index within the cellar's hoards (saves name the opened ones by it). */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly room: number;
  /** Treasure table. */
  readonly table: string;
  /** Danger the find is rolled at. */
  readonly danger: number;
  readonly seed: number;
  /** As the note calls it. */
  readonly name: string;
  /** Stands on a prop (a chest), or is the lair's heap. */
  readonly prop: boolean;
  /** Where one kneels to open it (x, z): a chest's front, towards the room (a prop's yaw points to its wall); none for a heap. */
  readonly front?: readonly [number, number];
}

/** One kneels this far from a chest's middle, before its front (m): half its depth and a body's. */
const FRONT = 0.75;

/** Danger of a cellar: its strongest dweller, more for every other one that would join the fight. */
export function cellarDanger(c: Cellar, defs: readonly CreatureDef[]): number {
  const ds = c.spawns.map((s) => defs.find((d) => d.id === s.creature)?.danger ?? 0).sort((a, b) => b - a);
  if (!ds.length) return 0;
  return Math.round((ds[0] + ds.slice(1).reduce((a, d) => a + d * 0.25, 0)) * 10) / 10;
}

/** The cellar's chests and the lair's hoard. */
export function hoardsOf(c: Cellar, defs: readonly CreatureDef[]): Hoard[] {
  // An empty place (a sight) keeps what an older people left: as rich as the land's danger there.
  const danger = c.dweller.creatures.length ? cellarDanger(c, defs) : (c.decision.danger ?? 18) * 0.8;
  const out: Hoard[] = [];
  for (const p of c.props) {
    if (p.kind !== 'chest') continue;
    out.push({ id: out.length, x: p.x, y: p.y, z: p.z, room: p.room, table: 'cellar-chest', danger: danger * 0.7, seed: deriveSeed(c.decision.seed, 'hoard', out.length), name: 'a chest', prop: true, front: [p.x - Math.sin(p.yaw) * FRONT, p.z - Math.cos(p.yaw) * FRONT] });
  }
  const r = c.layout.rooms[c.graph.goal], { cell, storey } = c.layout.scale, home = c.formed?.homes[c.graph.goal];
  out.push({
    id: out.length, x: home ? home.x : (r.x + r.w / 2) * cell, y: home ? home.y : r.level * storey, z: home ? home.z : (r.z + r.d / 2) * cell, room: r.id, table: 'lair', danger,
    // New dwellers gather a hoard of their own.
    seed: deriveSeed(c.occupation?.seed ?? c.decision.seed, 'hoard', out.length), name: !c.dweller.creatures.length ? 'what was left here' : `the ${c.dweller.id === 'rats' ? 'nest' : 'hoard'}`, prop: false,
  });
  return out;
}

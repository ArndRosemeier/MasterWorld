/**
 * Wrecks (S8, plan 13): Reward's answer at sea. When a find is overdue and the hero is by the sea (on the shore, in
 * the water, aboard), the VGM puts a ship gone down off the coast near them: she lies on the bed some 6 to 16 m down,
 * on her side, her hold broken open and a sea chest still in it (the setting's sea sight, its `loot`). It is a sight
 * of the log like any find: the hero comes upon it by diving down to it (breath, a spell, a draught or the otter),
 * and its chest is theirs. Pure, seeded.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SightDecision } from '../world/decisions';
import type { NeedContext } from './answers';
import { sightsOf } from './answers';
import { ringSpot, spiralFind } from '../world/spiral';

/** How far from the hero (m) a wreck may lie, and how deep its bed (m under the sea's level). */
const RING: readonly [number, number] = [50, 450];
const DEPTH: readonly [number, number] = [6, 16];
/** Wrecks keep this far apart (m), and this far from a harbour town's middle (out of the way of its moorings). */
const APART = 1500, OFF_HARBOUR = 450;
/** Her bed is level enough when it rises or falls no more than this (m) over her length either way. */
const BED_LEVEL = 3.5;
/** Spots tried round the hero. */
const TRIES = 64;
/** A ship's length on the bed (m), about. */
const HULL = 28;

/** The VGM's wreck near the hero, or null (no sea sight in the setting, the hero not by the sea, one near already). */
export function wreckFor(c: NeedContext): SightDecision | null {
  const def = (c.setting.sights ?? []).find((d) => d.sea && (d.need ?? 'discovery') === 'reward');
  if (!def) return null;
  const past = sightsOf(c.log);
  if (past.some((d) => d.sea && Math.hypot(d.x - c.hero.x, d.z - c.hero.z) < APART)) return null;
  const n = past.length + 1, s = deriveSeed(c.seed, 'sight', n), t = c.terrain;
  const harbours = c.towns.filter((w) => w.decision.harbour);
  let best: { x: number; z: number; yaw: number; d: number } | null = null;
  for (let k = 0; k < TRIES; k++) {
    const { x, z, d } = ringSpot(c.hero, RING, s, k), bed = -t.height(x, z);
    if (bed < DEPTH[0] || bed > DEPTH[1] || (best && d >= best.d)) continue;
    if (harbours.some((w) => Math.hypot(w.decision.x - x, w.decision.z - z) < OFF_HARBOUR)) continue;
    // Lying along a level stretch of the bed.
    const yaw = hash2f(s, k, 3) * Math.PI * 2, ux = Math.sin(yaw) * HULL / 2, uz = Math.cos(yaw) * HULL / 2;
    if (Math.abs(t.height(x + ux, z + uz) - t.height(x - ux, z - uz)) > BED_LEVEL || -t.height(x + ux, z + uz) < DEPTH[0] - 1 || -t.height(x - ux, z - uz) < DEPTH[0] - 1) continue;
    best = { x, z, yaw, d };
  }
  if (!best) return null;
  return { kind: 'sight', id: `sight-${n}`, sight: def.id, need: 'reward', sea: true, x: best.x, z: best.z, yaw: best.yaw, seed: s, at: c.hours };
}

/**
 * Open water off a town (for looking at a wreck: the `wreck` shot, tests): the nearest spot from 600 m out (past its
 * harbour) in 6 to 12 m of water; null if there is none within some 3 km.
 */
export function offTheCoast(t: Pick<NeedContext['terrain'], 'height'>, at: { readonly x: number; readonly z: number }): { x: number; z: number } | null {
  return spiralFind(at.x, at.z, (x, z) => (t.height(x, z) < -6 && t.height(x, z) > -12 ? { x, z } : null), 600, 100, 60, 2500);
}

/**
 * Wrecks (S8, plan 13): Reward's answer at sea. When a find is overdue and the hero is by the sea (on the shore, in
 * the water, aboard), the VGM puts a ship gone down off the coast near them: she lies on the bed some 9 to 16 m down (her masts, laid over, stay under the water),
 * on her side, her hold broken open and a sea chest still in it (the setting's sea sight, its `loot`). It is a sight
 * of the log like any find: the hero comes upon it by diving down to it (breath, a spell, a draught or the otter),
 * and its chest is theirs. A hero walking on the land by the sea finds instead a boat the sea threw up on the strand,
 * broken on her side, her casks and sea chest in the wrack round her (`washedUpFor`, S9). Pure, seeded.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { SightDecision } from '../world/decisions';
import type { NeedContext } from './answers';
import { sightsOf } from './answers';
import { ringSpot, spiralFind } from '../world/spiral';
import { harbourTowns } from '../world/town';
import { seaWithin } from '../world/coast';

/** How far from the hero (m) a wreck may lie, and how deep its bed (m under the sea's level). */
const RING: readonly [number, number] = [50, 450];
const DEPTH: readonly [number, number] = [9, 16];
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
  const harbours = harbourTowns(c.towns);
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

/** How far from the hero (m) a wreck washed up lies; how high over the sea its strand is (m); how near the sea (m). */
const BEACHED: readonly [number, number] = [40, 350];
const STRAND: readonly [number, number] = [0.3, 2.5];
const SEA_BY = 25;
/** Wrecks washed up keep this far apart (m), and this far from a harbour town's middle. */
const BEACHED_APART = 1200, BEACHED_OFF_HARBOUR = 350;
/** The hero is by the sea on ground at most this high over it (m) with the sea within HERO_SEA (m). */
const HERO_LOW = 6, HERO_SEA = 60;

/**
 * Reward's answer to a hero on the land by the sea (S9): a boat the sea threw up on a strand near them, broken on her
 * side, her casks and sea chest in the wrack (the setting's strand sight, its `loot`). Null: no strand sight in the
 * setting, the hero in the water or far from a strand, one near already.
 */
export function washedUpFor(c: NeedContext): SightDecision | null {
  const def = (c.setting.sights ?? []).find((d) => d.strand && (d.need ?? 'discovery') === 'reward');
  const t = c.terrain, here = t.height(c.hero.x, c.hero.z);
  // Only to a hero walking by the sea: on low ground with the sea near.
  if (!def || here <= 0 || here > HERO_LOW || !seaWithin(t, c.hero.x, c.hero.z, HERO_SEA)) return null;
  const past = sightsOf(c.log);
  if (past.some((d) => d.strand && Math.hypot(d.x - c.hero.x, d.z - c.hero.z) < BEACHED_APART)) return null;
  const n = past.length + 1, s = deriveSeed(c.seed, 'sight', n), harbours = harbourTowns(c.towns);
  let best: { x: number; z: number; yaw: number; d: number } | null = null;
  for (let k = 0; k < TRIES; k++) {
    const { x, z, d } = ringSpot(c.hero, BEACHED, s, k), h = t.height(x, z);
    if (h < STRAND[0] || h > STRAND[1] || t.waterDepth(x, z, h) > 0 || (best && d >= best.d)) continue;
    if (harbours.some((w) => Math.hypot(w.decision.x - x, w.decision.z - z) < BEACHED_OFF_HARBOUR) || t.steepness(x, z, 4, h) > 0.25) continue;
    // Her bow along the strand: square to the way the sea lies.
    const sea = seaWithin(t, x, z, SEA_BY);
    if (!sea) continue;
    best = { x, z, yaw: Math.atan2(sea[1], sea[0]) + Math.PI / 2, d };
  }
  if (!best) return null;
  return { kind: 'sight', id: `sight-${n}`, sight: def.id, need: 'reward', strand: true, x: best.x, z: best.z, yaw: best.yaw, seed: s, at: c.hours };
}


/**
 * Open water off a town (for looking at a wreck: the `wreck` shot, tests): the nearest spot from 600 m out (past its
 * harbour) in 6 to 12 m of water; null if there is none within some 3 km.
 */
export function offTheCoast(t: Pick<NeedContext['terrain'], 'height'>, at: { readonly x: number; readonly z: number }): { x: number; z: number } | null {
  return spiralFind(at.x, at.z, (x, z) => (t.height(x, z) < -6 && t.height(x, z) > -12 ? { x, z } : null), 600, 100, 60, 2500);
}

import { hash2f } from '@futuremagic/core';

/**
 * A walk out from a point along a spiral, for finding the nearest spot that passes a test (shots and checks).
 * Turns `gap` metres apart, a step every `step` metres, starting `r0` out, at most `steps` steps.
 */
export function spiralFind<T>(x: number, z: number, test: (px: number, pz: number) => T | null, r0: number, gap: number, step: number, steps: number): T | null {
  for (let a = 0, s = 0; s < steps; s++) {
    const r = r0 + (a * gap) / (2 * Math.PI), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    a += step / r;
    const hit = test(px, pz);
    if (hit !== null) return hit;
  }
  return null;
}

/** Things nearest (x, z) first, as a new list. */
export function nearestFirst<T extends { readonly x: number; readonly z: number }>(items: readonly T[], x: number, z: number): T[] {
  return [...items].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}

/** The `k`th seeded spot (seed `s`) on a ring round `at`, `ring` metres out (least, most): where and how far out. */
export function ringSpot(at: { readonly x: number; readonly z: number }, ring: readonly [number, number], s: number, k: number): { x: number; z: number; d: number } {
  const d = ring[0] + (ring[1] - ring[0]) * hash2f(s, k, 1), a = hash2f(s, k, 2) * Math.PI * 2;
  return { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d, d };
}

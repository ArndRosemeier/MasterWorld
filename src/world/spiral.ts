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

/**
 * What a fallen hero left, drawn (plan 11.1; game/death.ts): a pack left where the hero fell is a slumped
 * sack with a coil of rope; a roguelike hero's grave is a low cairn of stones with their pack at its foot.
 * Pure: a building mesh in the town's one building shader (no new shaders), around (0, 0, 0) at the spot.
 */
import type { BuildingMesh } from '@futuremagic/settlement';
import { Rng, deriveSeed } from '@futuremagic/core';
import { BuildingMat as M, MeshKit } from './meshKit';
import { stampModel, type PropModels } from './propModels';
import { varyTint } from './cellarMesh';

/** The look of remains: a pack, or a grave. `seed` varies the stones and the slump. */
export interface RemainsLook {
  readonly grave: boolean;
  readonly seed: string;
}

export function remainsMesh(r: RemainsLook, models?: PropModels): BuildingMesh {
  const k = new MeshKit(), rng = new Rng(deriveSeed(0, 'remains', r.seed));
  const a0 = rng.range(0, 6.28), b0 = rng.range(0, 6.28);
  const lump = (a: number, t: number) => Math.sin(2 * a + a0) * 0.7 * Math.sin(Math.PI * t) + Math.sin(3 * a + b0 + t * 4) * 0.5;
  // The cairn: two rings of stones and one on top, the pack set down at its foot.
  const sx = r.grave ? 0.75 : 0, sz = r.grave ? 0.2 : 0;
  if (r.grave) {
    const stone = models?.get('rock_cobble_worn');
    const rings: [number, number, number, number][] = [[7, 0.55, 0, 1], [5, 0.3, 0.22, 0.9], [1, 0, 0.42, 0.8]];
    for (const [n, rad, y, s] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + rng.range(-0.25, 0.25), x = Math.cos(a) * rad * rng.range(0.85, 1.1), z = Math.sin(a) * rad * rng.range(0.85, 1.1);
        if (stone) stampModel(k, stone, { x, y, z, yaw: rng.range(0, 6.28), shade: rng.range(0.42, 0.62), scale: [s, s * rng.range(0.8, 1.1), s] });
        else k.box(x, y, z, 0.3 * s, 0.24 * s, 0.26 * s, rng.range(0, 6.28), M.Plaster, varyTint(rng, [120, 118, 110], 0.15));
      }
    }
  }
  k.sack(sx, 0, sz, 0.24, 0.48, M.Plaster, varyTint(rng, [128, 102, 70], 0.1), lump);
  const rope = models?.get('prop_rope_coil');
  if (rope && !r.grave) stampModel(k, rope, { x: 0.42, y: 0, z: -0.18, yaw: rng.range(0, 6.28), scale: [0.7, 0.7, 0.7] });
  return k.mesh();
}

/**
 * The teachers' places out on the land (plan 10, C3, D49): a half-ruined tower past the start town's fields,
 * where its warden keeps watch and teaches (the warden is one of the town's people, stationed at the door:
 * game/township.ts). Its keep is the ruined towers' mesh (the town's building shader: nothing new to
 * compile), standing from the start; its walls stand in the walker's way. Nothing inside it is walked.
 */
import type { Mesh } from 'three/webgpu';
import { deriveSeed } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import { buildingMeshAt } from '../render/materials/building';
import type { DecisionLog, RetreatDecision } from '../world/decisions';
import { inFrame } from '../world/dungeon/site';
import { inTowerShape, towerMesh, type TowerSize } from '../world/dungeon/towerMesh';

/** A warden's keep: smaller than a tower dungeon's, three storeys, broken off at the top. */
const KEEP: TowerSize = { half: 5, depth: 10, storeys: 3 };

export class Retreats {
  private readonly meshes: Mesh[] = [];
  readonly sites: readonly RetreatDecision[];

  constructor(stage: Stage, log: DecisionLog, ground: (x: number, z: number) => number, seed: number) {
    this.sites = log.filter((d): d is RetreatDecision => d.kind === 'retreat');
    for (const s of this.sites) {
      const m = buildingMeshAt(towerMesh(KEEP, deriveSeed(seed, 'retreat', s.keeper)), s.x, ground(s.x, s.z) - 0.02, s.z, 'retreat', s.yaw);
      this.meshes.push(m);
      void stage.add(m);
    }
  }

  /** Is a body of radius `r` at (x, z) inside a keep's walls? */
  inKeep(x: number, z: number, r: number): boolean {
    for (const s of this.sites) {
      if (Math.abs(x - s.x) > 30 || Math.abs(z - s.z) > 30) continue;
      const [fx, fz] = inFrame(s, x, z);
      if (inTowerShape(KEEP, fx, fz, r)) return true;
    }
    return false;
  }
}

/**
 * Remains in the world (plan 11.1; world/dungeon/remainsMesh.ts): a pack or a grave where a hero fell, each
 * its own small mesh in the building shader the town already built (no compiles). Down in a cellar they are
 * at the cellar's own place in the world, so they show while the hero is below; `lay` lists the ones that
 * still lie there.
 */
import { Group, type Mesh } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { remainsMesh, type RemainsLook } from '../world/dungeon/remainsMesh';
import { loadCellarProps } from './dungeon/props';
import { buildingMeshAt } from './materials/building';

export interface RemainsSpot extends RemainsLook {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class RemainsView {
  readonly group = Object.assign(new Group(), { name: 'remains' });
  private readonly drawn = new Map<string, Mesh>();
  private adding: Promise<void> | null = null;

  constructor(private readonly stage: Stage) {}

  /** Draw these and drop the rest. */
  async lay(spots: readonly RemainsSpot[]): Promise<void> {
    const want = new Set(spots.map((s) => s.id));
    for (const [id, m] of this.drawn) if (!want.has(id)) { m.removeFromParent(); m.geometry.dispose(); this.drawn.delete(id); }
    const fresh = spots.filter((s) => !this.drawn.has(s.id));
    if (!fresh.length) return;
    if (!this.group.parent && !this.adding) this.adding = this.stage.add(this.group);
    const models = await loadCellarProps().catch(() => undefined);
    for (const s of fresh) {
      if (this.drawn.has(s.id)) continue;
      const m = buildingMeshAt(remainsMesh(s, models), s.x, s.y, s.z, `remains ${s.id}`);
      this.drawn.set(s.id, m);
      // The building shader is the town's, built long ago; prepared all the same, so nothing compiles on the render path.
      await this.stage.prepare(m);
      if (this.drawn.get(s.id) === m) this.group.add(m);
    }
  }
}

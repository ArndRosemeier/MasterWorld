/**
 * The room behind a door (D38), drawn while the player is in it: @futuremagic/settlement's interiorMesh
 * with the building shader the town already uses (no new shaders), placed under its building, out of
 * sight below the land. One room at a time, built when entered.
 */
import type { Mesh } from 'three/webgpu';
import { interiorMesh, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import { buildingMeshAt } from '../materials/building';

/** How far below its building a room is placed (m; the cellar lies deeper). */
export const ROOM_DEPTH = -200;

export class InteriorView {
  private mesh: Mesh | null = null;

  constructor(private readonly stage: Stage) {}

  /** Shows the room of `b` (its floor at `y`), in place of the last. */
  async show(plan: InteriorPlan, b: TownBuilding, y: number): Promise<void> {
    this.hide();
    const m = interiorMesh(plan, b, { x: b.cx, y, z: b.cz }, [b.cx, y, b.cz]);
    this.mesh = buildingMeshAt(m, b.cx, y, b.cz, `room ${b.id}`);
    await this.stage.add(this.mesh);
  }

  hide(): void {
    if (!this.mesh) return;
    this.stage.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }
}

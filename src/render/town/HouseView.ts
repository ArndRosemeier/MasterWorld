/**
 * A building drawn open in its place (D38): @futuremagic/settlement's building with its door open and
 * every storey's inside (interiorMesh), merged into one mesh with the building shader the town already
 * uses (no new shaders), while the town's own meshes leave that building out. One at a time.
 */
import type { Mesh } from 'three/webgpu';
import { buildingMesh, interiorMesh, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import { mergeMeshes } from '../../world/townMesh';
import { buildingMeshAt } from '../materials/building';
import type { TownView } from './TownView';

export class HouseView {
  private mesh: Mesh | null = null;
  private id = -1;

  constructor(private readonly stage: Stage, private readonly town: TownView | null) {}

  /** The building drawn open now (-1: none). */
  get open(): number { return this.id; }

  /** Draws `b` open (in place of the last one opened). */
  async drawOpen(b: TownBuilding, plan: InteriorPlan): Promise<void> {
    if (this.id === b.id) return;
    this.hide();
    const at: [number, number, number] = [b.cx, 0, b.cz];
    const m = mergeMeshes([buildingMesh(b, at, true, { open: true }), interiorMesh(plan, b, at)]);
    const mesh = buildingMeshAt(m, b.cx, 0, b.cz, `open ${b.kind} ${b.id}`);
    this.mesh = mesh;
    this.id = b.id;
    await this.stage.add(mesh);
    // Shut again meanwhile: not drawn after all.
    if (this.mesh !== mesh) { this.stage.remove(mesh); mesh.geometry.dispose(); return; }
    this.town?.hide(b.id, true);
  }

  /** Shut: the town's own building stands there again. */
  hide(): void {
    if (!this.mesh) return;
    this.town?.hide(this.id, false);
    this.stage.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
    this.id = -1;
  }
}

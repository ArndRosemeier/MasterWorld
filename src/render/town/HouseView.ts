/**
 * A building drawn open in its place (D38): @futuremagic/settlement's building with its door open and
 * every storey's inside (world/townMesh.ts openHouse, made in a worker), drawn with the building shader the
 * town already uses (no new shaders), while the town's own meshes leave that building out. One at a time.
 */
import { Group, Vector3, type Mesh } from 'three/webgpu';
import type { BuildingMesh, TownBuilding } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import { buildingMeshAt } from '../materials/building';
import type { TownView } from './TownView';

export class HouseView {
  private mesh: Mesh | null = null;
  /** A cellar's hatch lid, drawn apart to swing about its hinge (the group's place), and how it turns. */
  private lid: { readonly pivot: Group; readonly mesh: Mesh; axis: Vector3 | null } | null = null;
  private id = -1;
  /** The town whose building is drawn open (it leaves that building out meanwhile). */
  private town: TownView | null = null;

  constructor(private readonly stage: Stage) {}

  /** The building drawn open now (-1: none). */
  get open(): number { return this.id; }

  /** Draws `b` of `town` open (in place of the last one opened): `m`, its open mesh round its middle; `lid`, its hatch's. */
  async drawOpen(b: TownBuilding, m: BuildingMesh, town: TownView | null, lid: BuildingMesh | null = null): Promise<void> {
    if (this.id === b.id && this.town === town) return;
    this.hide();
    this.town = town;
    const mesh = buildingMeshAt(m, b.cx, 0, b.cz, `open ${b.kind} ${b.id}`);
    this.mesh = mesh;
    this.id = b.id;
    if (lid) {
      const pivot = new Group(), lm = buildingMeshAt(lid, b.cx, 0, b.cz, `hatch lid ${b.id}`);
      pivot.name = 'hatch lid';
      pivot.add(lm);
      this.lid = { pivot, mesh: lm, axis: null };
    }
    await this.stage.add(mesh);
    if (this.lid && this.mesh === mesh) await this.stage.add(this.lid.pivot);
    // Shut again meanwhile: not drawn after all.
    if (this.mesh !== mesh) { this.stage.remove(mesh); mesh.geometry.dispose(); return; }
    town?.hide(b.id, true);
  }

  /**
   * The hatch's lid swung up about its hinge, the line through (x, y, z) along `axis` (world), by `angle` (rad; 0
   * shut). The lid's own mesh stays where it was drawn; the pivot carries it round the hinge.
   */
  swingLid(x: number, y: number, z: number, axis: Vector3, angle: number): void {
    const l = this.lid;
    if (!l) return;
    l.pivot.position.set(x, y, z);
    l.pivot.quaternion.setFromAxisAngle(axis, angle);
    // The mesh was placed for the house's middle: put it relative to the hinge.
    const m = l.mesh, b = m.userData.at ?? (m.userData.at = m.position.clone());
    m.position.set(b.x - x, b.y - y, b.z - z);
    m.updateMatrix();
  }

  /** Shut: the town's own building stands there again. */
  hide(): void {
    if (this.lid) { this.stage.remove(this.lid.pivot); this.lid.mesh.geometry.dispose(); this.lid = null; }
    if (!this.mesh) return;
    this.town?.hide(this.id, false);
    this.stage.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
    this.id = -1;
  }
}

/**
 * A cellar drawn (world/dungeon/cellarMesh.ts): the shell and props in two meshes, each door with a state
 * as its own, each chest's lid on a pivot at its hinge (it lifts as the chest is searched), all with the building shader the town already uses (no new shaders). The props are
 * AssetGenerator's (props.ts), so the meshes are built in `add`, once they have loaded. Placed at `origin`,
 * hidden until the player is inside.
 */
import { Group, Vector3, type Mesh } from 'three/webgpu';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { Cellar } from '../../world/dungeon/cellar';
import { cellarMeshes } from '../../world/dungeon/cellarMesh';
import { buildingMeshAt } from '../materials/building';
import { loadCellarProps } from './props';
import { flameMesh } from '../materials/flame';
import { torchSpots } from '../../world/dungeon/torches';

export class CellarView {
  readonly group = new Group();
  private readonly doors = new Map<number, Mesh>();

  private readonly gone = new Set<number>();
  /** Each chest's lid on a pivot at its hinge, by chest (hoard id), and how far each is to stand open (0..1). */
  private lids: { readonly pivot: Group; readonly axis: Vector3 }[] = [];
  private readonly lift = new Map<number, number>();
  /** A cave's carved rock (world/dungeon/caveRock.ts), drawn with the rest; set before `add`. */
  rock: BuildingMesh | null = null;

  constructor(readonly cellar: Cellar, readonly origin: { x: number; y: number; z: number }) {
    this.group.name = `cellar ${cellar.decision.id}`;
    this.group.visible = false;
  }

  /** Built (once the props have loaded) and into the scene (shaders are the town's, already built). */
  async add(stage: Stage): Promise<void> {
    const m = cellarMeshes(this.cellar, await loadCellarProps());
    this.group.add(this.piece(m.shell, 'shell'), this.piece(m.props, 'props'));
    if (this.rock) this.group.add(this.piece(this.rock, 'rock'));
    const torches = torchSpots(this.cellar);
    if (torches.length) this.group.add(flameMesh(torches, this.origin.x, this.origin.y, this.origin.z));
    m.lids.forEach((l, i) => {
      const pivot = new Group(), mesh = this.piece(l.mesh, `chest lid ${i}`);
      pivot.name = 'chest lid';
      pivot.position.set(this.origin.x + l.hinge[0], this.origin.y + l.hinge[1], this.origin.z + l.hinge[2]);
      // The mesh was drawn in the cellar's frame: placed relative to the pivot.
      mesh.position.set(-l.hinge[0], -l.hinge[1], -l.hinge[2]);
      mesh.updateMatrix();
      pivot.add(mesh);
      this.group.add(pivot);
      this.lids.push({ pivot, axis: new Vector3(l.axis[0], 0, l.axis[1]) });
      this.lidUp(i, this.lift.get(i) ?? 0);
    });
    for (const d of m.doors) {
      const mesh = this.piece(d.mesh, `door ${d.kind}`);
      mesh.visible = !this.gone.has(d.link);
      this.doors.set(d.link, mesh);
      this.group.add(mesh);
    }
    await stage.add(this.group);
  }

  /** A door opened (unlocked, unbarred, found): it goes. */
  opened(link: number): void {
    this.gone.add(link);
    const d = this.doors.get(link);
    if (d) d.visible = false;
  }

  /** Chest `i`'s lid lifted by k (0 shut, 1 open), now or once it is built. */
  lidUp(i: number, k: number): void {
    this.lift.set(i, k);
    const l = this.lids[i];
    if (l) l.pivot.quaternion.setFromAxisAngle(l.axis, LID_OPEN * k);
  }

  private piece(m: BuildingMesh, name: string): Mesh {
    return buildingMeshAt(m, this.origin.x, this.origin.y, this.origin.z, name);
  }
}

/** How far a chest's lid opens (rad): about upright, so it stays up and clear of the wall behind. */
const LID_OPEN = 1.6;

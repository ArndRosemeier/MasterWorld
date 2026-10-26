/**
 * A cellar drawn (world/dungeon/cellarMesh.ts): the shell and props in two meshes, each door with a state
 * as its own, all with the building shader the town already uses (no new shaders). The props are
 * AssetGenerator's (props.ts), so the meshes are built in `add`, once they have loaded. Placed at `origin`,
 * hidden until the player is inside.
 */
import { Group, type Mesh } from 'three/webgpu';
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

  constructor(readonly cellar: Cellar, readonly origin: { x: number; y: number; z: number }) {
    this.group.name = `cellar ${cellar.decision.id}`;
    this.group.visible = false;
  }

  /** Built (once the props have loaded) and into the scene (shaders are the town's, already built). */
  async add(stage: Stage): Promise<void> {
    const m = cellarMeshes(this.cellar, await loadCellarProps());
    this.group.add(this.piece(m.shell, 'shell'), this.piece(m.props, 'props'));
    const torches = torchSpots(this.cellar);
    if (torches.length) this.group.add(flameMesh(torches, this.origin.x, this.origin.y, this.origin.z));
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

  private piece(m: BuildingMesh, name: string): Mesh {
    return buildingMeshAt(m, this.origin.x, this.origin.y, this.origin.z, name);
  }
}

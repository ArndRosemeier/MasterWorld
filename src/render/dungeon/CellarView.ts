/**
 * A cellar drawn (world/dungeon/cellarMesh.ts): the shell and props in two meshes, each door with a state
 * as its own, all with the building shader the town already uses (no new shaders). Placed at `origin`,
 * hidden until the player is inside.
 */
import { Group, type Mesh } from 'three/webgpu';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { Cellar } from '../../world/dungeon/cellar';
import { cellarMeshes } from '../../world/dungeon/cellarMesh';
import { buildingMeshAt } from '../materials/building';

export class CellarView {
  readonly group = new Group();
  private readonly doors = new Map<number, Mesh>();

  constructor(readonly cellar: Cellar, readonly origin: { x: number; y: number; z: number }) {
    this.group.name = `cellar ${cellar.decision.id}`;
    const m = cellarMeshes(cellar);
    this.group.add(this.piece(m.shell, 'shell'), this.piece(m.props, 'props'));
    for (const d of m.doors) {
      const mesh = this.piece(d.mesh, `door ${d.kind}`);
      this.doors.set(d.link, mesh);
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  /** Into the scene (shaders are the town's, already built). */
  async add(stage: Stage): Promise<void> {
    await stage.add(this.group);
  }

  /** A door opened (unlocked, unbarred, found): it goes. */
  opened(link: number): void {
    const d = this.doors.get(link);
    if (d) d.visible = false;
  }

  private piece(m: BuildingMesh, name: string): Mesh {
    return buildingMeshAt(m, this.origin.x, this.origin.y, this.origin.z, name);
  }
}

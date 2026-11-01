/**
 * A formed cave drawn (D63, phase K5): its walls, formations, crystals, loose stones and water as meshes of the cave kinds
 * (render/materials/formedCave.ts, formedWater.ts), placed at `origin` of its frame. The preview pages draw the same
 * (tools/preview/caveScene.ts). The water is the outside water's own ripple and foam code (waterSurface.ts).
 */
import { BufferAttribute, BufferGeometry, Group, type Mesh } from 'three/webgpu';
import { kindMesh } from '../materials';
import { FORMED_CALCITE, FORMED_ROCK } from '../materials/formedCave';
import { FORMED_WATER } from '../materials/formedWater';
import type { CaveResult } from '../../world/cave/job';

/** A geometry from a mesh of arrays: position, normal, tint (sRGB bytes to 0..1) and the material per vertex. */
export function caveGeometry(m: { position: Float32Array; normal: Float32Array; tint: Uint8Array; mat: Uint8Array; index: Uint32Array }): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('normal', new BufferAttribute(m.normal, 3));
  g.setAttribute('tint', new BufferAttribute(Float32Array.from(m.tint, (v) => v / 255), 3));
  g.setAttribute('mat', new BufferAttribute(Float32Array.from(m.mat), 1));
  g.setIndex(new BufferAttribute(m.index, 1));
  return g;
}

/** The water sheet's geometry (flow in the tint attribute). */
function waterGeometry(w: NonNullable<CaveResult['parts']>['water']): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(w.position, 3));
  g.setAttribute('normal', new BufferAttribute(w.normal, 3));
  g.setAttribute('uv', new BufferAttribute(w.uv, 2));
  g.setAttribute('tint', new BufferAttribute(w.flow, 3));
  g.setIndex(new BufferAttribute(w.index, 1));
  return g;
}

/** The cave's meshes in a group (and the walls apart, for rays against the rock), the cave's frame at `origin`. */
export function formedMeshes(res: Pick<CaveResult, 'mesh' | 'parts'>, origin: { readonly x: number; readonly y: number; readonly z: number } = { x: 0, y: 0, z: 0 }): { group: Group; walls: Mesh } {
  const group = new Group(), placed = (g: BufferGeometry, kind: Parameters<typeof kindMesh>[1]): Mesh => kindMesh(g, kind, origin.x, origin.y, origin.z);
  const walls = placed(caveGeometry(res.mesh as never), FORMED_ROCK);
  walls.name = 'cave walls';
  group.add(walls);
  if (res.parts) {
    group.add(placed(caveGeometry(res.parts.formations), FORMED_CALCITE), placed(caveGeometry(res.parts.crystals), FORMED_CALCITE), placed(caveGeometry(res.parts.stones), FORMED_ROCK));
    const sheet = placed(waterGeometry(res.parts.water), FORMED_WATER);
    sheet.renderOrder = 2;
    group.add(sheet);
  }
  return { group, walls };
}

/**
 * The hero's map as a thing in the world (D35's hand-over, shown not told): a sheet of parchment, a little
 * bowed, drawn with the building shader every town already uses (no new shader). It goes where the hand
 * holding it is, each frame; hidden while it is in the pack.
 */
import { Group, type Mesh } from 'three/webgpu';
import { BuildingMat, type BuildingMesh } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import { buildingMeshAt } from '../materials/building';

/** The sheet: this wide and deep (m), bowed this much in its middle, in this many strips. */
const W = 0.34, D = 0.24, BOW = 0.025, STRIPS = 4;
/** Parchment, its back a shade darker; the ink of its edge lines. */
const FACE: [number, number, number] = [232, 216, 178], BACK: [number, number, number] = [206, 188, 150];

/** The sheet's mesh, lying in x (across) and z (away), its middle at the origin, bowed up along x. */
export function mapSheetMesh(): BuildingMesh {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], mat: number[] = [], tint: number[] = [], idx: number[] = [];
  const y = (x: number) => BOW * (1 - (2 * x / W) ** 2);
  for (const [up, c] of [[1, FACE], [-1, BACK]] as const) {
    const base = pos.length / 3;
    for (let i = 0; i <= STRIPS; i++) {
      const x = -W / 2 + (W * i) / STRIPS, slope = (-8 * BOW * x) / (W * W), l = Math.hypot(slope, 1);
      for (const z of [-D / 2, D / 2]) {
        pos.push(x, y(x) - (up < 0 ? 0.002 : 0), z);
        nrm.push((-slope / l) * up, up / l, 0);
        uv.push(x, z); mat.push(BuildingMat.Plaster); tint.push(...c);
      }
    }
    for (let i = 0; i < STRIPS; i++) {
      const a = base + i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      if (up > 0) idx.push(a, b, d, a, d, c2); else idx.push(a, d, b, a, c2, d);
    }
  }
  return { position: Float32Array.from(pos), normal: Float32Array.from(nrm), uv: Float32Array.from(uv), mat: Uint8Array.from(mat), tint: Uint8Array.from(tint), index: Uint32Array.from(idx) };
}

export class MapSheet {
  /** Where the sheet is (world): moved and turned by the scene holding it. */
  readonly group = new Group();
  private readonly mesh: Mesh;
  private added = false;

  constructor(private readonly stage: Stage) {
    this.mesh = buildingMeshAt(mapSheetMesh(), 0, 0, 0, 'map sheet');
    this.group.name = 'map sheet';
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  /** In a hand at (x, y, z) (world), its long side across `yaw` (radians about +y), tipped up by `tip` towards the one holding it. */
  holdAt(x: number, y: number, z: number, yaw: number, tip: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(tip, yaw, 0, 'YXZ');
    this.group.visible = true;
    if (!this.added) { this.added = true; void this.stage.add(this.group); }
  }

  /** Back in the pack. */
  stow(): void { this.group.visible = false; }
}

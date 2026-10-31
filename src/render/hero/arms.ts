/**
 * What hands hold (plan 11.5): the setting's weapons, shields and the torch as small meshes in grip
 * space (+y along the blade out of the thumb side of the fist, the edge along +z, the hilt below), built from boxes in the building format and
 * drawn with the town's building shader (no new shaders): steel and iron on the slate layer (bright and
 * dark tints; the glass layer is a window's and reads black), hafts in oak. grips.ts puts them in hand, at the hip or on the back.
 */
import { BuildingMat as M } from '@futuremagic/settlement';
import type { Object3D } from 'three/webgpu';
import { MeshKit, type Tint } from '../../world/dungeon/meshKit';
import { buildingMeshAt } from '../materials/building';
import { flameMesh } from '../materials/flame';

const STEEL: Tint = [236, 240, 246], DARK: Tint = [90, 92, 98], OAK: Tint = [130, 96, 64], LEATHER: Tint = [88, 60, 40], BRASS: Tint = [214, 170, 90];

/** The shape family the humanoid package grips by (`gripClassOf`), by catalogue id. */
export const ARM_SHAPES: Readonly<Record<string, string>> = {
  knife: 'knife', dagger: 'dagger', 'short-sword': 'sword.short', 'arming-sword': 'sword.arming', 'lantern-blade': 'sword.arming',
  hatchet: 'axe.hand', 'bearded-axe': 'axe.bearded', club: 'club', mace: 'mace', 'watch-mace': 'mace', spear: 'spear',
  buckler: 'shield.buckler', 'round-shield': 'shield.round', threshold: 'shield.round', torch: 'torch',
};

/**
 * A steel part in grip space, from `y0` to the point at `y0 + len`: a lozenge in section (the edges at ±z,
 * the spine at ±x), full width `width` up to `shoulder` of its length, then narrowing to the point.
 */
function steel(k: MeshKit, y0: number, len: number, width: number, thick: number, shoulder = 0.78): void {
  const ys = y0 + len * shoulder, top = y0 + len;
  // Sections: [y, half width, half thickness].
  const rings: [number, number, number][] = [[y0, width / 2, thick / 2], [ys, (width / 2) * 0.86, (thick / 2) * 0.9], [top, 0, 0]];
  for (let r = 0; r < rings.length - 1; r++) {
    const [ya, wa, ta] = rings[r], [yb, wb, tb] = rings[r + 1];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = [0, ya, sz * wa], b = [0, yb, sz * wb], c = [sx * tb, yb, 0], d = [sx * ta, ya, 0];
      // Facing out of the quadrant (sx, sz).
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const out = (e1[1] * e2[2] - e1[2] * e2[1]) * sx + (e1[0] * e2[1] - e1[1] * e2[0]) * sz > 0;
      if (wb === 0) { if (out) k.tri(a, c, d, M.Slate, STEEL); else k.tri(a, d, c, M.Slate, STEEL); continue; }
      if (out) k.quad(a, b, c, d, [[0, ya], [0, yb], [thick, yb], [thick, ya]], M.Slate, STEEL);
      else k.quad(a, d, c, b, [[0, ya], [thick, ya], [thick, yb], [0, yb]], M.Slate, STEEL);
    }
  }
}

/** A blade: leather grip, brass pommel, a cross guard along the edge and a bright pointed blade of `len` metres. */
function blade(k: MeshKit, len: number, width: number, guard: number): void {
  k.box(0, -0.11, 0, 0.03, 0.12, 0.03, 0, M.Oak, LEATHER);
  k.box(0, -0.14, 0, 0.042, 0.035, 0.042, 0.4, M.Slate, BRASS);
  k.box(0, 0.0, 0, 0.03, 0.022, guard, 0, M.Slate, guard > 0.08 ? BRASS : DARK);
  steel(k, 0.02, len, width, Math.max(0.006, width * 0.18));
}

/** A haft of `len` with a head at its top. */
function haft(k: MeshKit, len: number, below = 0.12): void {
  k.box(0, -below, 0, 0.032, len, 0.032, 0, M.Oak, OAK);
}

export function buildArm(defId: string): Object3D {
  const k = new MeshKit();
  switch (ARM_SHAPES[defId]) {
    case 'knife': blade(k, 0.16, 0.025, 0.03); break;
    case 'dagger': blade(k, 0.24, 0.035, 0.08); break;
    case 'sword.short': blade(k, 0.5, 0.045, 0.14); break;
    case 'sword.arming': blade(k, 0.72, 0.045, 0.2); break;
    case 'axe.hand': haft(k, 0.5); k.box(0, 0.28, 0.05, 0.014, 0.08, 0.12, 0, M.Slate, STEEL); break;
    case 'axe.bearded': haft(k, 0.66); k.box(0, 0.38, 0.06, 0.014, 0.13, 0.14, 0, M.Slate, STEEL); break;
    case 'club': haft(k, 0.5); k.box(0, 0.24, 0, 0.07, 0.16, 0.07, 0, M.Oak, OAK); break;
    case 'mace': haft(k, 0.52); k.box(0, 0.32, 0, 0.09, 0.1, 0.09, 0.4, M.Slate, DARK); k.box(0, 0.34, 0, 0.03, 0.05, 0.12, 0, M.Slate, DARK); break;
    case 'spear': haft(k, 1.9, 0.6); steel(k, 1.3, 0.24, 0.05, 0.012, 0.35); break;
    case 'shield.buckler': k.cylinder(0, -0.02, 0, 0.17, 0.03, 12, M.Slate, DARK); k.cylinder(0, 0.01, 0, 0.05, 0.03, 8, M.Slate, BRASS); break;
    case 'shield.round': k.cylinder(0, -0.02, 0, 0.32, 0.03, 16, M.Oak, OAK); k.cylinder(0, 0.01, 0, 0.07, 0.035, 10, M.Slate, DARK); break;
    case 'torch': haft(k, 0.45, 0.1); k.box(0, 0.33, 0, 0.06, 0.08, 0.06, 0, M.Thatch, [90, 70, 40]); break;
    default: break;
  }
  const mesh = buildingMeshAt(k.mesh(), 0, 0, 0, `arm ${defId}`);
  // Shields lie in their plate, face to −z (out of the back of the fist in a hand's grip): the cylinders above
  // stand up along +y. Turned in the geometry, as grip() sets the mesh's own turn.
  if (ARM_SHAPES[defId]?.startsWith('shield')) mesh.geometry.rotateX(-Math.PI / 2);
  // A torch's flame over its head (the cellars' flame kind), dark until it is lit (`torchFlame`).
  if (ARM_SHAPES[defId] === 'torch') {
    const f = flameMesh([{ x: 0, y: TORCH_TIP, z: 0 }], 0, 0, 0);
    f.name = 'torch flame';
    f.visible = false;
    mesh.add(f);
  }
  return mesh;
}

/** The flame point over a held torch's head, in grip space (its base sits on the head's top). */
export const TORCH_TIP = 0.5;

/** A held torch's flame (null: the thing is no torch). */
export function torchFlame(arm: Object3D | null): Object3D | null {
  return arm?.getObjectByName('torch flame') ?? null;
}

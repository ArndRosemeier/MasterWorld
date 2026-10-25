/**
 * What hands hold (plan 11.5): the setting's weapons, shields and the torch as small meshes in grip
 * space (+y along the blade out of the thumb side of the fist, the edge along +z, the hilt below), built from boxes in the building format and
 * drawn with the town's building shader (no new shaders): steel on the smooth layer, hafts in oak, iron
 * in slate. The humanoid package grips, sheathes and swings them.
 */
import { BuildingMat as M } from '@futuremagic/settlement';
import type { Object3D } from 'three/webgpu';
import { MeshKit, type Tint } from '../../world/dungeon/meshKit';
import { buildingMeshAt } from '../materials/building';

const STEEL: Tint = [200, 204, 210], DARK: Tint = [90, 92, 98], OAK: Tint = [130, 96, 64], LEATHER: Tint = [88, 60, 40], BRASS: Tint = [214, 170, 90];

/** The shape family the humanoid package grips by (`gripClassOf`), by catalogue id. */
export const ARM_SHAPES: Readonly<Record<string, string>> = {
  knife: 'knife', dagger: 'dagger', 'short-sword': 'sword.short', 'arming-sword': 'sword.arming', 'lantern-blade': 'sword.arming',
  hatchet: 'axe.hand', 'bearded-axe': 'axe.bearded', club: 'club', mace: 'mace', 'watch-mace': 'mace', spear: 'spear',
  buckler: 'shield.buckler', 'round-shield': 'shield.round', threshold: 'shield.round', torch: 'torch',
};

/** A blade: grip, guard and a tapering blade of `len` metres. */
function blade(k: MeshKit, len: number, width: number, guard: number): void {
  k.box(0, -0.11, 0, 0.03, 0.12, 0.03, 0, M.Oak, LEATHER);
  k.box(0, -0.13, 0, 0.04, 0.025, 0.04, 0, M.Slate, BRASS);
  k.box(0, 0.005, 0, 0.035, 0.02, guard, 0, M.Slate, guard > 0.08 ? BRASS : DARK);
  // Three steps narrower towards the point.
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    const w = width * (1 - s / (steps + 0.5)), y0 = 0.02 + (len * s) / steps;
    k.box(0, y0, 0, 0.008, len / steps, w, 0, M.Glass, STEEL);
  }
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
    case 'axe.hand': haft(k, 0.5); k.box(0, 0.28, 0.05, 0.012, 0.08, 0.12, 0, M.Glass, STEEL); break;
    case 'axe.bearded': haft(k, 0.66); k.box(0, 0.38, 0.06, 0.012, 0.13, 0.14, 0, M.Glass, STEEL); break;
    case 'club': haft(k, 0.5); k.box(0, 0.24, 0, 0.07, 0.16, 0.07, 0, M.Oak, OAK); break;
    case 'mace': haft(k, 0.52); k.box(0, 0.32, 0, 0.09, 0.1, 0.09, 0.4, M.Slate, DARK); k.box(0, 0.34, 0, 0.03, 0.05, 0.12, 0, M.Slate, DARK); break;
    case 'spear': haft(k, 1.9, 0.6); k.box(0, 1.3, 0, 0.01, 0.22, 0.05, 0, M.Glass, STEEL); break;
    case 'shield.buckler': k.cylinder(0, -0.02, 0, 0.17, 0.03, 12, M.Slate, DARK); k.cylinder(0, 0.01, 0, 0.05, 0.03, 8, M.Slate, BRASS); break;
    case 'shield.round': k.cylinder(0, -0.02, 0, 0.32, 0.03, 16, M.Oak, OAK); k.cylinder(0, 0.01, 0, 0.07, 0.035, 10, M.Slate, DARK); break;
    case 'torch': haft(k, 0.45, 0.1); k.box(0, 0.33, 0, 0.06, 0.08, 0.06, 0, M.Thatch, [90, 70, 40]); break;
    default: break;
  }
  const mesh = buildingMeshAt(k.mesh(), 0, 0, 0, `arm ${defId}`);
  // Shields lie in their plate, face to −z (out of the back of the fist in a hand's grip): the cylinders above
  // stand up along +y. Turned in the geometry, as grip() sets the mesh's own turn.
  if (ARM_SHAPES[defId]?.startsWith('shield')) mesh.geometry.rotateX(-Math.PI / 2);
  return mesh;
}

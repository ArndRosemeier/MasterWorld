/**
 * The traveller's clothes for milestone 1: a plain wardrobe of shell garments (the humanoid package fits
 * them to any body). The setting's real garb comes later; this keeps the hero dressed until then.
 */
import { Group } from 'three/webgpu';
import type { Wardrobe } from '@futuremagic/humanoid/three';
import type { BodyRegion, EquipmentVisuals, ItemVisual, ShellLayer, ShellMaterial, WearableSpec } from '@futuremagic/humanoid';

type RGB = [number, number, number];

const cloth = (color: RGB, pattern: ShellMaterial['pattern'], o: Partial<ShellMaterial> = {}): ShellMaterial => ({
  color, color2: [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7], pattern, patternScale: 12, roughness: 0.9, metalness: 0, sheen: 0.4,
  glow: 0, glowColor: [0, 0, 0], wear: 0.35, ...o,
});

const whole = (...rs: BodyRegion[]) => rs.map((region) => ({ region }));

/** Each garment by id: its shell layers. */
const GARMENTS: Record<string, ShellLayer[]> = {
  shirt: [{
    kind: 'shell', layer: 1, offset: 0.004, material: cloth([0.72, 0.66, 0.54], 'plain', { sheen: 0.5 }),
    regions: [...whole('chest', 'belly', 'back', 'upperarm.L', 'upperarm.R'), { region: 'forearm.L', to: 0.92 }, { region: 'forearm.R', to: 0.92 }, { region: 'pelvis', to: 0.4 }],
  }],
  trousers: [{
    kind: 'shell', layer: 2, offset: 0.006, material: cloth([0.24, 0.2, 0.15], 'quilted', { patternScale: 16 }),
    regions: [...whole('pelvis', 'buttocks', 'thigh.L', 'thigh.R'), { region: 'shin.L', to: 0.9 }, { region: 'shin.R', to: 0.9 }],
  }],
  tunic: [{
    kind: 'shell', layer: 3, offset: 0.012, material: cloth([0.2, 0.3, 0.22], 'embroidered', { color2: [0.5, 0.4, 0.2], patternScale: 10 }),
    regions: [...whole('chest', 'belly', 'back', 'pelvis', 'buttocks'), { region: 'upperarm.L', to: 0.55 }, { region: 'upperarm.R', to: 0.55 }],
    skirt: { length: 0.34, flare: 0.35, slits: 2 },
    trim: { width: 0.012, color: [0.45, 0.33, 0.14] },
  }],
  boots: [{
    kind: 'shell', layer: 4, offset: 0.01, material: cloth([0.2, 0.13, 0.08], 'leather', { roughness: 0.7, sheen: 0.1, wear: 0.5 }),
    regions: [{ region: 'shin.L', from: 0.4 }, { region: 'shin.R', from: 0.4 }, ...whole('foot.L', 'foot.R')],
    trim: { width: 0.01, color: [0.12, 0.08, 0.05] },
  }],
};

export const TRAVELLER: Wardrobe = {
  resolve(defId: string): WearableSpec | null {
    const layers = GARMENTS[defId];
    return layers ? { layers } : null;
  },
  itemDef: () => undefined,
  buildItem: () => new Group(),
  disposeItem: () => {},
};

const visual = (seed: number): ItemVisual => ({ shape: 'cloth', seed, primary: [1, 1, 1], secondary: [1, 1, 1], accent: [1, 1, 1], material: 'cloth', glow: 0 });

/** What the traveller wears. */
export const TRAVELLER_GARB: EquipmentVisuals = {
  chest: { defId: 'shirt', visual: visual(11) },
  legs: { defId: 'trousers', visual: visual(12) },
  back: { defId: 'tunic', visual: visual(13) },
  feet: { defId: 'boots', visual: visual(14) },
};

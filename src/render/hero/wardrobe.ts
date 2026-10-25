/**
 * The clothes and arms of everyone drawn as a humanoid: the cellars' goblins, smugglers and dead (the hero is
 * an Actors character, HeroView). A plain wardrobe of shell garments (the humanoid package fits them to any body); a garment worn
 * with a coloured visual takes that colour (white: its own). Held things come from ./arms.ts.
 */
import type { Object3D } from 'three/webgpu';
import type { Wardrobe } from '@futuremagic/humanoid/three';
import type { BodyRegion, ItemVisual, ShellLayer, ShellMaterial, WearableSpec } from '@futuremagic/humanoid';
import { ARM_SHAPES, buildArm } from './arms';

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
  rags: [{
    kind: 'shell', layer: 3, offset: 0.012, material: cloth([0.34, 0.29, 0.2], 'plain', { wear: 0.9 }),
    regions: [...whole('chest', 'belly', 'back', 'pelvis', 'buttocks'), { region: 'thigh.L', to: 0.5 }, { region: 'thigh.R', to: 0.5 }],
    skirt: { length: 0.22, flare: 0.25, slits: 3 },
  }],
  jerkin: [{
    kind: 'shell', layer: 3, offset: 0.014, material: cloth([0.18, 0.14, 0.11], 'leather', { roughness: 0.7, sheen: 0.1, wear: 0.6 }),
    regions: [...whole('chest', 'belly', 'back', 'pelvis'), { region: 'upperarm.L', to: 0.4 }, { region: 'upperarm.R', to: 0.4 }],
    trim: { width: 0.01, color: [0.1, 0.07, 0.05] },
  }],
  shroud: [{
    kind: 'shell', layer: 3, offset: 0.016, material: cloth([0.42, 0.4, 0.34], 'plain', { wear: 1 }),
    regions: [...whole('chest', 'belly', 'back', 'pelvis', 'buttocks', 'upperarm.L', 'upperarm.R'), { region: 'thigh.L', to: 0.6 }, { region: 'thigh.R', to: 0.6 }],
    skirt: { length: 0.5, flare: 0.3, slits: 4 },
  }],
  boots: [{
    kind: 'shell', layer: 4, offset: 0.01, material: cloth([0.2, 0.13, 0.08], 'leather', { roughness: 0.7, sheen: 0.1, wear: 0.5 }),
    regions: [{ region: 'shin.L', from: 0.4 }, { region: 'shin.R', from: 0.4 }, ...whole('foot.L', 'foot.R')],
    trim: { width: 0.01, color: [0.12, 0.08, 0.05] },
  }],
};

const white = (c: RGB) => c[0] === 1 && c[1] === 1 && c[2] === 1;

export const TRAVELLER: Wardrobe = {
  resolve(defId: string, visual: ItemVisual): WearableSpec | null {
    const layers = GARMENTS[defId];
    if (!layers) return null;
    if (white(visual.primary)) return { layers };
    // Worn in the visual's colour.
    const c = visual.primary;
    return { layers: layers.map((l) => (l.kind === 'shell' ? { ...l, material: { ...l.material, color: c, color2: [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7] } } : l)) };
  },
  itemDef: (defId) => (ARM_SHAPES[defId] ? { visual: { shape: ARM_SHAPES[defId] }, twoHanded: false, category: defId === 'torch' ? 'light' : undefined } : undefined),
  buildItem: (defId) => buildArm(defId),
  disposeItem: (o: Object3D) => o.traverse((c) => (c as { geometry?: { dispose(): void } }).geometry?.dispose()),
};

/** A worn or held thing's visual, in `colour` (white: its own). */
export const visual = (seed: number, colour: RGB = [1, 1, 1], shape = 'cloth'): ItemVisual => ({ shape, seed, primary: colour, secondary: [1, 1, 1], accent: [1, 1, 1], material: 'cloth', glow: 0 });


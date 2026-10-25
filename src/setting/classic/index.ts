/**
 * The default setting module: classic fantasy, a small town start (D14). Dramatic land (D18), temperate
 * heartland, cold north, dry south.
 */
import { CONTRACT_VERSION, type SettingModule } from '../contract';
import { backgrounds } from './backgrounds';
import { cellar } from './cellar';
import { names, talk } from './people';
import { creatures } from './creatures';
import { hero } from './hero';
import { routines } from './routines';
import { items } from './items';
import { abilities, director, skills } from './skills';

export const classic: SettingModule = {
  contractVersion: CONTRACT_VERSION,
  id: 'classic',
  version: 1,
  title: 'Classic fantasy: a small town',
  world: {
    continentSpacing: 900_000,
    landFraction: 0.45,
    seaDepth: 3500,
    mountainHeight: 3600,
    rangeSpacing: 70_000,
    drama: 0.75,
    baseTemperature: 11,
    northCooling: 0.012,
    biomes: [
      { id: 'alpine', name: 'Bare rock and snow', ground: 0x8a8a86, surface: 'scree', temperature: [-40, 2], moisture: [0, 1], elevation: [1800, 9000], grass: { cover: 0.5, height: 0.1, dry: 0.35 } },
      { id: 'tundra', name: 'Tundra', ground: 0x8c8f6e, surface: 'grass', temperature: [-30, -2], moisture: [0, 1], flora: { trees: 4, cover: -0.8, mix: { birch: 2, pine: 1 }, shrubs: 30 }, grass: { cover: 0.6, height: 0.12, dry: 0.5 } },
      { id: 'taiga', name: 'Pine forest', ground: 0x3f5a33, surface: 'forest', temperature: [-2, 5], moisture: [0.35, 1], flora: { trees: 180, cover: 0.6, mix: { pine: 6, birch: 1 }, shrubs: 25 }, grass: { cover: 0.35, height: 0.3, dry: 0.25 } },
      { id: 'steppe', name: 'Steppe', ground: 0xa39a5c, surface: 'grass', temperature: [-2, 14], moisture: [0, 0.35], flora: { trees: 6, cover: -0.7, mix: { pine: 2, birch: 1, oak: 1 }, shrubs: 40 }, grass: { cover: 0.9, height: 0.55, dry: 0.8 } },
      { id: 'meadow', name: 'Meadows', ground: 0x6f9a3e, surface: 'grass', temperature: [5, 16], moisture: [0.35, 0.6], flora: { trees: 60, cover: -0.45, mix: { oak: 4, linden: 2, maple: 2, birch: 1, chestnut: 1 }, shrubs: 35 }, grass: { cover: 1, height: 0.42, dry: 0.1 } },
      { id: 'forest', name: 'Broadleaf forest', ground: 0x41692c, surface: 'forest', temperature: [5, 16], moisture: [0.6, 1], flora: { trees: 160, cover: 0.55, mix: { oak: 4, linden: 2, maple: 2, birch: 1, chestnut: 1, pine: 1 }, shrubs: 40 }, grass: { cover: 0.65, height: 0.32, dry: 0.05 } },
      { id: 'heath', name: 'Heath', ground: 0x8a7a4a, surface: 'grass', temperature: [14, 22], moisture: [0.2, 0.5], flora: { trees: 15, cover: -0.6, mix: { pine: 3, birch: 2, oak: 1 }, shrubs: 60 }, grass: { cover: 0.55, height: 0.28, dry: 0.5 } },
      { id: 'desert', name: 'Desert', ground: 0xd2b47a, surface: 'sand', temperature: [16, 40], moisture: [0, 0.2] },
      { id: 'jungle', name: 'Jungle', ground: 0x2f6a2a, surface: 'forest', temperature: [20, 40], moisture: [0.6, 1], flora: { trees: 220, cover: 0.7, mix: { plane: 3, chestnut: 2, linden: 2, cypress: 1 }, shrubs: 120 }, grass: { cover: 0.7, height: 0.6, dry: 0 } },
    ],
    // Temperate: fronts a few tens of km across pass over in half a day; showers, the odd thunderstorm,
    // misty mornings in the valleys.
    weather: { frontSize: 70_000, frontSpeed: 3_500, change: 14, rainfall: 0.5, storms: 0.45, mist: 0.55, windiness: 0.45, drying: 3 },
    // Horses stand in for cattle until Actors has cattle.
    livestock: 'horse',
  },
  start: {
    biomes: ['meadow', 'forest'],
    elevation: [15, 400],
    maxSlope: 0.12,
    vista: 220,
  },
  dungeons: { cellar },
  names,
  talk,
  skills,
  creatures,
  items,
  abilities,
  director,
  hero,
  backgrounds,
  routines,
};

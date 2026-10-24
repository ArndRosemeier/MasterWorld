/**
 * The default setting module: classic fantasy, a small town start (D14). Dramatic land (D18), temperate
 * heartland, cold north, dry south.
 */
import { CONTRACT_VERSION, type SettingModule } from '../contract';

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
    rangeSpacing: 140_000,
    drama: 0.75,
    baseTemperature: 11,
    northCooling: 0.012,
    biomes: [
      { id: 'alpine', name: 'Bare rock and snow', temperature: [-40, 2], moisture: [0, 1], elevation: [1800, 9000] },
      { id: 'tundra', name: 'Tundra', temperature: [-30, -2], moisture: [0, 1] },
      { id: 'taiga', name: 'Pine forest', temperature: [-2, 5], moisture: [0.35, 1] },
      { id: 'steppe', name: 'Steppe', temperature: [-2, 14], moisture: [0, 0.35] },
      { id: 'meadow', name: 'Meadows', temperature: [5, 16], moisture: [0.35, 0.6] },
      { id: 'forest', name: 'Broadleaf forest', temperature: [5, 16], moisture: [0.6, 1] },
      { id: 'heath', name: 'Heath', temperature: [14, 22], moisture: [0.2, 0.5] },
      { id: 'desert', name: 'Desert', temperature: [16, 40], moisture: [0, 0.2] },
      { id: 'jungle', name: 'Jungle', temperature: [20, 40], moisture: [0.6, 1] },
    ],
  },
  start: {
    biomes: ['meadow', 'forest'],
    elevation: [15, 400],
    maxSlope: 0.12,
  },
};

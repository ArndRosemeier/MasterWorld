/**
 * The terrain surface: the skeleton's elevation plus local detail (the height field layer of 5.6). Pure,
 * deterministic, evaluated in workers for meshes and on the main thread for walking.
 */
import { Noise, deriveSeed } from '@futuremagic/core';
import { Skeleton } from './skeleton';
import type { SettingModule } from '../setting/contract';

export class Terrain {
  readonly skeleton: Skeleton;
  private readonly detail: Noise;

  constructor(readonly seed: number, readonly setting: SettingModule) {
    this.skeleton = new Skeleton(seed, setting.world);
    this.detail = new Noise(deriveSeed(seed, 'terrain', 'detail'));
  }

  /** Ground height above the sea surface, metres. */
  height(x: number, z: number): number {
    const e = this.skeleton.elevation(x, z);
    if (e <= 0) return e;
    // Small undulations everywhere, rougher where the land is high.
    const rough = 1 + Math.min(4, e / 600);
    const d = this.detail.fbm2(x / 70, z / 70, 3) * 2.2 + this.detail.fbm2(x / 9 + 71.3, z / 9 - 12.9, 2) * 0.25;
    return Math.max(0.5, e + d * rough);
  }
}

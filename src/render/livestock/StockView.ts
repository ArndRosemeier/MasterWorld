/**
 * The farms' animals as drawn (sim/livestock.ts moves them). The setting says which animal grazes the
 * paddocks; each kind has its own drawing (only horses so far: Actors' horse without saddle and
 * bridle). At most `max` are drawn, the nearest to the camera, and none farther than REACH.
 */
import type { Object3D, Vector3, WebGPURenderer } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { LivestockKind } from '../../setting/contract';
import type { Herds } from '../../sim/livestock';
import { HorseView } from '../horse/HorseView';

/** Farther than this (m) an animal is not drawn. */
const REACH = 180;

/** What drawing one kind of animal takes: a fixed set of bodies, each posed or hidden every frame. */
interface Bodies {
  warmObjects(): Object3D[];
  show(stage: Stage): Promise<void>;
  shown(i: number, on: boolean): void;
  pose(i: number, p: { x: number; y: number; z: number; yaw: number; act: 'eat' | 'idle' | 'walk'; speed: number }, dt: number): void;
}

const MAKE: Record<LivestockKind, (renderer: WebGPURenderer, count: number) => Promise<Bodies>> = {
  // Coats from the third on, so the saddled horses at the start look different.
  horse: (renderer, count) => HorseView.make(renderer, count, { tack: false, coat0: 2 }),
};

export class StockView {
  /** Which animal each body shows (-1 none). */
  private readonly slot: number[];
  private sortIn = 0;

  private constructor(private readonly bodies: Bodies, private readonly herds: Herds, private readonly height: (x: number, z: number) => number, count: number) {
    this.slot = new Array<number>(count).fill(-1);
  }

  static async forHerds(renderer: WebGPURenderer, kind: LivestockKind, herds: Herds, max: number, height: (x: number, z: number) => number): Promise<StockView | null> {
    const count = Math.min(max, herds.animals.length);
    if (count <= 0) return null;
    return new StockView(await MAKE[kind](renderer, count), herds, height, count);
  }

  toWarm(): Object3D[] { return this.bodies.warmObjects(); }
  enter(stage: Stage): Promise<void> { return this.bodies.show(stage); }

  /** Each frame, after the herds have stepped. */
  herd(dt: number, cam: Vector3): void {
    const animals = this.herds.animals;
    // Now and then: the nearest animals get the bodies. One that keeps its place keeps its body.
    if ((this.sortIn -= dt) <= 0) {
      this.sortIn = 1;
      const d = (i: number) => Math.hypot(animals[i].x - cam.x, animals[i].z - cam.z);
      const want = animals.map((_, i) => i).filter((i) => d(i) < REACH).sort((a, b) => d(a) - d(b)).slice(0, this.slot.length);
      const keep = new Set(want);
      for (let s = 0; s < this.slot.length; s++) if (!keep.has(this.slot[s])) this.slot[s] = -1;
      for (const a of want) if (!this.slot.includes(a)) this.slot[this.slot.indexOf(-1)] = a;
    }
    for (let s = 0; s < this.slot.length; s++) {
      const a = this.slot[s] >= 0 ? animals[this.slot[s]] : null;
      this.bodies.shown(s, !!a);
      if (!a) continue;
      // The walker's yaw convention: 0 faces −z.
      this.bodies.pose(s, { x: a.x, y: this.height(a.x, a.z), z: a.z, yaw: Math.atan2(-Math.cos(a.dir), -Math.sin(a.dir)), act: a.act, speed: a.speed }, dt);
    }
  }
}

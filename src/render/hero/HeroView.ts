/**
 * The hero as drawn: a humanoid (@futuremagic/humanoid) in the traveller's clothes, posed each frame from
 * where the body is and what it does. Built behind the loading screen (the body build takes some tens of
 * milliseconds), warmed with everything else.
 */
import type { Object3D } from 'three/webgpu';
import { randomAppearance, setHumanAssetBase } from '@futuremagic/humanoid';
import { Humanoid, type GroundFn, type MoveState } from '@futuremagic/humanoid/three';
import { TRAVELLER, TRAVELLER_GARB } from './wardrobe';

/** Where the build serves the humanoid package's assets (vite.config.ts). */
const ASSETS = `${import.meta.env.BASE_URL}humanoid/`;

/** One frame of the hero: feet position, velocity, facing (the humanoid's yaw), gait. */
export interface HeroPose {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  gait: MoveState;
}

export class HeroView {
  private time = 0;
  private constructor(private readonly body: Humanoid) {}

  static async create(seed: number): Promise<HeroView> {
    setHumanAssetBase(ASSETS);
    // A man in his twenties, of middling height (about 1.8 m).
    const app = { ...randomAppearance('human', seed, { gender: 1, age: 0.5 }), height: 0.55 };
    const body = await Humanoid.create(app, { wardrobe: TRAVELLER, castShadow: true });
    body.dress(TRAVELLER_GARB);
    body.object.name = 'hero';
    return new HeroView(body);
  }

  get object(): Object3D { return this.body.object; }
  /** Height of the body, metres. */
  get height(): number { return this.body.height; }

  /** Shown or not (first person hides it). */
  set visible(v: boolean) { this.body.object.visible = v; }

  update(p: HeroPose, dt: number, ground: GroundFn): void {
    this.time += dt;
    this.body.update({ pos: [p.pos.x, p.pos.y, p.pos.z], vel: [p.vel.x, p.vel.y, p.vel.z], yaw: p.yaw, anim: { move: p.gait } }, dt, this.time, ground);
  }
}

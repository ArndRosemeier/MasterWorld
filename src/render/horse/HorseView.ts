/**
 * The horses as drawn: Actors' horse (0.12, a 1.6 m gelding on Mesh2Motion's rig and clips) saddled and
 * bridled, one actor each, in the coat of its preset. Each frame the game says where each stands and what
 * it does; the view plays the clip for that gait at a speed that matches the ground speed, and tells the
 * game where the saddle is (the rider sits there, through every gait).
 * The coat is Actors' fur on node materials: the body in its coat colours and markings under a stack
 * of fur shells (two shaders for every horse: each coat is an input of the shared graphs).
 */
import { Matrix4, Vector3, type Group, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Animal } from '@actors/animal';
import type { HorseCoat, HorseShape } from '@actors/animal';
import type { ThreeActor } from '@actors/three';
import { furActor, gaitPace } from '../furAnimal';
import type { Stage } from '@futuremagic/stage';
import { ORIGIN } from '../origin';

/** Where the build serves the horse pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/horse/manifest.json`;
/** The coats in turn (Actors' horse presets). */
const COATS = ['bay', 'chestnut', 'grey', 'black', 'buckskin', 'palomino'];
/** What a horse does: a gait or grazing. */
export type HorseAct = 'idle' | 'eat' | 'walk' | 'trot' | 'gallop';
/** The ground speed (m/s) each moving clip shows at its own pace. */
const PACE: Partial<Record<HorseAct, number>> = { walk: 1.7, trot: 4.2, gallop: 11 };

/** One frame of a horse: its feet's ground, facing (the walker's yaw), what it does and how fast. */
export interface HorsePose {
  x: number; y: number; z: number;
  yaw: number;
  act: HorseAct;
  speed: number;
}

interface Drawn {
  actor: ThreeActor;
  place: Group;
  act: HorseAct | '';
  seat: { index: number; head: Vector3 } | null;
}

export class HorseView {
  private readonly m = new Matrix4();

  private constructor(private readonly animal: Animal<HorseShape, HorseCoat>, private readonly horses: Drawn[]) {}

  /**
   * Loads the pack and `count` horses (shapes evaluated here, behind the loading screen). `tack` false:
   * no saddle or bridle (horses at grass); `coat0` the first horse's place in the coats.
   */
  static async make(renderer: WebGPURenderer, count: number, { tack: saddled = true, coat0 = 0 } = {}): Promise<HorseView> {
    const lead = await Animal.load<HorseShape, HorseCoat>(PACK);
    const tack = (lead.runtime.manifest.meshes ?? []).filter((m) => m.tags?.includes('tack')).map((m) => m.name);
    const horses: Drawn[] = [];
    for (let i = 0; i < count; i++) {
      const a = i === 0 ? lead : Animal.share(lead);
      a.setPreset(COATS[(i + coat0) % COATS.length]);
      // Tack first: the shape applies pending visibility, so its meshes exist before the warm-up compiles.
      const { actor, place } = await furActor(a as never, renderer, 'horse', (actor) => { if (saddled) for (const name of tack) actor.setVisible(name, true); });
      const seatBone = (a.extra.seat?.bone) ?? 'saddle';
      const f = actor.fittedSkeleton;
      const index = f ? f.names.indexOf(seatBone) : -1;
      horses.push({ actor, place, act: '', seat: f && index >= 0 ? { index, head: new Vector3(...f.heads[index]) } : null });
    }
    return new HorseView(lead, horses);
  }

  get drawn(): number { return this.horses.length; }

  /**
   * What the warm-up compiles: every horse. Their materials are cache hits after the first, but each
   * skinned mesh gets shadow-pass shaders of its own, which would otherwise build in play.
   */
  warmObjects(): Object3D[] { return this.horses.map((h) => h.place); }

  /** Into the scene, after the warm-up (each compiled on the way, cache hits after the first). */
  async show(stage: Stage): Promise<void> {
    for (const h of this.horses) await stage.add(h.place);
  }

  /** Show or hide horse `i` (a hidden one need not be posed). */
  shown(i: number, on: boolean): void { this.horses[i].place.visible = on; }

  /** Each frame: where horse `i` is and what it does. */
  pose(i: number, p: HorsePose, dt: number): void {
    const h = this.horses[i];
    h.place.position.copy(p);
    // The walker's yaw turns −z; Actors' horse faces +z.
    h.place.rotation.y = p.yaw + Math.PI;
    if (p.act !== h.act) {
      h.act = p.act;
      const act = p.act;
      void this.animal.runtime.loadClip(act).then((clip) => { if (h.act === act) h.actor.play(clip); });
    }
    gaitPace(h.actor, p.speed, PACE[p.act]);
    h.actor.update(dt);
  }

  /**
   * The lowest point of horse `i`'s saddle in the world (where the rider's seat goes), after `pose`;
   * null before its shape is known.
   */
  saddle(i: number, out: Vector3): Vector3 | null {
    const h = this.horses[i];
    if (!h.seat || !h.actor.skeleton) return null;
    h.place.updateMatrixWorld(true);
    // The seat bone's motion since the bind pose, applied to its bind-pose head (like a skinned vertex).
    const bone = h.actor.bones[h.seat.index];
    this.m.multiplyMatrices(bone.matrixWorld, h.actor.skeleton.boneInverses[h.seat.index]);
    // matrixWorld is relative to the floating origin (render/origin.ts): back to the world.
    return ORIGIN.toWorld(out.copy(h.seat.head).applyMatrix4(this.m));
  }
}

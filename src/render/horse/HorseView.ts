/**
 * The horses as drawn: Actors' horse (0.12, a 1.6 m gelding on Mesh2Motion's rig and clips) saddled and
 * bridled, one actor each, in the coat of its preset. Each frame the game says where each stands and what
 * it does; the view plays the clip for that gait at a speed that matches the ground speed, and tells the
 * game where the saddle is (the rider sits there, through every gait).
 * The coat is Actors' fur on node materials: the body in its coat colours and markings under a stack
 * of fur shells (two shaders for every horse: each coat is an input of the shared graphs).
 */
import { Group, Matrix4, Vector3, type Object3D, type WebGPURenderer, type Mesh } from 'three/webgpu';
import { Animal } from '@actors/animal';
import type { HorseCoat, HorseShape } from '@actors/animal';
import { ThreeActor, createFurUniforms, setFurCoat } from '@actors/three';
import { addNodeFurShells, animalNodeMaterials } from '@actors/three/webgpu';
import type { Stage } from '@futuremagic/stage';

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

  /** Loads the pack and `count` horses (shapes evaluated here, behind the loading screen). */
  static async make(renderer: WebGPURenderer, count: number): Promise<HorseView> {
    const lead = await Animal.load<HorseShape, HorseCoat>(PACK);
    const reversedDepth = renderer.reversedDepthBuffer === true;
    const tack = (lead.runtime.manifest.meshes ?? []).filter((m) => m.tags?.includes('tack')).map((m) => m.name);
    const horses: Drawn[] = [];
    for (let i = 0; i < count; i++) {
      const a = i === 0 ? lead : Animal.share(lead);
      a.setPreset(COATS[i % COATS.length]);
      const fur = createFurUniforms();
      const actor = new ThreeActor(a.runtime, animalNodeMaterials(fur), { reversedDepth });
      // Tack first: the shape applies pending visibility, so its meshes exist before the warm-up compiles.
      for (const name of tack) actor.setVisible(name, true);
      actor.applyShape(await a.evaluate());
      actor.object.position.y = actor.groundOffset();
      setFurCoat(fur, a.coat as never, a.shape.size);
      addNodeFurShells(actor, fur);
      const place = new Group();
      place.name = 'horse';
      place.add(actor.object);
      const seatBone = (a.extra.seat?.bone) ?? 'saddle';
      const f = actor.fittedSkeleton;
      const index = f ? f.names.indexOf(seatBone) : -1;
      horses.push({ actor, place, act: '', seat: f && index >= 0 ? { index, head: new Vector3(...f.heads[index]) } : null });
    }
    // (The fur shells cast no shadow: the body does.)
    for (const o of horses) o.place.traverse((m) => { if ((m as Mesh).isMesh && !m.name.endsWith(':fur')) (m as Mesh).castShadow = true; });
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

  /** Each frame: where horse `i` is and what it does. */
  pose(i: number, p: HorsePose, dt: number): void {
    const h = this.horses[i];
    h.place.position.set(p.x, p.y, p.z);
    // The walker's yaw turns −z; Actors' horse faces +z.
    h.place.rotation.y = p.yaw + Math.PI;
    if (p.act !== h.act) {
      h.act = p.act;
      const act = p.act;
      void this.animal.runtime.loadClip(act).then((clip) => { if (h.act === act) h.actor.play(clip); });
    }
    const pace = PACE[p.act];
    const action = h.actor.currentAction;
    if (action) action.timeScale = pace ? Math.min(1.6, Math.max(0.5, p.speed / pace)) : 1;
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
    return out.copy(h.seat.head).applyMatrix4(this.m);
  }
}

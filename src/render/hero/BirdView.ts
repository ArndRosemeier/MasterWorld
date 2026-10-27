/**
 * The hero's bird form as drawn (game/birdForm.ts): WildMesh3D's pheasant (a library animal, render/libraryAnimals.ts
 * BIRD_CLIPS) banking and pitching as it flies, and the swirl of glowing feathers the change of shape shows. Both are
 * compiled (stage.prepare, every shadow caster too) before they are first shown: the change starts loading them,
 * and a hero who knows the ability has them warmed at the start. A build without PrivateAssets has no pheasant
 * (`BirdView.load` gives null) and the ability says so.
 */
import { Group, InstancedMesh, LoopOnce, Matrix4, PlaneGeometry, Quaternion, Vector3, Euler } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { LibraryAnimal } from '@actors/three';
import { hash2f } from '@futuremagic/core';
import type { BirdDoing } from '../../sim/birdFlight';
import { BIRD_CLIPS, LIBRARY_KINDS } from '../libraryAnimals';
import { shelvedAnimal } from '../dungeon/animals';
import { FEATHER, FEATHER_GLOW } from '../materials/feathers';
import { preparePeople } from './play';

/** Feathers in the swirl. */
const FEATHERS = 140;
/** Played once and held (the rest loop). */
const ONCE: readonly BirdDoing[] = ['takeoff', 'land'];

/** One frame of the bird: where, facing (the walker's yaw), banked, nose up, doing what, how big (0..1 while changing). */
export interface BirdPose {
  readonly x: number; readonly y: number; readonly z: number;
  readonly yaw: number; readonly bank: number; readonly pitch: number;
  readonly doing: BirdDoing;
  readonly scale: number;
}

export class BirdView {
  readonly place = new Group();
  readonly swirl: InstancedMesh;
  private doing: BirdDoing | 'call' | '' = '';
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private spin = 0;

  private constructor(private readonly lib: LibraryAnimal) {
    this.place.name = 'bird form';
    this.place.add(lib.object);
    lib.object.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) o.castShadow = true; });
    // A feather: 9 cm wide, 24 cm long, its quill at the bottom.
    const g = new PlaneGeometry(0.09, 0.24);
    g.translate(0, 0.12, 0);
    this.swirl = new InstancedMesh(g, FEATHER.make(), FEATHERS);
    this.swirl.name = 'feather swirl';
    this.swirl.frustumCulled = false;
    this.swirl.castShadow = this.swirl.receiveShadow = false;
  }

  /** The pheasant loaded and compiled, with the swirl, both hidden and in the scene; null without the pheasant. */
  static async forHero(stage: Stage): Promise<BirdView | null> {
    const lib = await shelvedAnimal(LIBRARY_KINDS.pheasant.ids[0]);
    if (!lib) return null;
    const v = new BirdView(lib);
    lib.play(BIRD_CLIPS.idle);
    await preparePeople(stage, v.place);
    await preparePeople(stage, v.swirl);
    v.place.visible = v.swirl.visible = false;
    await stage.add(v.place);
    await stage.add(v.swirl);
    return v;
  }

  /** Off: neither the bird nor the feathers drawn. */
  hide(): void {
    this.place.visible = false;
    this.swirl.visible = false;
    FEATHER_GLOW.value = 0;
  }

  /** The bird at `p` (scale 0: not drawn). */
  pose(p: BirdPose, dt: number): void {
    const o = this.place;
    o.visible = p.scale > 0.01;
    if (!o.visible) return;
    o.position.copy(p);
    // The walker's yaw turns −z; the pheasant faces +z. Nose up is a turn about its own x, banking one about its z.
    o.rotation.set(-p.pitch, p.yaw + Math.PI, p.bank, 'YXZ');
    o.scale.setScalar(p.scale);
    if (p.doing !== this.doing && this.doing !== 'call') this.play(p.doing);
    else if (this.doing === 'call' && !this.lib.currentAction?.isRunning()) this.play(p.doing);
    this.lib.update(dt);
  }

  /** It calls (once, on becoming the bird), then goes on with what it does. */
  cry(): void {
    const name = this.lib.clipNames.find((n) => n.startsWith('PheasantM_Call_Common'));
    if (!name) return;
    this.doing = 'call';
    this.lib.play(name, { fade: 0.25, loop: false });
  }

  private play(doing: BirdDoing): void {
    this.doing = doing;
    this.lib.play(BIRD_CLIPS[doing], { fade: 0.25, loop: !ONCE.includes(doing) });
    const a = this.lib.currentAction;
    if (a && ONCE.includes(doing)) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; }
  }

  /**
   * The swirl round (x, y, z) at `glow` (0 none, 1 full): feathers wheel up a column `height` high and `radius`
   * wide, faster as `pace` rises. Each feather's place on the wheel is its own (seeded, never random).
   */
  feathers(x: number, y: number, z: number, glow: number, radius: number, height: number, pace: number, dt: number): void {
    const show = glow > 0.005;
    this.swirl.visible = show;
    FEATHER_GLOW.value = Math.min(1, Math.max(0, glow));
    if (!show) return;
    this.spin += dt * (0.8 + pace * 4);
    this.swirl.position.set(x, y, z);
    for (let i = 0; i < FEATHERS; i++) {
      const a = hash2f(i, 1, 31), b = hash2f(i, 2, 37), c = hash2f(i, 3, 41);
      const turn = this.spin * (0.7 + a * 0.6) + a * Math.PI * 2;
      const r = radius * (0.55 + b * 0.6);
      const h = ((c + this.spin * 0.08 * (0.5 + b)) % 1) * height;
      this.p.set(Math.cos(turn) * r, h, Math.sin(turn) * r);
      // Each feather lies along the wheel, tilted up as it rises, and flutters about its quill.
      this.e.set(0.6 + Math.sin(this.spin * 3 + i) * 0.5, -turn, 1.2 + b, 'YXZ');
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.6 + c * 0.8);
      this.swirl.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.swirl.instanceMatrix.needsUpdate = true;
  }
}

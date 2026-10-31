/**
 * The hero's animal forms as drawn (game/birdForm.ts): a library animal (render/libraryAnimals.ts) turning, banking
 * and pitching as it moves, and the swirl the change of shape shows round the hero: WildMesh3D's pheasant in glowing
 * feathers for bird form, its mink (as an otter) in silver bubbles for otter form. Both are compiled (stage.prepare,
 * every shadow caster too) before they are first shown: the change starts loading them, and a hero who knows the
 * ability has them warmed at the start. A build without PrivateAssets has no such animal (`forHero` gives null) and
 * the ability says so.
 */
import { Group, InstancedMesh, LoopOnce, Matrix4, PlaneGeometry, Quaternion, Vector3, Euler } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { LibraryAnimal } from '@actors/three';
import { hash2f } from '@futuremagic/core';
import type { BirdDoing } from '../../sim/birdFlight';
import type { OtterDoing } from '../../sim/otterSwim';
import { BIRD_CLIPS, LIBRARY_KINDS, OTTER_CLIPS } from '../libraryAnimals';
import { shelvedAnimal } from '../dungeon/animals';
import type { MaterialKind } from '../materials';
import { BUBBLE, BUBBLE_GLOW, FEATHER, FEATHER_GLOW } from '../materials/feathers';
import { preparePeople } from './play';

/** What an animal form looks like: its library animal and clips, and the swirl of its change. */
export interface FormLook<D extends string> {
  readonly name: string;
  readonly id: string;
  readonly clips: Readonly<Record<D, string>>;
  /** Played once and held (the rest loop). */
  readonly once: readonly D[];
  /** The start of its call clip's name (played once on becoming it). */
  readonly call: string;
  /** Times the model's own size. */
  readonly scale: number;
  readonly swirl: {
    readonly name: string;
    readonly kind: MaterialKind;
    readonly glow: { value: number };
    readonly count: number;
    /** One piece's quad (m): width, height (its foot at the bottom). */
    readonly w: number; readonly h: number;
  };
}

export const BIRD_LOOK: FormLook<BirdDoing> = {
  name: 'bird form', id: LIBRARY_KINDS.pheasant.ids[0], clips: BIRD_CLIPS, once: ['takeoff', 'land'], call: 'PheasantM_Call_Common', scale: 1,
  // A feather: 9 cm wide, 24 cm long, its quill at the bottom.
  swirl: { name: 'feather swirl', kind: FEATHER, glow: FEATHER_GLOW, count: 140, w: 0.09, h: 0.24 },
};

export const OTTER_LOOK: FormLook<OtterDoing> = {
  name: 'otter form', id: LIBRARY_KINDS.otter.ids[0], clips: OTTER_CLIPS, once: ['dive'], call: 'idle_call_shared', scale: LIBRARY_KINDS.otter.scale,
  // A bubble: 7 cm across.
  swirl: { name: 'bubble swirl', kind: BUBBLE, glow: BUBBLE_GLOW, count: 160, w: 0.07, h: 0.07 },
};

/** One frame of the animal: where, facing (the walker's yaw), banked, nose up, doing what, how big (0..1 while changing). */
export interface FormPose<D extends string> {
  readonly x: number; readonly y: number; readonly z: number;
  readonly yaw: number; readonly bank: number; readonly pitch: number;
  readonly doing: D;
  readonly scale: number;
}

export class FormView<D extends string> {
  readonly place = new Group();
  readonly swirl: InstancedMesh;
  private doing: D | 'call' | '' = '';
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private spin = 0;

  private constructor(private readonly lib: LibraryAnimal, private readonly look: FormLook<D>) {
    this.place.name = look.name;
    this.place.add(lib.object);
    lib.object.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) o.castShadow = true; });
    const sw = look.swirl, g = new PlaneGeometry(sw.w, sw.h);
    g.translate(0, sw.h / 2, 0);
    this.swirl = new InstancedMesh(g, sw.kind.make(), sw.count);
    this.swirl.name = sw.name;
    this.swirl.frustumCulled = false;
    this.swirl.castShadow = this.swirl.receiveShadow = false;
  }

  /** The animal loaded and compiled, with its swirl, both hidden and in the scene; null without the animal. */
  static async forHero<D extends string>(stage: Stage, look: FormLook<D>, first: D): Promise<FormView<D> | null> {
    const lib = await shelvedAnimal(look.id);
    if (!lib) return null;
    const v = new FormView(lib, look);
    lib.play(look.clips[first]);
    await preparePeople(stage, v.place);
    await preparePeople(stage, v.swirl);
    v.place.visible = v.swirl.visible = false;
    await stage.add(v.place);
    await stage.add(v.swirl);
    return v;
  }

  /** Off: neither the animal nor the swirl drawn. */
  hide(): void {
    this.place.visible = false;
    this.swirl.visible = false;
    this.look.swirl.glow.value = 0;
  }

  /** The animal at `p` (scale 0: not drawn). */
  pose(p: FormPose<D>, dt: number): void {
    const o = this.place;
    o.visible = p.scale > 0.01;
    if (!o.visible) return;
    o.position.copy(p);
    // The walker's yaw turns −z; the animals face +z. Nose up is a turn about its own x, banking one about its z.
    o.rotation.set(-p.pitch, p.yaw + Math.PI, p.bank, 'YXZ');
    o.scale.setScalar(p.scale * this.look.scale);
    if (p.doing !== this.doing && this.doing !== 'call') this.play(p.doing);
    else if (this.doing === 'call' && !this.lib.currentAction?.isRunning()) this.play(p.doing);
    this.lib.update(dt);
  }

  /** It calls (once, on becoming the animal), then goes on with what it does. */
  cry(): void {
    const name = this.lib.clipNames.find((n) => n.startsWith(this.look.call));
    if (!name) return;
    this.doing = 'call';
    this.lib.play(name, { fade: 0.25, loop: false });
  }

  private play(doing: D): void {
    this.doing = doing;
    const once = this.look.once.includes(doing);
    this.lib.play(this.look.clips[doing], { fade: 0.25, loop: !once });
    const a = this.lib.currentAction;
    if (a && once) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; }
  }

  /**
   * The swirl round (x, y, z) at `glow` (0 none, 1 full): its pieces wheel up a column `height` high and `radius`
   * wide, faster as `pace` rises. Each piece's place on the wheel is its own (seeded, never random).
   */
  wheel(x: number, y: number, z: number, glow: number, radius: number, height: number, pace: number, dt: number): void {
    const show = glow > 0.005;
    this.swirl.visible = show;
    this.look.swirl.glow.value = Math.min(1, Math.max(0, glow));
    if (!show) return;
    this.spin += dt * (0.8 + pace * 4);
    this.swirl.position.set(x, y, z);
    for (let i = 0; i < this.look.swirl.count; i++) {
      const a = hash2f(i, 1, 31), b = hash2f(i, 2, 37), c = hash2f(i, 3, 41);
      const turn = this.spin * (0.7 + a * 0.6) + a * Math.PI * 2;
      const r = radius * (0.55 + b * 0.6);
      const h = ((c + this.spin * 0.08 * (0.5 + b)) % 1) * height;
      this.p.set(Math.cos(turn) * r, h, Math.sin(turn) * r);
      // Each piece lies along the wheel, tilted up as it rises, and flutters about its foot.
      this.e.set(0.6 + Math.sin(this.spin * 3 + i) * 0.5, -turn, 1.2 + b, 'YXZ');
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.6 + c * 0.8);
      this.swirl.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.swirl.instanceMatrix.needsUpdate = true;
  }
}

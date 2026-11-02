/**
 * Small life as drawn (sim/smallLife.ts moves it): every bird in one draw (@futuremagic/creatures
 * BirdBatch), every fish near a camera under the water in another (FishBatch), each only as far off as it would still cover a pixel or so; the nearest squirrels on
 * Actors' squirrel in its fur (render/dungeon/animals.ts), at most MAX of them within REACH. A squirrel's
 * body is made the first time one is near (its pack loads then, not at the start) and compiled under the
 * shader cap before it shows; one keeps its body while it stays among the nearest.
 */
import type { Object3D, Vector3, WebGPURenderer } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { BirdBatch, FishBatch } from '@futuremagic/creatures/three';
import { createBirdMaterial, createFishMaterial } from '../materials/creatures';
import { animalBody, poseAnimal, type AnimalBody, type AnimalDoing } from '../dungeon/animals';
import { preparePeople } from '../hero/play';
import type { SmallLife, Squirrel, SquirrelDoing } from '../../sim/smallLife';

/** Birds drawn at most; how far off one is drawn per metre of its length. */
const BIRDS = 384, BIRD_REACH = 600;
/** Fish drawn at most, and how far off (m: the murk hides them beyond). */
const FISH = 512, FISH_REACH = 40;
/** Squirrel bodies at most, and how near (m) one must be to get a body. */
const MAX = 4, REACH = 45;
/** Seconds without new squirrel bodies after one could not be made. */
const PAUSE = 30;

const DOING: Record<SquirrelDoing, AnimalDoing> = { idle: 'idle', alert: 'alert', eat: 'feed', hop: 'walk', run: 'run', flick: 'flick', climb: 'run', cling: 'idle' };

interface Body { readonly look: string; readonly body: AnimalBody; who: Squirrel | null }

export class SmallLifeView {
  readonly birds = new BirdBatch(createBirdMaterial(), BIRDS);
  readonly fish = new FishBatch(createFishMaterial(), FISH);
  private readonly bodies: Body[] = [];
  private building = false;
  private sortIn = 0;
  /** After a body could not be made (its pack would not load): seconds until the next try. */
  private pause = 0;
  private warned = false;

  constructor(private readonly life: SmallLife, private readonly stage: Stage, private readonly renderer: WebGPURenderer) {}

  /** For the warm-up (the birds' and the fishes' shaders). */
  toWarm(): Object3D[] { return [this.birds.mesh, this.fish.mesh]; }

  async addBirds(): Promise<void> { await Promise.all([this.stage.add(this.birds.mesh), this.stage.add(this.fish.mesh)]); }

  /** Each frame after the life has stepped; `shown`: out of doors (not below, not inside); `wet`: the camera under the water. */
  show(dt: number, cam: Vector3, shown: boolean, wet = false): void {
    const f = this.fish;
    f.begin(cam.x, cam.y, cam.z);
    if (shown && wet) for (const fish of this.life.fish()) {
      const dx = fish.x - cam.x, dy = fish.y - cam.y, dz = fish.z - cam.z;
      if (dx * dx + dy * dy + dz * dz < FISH_REACH * FISH_REACH && !f.add(fish)) break;
    }
    f.end();
    const b = this.birds;
    b.begin(cam.x, cam.y, cam.z);
    if (shown) for (const bird of this.life.birds()) {
      const dx = bird.x - cam.x, dy = bird.y - cam.y, dz = bird.z - cam.z, reach = bird.size * BIRD_REACH;
      if (dx * dx + dy * dy + dz * dz < reach * reach && !b.add(bird)) break;
    }
    b.end();
    this.squirrels(dt, cam, shown);
  }

  get hudText(): string { return `${this.life.headcount} (${this.birds.count} + ${this.fish.count} drawn, ${this.bodies.filter((x) => x.who).length}/${this.bodies.length} squirrel bodies)`; }

  private squirrels(dt: number, cam: Vector3, shown: boolean): void {
    const off = (s: Squirrel) => Math.hypot(s.x - cam.x, s.z - cam.z);
    this.pause -= dt;
    if ((this.sortIn -= dt) <= 0) {
      this.sortIn = 0.5;
      const want = shown ? this.life.squirrels.filter((s) => !s.hidden && off(s) < REACH).sort((a, b) => off(a) - off(b)).slice(0, MAX) : [];
      for (const x of this.bodies) if (x.who && !want.includes(x.who)) x.who = null;
      for (const s of want) {
        if (this.bodies.some((x) => x.who === s)) continue;
        const free = this.bodies.find((x) => !x.who && x.look === s.look);
        if (free) free.who = s;
        else if (this.bodies.length < MAX * 2 && !this.building && this.pause <= 0) void this.makeBody(s);
      }
    }
    for (const x of this.bodies) {
      const s = x.who;
      x.body.place.visible = !!s && shown && !s.hidden;
      if (!s || !x.body.place.visible) continue;
      poseAnimal(x.body, s.x, s.y, s.z, 0, DOING[s.doing], s.speed, dt);
      // Nose up a trunk or down it; on the ground level.
      x.body.place.rotation.set(-s.pitch, Math.PI / 2 - s.heading, 0, 'YXZ');
    }
  }

  /** A body in the look of `s`, compiled under the cap, then given to it (if it still wants one). */
  private async makeBody(s: Squirrel): Promise<void> {
    this.building = true;
    try {
      const body = await animalBody('squirrel', s.seed, this.renderer, s.look);
      if (!body) return;
      body.place.visible = false;
      // A squirrel's shadow is a speck: none, and no shadow shaders to build in play.
      body.place.traverse((m) => { m.castShadow = false; });
      await preparePeople(this.stage, body.place);
      await this.stage.add(body.place);
      this.bodies.push({ look: s.look, body, who: null });
      this.sortIn = 0;
    } catch (err) {
      // No squirrels for a while (the woods go on without them), and one note rather than one per squirrel.
      if (!this.warned) console.warn('squirrels:', err instanceof Error ? err.message : err);
      this.warned = true;
      this.pause = PAUSE;
    } finally {
      this.building = false;
    }
  }
}

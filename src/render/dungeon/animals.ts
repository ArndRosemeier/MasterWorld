/**
 * The wild's wolves and deer as drawn: Actors' animals (the dog pack's grey wolf, the deer pack's red
 * deer) in their fur, like the town's horses (render/horse/HorseView.ts). Each creature is one actor;
 * the first of a kind loads its pack (shapes evaluated in a worker), the others share it. Each frame
 * the den says what the creature does; the body plays the clip for it, a blow, a flinch or the fall
 * once, the gaits looping at a pace that matches the ground speed.
 */
import { LoopOnce, type Group, type WebGPURenderer } from 'three/webgpu';
import { Animal } from '@actors/animal';
import AnimalWorker from '@actors/animal/worker?worker';
import type { ThreeActor } from '@actors/three';
import { hash2f } from '@futuremagic/core';
import { furActor, gaitPace } from '../furAnimal';

/** What a wild animal does this frame (from its den state). */
export type AnimalDoing = 'idle' | 'alert' | 'feed' | 'walk' | 'run' | 'blow' | 'hurt' | 'dead';

interface Kind {
  readonly pack: string;
  readonly preset: string;
  /** The pack's clip for each thing it does (null: the idle). */
  readonly clips: Record<AnimalDoing, string | null>;
  /** The ground speed (m/s) its walk and run show at their own pace. */
  readonly pace: { readonly walk: number; readonly run: number };
}

/** The setting's beasts Actors has a body for (the boar has none: a grown critter draws it). */
export const ANIMAL_KINDS: Partial<Record<string, Kind>> = {
  wolf: {
    pack: 'dog', preset: 'wolf',
    clips: { idle: 'idle', alert: 'alert', feed: 'idle', walk: 'walk', run: 'run', blow: 'bite', hurt: null, dead: 'death' },
    pace: { walk: 1.5, run: 7 },
  },
  deer: {
    pack: 'deer', preset: 'red',
    clips: { idle: 'idle', alert: 'idle2', feed: 'eat', walk: 'walk', run: 'gallop', blow: 'kick', hurt: 'hit', dead: 'death' },
    pace: { walk: 1.5, run: 10 },
  },
};

/** Played once and held (the rest loop). */
const ONCE: readonly AnimalDoing[] = ['blow', 'hurt', 'dead'];

export interface AnimalBody {
  readonly kind: 'animal';
  readonly place: Group;
  readonly actor: ThreeActor;
  readonly animal: Animal<object, object>;
  readonly def: Kind;
  doing: AnimalDoing | '';
}

/** The loaded packs (one per kind, shared by all its animals). */
const leads = new Map<string, Promise<Animal<object, object>>>();

function lead(pack: string): Promise<Animal<object, object>> {
  let p = leads.get(pack);
  if (!p) {
    p = (async () => {
      const a = await Animal.load<object, object>(`${import.meta.env.BASE_URL}packs/${pack}/manifest.json`);
      await a.useWorker(new AnimalWorker());
      return a;
    })();
    leads.set(pack, p);
  }
  return p;
}

/** One animal of a species (`wolf`, `deer`); a little bigger or smaller by `seed`. */
export async function animalBody(species: string, seed: number, renderer: WebGPURenderer): Promise<AnimalBody | null> {
  const def = ANIMAL_KINDS[species];
  if (!def) return null;
  const first = await lead(def.pack);
  const animal = Animal.share(first);
  animal.setPreset(def.preset);
  const shape = animal.shape as { size?: number };
  if (typeof shape.size === 'number') shape.size *= 0.92 + hash2f(seed, 1, 7) * 0.16;
  const { actor, place } = await furActor(animal, renderer, species);
  return { kind: 'animal', place, actor, animal, def, doing: '' };
}

/** A frame of an animal: where it stands, facing `yaw` (−z turned), what it does, how fast it goes. */
export function poseAnimal(b: AnimalBody, x: number, y: number, z: number, yaw: number, doing: AnimalDoing, speed: number, dt: number): void {
  b.place.position.set(x, y, z);
  // The den's yaw turns −z; Actors' animals face +z.
  b.place.rotation.y = yaw + Math.PI;
  // (A doing without a clip of its own, a wolf's flinch, keeps the clip playing.)
  const name = b.def.clips[doing];
  if (doing !== b.doing && name) {
    b.doing = doing;
    void b.animal.runtime.loadClip(name).then((clip) => {
      if (b.doing !== doing) return;
      b.actor.play(clip, { fade: doing === 'dead' ? 0.1 : 0.25 });
      const a = b.actor.currentAction;
      if (a && ONCE.includes(doing)) { a.time = 0; a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; }
    });
  }
  gaitPace(b.actor, speed, doing === 'walk' ? b.def.pace.walk : doing === 'run' ? b.def.pace.run : undefined);
  b.actor.update(dt);
}

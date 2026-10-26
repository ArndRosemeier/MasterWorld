/**
 * The wild's wolves and deer as drawn: Actors' animals (the dog pack's grey wolf, the deer pack's red
 * deer) in their fur, like the town's horses (render/horse/HorseView.ts). Each creature is one actor;
 * the first of a kind loads its pack (shapes evaluated in a worker), the others share it. Each frame
 * the den says what the creature does; the body plays the clip for it, a blow, a flinch or the fall
 * once, the gaits looping at a pace that matches the ground speed.
 */
import { LoopOnce, type Group, type WebGPURenderer } from 'three/webgpu';
import { Animal } from '@actors/animal';
import AnimalWorker from '../../workers/animal.worker?worker';
import type { ThreeActor } from '@actors/three';
import { hash2f } from '@futuremagic/core';
import { furActor, gaitPace } from '../furAnimal';

/** What a wild animal does this frame (from its den state). */
export type AnimalDoing = 'idle' | 'alert' | 'feed' | 'walk' | 'run' | 'blow' | 'hurt' | 'dead' | 'flick';

interface Kind {
  readonly pack: string;
  readonly preset: string;
  /** Breeds to pick from by seed (over `preset`): a herd of mixed cattle. */
  readonly presets?: readonly string[];
  /** The pack's clip for each thing it does (null or none: the clip playing goes on). */
  readonly clips: Partial<Record<AnimalDoing, string | null>>;
  /** The ground speed (m/s) its walk and run show at their own pace. */
  readonly pace: { readonly walk: number; readonly run: number };
  /** Over the preset: shape values and coat. */
  readonly shape?: Readonly<Record<string, number>>;
  readonly coat?: Readonly<Record<string, number | readonly number[]>>;
  /**
   * The coat's own colours (not its white) for every breed: `[times, hue]`, darker by `times` and up to `hue` times as
   * far from grey (the greyer the more). The game's bright, sky-blue day lifts Actors' mid-tone coats to a flat beige or
   * silver and takes their brown away, so they read as stand-ins.
   */
  readonly shade?: readonly [number, number];
}

/** The setting's beasts and the farms' cattle, on Actors' bodies (the boar on the dog's rig: Actors has no pig). */
export const ANIMAL_KINDS: Partial<Record<string, Kind>> = {
  wolf: {
    pack: 'dog', preset: 'wolf',
    clips: { idle: 'idle', alert: 'alert', feed: 'idle', walk: 'walk', run: 'run', blow: 'bite', hurt: null, dead: 'death' },
    pace: { walk: 1.5, run: 7 },
    // Grey-brown all over (warmer than it looks in Actors' light: the sky's blue cools it) with a darker saddle and a paler belly and muzzle: Actors' grey wolf reads as a
    // husky in the game's light (white face and legs, a black back), and a mid grey as pale silver.
    coat: { base: [0.4, 0.33, 0.24], second: [0.18, 0.15, 0.12], tan: [0.56, 0.42, 0.27], white: [0.58, 0.54, 0.47], saddle: 0.6, mask: 0.2, points: 0, socks: 0, blaze: 0, belly: 0.5, bib: 0.3, paleMask: 0.3, tanLegs: 0.3, agouti: 0.5 },
  },
  boar: {
    pack: 'dog', preset: 'wolf',
    clips: { idle: 'idle', alert: 'alert', feed: 'idle', walk: 'walk', run: 'run', blow: 'bite', hurt: null, dead: 'death' },
    pace: { walk: 1.2, run: 6 },
    // A boar's build: short legs under a deep heavy barrel, a big wedge of a head (a long, deep snout
    // with no stop), small pricked ears, a short straight tail; a dark coarse coat with no pale marks.
    shape: {
      size: 1.3, legs: 0.48, body: 1.15, neck: 0.7, head: 1.3, bulk: 1.45, bone: 1.4, tail: 0.3, ears: 0.75, earDrop: 0, earFold: 0,
      muzzle: 0.8, muzzleBroad: 0.8, muzzleDeep: 1, stop: 0, skullDome: 0, chestDeep: 1, bellyTuck: 0, tailCurl: 0, tailPlume: 0, cheeks: 0.5,
    },
    coat: {
      // One dark brown all over (every marking colour the same), long and bristly.
      base: [0.24, 0.19, 0.14], second: [0.24, 0.19, 0.14], tan: [0.24, 0.19, 0.14], white: [0.24, 0.19, 0.14],
      saddle: 0, mask: 0, points: 0, belly: 0, bib: 0, socks: 0, blaze: 0, tailTip: 0, spots: 0, shade: 0.15, paleMask: 0, agouti: 0.3, tanLegs: 0, length: 0.06, fluff: 0.05,
    },
  },
  // The farms' cattle (render/livestock/StockView.ts): old brown, red-pied and shaggy breeds, no modern
  // Holsteins. A cow does not run; its gallop is a startled trot.
  cow: {
    pack: 'cow', preset: 'braunvieh', presets: ['braunvieh', 'braunvieh', 'fleckvieh', 'jersey', 'highland'],
    clips: { idle: 'idle', alert: 'idle', feed: 'eat', walk: 'walk', run: 'trot', blow: 'headbutt', hurt: null, dead: 'death' },
    pace: { walk: 1, run: 2.5 },
    shade: [0.75, 1.8],
  },
  // The woods' squirrels (sim/smallLife.ts): a hop to forage, a run up the trunk, a flick of the tail.
  squirrel: {
    pack: 'squirrel', preset: 'red',
    clips: { idle: 'idle', alert: 'alert', feed: 'eat', walk: 'hop', run: 'run', flick: 'flick', dead: 'death' },
    pace: { walk: 1.3, run: 4.5 },
    // A full brush of a tail (the presets' is thin at game distance).
    shape: { tailPlume: 1 },
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
    // A pack that failed (offline, or missing from the build) is asked for again by the next body, not kept failed.
    p.catch(() => { if (leads.get(pack) === p) leads.delete(pack); });
    leads.set(pack, p);
  }
  return p;
}

/** One animal of a species (`wolf`, `deer`); a little bigger or smaller by `seed`; `preset` over the kind's own. */
export async function animalBody(species: string, seed: number, renderer: WebGPURenderer, preset?: string): Promise<AnimalBody | null> {
  const def = ANIMAL_KINDS[species];
  if (!def) return null;
  const first = await lead(def.pack);
  const animal = Animal.share(first);
  animal.setPreset(preset ?? (def.presets ? def.presets[Math.floor(hash2f(seed, 2, 9) * def.presets.length) % def.presets.length] : def.preset));
  if (def.shape || def.coat) animal.params = { shape: { ...animal.shape, ...def.shape }, coat: { ...animal.coat, ...def.coat } };
  if (def.shade) animal.params = { shape: animal.shape, coat: shaded(animal.coat as Record<string, unknown>, ...def.shade) };
  const shape = animal.shape as { size?: number };
  if (typeof shape.size === 'number') shape.size *= 0.92 + hash2f(seed, 1, 7) * 0.16;
  const { actor, place } = await furActor(animal, renderer, species);
  return { kind: 'animal', place, actor, animal, def, doing: '' };
}

/** `coat` with its base, second and tan colours times `k`, and up to `hue` times as far from their grey (sRGB, kept in 0..1; the white and the nose stay). */
export function shaded(coat: Record<string, unknown>, k: number, hue = 1): Record<string, unknown> {
  const out = { ...coat };
  for (const key of ['base', 'second', 'tan']) {
    const c = coat[key];
    if (!Array.isArray(c)) continue;
    // Greyer coats gain the most (a red Highland is red enough already).
    const grey = (c[0] + c[1] + c[2]) / 3, top = Math.max(...c), sat = top > 0 ? (top - Math.min(...c)) / top : 0;
    const h = 1 + (hue - 1) * (1 - sat);
    out[key] = c.map((v: number) => Math.min(1, Math.max(0, (grey + (v - grey) * h) * k)));
  }
  return out;
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

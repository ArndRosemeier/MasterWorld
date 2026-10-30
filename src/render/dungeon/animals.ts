/**
 * The wild's wolves, boars and deer and the farms' cattle as drawn: the library animals (WildMesh3D's
 * modelled and animated wolf, wild boar, red deer and cow, loaded through Actors' `loadLibraryAnimal`)
 * where the build has them, else Actors' generated animals in their fur (the dog pack's grey wolf, the
 * deer pack's red deer, the cow pack), like the town's horses (render/horse/HorseView.ts). The library
 * files are licensed for Arnd's games only: they live in the private PrivateAssets repository and
 * `npm run packs` copies the ones used here into public/wildmesh3d when it can reach them
 * (tools/packs/library.mjs); a build without them draws Actors' animals.
 *
 * Each creature is one body; the first of a kind loads its file or pack (an Actors shape is evaluated in
 * a worker), the others share it. Each frame the den says what the creature does; the body plays the
 * clip for it, a blow, a flinch or the fall once, the gaits looping at a pace that matches the ground speed.
 */
import { Group, LoopOnce, type WebGPURenderer } from 'three/webgpu';
import { Animal } from '@actors/animal';
import AnimalWorker from '../../workers/animal.worker?worker';
import { loadLibraryAnimal, type LibraryAnimal, type ThreeActor } from '@actors/three';
import { LIBRARY_KINDS, libraryClip, type AnimalDoing, type LibraryKind } from '../libraryAnimals';
import { hash2f } from '@futuremagic/core';
import { furActor, gaitPace } from '../furAnimal';

export type { AnimalDoing };

interface Kind {
  /** Drawn as library animals where the build has their files (else as the Actors pack below). */
  readonly library?: LibraryKind;
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
    library: LIBRARY_KINDS.wolf,
    pack: 'dog', preset: 'wolf',
    clips: { idle: 'idle', alert: 'alert', feed: 'idle', walk: 'walk', run: 'run', blow: 'bite', hurt: null, dead: 'death' },
    pace: { walk: 1.5, run: 7 },
    // Grey-brown all over (warmer than it looks in Actors' light: the sky's blue cools it) with a darker saddle and a paler belly and muzzle: Actors' grey wolf reads as a
    // husky in the game's light (white face and legs, a black back), and a mid grey as pale silver.
    coat: { base: [0.4, 0.33, 0.24], second: [0.18, 0.15, 0.12], tan: [0.56, 0.42, 0.27], white: [0.58, 0.54, 0.47], saddle: 0.6, mask: 0.2, points: 0, socks: 0, blaze: 0, belly: 0.5, bib: 0.3, paleMask: 0.3, tanLegs: 0.3, agouti: 0.5 },
  },
  boar: {
    library: LIBRARY_KINDS.boar,
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
    library: LIBRARY_KINDS.cow,
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
    library: LIBRARY_KINDS.deer,
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
  /** The Actors animal (null: a library animal). */
  readonly actor: ThreeActor | null;
  readonly animal: Animal<object, object> | null;
  /** The library animal (null: an Actors animal). */
  readonly lib: LibraryAnimal | null;
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

/** Where the build serves the library animals (tools/packs/library.mjs). */
const LIBRARY = `${import.meta.env.BASE_URL}wildmesh3d/`;
let shelf: Promise<ReadonlySet<string>> | null = null;

/** The library animals this build has (its index; none when the build was made without PrivateAssets). */
export function libraryShelf(): Promise<ReadonlySet<string>> {
  shelf ??= fetch(`${LIBRARY}index.json`)
    .then((r) => (r.ok ? r.json() : { ids: [] }))
    .then((j: { ids?: unknown }) => new Set(Array.isArray(j.ids) ? j.ids.filter((x): x is string => typeof x === 'string') : []))
    // Not there (a dev server answers with the page): Actors' animals.
    .catch(() => new Set<string>());
  return shelf;
}

/** A library animal by id, loaded, or null when this build does not have it. */
export async function shelvedAnimal(id: string): Promise<LibraryAnimal | null> {
  return (await libraryShelf()).has(id) ? loadLibraryAnimal(id, { baseUrl: LIBRARY }) : null;
}

/** One animal of a species (`wolf`, `deer`); a little bigger or smaller by `seed`; `preset` over the kind's own. */
export async function animalBody(species: string, seed: number, renderer: WebGPURenderer, preset?: string): Promise<AnimalBody | null> {
  const def = ANIMAL_KINDS[species];
  if (!def) return null;
  const size = 0.92 + hash2f(seed, 1, 7) * 0.16;
  if (def.library && !preset) {
    const ids = def.library.ids;
    const id = ids[Math.floor(hash2f(seed, 2, 9) * ids.length) % ids.length];
    const lib = await shelvedAnimal(id);
    if (lib) {
      const place = new Group();
      place.name = species;
      place.add(lib.object);
      lib.object.scale.setScalar((def.library.scale ?? 1) * size);
      return { kind: 'animal', place, actor: null, animal: null, lib, def, doing: '' };
    }
  }
  const first = await lead(def.pack);
  const animal = Animal.share(first);
  animal.setPreset(preset ?? (def.presets ? def.presets[Math.floor(hash2f(seed, 2, 9) * def.presets.length) % def.presets.length] : def.preset));
  if (def.shape || def.coat) animal.params = { shape: { ...animal.shape, ...def.shape }, coat: { ...animal.coat, ...def.coat } };
  if (def.shade) animal.params = { shape: animal.shape, coat: shaded(animal.coat as Record<string, unknown>, ...def.shade) };
  const shape = animal.shape as { size?: number };
  if (typeof shape.size === 'number') shape.size *= size;
  const { actor, place } = await furActor(animal, renderer, species);
  return { kind: 'animal', place, actor, animal, lib: null, def, doing: '' };
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

/**
 * A frame of an animal: where it stands, facing `yaw` (−z turned), what it does, how fast it goes; `again`: a
 * one-shot (a second flinch) starts over though it is already playing.
 */
export function poseAnimal(b: AnimalBody, x: number, y: number, z: number, yaw: number, doing: AnimalDoing, speed: number, dt: number, again = false): void {
  b.place.position.set(x, y, z);
  // The den's yaw turns −z; the animals face +z.
  b.place.rotation.set(0, yaw + Math.PI, 0);
  if (again && ONCE.includes(doing)) b.doing = '';
  if (b.lib) { poseLibrary(b, b.lib, b.def.library!, doing, speed, dt); return; }
  const actor = b.actor!;
  // (A doing without a clip of its own, a wolf's flinch, keeps the clip playing.)
  const name = b.def.clips[doing];
  if (doing !== b.doing && name) {
    b.doing = doing;
    void b.animal!.runtime.loadClip(name).then((clip) => {
      if (b.doing !== doing) return;
      actor.play(clip, { fade: doing === 'dead' ? 0.1 : 0.25 });
      const a = actor.currentAction;
      if (a && ONCE.includes(doing)) { a.time = 0; a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; }
    });
  }
  gaitPace(actor, speed, doing === 'walk' ? b.def.pace.walk : doing === 'run' ? b.def.pace.run : undefined);
  actor.update(dt);
}

/** A frame of a library animal's clips (`b.doing`: what it did last frame): the clip for `doing`, the gait at the ground speed. */
export function poseLibrary(b: { doing: AnimalDoing | '' }, lib: LibraryAnimal, kind: LibraryKind, doing: AnimalDoing, speed: number, dt: number): void {
  const name = doing !== b.doing ? libraryClip(lib, kind, doing) : undefined;
  if (name) {
    b.doing = doing;
    const a = lib.play(name, { fade: !lib.currentAction ? 0 : doing === 'dead' ? 0.1 : 0.25, loop: !ONCE.includes(doing) });
    // The same one-shot again (already running, so not restarted by play): from its start.
    if (a && ONCE.includes(doing)) a.time = 0;
  }
  // The gait at its own pace when the ground speed is the clip's (its scale counted), within half to 1.6 times.
  const a = lib.currentAction;
  if (a) {
    const own = (doing === 'walk' || doing === 'run') && b.doing === doing ? lib.speedOf(a.getClip().name) * lib.object.scale.x : 0;
    a.timeScale = own > 0 ? Math.min(1.6, Math.max(0.5, speed / own)) : 1;
  }
  lib.update(dt);
}

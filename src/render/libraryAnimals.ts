/**
 * Which library animals (WildMesh3D, in Arnd's private PrivateAssets; see render/dungeon/animals.ts) draw which
 * of the game's kinds, and their clips for what a creature does. Plain data and a clip pick, without three.js,
 * so tests check it against Actors' catalogue (@actors/animal/library) and tools/packs/library.mjs reads the ids.
 */

import type { BirdDoing } from '../sim/birdFlight';

/** What a wild animal does this frame (from its den state). */
export type AnimalDoing = 'idle' | 'alert' | 'feed' | 'walk' | 'run' | 'blow' | 'hurt' | 'dead' | 'flick' | 'rest' | 'call';

/** A kind drawn as library animals: which ones (by seed), their clips, and how big. */
export interface LibraryKind {
  /** Library ids picked by seed (a herd of stags and hinds, cows and calves). */
  readonly ids: readonly string[];
  /** For each thing it does, the clips to try in order (the first the animal has); none found: the clip playing goes on. */
  readonly clips: Partial<Record<AnimalDoing, readonly string[]>>;
  /** Times the model's own size. */
  readonly scale?: number;
}

export const LIBRARY_KINDS = {
  wolf: {
    // WildMesh3D's second wolf: the one with bites, flinches and falls of its own.
    ids: ['wolf-1'],
    clips: { idle: ['Idle', 'Idle_2'], alert: ['Idle_3', 'Idle'], feed: ['Idle_Eating'], walk: ['Walk'], run: ['Run'], blow: ['Attack_BiteForward'], hurt: ['Hit_Stand_R01', 'Hit_Stand_L01'], dead: ['Death_Stand_R01'] },
  },
  boar: {
    // A tusked wild boar with its own charge, flinch and fall (the fallback is a boar-built dog).
    ids: ['wild-boar'],
    clips: { idle: ['Idle'], alert: ['idle_alerted_bark_01'], feed: ['idle_eat_grazing_01'], walk: ['walk_fwd_01'], run: ['run_fwd_01'], blow: ['attack_02'], hurt: ['hit_hip_lft_01', 'hit_hip_rgt_01'], dead: ['dead_reaction_lft_01', 'dead_reaction_rgt_01'] },
    scale: 0.85,
  },
  cow: {
    // A red-pied cow, and now and then a calf. It grazes with Idle_3 (the head down).
    ids: ['cow', 'cow', 'cow', 'cow', 'calf'],
    clips: { idle: ['Idle', 'Idle_2'], alert: ['Alert'], feed: ['Idle_3'], walk: ['Walk_100', 'Walk_60'], run: ['Trot_300', 'Trot_200'], hurt: ['Damage'], dead: ['Death'] },
  },
  deer: {
    // Red deer: a stag to every two hinds (one rig, so the same clips).
    ids: ['red-deer-male', 'female-deer', 'female-deer'],
    clips: { idle: ['Idle'], alert: ['Idle_2', 'Idle_Idle_02', 'Idle_Breathing_01'], feed: ['Idle_Eating', 'Idle_Eating_01'], walk: ['Walk'], run: ['Sprint', 'Run'], hurt: ['Hit_Stand_L01'], dead: ['Death_Stand_R01'] },
  },
  hen: {
    // The yards' hens (sim/poultry.ts): both idles peck at the ground; at night they sit (IdleLay).
    ids: ['chicken'],
    clips: { idle: ['Idle'], feed: ['Idle2', 'Idle'], walk: ['Walk'], run: ['Run'], rest: ['IdleLay'], hurt: ['GetHit'], dead: ['Death'] },
  },
  cock: {
    // A cock to the hens: Idle_4 throws the head up and back (the crow, heard as call/rooster); Idle_2, _5 and _6 peck.
    ids: ['rooster'],
    clips: { idle: ['Idle', 'Oneleg02'], feed: ['Idle_6', 'Idle_5'], walk: ['Walk'], run: ['Run'], rest: ['Sitting01'], call: ['Idle_4'], hurt: ['Damage'], dead: ['Death'] },
  },
  pheasant: {
    // The hero's bird form (game/birdForm.ts): a cock pheasant, with flight of its own (BIRD_CLIPS).
    ids: ['pheasant'],
    clips: { idle: ['Idle', 'Idle_Breathing'], feed: ['StandGrazingA'], walk: ['WalkMedium_NoRootMotion'], run: ['RunFast_NoRootMotion'] },
  },
} satisfies Record<string, LibraryKind>;

/** The pheasant's clip for each thing the hero's bird does (game/birdForm.ts BirdDoing). */
export const BIRD_CLIPS: Readonly<Record<BirdDoing, string>> = {
  idle: 'Idle', walk: 'WalkMedium_NoRootMotion', run: 'RunFast_NoRootMotion',
  takeoff: 'TakeOf_BounceOff', flap: 'FlyFlapping_NoRootMotion', glide: 'FlyGliding_NoRootMotion', dive: 'FlyGliding_NoRootMotion', land: 'Landing_Touch',
};

/** What a doing asks of `clipFor` when the kind names no clip for it. */
const MOTION: Partial<Record<AnimalDoing, 'idle' | 'walk' | 'run' | 'eat' | 'attack' | 'hit' | 'death'>> = {
  idle: 'idle', alert: 'idle', feed: 'eat', walk: 'walk', run: 'run', blow: 'attack', hurt: 'hit', dead: 'death',
};

/**
 * The library animal's clip for `doing` (undefined: none, the clip playing goes on): the first of the kind's
 * clips it has; a doing the kind names no clips for asks `clipFor`.
 */
export function libraryClip(lib: { readonly clipNames: readonly string[]; clipFor(m: NonNullable<(typeof MOTION)[AnimalDoing]>): string | undefined }, kind: LibraryKind, doing: AnimalDoing): string | undefined {
  const want = kind.clips[doing];
  if (want) return want.find((n) => lib.clipNames.includes(n));
  const motion = MOTION[doing];
  return motion ? lib.clipFor(motion) : undefined;
}

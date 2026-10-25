/**
 * How the cellar's people look and move as Actors people: goblins, smugglers, the walking dead, ghouls. Each
 * one's body and rags from the setting's creature (race, height, outfit, skin) and its seed, and the clip
 * for what the den says it does. `FOE_CLIPS` is what `npm run packs` (tools/packs/actors.mjs) copies for
 * them besides the hero's and the townsfolk's: keep it a plain quoted list.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CharacterPatch } from '@actors/generator';
import type { RaceId } from '@actors/human';
import type { CreatureDef } from '../../setting/contract';
import { garmentColors } from '../folk/looks';

/** Clips only the cellar's people play: the dead shamble and claw, the hurt reel, the meek kneel. */
export const FOE_CLIPS = ['zombie idle', 'zombie walk', 'zombie scratch', 'hook', 'hit to head', 'repair (kneeling)', 'sword slash C'];

type Humanoid = Extract<CreatureDef['body'], { kind: 'humanoid' }>;

/** Worn, undyed and dirty cloth; leather. */
const DRAB = ['#5a4a32', '#4e4434', '#62563e', '#3f382c', '#6a5c44'];
const GRAVE = ['#5f5c52', '#4f4c44', '#6b665a'];
const LEATHER = ['#3a2416', '#2a1d14', '#4a3020'];

/** The look of creature `id` of kind `def` (seeded: the same cellar shows the same people). */
export function foeLook(def: CreatureDef, seed: number, id: number): CharacterPatch {
  const b = def.body as Humanoid;
  const r = new Rng(deriveSeed(seed, 'foe look', def.id, id));
  const female = !b.bones && r.chance(0.25);
  const { colors, wear } = garmentColors();
  const under = ['briefs', ...(female ? ['bra'] : [])];
  const outfit = b.outfit === 'bandit'
    ? [...under, wear('med-tunic', r.pick(DRAB)), wear('med-hose', r.pick(DRAB)), wear('med-jerkin', r.pick(LEATHER)), wear('med-belt', r.pick(LEATHER)),
      wear('leather-boots', r.pick(LEATHER)), ...(r.chance(0.6) ? [wear('hood-down', r.pick(DRAB))] : [])]
    : b.outfit === 'grave'
      ? [...under, wear('med-long-tunic', r.pick(GRAVE))]
      : [...under, wear('med-tunic', r.pick(DRAB)), wear('wool-pants', r.pick(DRAB))];
  return {
    race: b.race as RaceId, race2: null, raceMix: 0, raceSize: 0.5,
    body: { gender: female ? 0 : 1, ageYears: r.range(22, 55), ...(b.gaunt ? { weight: 0.1, muscle: 0.2 } : {}) },
    ...(b.skin && !b.bones ? { skinColor: b.skin } : {}),
    ...(b.bones ? { skeletal: true, skeletalLook: { bone: b.skin ?? '#d8ccb4', glow: '#4dc8ff', glowStrength: 0.6, dryness: 0.7 } } : {}),
    outfit, garmentColors: colors, anatomy: false, animation: 'idle', seed: r.float(),
  };
}

/** What a foe does this frame, as the den and the fight say. */
export interface FoeDoing {
  readonly dead: boolean;
  readonly speed: number;
  /** In a fight or on guard (weapon drawn, fight stance). */
  readonly fighting: boolean;
  /** Kneeling (begging) or bent over (rummaging). */
  readonly low: 'beg' | 'rummage' | null;
  /** The blow under way (its kind), or a flinch. */
  readonly action: 'stab' | 'swing_1h' | 'slam' | 'flinch' | null;
  /** Which of two blows (alternates). */
  readonly variant: number;
}

/** The clip for it; the dead and the gaunt (ghouls) shamble and claw. */
export function foeClip(def: CreatureDef, d: FoeDoing): string {
  const b = def.body as Humanoid;
  const dead = !!(b.bones || b.gaunt);
  if (d.dead) return 'death';
  if (d.action === 'flinch') return d.variant % 2 ? 'hit to head' : 'hit to chest';
  if (d.action === 'stab') return 'sword slash C';
  if (d.action === 'swing_1h') return d.variant % 2 ? 'sword slash B' : 'sword slash A';
  if (d.action === 'slam') return dead ? 'zombie scratch' : 'hook';
  if (d.speed > 2.6) return 'jog';
  if (d.speed > 0.2) return dead ? 'zombie walk' : 'walk';
  if (d.low === 'beg') return 'repair (kneeling)';
  if (d.low === 'rummage') return 'crouch';
  if (dead) return 'zombie idle';
  return d.fighting ? (b.held ? 'sword idle' : 'fight stance') : 'idle';
}

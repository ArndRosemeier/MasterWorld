/**
 * How the townsfolk look and move (Actors' medieval wardrobe): each person's body, hair and clothes
 * from their seed and role, and which clip shows each activity. The PACK_ lists are what
 * `npm run packs` (tools/packs/actors.mjs) copies out of the Actors pack: keep them to plain quoted ids.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CharacterPatch } from '@actors/generator';
import type { Person } from '../../sim/people';
import type { ActivityKind } from '../../sim/spots';

/** Garments worn in town. */
export const PACK_GARMENTS = [
  'briefs', 'bra', 'med-tunic', 'med-long-tunic', 'med-hose', 'med-belt', 'med-jerkin', 'med-mantle', 'laced-chemise', 'peasant-blouse',
  'gored-skirt', 'medieval-dress', 'hood-down', 'medieval-boots', 'leather-boots', 'buckled-shoes', 'cloth-shoes', 'wool-pants',
];
/** Hairstyles. */
export const PACK_HAIR = [
  'hair-short02', 'hair-short03', 'hair-short04', 'hair-short-messy', 'hair-shaggy', 'hair-short-grump', 'hair-swept-back', 'hair-short-curls',
  'hair-long01', 'hair-braid01', 'hair-ponytail01', 'hair-french-braid', 'hair-double-braid', 'hair-braid-bun', 'hair-bun', 'hair-unkempt-braid',
];
/** Clips (every name in CLIP below). */
export const PACK_CLIPS = [
  'idle', 'talk', 'arms folded', 'nod', 'walk', 'walk carrying', 'sit', 'sit and talk', 'pick up', 'interact', 'eat or drink',
  'repair (kneeling)', 'harvest', 'plant seeds', 'water plants', 'chop wood', 'crouch',
];

const MEN_HAIR = PACK_HAIR.slice(0, 8);
const WOMEN_HAIR = PACK_HAIR.slice(8);

/** Natural dyes: undyed linen and wool, browns, madder, woad, weld, walnut. */
const PLAIN = ['#b8a684', '#a89878', '#8a7a5c', '#6e5a40', '#5a4a3a', '#4a3a2a', '#7a6a4c'];
const DYED = ['#7a3a2a', '#8a4a30', '#3d5a80', '#4a5a6a', '#5f6838', '#6b6a3a', '#5e1a2b', '#2f4a3a', '#7a6a2a'];
const LEATHER = ['#4a3020', '#3a2416', '#5a3a22', '#2a1d14'];
const HAIR_COLORS = ['#2a1d14', '#3b2417', '#4a3020', '#6a4a2a', '#8a6a3a', '#b08a50', '#c8a868', '#1c1814', '#7a3a1e'];

/** Who is drawn (Actors makes adults only: children are in the simulation, not yet in the picture). */
export const drawn = (p: Person): boolean => p.role !== 'child';

/** Everything about how `p` looks. */
export function lookOf(p: Person): CharacterPatch {
  const r = new Rng(deriveSeed(p.seed, 'look'));
  const f = p.female;
  const plain = () => r.pick(PLAIN), dyed = () => r.pick(DYED), leather = () => r.pick(LEATHER);
  const colors: Record<string, string> = {};
  const wear = (id: string, c: string) => { colors[id] = c; return id; };
  let outfit: string[];
  const shoes = r.chance(0.5) ? wear('medieval-boots', leather()) : wear('leather-boots', leather());
  switch (p.role) {
    case 'trader':
      outfit = f
        ? ['briefs', wear('laced-chemise', plain()), wear('medieval-dress', dyed()), wear('med-belt', leather()), wear('buckled-shoes', leather())]
        : ['briefs', wear('med-long-tunic', dyed()), wear('med-belt', leather()), wear('buckled-shoes', leather())];
      break;
    case 'keeper':
      // The temple's keeper: a long plain robe and a mantle (no faith's dress: the setting says that later).
      outfit = ['briefs', ...(f ? ['bra'] : []), wear('med-long-tunic', r.pick(['#d8d0bc', '#3a3a44', '#2f4a3a'])), wear('med-mantle', r.pick(['#5e1a2b', '#3d5a80', '#6b6a3a'])), wear('cloth-shoes', leather())];
      break;
    case 'trade':
    case 'hand':
      outfit = f
        ? ['briefs', wear('peasant-blouse', plain()), wear('gored-skirt', plain()), wear('med-belt', leather()), shoes]
        : ['briefs', wear('med-tunic', plain()), wear('med-hose', plain()), wear('med-belt', leather()), shoes];
      if (!f && r.chance(0.35)) outfit.push(wear('med-jerkin', leather()));
      break;
    default:
      outfit = f
        ? ['briefs', wear('laced-chemise', plain()), wear('gored-skirt', r.chance(0.4) ? dyed() : plain()), wear('med-belt', leather()), shoes]
        : ['briefs', wear('med-tunic', r.chance(0.4) ? dyed() : plain()), wear(r.chance(0.5) ? 'med-hose' : 'wool-pants', plain()), wear('med-belt', leather()), shoes];
  }
  if (r.chance(0.12)) outfit.push(wear('hood-down', dyed()));
  const old = p.age > 55;
  return {
    body: {
      gender: f ? 0 : 1, ageYears: p.age, muscle: r.range(0.3, p.role === 'trade' ? 0.8 : 0.6), weight: r.range(0.3, 0.75),
      height: r.range(0.3, 0.7), proportions: r.range(0.3, 0.7),
      african: r.range(0, 0.15), asian: r.range(0, 0.15), caucasian: 1,
    },
    skin: 'procedural', skinTone: r.range(0.05, 0.45),
    hair: r.pick(f ? WOMEN_HAIR : MEN_HAIR), hairColor: old && r.chance(0.7) ? r.pick(['#8a8580', '#b0aca4', '#d0ccc4']) : r.pick(HAIR_COLORS),
    beard: !f && r.chance(0.45) ? r.pick(['short', 'full', 'mustache', 'chinstrap', 'goatee'] as const) : 'none',
    stubble: f ? 0 : r.range(0, 0.6),
    outfit, garmentColors: colors,
  };
}

/** The clip for each activity (looped); `walk` while on the way. Sleep and indoors are not drawn. */
const CLIP: Record<ActivityKind, string> = {
  sleep: 'idle', indoors: 'idle', walk: 'walk', wait: 'idle', stroll: 'walk', gather: 'idle',
  smith: 'chop wood', stoke: 'interact', quench: 'pick up', bake: 'interact', craft: 'repair (kneeling)',
  sell: 'talk', serve: 'talk', tend: 'water plants',
  fetchWater: 'pick up', fetchWood: 'pick up', chop: 'chop wood', garden: 'harvest', washing: 'interact', feedHens: 'plant seeds',
  browse: 'arms folded', sit: 'sit', chat: 'talk', drink: 'eat or drink', pray: 'crouch', mourn: 'arms folded', play: 'idle',
};

/** The clip that shows `act` (`id` varies a few between people). */
export function clipOf(act: ActivityKind, id: number): string {
  if (act === 'garden' && id % 2) return 'plant seeds';
  if (act === 'chat' && id % 3 === 0) return 'nod';
  if (act === 'drink' && id % 2) return 'sit and talk';
  return CLIP[act];
}

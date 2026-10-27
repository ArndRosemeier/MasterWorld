/**
 * Skills, weapon abilities and the Director's pacing for the classic setting (plan 4.1, 10, 11.4). Skills
 * grow by use (D30); this is the first, fighting-heavy cut of Norgo's forty, the rest come with magic.
 */
import type { AbilityDef, DirectorDef, EffectDef, SkillDef } from '../contract';

export const skills: readonly SkillDef[] = [
  { id: 'blades', name: 'Blades', group: 'combat', start: 12, rate: 1 },
  { id: 'axes', name: 'Axes', group: 'combat', start: 8, rate: 1 },
  { id: 'maces', name: 'Maces and clubs', group: 'combat', start: 8, rate: 1 },
  { id: 'spears', name: 'Spears', group: 'combat', start: 8, rate: 1 },
  { id: 'unarmed', name: 'Fists', group: 'combat', start: 8, rate: 1.2, open: true },
  { id: 'shields', name: 'Shields', group: 'combat', start: 8, rate: 1 },
  { id: 'armour', name: 'Armour', group: 'combat', start: 8, rate: 0.8 },
  { id: 'dodge', name: 'Dodging', group: 'combat', start: 10, rate: 1, open: true },
  { id: 'perception', name: 'Perception', group: 'utility', start: 15, rate: 0.8, open: true },
  { id: 'stealth', name: 'Stealth', group: 'utility', start: 8, rate: 1 },
  { id: 'orientation', name: 'Orientation', group: 'survival', start: 10, rate: 0.6, open: true },
  { id: 'speech', name: 'Speech', group: 'social', start: 12, rate: 0.8, open: true },
  // The six schools that came back after the Fading (plan 10, 12.1): nobody starts with one; a teacher opens it (C3).
  { id: 'pyromancy', name: 'Pyromancy', group: 'magic', start: 0, rate: 0.9, color: [1, 0.48, 0.14], motif: 'flame' },
  { id: 'cryomancy', name: 'Cryomancy', group: 'magic', start: 0, rate: 0.9, color: [0.55, 0.85, 1], motif: 'frost' },
  { id: 'geomancy', name: 'Geomancy', group: 'magic', start: 0, rate: 0.9, color: [0.78, 0.6, 0.36], motif: 'stone' },
  { id: 'vitae', name: 'Vitae', group: 'magic', start: 0, rate: 0.9, color: [0.45, 1, 0.5], motif: 'bloom' },
  { id: 'luminism', name: 'Luminism', group: 'magic', start: 0, rate: 0.9, color: [1, 0.9, 0.55], motif: 'radiance' },
  { id: 'umbramancy', name: 'Umbramancy', group: 'magic', start: 0, rate: 0.9, color: [0.62, 0.38, 1], motif: 'shade' },
];

export const abilities: readonly AbilityDef[] = [
  { id: 'strike', icon: '⚔', name: 'Strike', cooldown: 0, ops: [{ op: 'blow', power: 1, again: true }], text: 'Attack your target with what you hold, again and again until you stop.' },
  { id: 'heavy', icon: '⚒', name: 'Heavy blow', cost: { stamina: 25 }, cooldown: 8, ops: [{ op: 'blow', power: 1.9, aim: -0.08 }], text: 'Put your weight behind one blow: nearly twice the damage, a little harder to land.' },
  { id: 'shove', icon: '✋', name: 'Shove', cost: { stamina: 15 }, cooldown: 10, ops: [{ op: 'blow', power: 0.3, aim: 0.15, stagger: 1.6 }], text: 'Shove your foe off balance; for a moment it cannot strike back.' },
  { id: 'breath', icon: '❂', name: 'Second wind', aim: 'self', cooldown: 90, ops: [{ op: 'heal', to: 'self', amount: 0.2, share: true }], text: 'Catch your breath: win back a fifth of your health. Once a minute and a half.' },
  // Bird form (plan 10, D49): one of the old changes the Fading took, taught again by the hidden teachers. Not a man flying: the hero becomes a bird.
  {
    id: 'bird', icon: '🪶', name: 'Bird form', aim: 'self', cooldown: 30, taught: true,
    ops: [{ op: 'shape', into: 'bird', change: 15, back: 6 }],
    text: 'Kneel and become a pheasant: fifteen slow breaths, and never while you fight. Space takes off, W flaps on, X dives. Use it again to land and be yourself.',
  },
  ...spells(),
  // Abilities only items give (D31, C5): each legendary piece of the canon carries one, the hero has it while wearing it.
  {
    id: 'deeplight', icon: '☀', name: 'Deeplight', aim: 'self', skill: 'blades', item: true, cost: { stamina: 18 }, cooldown: 40,
    glow: { color: [1, 0.95, 0.72], motif: 'radiance' },
    ops: [{ op: 'area', radius: 5, at: 'self', damage: 6, kind: 'radiant', effect: { id: 'feared', magnitude: 1, duration: 3 }, look: 'deeplight' }],
    text: 'Raise the blade and let the old light of the deep halls blaze out: it burns what stands near, and what lives in the dark shrinks from it.',
  },
  {
    id: 'hold-door', icon: '⛨', name: 'Hold the Door', aim: 'self', skill: 'shields', item: true, cost: { stamina: 20 }, cooldown: 45,
    glow: { color: [1, 0.72, 0.32], motif: 'radiance' },
    ops: [
      { op: 'effect', to: 'self', effect: { id: 'warded', magnitude: 10, duration: 8 } },
      { op: 'area', radius: 3, at: 'self', effect: { id: 'held', magnitude: 1, duration: 1.5 }, look: 'threshold' },
    ],
    text: 'Plant the shield as the Threshold\'s keepers did: blows glance off you for a while, and what is close cannot get past.',
  },
  {
    id: 'watch-cold', icon: '❄', name: 'Cold of the Watch', skill: 'maces', item: true, range: 3, cost: { stamina: 15 }, cooldown: 20,
    glow: { color: [0.72, 0.86, 1], motif: 'frost' },
    ops: [{ op: 'area', radius: 1.5, at: 'target', damage: 5, kind: 'cold', effect: { id: 'frozen', magnitude: 1, duration: 1.5 }, look: 'watch frost' }],
    text: 'The old iron bites with the cold it keeps: your foe is frozen where it stands for a breath.',
  },
];

/**
 * The six schools' first spells (plan 10, C2), from Norgo's: three each, opened by the school's level (a teacher
 * gives the first, C3). Numbers are at level 0; the school's level makes them stronger.
 */
function spells(): AbilityDef[] {
  const spell = (skill: string, level: number, a: Omit<AbilityDef, 'skill' | 'level' | 'taught'>): AbilityDef => ({ ...a, skill, level, taught: true });
  return [
    // Pyromancy: fire that clings.
    spell('pyromancy', 0, {
      id: 'fire-dart', icon: '🔥', name: 'Fire dart', cost: { mana: 7 }, cooldown: 2.5, cast: 1, range: 24,
      ops: [{ op: 'projectile', speed: 18, damage: 7, kind: 'fire', effect: { id: 'burning', magnitude: 2, duration: 3 }, look: 'ember' }],
      text: 'A dart of flame at your target: it burns on for a few breaths.',
    }),
    spell('pyromancy', 10, {
      id: 'fireball', icon: '☄', name: 'Fireball', cost: { mana: 16 }, cooldown: 8, cast: 1.5, range: 30,
      ops: [{ op: 'projectile', speed: 14, damage: 4, kind: 'fire', radius: 0.35, look: 'fireball', onHit: [{ op: 'area', radius: 2.5, damage: 12, kind: 'fire', effect: { id: 'burning', magnitude: 2, duration: 4 }, look: 'fire burst' }] }],
      text: 'A ball of fire that bursts where it lands, burning all close by.',
    }),
    spell('pyromancy', 20, {
      id: 'ring-of-fire', icon: '♨', name: 'Ring of fire', cost: { mana: 24 }, cooldown: 16, cast: 1.2, range: 20,
      ops: [{ op: 'zone', radius: 2.5, duration: 6, tick: 1, at: 'target', look: 'flames', ops: [{ op: 'area', radius: 2.5, damage: 4, kind: 'fire', effect: { id: 'burning', magnitude: 1.5, duration: 2 } }] }],
      text: 'Flames ring your target for six breaths; whatever stands in them burns.',
    }),
    // Cryomancy: cold that slows and holds.
    spell('cryomancy', 0, {
      id: 'frost-shard', icon: '❄', name: 'Frost shard', cost: { mana: 6 }, cooldown: 2.5, cast: 1, range: 26,
      ops: [{ op: 'projectile', speed: 22, damage: 6, kind: 'cold', effect: { id: 'chilled', magnitude: 0.4, duration: 4 }, look: 'shard' }],
      text: 'A shard of ice: it cuts, and the cold slows your foe.',
    }),
    spell('cryomancy', 10, {
      id: 'rime', icon: '❆', name: 'Rime', aim: 'self', cost: { mana: 12 }, cooldown: 30,
      ops: [{ op: 'effect', to: 'self', effect: { id: 'rimed', magnitude: 4, duration: 30 } }, { op: 'look', look: 'rime', at: 'self' }],
      text: 'Frost plates you like armour for half a minute.',
    }),
    spell('cryomancy', 20, {
      id: 'frost-nova', icon: '✳', name: 'Frost nova', aim: 'self', cost: { mana: 20 }, cooldown: 18, cast: 0.6,
      ops: [{ op: 'area', radius: 4, at: 'self', damage: 6, kind: 'cold', effect: { id: 'frozen', magnitude: 1, duration: 2.5 }, look: 'frost ring' }],
      text: 'A ring of killing cold round you: those it touches freeze where they stand.',
    }),
    // Geomancy: the ground answers (walls and pillars come with the land's volumes).
    spell('geomancy', 0, {
      id: 'earth-spike', icon: '⛰', name: 'Earth spike', cost: { mana: 8 }, cooldown: 3, cast: 1, range: 20,
      ops: [{ op: 'area', radius: 1.2, at: 'target', damage: 8, kind: 'pierce', effect: { id: 'held', magnitude: 1, duration: 0.8 }, look: 'spike' }],
      text: 'A spike of stone bursts up under your target and throws it off its feet.',
    }),
    spell('geomancy', 10, {
      id: 'stone-skin', icon: '🪨', name: 'Stone skin', aim: 'self', cost: { mana: 14 }, cooldown: 40,
      ops: [{ op: 'effect', to: 'self', effect: { id: 'stoneskin', magnitude: 6, duration: 25 } }, { op: 'look', look: 'dust', at: 'self' }],
      text: 'Your skin hardens to granite for a while.',
    }),
    spell('geomancy', 20, {
      id: 'quake', icon: '〰', name: 'Quake', aim: 'self', cost: { mana: 24 }, cooldown: 22, cast: 1.2,
      ops: [{ op: 'area', radius: 6, at: 'self', damage: 7, kind: 'blunt', effect: { id: 'held', magnitude: 1, duration: 1.5 }, look: 'quake' }],
      text: 'The ground heaves round you and throws down all who stand on it.',
    }),
    // Vitae: life.
    spell('vitae', 0, {
      id: 'mend', icon: '✚', name: 'Mend', aim: 'self', cost: { mana: 8 }, cooldown: 4, cast: 1.5,
      ops: [{ op: 'heal', to: 'self', amount: 14 }, { op: 'look', look: 'leaves', at: 'self' }],
      text: 'Knit your wounds closed.',
    }),
    spell('vitae', 10, {
      id: 'regrowth', icon: '♻', name: 'Regrowth', aim: 'self', cost: { mana: 12 }, cooldown: 12,
      ops: [{ op: 'effect', to: 'self', effect: { id: 'mending', magnitude: 2, duration: 10 } }, { op: 'look', look: 'leaves', at: 'self' }],
      text: 'Your body mends itself for ten breaths, even while you fight.',
    }),
    spell('vitae', 20, {
      id: 'roots', icon: '🌱', name: 'Grasping roots', cost: { mana: 18 }, cooldown: 16, cast: 1, range: 20,
      ops: [{ op: 'zone', radius: 2.5, duration: 5, tick: 1, at: 'target', look: 'roots', ops: [{ op: 'area', radius: 2.5, damage: 1, kind: 'pierce', effect: { id: 'rooted', magnitude: 1, duration: 1.2 } }] }],
      text: 'Roots burst from the ground round your target and hold fast whatever stands there.',
    }),
    // Luminism: light that burns what lives in the dark.
    spell('luminism', 0, {
      id: 'sunlance', icon: '☀', name: 'Sunlance', cost: { mana: 7 }, cooldown: 2.5, cast: 0.8, range: 30,
      ops: [{ op: 'projectile', speed: 40, damage: 8, kind: 'radiant', look: 'lance' }],
      text: 'A lance of sunlight, quicker than any arrow.',
    }),
    spell('luminism', 10, {
      id: 'sunburst', icon: '🌞', name: 'Sunburst', aim: 'self', cost: { mana: 16 }, cooldown: 14, cast: 0.8,
      ops: [{ op: 'area', radius: 5, at: 'self', damage: 7, kind: 'radiant', look: 'sunburst' }],
      text: 'Burst with light: it burns every foe near you.',
    }),
    spell('luminism', 20, {
      id: 'dawn', icon: '🌅', name: 'Dawn', aim: 'self', cost: { mana: 26 }, cooldown: 40, cast: 1.5,
      ops: [{ op: 'zone', radius: 5, duration: 8, tick: 1, at: 'self', look: 'dawn', ops: [{ op: 'area', radius: 5, damage: 3, kind: 'radiant' }, { op: 'area', radius: 5, heal: 3 }] }],
      text: 'Bring the sunrise here for eight breaths: your foes in it burn, and you heal.',
    }),
    // Umbramancy: shadow and fear.
    spell('umbramancy', 0, {
      id: 'shadow-bolt', icon: '☾', name: 'Shadow bolt', cost: { mana: 7 }, cooldown: 2.5, cast: 1, range: 24,
      ops: [{ op: 'projectile', speed: 16, damage: 5, kind: 'shadow', effect: { id: 'decay', magnitude: 2, duration: 4 }, look: 'shadow' }],
      text: 'A seeking bolt of shadow that withers what it touches.',
    }),
    spell('umbramancy', 10, {
      id: 'veil', icon: '🌑', name: 'Veil', aim: 'self', cost: { mana: 12 }, cooldown: 30,
      ops: [{ op: 'effect', to: 'self', effect: { id: 'veiled', magnitude: 0.6, duration: 20 } }, { op: 'look', look: 'veil', at: 'self' }],
      text: 'Shadow wraps you: for a while you are hard to see and hard to hear.',
    }),
    spell('umbramancy', 20, {
      id: 'dread', icon: '👁', name: 'Dread', cost: { mana: 16 }, cooldown: 18, cast: 1, range: 22,
      ops: [{ op: 'projectile', speed: 20, damage: 2, kind: 'shadow', effect: { id: 'feared', magnitude: 1, duration: 6 }, look: 'shadow' }],
      text: 'Fill a creature with nightmares: it flees from you.',
    }),
  ];
}

/** Status effects (plan 10): what abilities put on the hero and on what they fight. */
export const effects: readonly EffectDef[] = [
  { id: 'bleeding', name: 'Bleeding', icon: '🩸', kind: 'bane', dot: 'cut' },
  { id: 'chilled', name: 'Chilled', icon: '❄', kind: 'bane', slow: true },
  { id: 'held', name: 'Held fast', icon: '⛓', kind: 'bane', hold: true },
  { id: 'mending', name: 'Mending', icon: '✚', kind: 'boon', hot: true },
  { id: 'warded', name: 'Warded', icon: '⛨', kind: 'boon', ward: true },
  { id: 'burning', name: 'Burning', icon: '🔥', kind: 'bane', dot: 'fire' },
  { id: 'frozen', name: 'Frozen', icon: '🧊', kind: 'bane', hold: true },
  { id: 'rimed', name: 'Rime', icon: '❆', kind: 'boon', ward: true },
  { id: 'stoneskin', name: 'Stone skin', icon: '🪨', kind: 'boon', ward: true },
  { id: 'rooted', name: 'Rooted', icon: '🌱', kind: 'bane', hold: true },
  { id: 'decay', name: 'Withering', icon: '☾', kind: 'bane', dot: 'shadow' },
  { id: 'veiled', name: 'Veiled', icon: '🌑', kind: 'boon', veil: true },
  { id: 'feared', name: 'Afraid', icon: '😱', kind: 'bane', fear: true },
];

export const director: DirectorDef = {
  // Per real minute: Purpose grows fastest (always have a lead), People slowest.
  needs: { discovery: 0.15, challenge: 0.12, reward: 0.1, people: 0.07, purpose: 0.2 },
  // What each playstyle enjoys more of (C12): a mage the old places and their finds, a fighter the fights.
  styles: {
    explorer: { discovery: 1.6, challenge: 0.85 },
    fighter: { challenge: 1.7, reward: 1.15, discovery: 0.8 },
    socializer: { people: 1.8, challenge: 0.8 },
    crafter: { reward: 1.5, people: 1.2 },
    mage: { discovery: 1.4, reward: 1.25, challenge: 0.7 },
  },
};

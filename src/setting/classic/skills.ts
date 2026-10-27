/**
 * Skills, weapon abilities and the Director's pacing for the classic setting (plan 4.1, 10, 11.4). Skills
 * grow by use (D30); this is the first, fighting-heavy cut of Norgo's forty, the rest come with magic.
 */
import type { AbilityDef, DirectorDef, SkillDef } from '../contract';

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
];

export const abilities: readonly AbilityDef[] = [
  { id: 'strike', icon: '⚔', name: 'Strike', stamina: 0, cooldown: 0, power: 1, aim: 0, text: 'Attack your target with what you hold, again and again until you stop.' },
  { id: 'heavy', icon: '⚒', name: 'Heavy blow', stamina: 25, cooldown: 8, power: 1.9, aim: -0.08, text: 'Put your weight behind one blow: nearly twice the damage, a little harder to land.' },
  { id: 'shove', icon: '✋', name: 'Shove', stamina: 15, cooldown: 10, power: 0.3, aim: 0.15, effect: 'stagger', text: 'Shove your foe off balance; for a moment it cannot strike back.' },
  { id: 'breath', icon: '❂', name: 'Second wind', stamina: 0, cooldown: 90, power: 0, aim: 0, effect: 'heal', text: 'Catch your breath: win back a fifth of your health. Once a minute and a half.' },
  // Bird form (plan 10, D49): one of the old changes the Fading took, taught again by the hidden teachers. Not a man flying: the hero becomes a bird.
  {
    id: 'bird', icon: '🪶', name: 'Bird form', stamina: 0, cooldown: 30, power: 0, aim: 0, taught: true,
    shape: { into: 'bird', change: 15, back: 6 },
    text: 'Kneel and become a pheasant: fifteen slow breaths, and never while you fight. Space takes off, W flaps on, X dives. Use it again to land and be yourself.',
  },
];

export const director: DirectorDef = {
  // Per real minute: Purpose grows fastest (always have a lead), People slowest.
  needs: { discovery: 0.15, challenge: 0.12, reward: 0.1, people: 0.07, purpose: 0.2 },
};

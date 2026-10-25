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
  { id: 'unarmed', name: 'Fists', group: 'combat', start: 8, rate: 1.2 },
  { id: 'shields', name: 'Shields', group: 'combat', start: 8, rate: 1 },
  { id: 'armour', name: 'Armour', group: 'combat', start: 8, rate: 0.8 },
  { id: 'dodge', name: 'Dodging', group: 'combat', start: 10, rate: 1 },
  { id: 'perception', name: 'Perception', group: 'utility', start: 15, rate: 0.8 },
  { id: 'stealth', name: 'Stealth', group: 'utility', start: 8, rate: 1 },
  { id: 'orientation', name: 'Orientation', group: 'survival', start: 10, rate: 0.6 },
  { id: 'speech', name: 'Speech', group: 'social', start: 12, rate: 0.8 },
];

export const abilities: readonly AbilityDef[] = [
  { id: 'strike', name: 'Strike', stamina: 0, cooldown: 0, power: 1, aim: 0, text: 'Attack your target with what you hold, again and again until you stop.' },
  { id: 'heavy', name: 'Heavy blow', stamina: 25, cooldown: 8, power: 1.9, aim: -0.08, text: 'Put your weight behind one blow: nearly twice the damage, a little harder to land.' },
  { id: 'shove', name: 'Shove', stamina: 15, cooldown: 10, power: 0.3, aim: 0.15, effect: 'stagger', text: 'Shove your foe off balance; for a moment it cannot strike back.' },
  { id: 'breath', name: 'Second wind', stamina: 0, cooldown: 90, power: 0, aim: 0, effect: 'heal', text: 'Catch your breath: win back a fifth of your health. Once a minute and a half.' },
];

export const director: DirectorDef = {
  // Per real minute: Purpose grows fastest (always have a lead), People slowest.
  needs: { discovery: 0.15, challenge: 0.12, reward: 0.1, people: 0.07, purpose: 0.2 },
};

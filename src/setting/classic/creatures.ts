/**
 * Creatures of the classic setting (plan 12.1, D29, D43): what lives under the start town first. Each has
 * its power fixed by what it is (`danger`, on the hero's scale: a fresh hero is about 10). Animals and the
 * giants of the far mountains follow with the frontier.
 */
import type { CreatureDef } from '../contract';

export const creatures: readonly CreatureDef[] = [
  {
    id: 'rat', name: 'rat', plural: 'rats', body: { kind: 'rat', length: 0.35, color: '#5a4c40' },
    health: 5, armour: 0, defence: 22, speed: 4.2, senses: { sight: 5, hearing: 14 }, temper: 'skittish', morale: 0.5, pack: true, role: 'swarm', danger: 1.5,
    attacks: [{ name: 'bite', damage: [1, 3], kind: 'bite', reach: 0.45, time: 1.1, skill: 18 }],
    loot: 'vermin', tell: 'Claws skitter on stone, somewhere ahead.',
  },
  {
    id: 'giant rat', name: 'giant rat', plural: 'giant rats', body: { kind: 'rat', length: 0.95, color: '#4a3e34' },
    health: 18, armour: 0, defence: 16, speed: 4.6, senses: { sight: 6, hearing: 16 }, temper: 'hostile', morale: 0.65, pack: true, role: 'melee', danger: 5,
    attacks: [{ name: 'bite', damage: [2, 6], kind: 'bite', reach: 0.6, time: 1.4, skill: 24 }],
    loot: 'vermin', tell: 'A smell of wet fur and old meat, and something big breathing.',
  },
  {
    id: 'goblin', name: 'goblin', plural: 'goblins', body: { kind: 'humanoid', race: 'goblin', height: 1.25, outfit: 'rags' },
    health: 20, armour: 1, defence: 18, speed: 4.4, senses: { sight: 9, hearing: 16 }, temper: 'hostile', morale: 0.55, pack: true, role: 'melee', danger: 7,
    attacks: [{ name: 'rusty knife', damage: [2, 6], kind: 'cut', reach: 0.8, time: 1.7, skill: 22 }],
    loot: 'goblin', tell: 'Whispering in a hissing tongue, and the smell of smoke and turnips.',
    pleas: [
      'No hurt! No hurt Snik! Snik only hungry, only bread, little bread!',
      'Snik go. Snik go far, no come back. Promise-promise.',
      'Big one strong. Snik know. Snik tell you: deeper, worse thing. Old thing. Snik not go there.',
    ],
  },
  {
    id: 'bandit', name: 'smuggler', plural: 'smugglers', body: { kind: 'humanoid', race: 'human', height: 1.78, outfit: 'bandit' },
    health: 34, armour: 2, defence: 22, speed: 4.8, senses: { sight: 11, hearing: 14 }, temper: 'hostile', morale: 0.6, pack: true, role: 'melee', danger: 11,
    attacks: [{ name: 'short sword', damage: [3, 8], kind: 'cut', reach: 1.0, time: 2.0, skill: 28 }],
    loot: 'bandit', tell: 'Low voices, a laugh, the clink of a bottle.',
  },
  {
    id: 'giant spider', name: 'giant spider', plural: 'giant spiders', body: { kind: 'spider', length: 1.5, color: '#2c2622' },
    health: 44, armour: 2, defence: 24, speed: 5, senses: { sight: 7, hearing: 12 }, temper: 'hostile', morale: 0.9, pack: false, role: 'melee', danger: 16,
    attacks: [{ name: 'fangs', damage: [5, 10], kind: 'pierce', reach: 0.9, time: 1.7, skill: 38 }],
    loot: 'web', tell: 'Silk across your face, and a dry ticking from the ceiling.',
  },
  {
    id: 'skeleton', name: 'skeleton', plural: 'skeletons', body: { kind: 'humanoid', race: 'human', height: 1.74, skin: '#d8ccb4', outfit: 'grave', gaunt: true },
    health: 32, armour: 3, defence: 14, speed: 3.6, senses: { sight: 10, hearing: 12 }, temper: 'hostile', morale: 1, pack: true, role: 'melee', danger: 11,
    attacks: [{ name: 'rusted sword', damage: [4, 8], kind: 'cut', reach: 1.0, time: 2.0, skill: 28 }],
    loot: 'grave', tell: 'A dry rattle, like sticks in a sack, and it stops when you stop.',
  },
  {
    id: 'ghoul', name: 'ghoul', plural: 'ghouls', body: { kind: 'humanoid', race: 'umbral', height: 1.7, skin: '#8a9086', outfit: 'grave', gaunt: true },
    health: 58, armour: 2, defence: 24, speed: 4.6, senses: { sight: 8, hearing: 18 }, temper: 'hostile', morale: 1, pack: false, role: 'leader', danger: 21,
    attacks: [{ name: 'claws', damage: [5, 11], kind: 'claw', reach: 0.9, time: 1.5, skill: 40 }],
    loot: 'grave', tell: 'Cold breath on your neck, and the sweet smell of the grave.',
  },
];

/**
 * Who is against whom in the classic setting (D65). The peoples (peoples.ts) are factions too; these are the rest. The matrix is
 * constant: nobody here ever changes sides; only what the hero is to each of them moves.
 */
import type { FactionsDef } from '../contract';

const PEOPLES = ['human', 'dwarf', 'halfling', 'elf'] as const;

export const factions: FactionsDef = {
  others: [
    { id: 'watch', name: 'watchman', plural: 'the town watch', regard: 10, aware: true },
    { id: 'smugglers', name: 'smuggler', plural: 'smugglers', regard: 0, aware: true },
    { id: 'bandits', name: 'bandit', plural: 'bandits', regard: -20, aware: true },
    { id: 'goblins', name: 'goblin', plural: 'goblins', regard: -30, aware: true },
    { id: 'cutthroats', name: 'cutthroat', plural: 'cutthroats', regard: -100, aware: true },
    { id: 'undead', name: 'undead', plural: 'the dead that walk', regard: -100, aware: true },
    { id: 'predators', name: 'beast of prey', plural: 'beasts of prey', regard: 0, aware: false },
    { id: 'prey', name: 'grazing beast', plural: 'grazing beasts', regard: 0, aware: false },
    { id: 'vermin', name: 'vermin', plural: 'vermin', regard: 0, aware: false },
    { id: 'beasts', name: 'beast', plural: 'beasts', regard: 0, aware: false },
  ],
  matrix: [
    // The watch stands with the town's peoples and against whatever comes at them.
    ...PEOPLES.map((p) => ['watch', p, 'ally'] as const),
    ...['smugglers', 'bandits', 'goblins', 'cutthroats', 'undead', 'predators'].map((f) => ['watch', f, 'hostile'] as const),
    // The peoples against the lawless, the dead and the wild.
    ...PEOPLES.flatMap((p) => [
      [p, 'bandits', 'hostile'], [p, 'goblins', 'hostile'], [p, 'cutthroats', 'hostile'], [p, 'undead', 'hostile'],
      [p, 'smugglers', 'wary'], [p, 'predators', 'wary'], [p, 'vermin', 'wary'],
    ] as const),
    // The lawless among themselves: goblins and smugglers fight where they meet, bandits and smugglers keep wary.
    ['goblins', 'smugglers', 'hostile'], ['bandits', 'smugglers', 'wary'], ['goblins', 'bandits', 'wary'],
    // The wild: wolves hunt deer.
    ['predators', 'prey', 'hostile'],
    // The dead go for anything living.
    ...['smugglers', 'bandits', 'goblins', 'cutthroats', 'predators', 'prey', 'vermin', 'beasts'].map((f) => ['undead', f, 'hostile'] as const),
  ],
  kill: { own: -8, foes: 3, upTo: 14 },
};

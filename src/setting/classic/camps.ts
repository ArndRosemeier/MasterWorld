/**
 * The camps of the classic land and the zones they lie in (D69, Z2, Z3, Z5): goblins in the broken walls of the old realm, highwaymen
 * and cutthroats set back from the roads, the dead among barrows and standing stones, spiders in the deep woods, wolves and boar on
 * hunting grounds of their own. Every camp is scaled to its zone's level band (sim/camps.ts), so a goblin warren far out is no
 * warren for a fresh hero. Zones are the aligned 2 km squares (D16, level 3); the start's ring starts at level 1, each ring out three
 * higher (Z3: neighbours differ by at most three), up to the top band 16 to 20.
 */
import type { CampsDef } from '../contract';

const GOBLIN_NAMES = ['Snaggletooth', 'Grubnose', 'Old Ripper', 'Mudskull', 'Gutwhistle', 'Nettlefang', 'Sourface'];
const OUTLAW_NAMES = ['Black Hal', 'Red Maud', 'One-Eyed Tam', 'Corwen the Knife', 'Lame Jory', 'Silent Agna'];
const DEAD_NAMES = ['the Barrow Wight', 'the Hollow Lord', 'Old Bones', 'the Grey Warden', 'the Pale Thane'];
const BEAST_NAMES = ['Greymuzzle', 'the Old Grey', 'Tatterear', 'the Widow'];

export const camps: CampsDef = {
  camps: [
    // Goblins: a few round a fire in a broken wall, a warren in a bigger ruin, a war camp with its chief.
    {
      id: 'goblin-den', name: 'a goblin den', size: 'small', r: 14, habitat: 'any', arrive: 'walk', holder: 'goblins',
      pieces: { ruin: 3, stones: 1, tents: 0.25 },
      posts: [{ creatures: ['goblin'], count: [1, 1], out: [0, 0.2], leader: true }, { creatures: ['goblin'], count: [1, 2], out: [0.4, 0.9] }],
    },
    {
      id: 'goblin-warren', name: 'a goblin warren', size: 'middle', r: 26, habitat: 'any', arrive: 'walk', holder: 'goblins',
      pieces: { ruin: 4, stones: 1, tents: 0.3 },
      named: [{ creature: 'goblin', names: GOBLIN_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['goblin'], count: [1, 1], out: [0, 0.15], leader: true },
        { creatures: ['goblin'], count: [2, 3], out: [0.3, 0.6] },
        { creatures: ['goblin'], count: [1, 2], out: [0.75, 1] },
        { creatures: ['goblin'], count: [1, 1], out: [1, 1.1], patrol: true },
      ],
    },
    {
      id: 'goblin-warcamp', name: 'a goblin war camp', size: 'big', r: 45, habitat: 'any', arrive: 'walk', holder: 'goblins',
      landmarks: { 'great-ruin': 1 }, pieces: { ruin: 5, stones: 1 },
      named: [{ creature: 'goblin', names: GOBLIN_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['goblin'], count: [1, 1], out: [0, 0.1], leader: true },
        { creatures: ['goblin'], count: [2, 3], out: [0.15, 0.35] },
        { creatures: ['goblin', 'giant rat'], count: [2, 3], out: [0.4, 0.6] },
        { creatures: ['goblin'], count: [2, 3], out: [0.65, 0.9] },
        { creatures: ['goblin'], count: [1, 2], out: [1, 1.1], patrol: true },
      ],
    },
    // Outlaws, set back from the roads they rob (Z5: no camp's aggro reaches a road).
    {
      id: 'outlaw-lookout', name: "an outlaws' lookout", size: 'small', r: 14, habitat: 'any', arrive: 'walk', holder: 'bandits',
      pieces: { ruin: 3, cairn: 1, tents: 0.25 },
      posts: [{ creatures: ['highwayman'], count: [1, 1], out: [0, 0.2], leader: true }, { creatures: ['highwayman'], count: [1, 2], out: [0.4, 0.9] }],
    },
    {
      id: 'outlaw-hold', name: "an outlaws' hold", size: 'middle', r: 28, habitat: 'any', arrive: 'walk', holder: 'bandits',
      landmarks: { 'fortified-bridge': 1 }, pieces: { ruin: 4, tents: 0.3 },
      named: [{ creature: 'highwayman', names: OUTLAW_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['highwayman'], count: [1, 1], out: [0, 0.15], leader: true },
        { creatures: ['highwayman'], count: [2, 3], out: [0.3, 0.7] },
        { creatures: ['highwayman'], count: [1, 1], out: [0.8, 1] },
        { creatures: ['highwayman'], count: [1, 1], out: [1, 1.1], patrol: true },
      ],
    },
    {
      id: 'cutthroat-camp', name: "a cutthroats' camp", size: 'middle', r: 24, habitat: 'any', arrive: 'walk', holder: 'bandits',
      pieces: { ruin: 3, stones: 1, tents: 0.25 },
      named: [{ creature: 'cutthroat', names: OUTLAW_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['cutthroat'], count: [1, 1], out: [0, 0.15], leader: true },
        { creatures: ['cutthroat'], count: [2, 3], out: [0.3, 0.8] },
        { creatures: ['cutthroat'], count: [1, 1], out: [1, 1.1], patrol: true },
      ],
    },
    // The restless dead: a few among the barrows, a stone ring with its wight, a great ruin full of them.
    {
      id: 'restless-barrows', name: 'restless barrows', size: 'small', r: 18, habitat: 'open', arrive: 'rise', holder: 'undead',
      pieces: { barrows: 2, stones: 2, cairn: 1 },
      posts: [{ creatures: ['skeleton'], count: [1, 1], out: [0, 0.3], leader: true }, { creatures: ['skeleton'], count: [1, 2], out: [0.4, 0.9] }],
    },
    {
      id: 'wight-ring', name: 'a ring of the dead', size: 'middle', r: 28, habitat: 'any', arrive: 'rise', holder: 'undead',
      pieces: { stones: 3, barrows: 2, ruin: 1 },
      named: [{ creature: 'ghoul', names: DEAD_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['ghoul'], count: [1, 1], out: [0, 0.15], leader: true },
        { creatures: ['skeleton'], count: [2, 3], out: [0.3, 0.7] },
        { creatures: ['skeleton', 'ghoul'], count: [1, 2], out: [0.75, 1] },
      ],
    },
    {
      id: 'dead-halls', name: 'halls of the dead', size: 'big', r: 50, habitat: 'any', arrive: 'rise', holder: 'undead',
      landmarks: { 'great-ruin': 1 }, pieces: { ruin: 3, barrows: 1 },
      named: [{ creature: 'ghoul', names: DEAD_NAMES, loot: 'lair' }],
      posts: [
        { creatures: ['ghoul'], count: [1, 1], out: [0, 0.1], leader: true },
        { creatures: ['skeleton'], count: [2, 3], out: [0.15, 0.35] },
        { creatures: ['ghoul', 'skeleton'], count: [2, 3], out: [0.4, 0.6] },
        { creatures: ['skeleton'], count: [2, 4], out: [0.65, 0.9] },
        { creatures: ['skeleton'], count: [1, 2], out: [1, 1.1], patrol: true },
      ],
    },
    // Hunting grounds (Z4: a landmark of their own, a bone heap in a ring of rocks, a cairn).
    {
      id: 'spider-nest', name: "a spiders' nest", size: 'small', r: 16, habitat: 'wood', arrive: 'walk',
      pieces: { cairn: 2, stones: 1 },
      posts: [{ creatures: ['giant spider'], count: [1, 1], out: [0, 0.3], leader: true }, { creatures: ['giant spider'], count: [1, 2], out: [0.4, 0.9] }],
    },
    {
      id: 'wolf-ground', name: "the wolves' ground", size: 'small', r: 22, habitat: 'wood', arrive: 'walk',
      pieces: { cairn: 2, none: 1 },
      named: [{ creature: 'wolf', names: BEAST_NAMES, loot: 'wolf' }],
      posts: [{ creatures: ['wolf'], count: [1, 1], out: [0, 0.3], leader: true }, { creatures: ['wolf'], count: [2, 3], out: [0.3, 0.9] }],
    },
    {
      id: 'boar-ground', name: "the boars' rooting ground", size: 'small', r: 20, habitat: 'wood', arrive: 'walk',
      pieces: { none: 2, cairn: 1 },
      posts: [{ creatures: ['boar'], count: [1, 1], out: [0, 0.4], leader: true }, { creatures: ['boar'], count: [1, 2], out: [0.3, 0.9] }],
    },
  ],
  themes: [
    { id: 'goblin-hills', names: ['the Goblin {land}', 'the Snagged {land}', 'the Smoky {land}'], weight: 1, camps: { 'goblin-den': 4, 'goblin-warren': 3, 'goblin-warcamp': 1, 'wolf-ground': 1, 'boar-ground': 1, 'spider-nest': 0.5 } },
    { id: 'barrow-downs', names: ['the Barrow {land}', 'the Restless {land}', 'the Grey {land}'], weight: 1, camps: { 'restless-barrows': 4, 'wight-ring': 3, 'dead-halls': 1, 'wolf-ground': 1, 'goblin-den': 0.5 } },
    { id: 'wolf-wood', names: ['the Wolf {land}', 'the Howling {land}', 'the Dark {land}'], weight: 1, camps: { 'wolf-ground': 4, 'spider-nest': 3, 'boar-ground': 2, 'goblin-warren': 1, 'goblin-den': 1, 'goblin-warcamp': 0.5 } },
    { id: 'outlaw-country', names: ["the Outlaws' {land}", 'the Lawless {land}', "the Hangman's {land}"], weight: 1, camps: { 'outlaw-lookout': 4, 'outlaw-hold': 3, 'cutthroat-camp': 2, 'wolf-ground': 1, 'goblin-den': 1, 'dead-halls': 0.4 } },
  ],
  lands: {
    meadow: ['Downs', 'Meads', 'Leas'],
    forest: ['Wood', 'Weald', 'Holt'],
    taiga: ['Pines', 'Firwood'],
    heath: ['Heath', 'Moor'],
    steppe: ['Plain', 'Wold'],
    tundra: ['Barrens', 'Waste'],
    other: ['Hills', 'Reach', 'Marches'],
  },
  zoneLevel: 3,
  band: { first: 1, step: 3, width: 5, top: 20 },
  density: { count: [25, 40], small: 0.6, middle: 0.3, big: 0.1 },
  apart: 60,
  road: 10,
  town: 200,
  respawn: { out: 360, below: 1080, named: [1800, 3600], spread: 0.2 },
  namedChance: 0.15,
};

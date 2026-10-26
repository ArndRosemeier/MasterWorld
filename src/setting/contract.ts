/**
 * The setting module contract (docs/design/masterworld-plan.md section 12, D14): everything world-related
 * that the engine must not hard-code. One module per game; a save records its id and version.
 *
 * First cut: identity, the shape of the land and the start. Peoples, places, creatures, items, magic,
 * lore, VGM templates and the Conversations package are added as the milestones need them.
 */

import type { GradeKey } from '@futuremagic/stage';

export const CONTRACT_VERSION = 8;

/**
 * The ground surfaces the engine can draw on open land (each is a tileable material layer). Rock on steep
 * ground, snow up high and sand at the shore are added by the terrain itself.
 */
export const SURFACES = ['grass', 'forest', 'sand', 'scree'] as const;
export type Surface = (typeof SURFACES)[number];

/** The tree species the engine can grow (procedural models from @futuremagic/vegetation). */
export const TREES = ['oak', 'linden', 'maple', 'birch', 'chestnut', 'pine', 'cypress', 'plane'] as const;
export type TreeName = (typeof TREES)[number];

/** What grows wild in a biome. */
export interface FloraDef {
  /** Trees per hectare where the woods are thickest (a forest: 100-250; open country: a few). */
  readonly trees: number;
  /** How much of the land the woods cover, -1 (copses here and there) .. 1 (unbroken, a clearing now and then). */
  readonly cover: number;
  /** Relative share of each species. */
  readonly mix: Readonly<Partial<Record<TreeName, number>>>;
  /** Shrubs per hectare (under trees and in the open). */
  readonly shrubs: number;
}

/** The grass on open ground (drawn blade by blade near the camera). */
export interface GrassDef {
  /** Share of open ground covered, 0..1 (patchy below 1). Fewer under thick woods. */
  readonly cover: number;
  /** Typical blade height, metres (0.05 .. 1.5). */
  readonly height: number;
  /** 0 lush green .. 1 dry straw. */
  readonly dry: number;
}

export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  /** Mean annual temperature range in °C where this biome grows. */
  readonly temperature: readonly [number, number];
  /** Moisture range, 0 (desert) to 1 (rainforest). */
  readonly moisture: readonly [number, number];
  /** Ground colour (sRGB hex) of open land in this biome; rock, snow and sand come from the terrain material. */
  readonly ground: number;
  /** What open ground in this biome is made of; `ground` tints it. */
  readonly surface: Surface;
  /** Optional elevation range in metres above the sea. */
  readonly elevation?: readonly [number, number];
  /** Wild trees and shrubs; none if absent. */
  readonly flora?: FloraDef;
  /** Grass; none if absent. */
  readonly grass?: GrassDef;
}

/**
 * The weather's climate (world/weather.ts): how big and fast its fronts are and how often it rains,
 * storms and mists. Local moisture and temperature (the skeleton) shift it from place to place.
 */
export interface WeatherDef {
  /** Typical size of a weather system (a rain area, a clear spell), metres. */
  readonly frontSize: number;
  /** How fast the weather drifts with the prevailing wind, metres per game hour. */
  readonly frontSpeed: number;
  /** Game hours over which a weather system grows or dies away as it drifts. */
  readonly change: number;
  /** 0 dry (rain is rare) .. 1 wet (rain is common); 0.5 is a temperate climate. */
  readonly rainfall: number;
  /** 0 .. 1: how often rain turns to thunderstorms. */
  readonly storms: number;
  /** 0 .. 1: how often calm mornings bring mist. */
  readonly mist: number;
  /** 0 .. 1: how windy it is in general. */
  readonly windiness: number;
  /** Game hours for wet ground to dry to a third. */
  readonly drying: number;
}

/** The shape of the land: the skeleton's parameters (section 5.2). All lengths in metres. */
export interface WorldShape {
  /** Typical distance between continents' centres. */
  readonly continentSpacing: number;
  /** Share of the surface that is land, 0..1. */
  readonly landFraction: number;
  /** Deepest sea. */
  readonly seaDepth: number;
  /** Highest peaks above the sea. */
  readonly mountainHeight: number;
  /** Typical distance between mountain ranges. */
  readonly rangeSpacing: number;
  /** 0 = gentle and realistic, 1 = dramatic: steeper ranges, terraces, sharper cliffs (D18). */
  readonly drama: number;
  /** Mean temperature at sea level at the latitude of z = 0, °C. */
  readonly baseTemperature: number;
  /** Temperature change per kilometre northwards (negative z), °C. */
  readonly northCooling: number;
  /** Every biome. The skeleton takes the first whose ranges all hold, else the closest fit. */
  readonly biomes: readonly BiomeDef[];
  /** The weather's climate. */
  readonly weather: WeatherDef;
  /** What grazes the farms' paddocks (the game draws each kind its own way; only horses exist yet). */
  readonly livestock: LivestockKind;
}

/** Farm animals the game can draw. Cattle, sheep and pigs join when Actors has them. */
export type LivestockKind = 'horse';

export interface StartSpec {
  /** Biome ids the start town may lie in, in order of preference. */
  readonly biomes: readonly string[];
  /** Elevation range of the start, metres above the sea. */
  readonly elevation: readonly [number, number];
  /** Steepest ground under the town, rise per metre. */
  readonly maxSlope: number;
  /** Least height difference within 6 km of the start, metres: something to look at (D18). */
  readonly vista: number;
}

/** The props the engine can draw in a dungeon (simple kit pieces). */
export const DUNGEON_PROPS = [
  'barrel', 'cask', 'rack', 'crate', 'sack', 'shelf', 'table', 'stool', 'cot', 'straw', 'rubble', 'bones',
  'candle', 'lantern', 'ledger', 'chest', 'web', 'nest', 'vat', 'bricks', 'beam', 'puddle', 'bin', 'jar', 'ladder',
] as const;
export type DungeonProp = (typeof DUNGEON_PROPS)[number];

/** What a room is used for: its name and what stands in it. */
export interface RoomUseDef {
  readonly id: string;
  /** As the player would call it ("the wine store"). */
  readonly name: string;
  /** Props that stand in it, most typical first. */
  readonly props: readonly DungeonProp[];
}

/**
 * One layer of a place's past (plan 8.1, history first): who built it, what lay there before, what went
 * wrong, who lives there now. `text` is a line of history; `{house}` stands for the house above.
 */
export interface HistoryDef {
  readonly id: string;
  readonly text: string;
  /** Room uses this layer leaves behind (ids of `RoomUseDef`). */
  readonly uses: readonly string[];
  /** Cycle patterns (@futuremagic/dungeon) that fit this layer's story. */
  readonly patterns?: readonly string[];
  /** Traces it leaves anywhere (soot, silt, bones). */
  readonly traces?: readonly DungeonProp[];
  readonly weight?: number;
  /** Only together with one of these layers (ids from the other lists). */
  readonly with?: readonly string[];
}

/** Who lives in a dungeon now: the problem the player solves. */
export interface DwellerDef extends HistoryDef {
  /** Creatures (the setting's names). */
  readonly creatures: readonly string[];
  /** Use of the goal room. */
  readonly lair: string;
  /** Most of them in one room (a few big ones, or a swarm of small). */
  readonly crowd: number;
  /** How dangerous a cellar of theirs is, on the hero's power scale (a fresh hero is about 15). */
  readonly danger: number;
  /** What the household above notices: the hint lines an NPC can say. */
  readonly signs: readonly string[];
  /** A rare surprise among them (plan 8.1: breaking expectations), if any. */
  readonly surprise?: string;
}

/** How a kind of dungeon is spoken of as the hero goes in and out; `{place}` is what it is called. */
export interface DungeonWords {
  /** Going down ("You climb down into the cellar of {place}."). */
  readonly enter: string;
  /** The Director's line when it has gone quiet. */
  readonly quiet: string;
  /** The thanks when the promise is kept; `{coins}` the reward. */
  readonly thanks: string;
}

/** The setting's material for a kind of dungeon (plan 8: cellars in milestone 3, barrows after). */
export interface CellarLore {
  readonly words?: DungeonWords;
  readonly uses: readonly RoomUseDef[];
  /** Who dug the cellar and why. */
  readonly builders: readonly HistoryDef[];
  /** What lay there before the house: the storey below. */
  readonly older: readonly HistoryDef[];
  /** What went wrong. */
  readonly troubles: readonly HistoryDef[];
  readonly dwellers: readonly DwellerDef[];
}

/** The skills a character can grow by use (plan 10, 11.4, D30): no classes, no XP. */
export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly group: 'combat' | 'magic' | 'utility' | 'survival' | 'social';
  /** Where a fresh character starts (0..100). */
  readonly start: number;
  /** How fast use raises it (1 typical). */
  readonly rate: number;
}

/** How a blow lands: the engine reads it for armour, sounds and the clip. */
export const DAMAGE_KINDS = ['cut', 'pierce', 'blunt', 'bite', 'claw', 'cold'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];

/** One way to hit: a creature's bite, a weapon's swing. */
export interface AttackDef {
  readonly name: string;
  /** Damage before armour, lo..hi. */
  readonly damage: readonly [number, number];
  readonly kind: DamageKind;
  /** Reach, metres from the body's edge. */
  readonly reach: number;
  /** Seconds from one blow to the next. */
  readonly time: number;
  /** How well it is aimed (0..100, as a skill). */
  readonly skill: number;
}

/** How a creature is drawn: an Actors person (race, look) or one of the engine's small bodies. */
export type CreatureBody =
  | {
    readonly kind: 'humanoid'; readonly race: string; readonly height: number; readonly skin?: string; readonly outfit: 'rags' | 'bandit' | 'grave'; readonly gaunt?: boolean;
    /** What it holds (an item id). */
    readonly held?: string;
    /** Only its bones: the raised dead. */
    readonly bones?: boolean;
  }
  | { readonly kind: 'rat' | 'spider'; readonly length: number; readonly color: string }
  /** An animal of the land: Actors' wolf and deer, a boar grown by @futuremagic/creatures. `length` nose to rump. */
  | { readonly kind: 'beast'; readonly species: 'wolf' | 'deer' | 'boar'; readonly length: number; readonly color: string };

/**
 * Who lives on the land around a town (plan 9.3, the world simulation): a kind of group, where its
 * territories lie and how many there are. The simulation places them from the seed; the VGM does not.
 */
export interface WildDef {
  readonly id: string;
  /** Who lives together (creature ids): the first leads, the others follow at random. */
  readonly creatures: readonly string[];
  /** How many in a group, at least and at most. */
  readonly count: readonly [number, number];
  /** wood: under thick trees; open: meadows and heath; road: by a road out of town. */
  readonly habitat: 'wood' | 'open' | 'road';
  /** Metres from the town's market where their territories lie. */
  readonly ring: readonly [number, number];
  /** Territory radius, metres. */
  readonly range: number;
  /** Territories of this kind around a town. */
  readonly groups: number;
}

/**
 * A creature (plan 9.3, 12, D29): its body, senses, temper and power. Its danger is fixed by what it is,
 * never scaled to the player; weak ones fight anyway, as they do not know the player is a champion.
 */
export interface CreatureDef {
  /** As dwellers name it ("giant rat"). */
  readonly id: string;
  readonly name: string;
  readonly plural: string;
  readonly body: CreatureBody;
  readonly health: number;
  /** Damage taken off every blow. */
  readonly armour: number;
  /** Dodging and parrying (0..100, as a skill). */
  readonly defence: number;
  /** Running speed, m/s. */
  readonly speed: number;
  readonly attacks: readonly AttackDef[];
  /** Sees this far in the dark (m) and much farther by the hero's light; hears a running hero this far. */
  readonly senses: { readonly sight: number; readonly hearing: number };
  /** skittish: keeps away unless cornered or many; hostile: attacks on sight. */
  readonly temper: 'skittish' | 'hostile';
  /** 0..1: how much of its health it loses before it runs (1 never runs). */
  readonly morale: number;
  /** Calls the others of its den when it sees the hero. */
  readonly pack: boolean;
  /** Its part in a group fight. */
  readonly role: 'leader' | 'melee' | 'swarm';
  /** Power, on the scale of the hero's (a fresh hero is about 10). */
  readonly danger: number;
  /** Treasure table id (items) for what it carries. */
  readonly loot?: string;
  /** What the player notices before the fight (a sound, a smell). */
  readonly tell: string;
  /** Lines when it breaks expectations (plan 8.1): a goblin begging in broken Common. */
  readonly pleas?: readonly string[];
}

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const SLOTS = ['head', 'body', 'hands', 'feet', 'cloak', 'main', 'off', 'ring', 'amulet'] as const;
export type Slot = (typeof SLOTS)[number];

/** An item kind of the catalogue (plan 11.5, D31). Rarity and bonuses come when one is found. */
export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly kind: 'weapon' | 'shield' | 'armour' | 'potion' | 'food' | 'tool' | 'valuable';
  readonly slot?: Slot;
  /** Weapons: the skill it trains and how it hits. */
  readonly weapon?: { readonly skill: string; readonly damage: readonly [number, number]; readonly kind: DamageKind; readonly time: number; readonly reach: number };
  /** Armour and shields: damage taken off, and a shield's chance to block (0..1). */
  readonly armour?: number;
  readonly block?: number;
  /** Potions and food: health restored. */
  readonly heal?: number;
  /** Copper pieces. */
  readonly value: number;
  readonly weight: number;
  /** A line of lore on its card. */
  readonly lore?: string;
}

/** A named legendary item with its place in the canon (plan 11.5). */
export interface UniqueDef {
  readonly id: string;
  readonly base: string;
  readonly name: string;
  readonly bonuses: Readonly<Record<string, number>>;
  readonly lore: string;
  /** Least danger of a place that may hold it. */
  readonly danger: number;
}

/** What a place or creature of some danger holds. */
export interface TreasureDef {
  readonly id: string;
  /** Item ids with weights. */
  readonly items: readonly (readonly [string, number])[];
  /** How many items, lo..hi. */
  readonly count: readonly [number, number];
  /** Coins, copper, lo..hi. */
  readonly coins: readonly [number, number];
}

/** Items: the catalogue, the legendary ones, treasure tables, and the words for rarer finds. */
export interface ItemCatalog {
  readonly items: readonly ItemDef[];
  readonly uniques: readonly UniqueDef[];
  readonly treasure: readonly TreasureDef[];
  /** Name parts for uncommon and rare finds, by the skill they raise ("Keen" for blades). */
  readonly affixes: Readonly<Record<string, { readonly prefix: string; readonly suffix: string }>>;
}

/**
 * Upkeep (plan 11.5, 11.2): what a room and mending cost, and how it is said. Lines may use `{price}`
 * (coins as said), `{items}` (what was mended), `{name}` (the smith or keeper).
 */
export interface UpkeepDef {
  /** A night's room at the inn, copper. */
  readonly room: number;
  /** Mending a broken item costs this share of its worth as new (less for one only worn). */
  readonly repair: number;
  /** The hour the hero rises after a night at the inn. */
  readonly rise: number;
  readonly words: {
    /** Talk topics: the innkeeper's room, the smith's mending. */
    readonly roomTopic: string;
    readonly repairTopic: string;
    /** The keeper's answer as the room is taken (`{price}`), or when the purse is too light. */
    readonly roomGiven: string;
    readonly roomTooDear: string;
    /** The smith's answer as the bench is opened. */
    readonly repairLine: string;
    /** The note on waking after a night at the inn. */
    readonly slept: string;
    /** The smith: nothing needs mending; mended; could not mend it all (`{left}`). */
    readonly nothingToMend: string;
    readonly mended: string;
    readonly mendTooDear: string;
    /** A worn thing looks so now (`{item}`). */
    readonly worn: string;
    readonly battered: string;
    readonly broken: string;
    /** Where one wakes after a fall, as in "You wake in …": one's room at the inn, the temple, the inn (no room, no temple). */
    readonly wakeRoom: string;
    readonly wakeTemple: string;
    readonly wakeInn: string;
  };
}

/** A weapon ability on the belt (plan 11.2; Norgo's recipe format comes with milestone 6). */
export interface AbilityDef {
  readonly id: string;
  readonly name: string;
  /** Stamina it costs. */
  readonly stamina: number;
  /** Seconds before it can be used again. */
  readonly cooldown: number;
  /** Damage as a share of a normal blow. */
  readonly power: number;
  /** Extra chance to hit (−1..1). */
  readonly aim: number;
  /** What else it does. */
  readonly effect?: 'stagger' | 'heal';
  readonly text: string;
}

/** How the VGM's Director paces play (plan 4.1): how fast each need grows (per real minute). */
export interface DirectorDef {
  readonly needs: Readonly<Record<'discovery' | 'challenge' | 'reward' | 'people' | 'purpose', number>>;
}

/** Names of one people (by Actors' race id): given names and the family names households share. */
export interface NamesDef {
  readonly female: readonly string[];
  readonly male: readonly string[];
  readonly family: readonly string[];
}

/**
 * How townsfolk talk (plan 9.1: topic-based dialogue through Conversations), in English for now. `{name}`,
 * `{family}`, `{house}`, `{trade}` and `{sign}` are filled in by the engine.
 */
export interface TalkDef {
  /** Who someone is, by what they do (keys: trade, trader, keeper, hand, homemaker, child, traveller; {house} is where they live or lodge). */
  readonly identity: Readonly<Record<string, string>>;
  /** The topics the player can pick, by id (greet, self, news, more, source, bye, and `lead` for a lead's topic). */
  readonly topics: Readonly<Record<string, string>>;
  /** What is said when someone knows nothing of a topic. */
  readonly nothing: readonly string[];
  /** How a house is called: `{house}` the building ("the cottage"), `{family}` the household's name. */
  readonly house: string;
  /** How a promised cellar is called (`{house}` from above). */
  readonly cellar: string;
  /** The clause for "something is wrong down there" (`{subject}` the cellar). */
  readonly troubled: string;
  /** The household's own source, as in "I know it from our own house". */
  readonly ownHouse: string;
  /** How a lead reads in the journal (`{cellar}`). */
  readonly lead: string;
  /** The note when a place is marked on the player's map (`{name}` who marks it, `{house}`). */
  readonly marked: string;
  /** The line in the talk as the hero hands over the map to be marked (`{name}` who takes it). */
  readonly handOver: string;
}

/**
 * What the player's hero may look like (plan 11.4, D30): the shared Actors character creator offers only
 * what fits the setting. Generous, but leaving out what clearly does not fit.
 */
export interface HeroLooksDef {
  /** Actors theme tags the setting's clothes, hair and peoples fit (Actors' THEMES, e.g. "medieval"). */
  readonly themes: readonly string[];
  /** Actors flags left out whatever the themes (e.g. "real-faith": real-world religious symbols). */
  readonly without: readonly string[];
  /** The peoples a hero can be born to, by Actors' race id (each needs `names`). */
  readonly races: readonly string[];
  /** Actors outfit presets a new hero starts in, one drawn per hero (each must fit the themes). */
  readonly outfits: readonly string[];
}

/**
 * A hero's past (plan 11.4): what they did before the story starts. It sets the starting skills and kit
 * and gives one or two people in town who already know them.
 */
export interface BackgroundDef {
  readonly id: string;
  readonly name: string;
  /** A line or two on who they were. */
  readonly text: string;
  /** Points over each skill's start. */
  readonly skills: Readonly<Record<string, number>>;
  /** What they wear (item ids by slot), carry and own (copper). */
  readonly kit: { readonly worn: Partial<Readonly<Record<Slot, string>>>; readonly pack: readonly string[]; readonly coins: number };
  /**
   * Who in town knows them, by trade (the town's trades: 'smith', 'innkeeper', 'reeve', 'keeper' …; the
   * first of these the town has, up to two). `line` greets the hero: {hero} is their name, {name} the speaker's.
   */
  readonly known: readonly { readonly trade: string; readonly line: string }[];
}

/**
 * What a townsperson is about in one part of their day (plan 9.2). The simulation turns each into the
 * places that fit it: `work` is their trade's tools, `errands` the well, the stalls and the shops, `inn`
 * the inn's rooms and tables, `temple` the temple, `home` indoors at home, `lodge` the inn for a guest.
 */
export const DAY_TASKS = ['sleep', 'rise', 'meal', 'work', 'chores', 'errands', 'leisure', 'home', 'inn', 'temple', 'play', 'lodge'] as const;
export type DayTask = (typeof DAY_TASKS)[number];

/** The traits that tilt a choice (0..1 each person). */
export type DayTrait = 'social' | 'diligent' | 'pious';

/** One part of a day: from hour `at` (0..24) until the next part starts. */
export interface DayPart {
  readonly at: number;
  readonly do: DayTask;
  /**
   * On some days, for some people, something else instead (decided once a day): `chance` is the share
   * of people on an average day; with a `trait` it scales with it (twice the chance at 1, none at 0).
   */
  readonly or?: { readonly do: DayTask; readonly chance: number; readonly trait?: DayTrait };
}

/** A day plan: a working day and a rest day (the rest day falls back to the routines' `restday`). */
export interface RoutineDef {
  readonly workday: readonly DayPart[];
  readonly restday?: readonly DayPart[];
}

/**
 * The townsfolk's days (plan 9.2): a routine for each part people play in town (the simulation's roles:
 * trade, trader, keeper, hand, homemaker, child, traveller), trades that keep other hours (the baker
 * before dawn, the innkeeper into the night), and the week with its rest day. Every town of the
 * setting lives by these; a town without an inn or temple sends people home instead.
 */
export interface RoutinesDef {
  /** Days in a week, and which of them (0-based, day 0 is the first of the game) is the rest day. */
  readonly week: number;
  readonly restDay: number;
  /** The rest day for everyone without a rest day of their own. */
  readonly restday: readonly DayPart[];
  /** Early risers start up to this many hours sooner, late ones as much later (all but midnight). */
  readonly shift: number;
  /** And each day varies by up to this many hours either way. */
  readonly jitter: number;
  /** When it is dark (hours): out of doors only what has to be. */
  readonly dark: readonly [number, number];
  readonly roles: Readonly<Record<string, RoutineDef>>;
  /** Trades that keep their own hours, by trade ('baker', 'innkeeper', 'farmer' ...). */
  readonly trades: Readonly<Record<string, RoutineDef>>;
}

export interface SettingModule {
  readonly contractVersion: typeof CONTRACT_VERSION;
  /** Stable lowercase slug: the save identity. */
  readonly id: string;
  /** Bump when the saved meaning of the module changes. */
  readonly version: number;
  readonly title: string;
  readonly world: WorldShape;
  readonly start: StartSpec;
  /** Material for dungeons, per kind (plan 8). */
  readonly dungeons: { readonly cellar: CellarLore; readonly barrow?: CellarLore };
  /** Names of the peoples, by Actors' race id (human, dwarf, halfling, elf). */
  readonly names: Readonly<Record<string, NamesDef>>;
  readonly talk: TalkDef;
  readonly skills: readonly SkillDef[];
  readonly creatures: readonly CreatureDef[];
  readonly items: ItemCatalog;
  /** Rooms and mending (plan 11.5). */
  readonly upkeep: UpkeepDef;
  readonly abilities: readonly AbilityDef[];
  readonly director: DirectorDef;
  readonly hero: HeroLooksDef;
  /** The pasts a hero can choose (plan 11.4), the first the default. */
  readonly backgrounds: readonly BackgroundDef[];
  /** How the townsfolk spend their days. */
  readonly routines: RoutinesDef;
  /** What lives on the land around a town. */
  readonly wild: readonly WildDef[];
  /** The setting's colour key over the day; without it the engine's neutral grade. */
  readonly look?: LookDef;
}

/** The picture's colour key: grade keys at sun heights, sorted by `at` (warm dusk, blue night, ...). */
export interface LookDef {
  readonly grade: readonly GradeKey[];
}

/** Authoring errors, one line each (empty: the module is valid). */
export function validateSetting(m: SettingModule): string[] {
  const out: string[] = [];
  const where = `setting "${m.id}"`;
  if (m.contractVersion !== CONTRACT_VERSION) out.push(`${where}: contract version ${m.contractVersion}, engine speaks ${CONTRACT_VERSION}`);
  if (!/^[a-z][a-z0-9-]*$/.test(m.id)) out.push(`${where}: id must be a lowercase slug`);
  if (!Number.isInteger(m.version) || m.version < 1) out.push(`${where}: version must be a positive integer`);
  const w = m.world;
  const positive: (keyof WorldShape)[] = ['continentSpacing', 'seaDepth', 'mountainHeight', 'rangeSpacing'];
  for (const k of positive) if (!((w[k] as number) > 0)) out.push(`${where}: world.${k} must be > 0`);
  for (const k of ['landFraction', 'drama'] as const) if (!(w[k] >= 0 && w[k] <= 1)) out.push(`${where}: world.${k} must be in 0..1`);
  if (!w.biomes.length) out.push(`${where}: world.biomes is empty`);
  const ids = new Set<string>();
  for (const b of w.biomes) {
    if (ids.has(b.id)) out.push(`${where}: biome "${b.id}" defined twice`);
    ids.add(b.id);
    if (!SURFACES.includes(b.surface)) out.push(`${where}: biome "${b.id}" surface "${b.surface}" is unknown`);
    if (b.flora) {
      const f = b.flora;
      if (!(f.trees >= 0 && f.trees <= 600) || !(f.shrubs >= 0 && f.shrubs <= 600)) out.push(`${where}: biome "${b.id}" flora densities must be 0..600 per hectare`);
      if (!(f.cover >= -1 && f.cover <= 1)) out.push(`${where}: biome "${b.id}" flora cover must be -1..1`);
      for (const k of Object.keys(f.mix)) if (!TREES.includes(k as TreeName)) out.push(`${where}: biome "${b.id}" tree "${k}" is unknown`);
      if (f.trees > 0 && !Object.values(f.mix).some((w) => (w ?? 0) > 0)) out.push(`${where}: biome "${b.id}" has trees but no species`);
    }
    if (b.grass) {
      const g = b.grass;
      if (!(g.cover >= 0 && g.cover <= 1) || !(g.dry >= 0 && g.dry <= 1)) out.push(`${where}: biome "${b.id}" grass cover and dry must be 0..1`);
      if (!(g.height >= 0.05 && g.height <= 1.5)) out.push(`${where}: biome "${b.id}" grass height must be 0.05..1.5 m`);
    }
    if (!(b.temperature[0] <= b.temperature[1])) out.push(`${where}: biome "${b.id}" temperature range is reversed`);
    if (!(b.moisture[0] >= 0 && b.moisture[1] <= 1 && b.moisture[0] <= b.moisture[1])) out.push(`${where}: biome "${b.id}" moisture range must lie in 0..1`);
  }
  const wx = w.weather;
  for (const k of ['frontSize', 'frontSpeed', 'change', 'drying'] as const) if (!(wx[k] > 0)) out.push(`${where}: world.weather.${k} must be > 0`);
  for (const k of ['rainfall', 'storms', 'mist', 'windiness'] as const) if (!(wx[k] >= 0 && wx[k] <= 1)) out.push(`${where}: world.weather.${k} must be in 0..1`);
  for (const id of m.start.biomes) if (!ids.has(id)) out.push(`${where}: start biome "${id}" is not defined`);
  if (!(m.start.elevation[0] >= 0 && m.start.elevation[0] < m.start.elevation[1])) out.push(`${where}: start.elevation must be a rising range above the sea`);
  if (!(m.start.maxSlope > 0)) out.push(`${where}: start.maxSlope must be > 0`);
  if (!(m.start.vista >= 0)) out.push(`${where}: start.vista must be >= 0`);
  for (const [kind, c] of Object.entries(m.dungeons) as [string, CellarLore | undefined][]) {
    if (!c) continue;
    const uses = new Set(c.uses.map((u) => u.id));
    for (const u of c.uses) for (const p of u.props) if (!DUNGEON_PROPS.includes(p)) out.push(`${where}: ${kind} use "${u.id}" prop "${p}" is unknown`);
    // The engine's own rooms (the safe spot, a dug burrow) must exist in every kind.
    for (const u of ['refuge', 'burrow']) if (!uses.has(u)) out.push(`${where}: dungeons.${kind} needs the room use "${u}"`);
    for (const [k, list] of [['builders', c.builders], ['older', c.older], ['troubles', c.troubles], ['dwellers', c.dwellers]] as const) {
      if (!list.length) out.push(`${where}: dungeons.${kind}.${k} is empty`);
      for (const h of list as readonly HistoryDef[]) {
        for (const u of h.uses) if (!uses.has(u)) out.push(`${where}: ${kind} ${k} "${h.id}" uses unknown room use "${u}"`);
        for (const p of h.traces ?? []) if (!DUNGEON_PROPS.includes(p)) out.push(`${where}: ${kind} ${k} "${h.id}" trace "${p}" is unknown`);
      }
    }
    for (const d of c.dwellers) {
      if (!uses.has(d.lair)) out.push(`${where}: ${kind} dweller "${d.id}" lair "${d.lair}" is unknown`);
      if (!d.signs.length) out.push(`${where}: ${kind} dweller "${d.id}" has no signs to hint with`);
    }
  }
  for (const race of ['human', 'dwarf', 'halfling', 'elf']) {
    const n = m.names[race];
    if (!n) { out.push(`${where}: names for "${race}" are missing`); continue; }
    for (const k of ['female', 'male', 'family'] as const) if (n[k].length < 8) out.push(`${where}: names.${race}.${k} needs at least 8 names`);
  }
  const h = m.hero;
  if (!h.themes.length) out.push(`${where}: hero.themes is empty`);
  if (!h.races.length) out.push(`${where}: hero.races is empty`);
  for (const r of h.races) if (!m.names[r]) out.push(`${where}: hero race "${r}" has no names`);
  if (!h.outfits.length) out.push(`${where}: hero.outfits is empty`);
  if (!m.backgrounds.length) out.push(`${where}: backgrounds is empty`);
  m.look?.grade.forEach((k, i, all) => {
    if (i > 0 && !(k.at > all[i - 1]!.at)) out.push(`${where}: look.grade keys must rise in sun height (key ${i})`);
    if (!(k.at >= -1 && k.at <= 1) || !(k.saturation > 0) || !k.slope.every((v) => v > 0)) out.push(`${where}: look.grade key ${i} needs at in -1..1, saturation and slope > 0`);
  });
  const t = m.talk;
  for (const k of ['greet', 'self', 'news', 'more', 'source', 'bye']) if (!t.topics[k]) out.push(`${where}: talk topic "${k}" has no wording`);
  for (const k of ['trade', 'trader', 'keeper', 'hand', 'homemaker', 'child', 'traveller']) if (!t.identity[k]) out.push(`${where}: talk identity "${k}" has no wording`);
  if (!t.nothing.length) out.push(`${where}: talk.nothing is empty`);
  if (!t.troubled.includes('{subject}')) out.push(`${where}: talk.troubled must name {subject}`);
  out.push(...validateFight(m, where));
  out.push(...validateRoutines(m.routines, where));
  return out;
}

/** Skills, creatures, items and abilities: every name points at something that exists. */
function validateFight(m: SettingModule, where: string): string[] {
  const out: string[] = [];
  const skills = new Set(m.skills.map((s) => s.id));
  if (skills.size !== m.skills.length) out.push(`${where}: a skill is defined twice`);
  for (const s of m.skills) if (!(s.start >= 0 && s.start <= 100) || !(s.rate > 0)) out.push(`${where}: skill "${s.id}" needs start 0..100 and rate > 0`);
  for (const k of ['dodge', 'armour', 'shields', 'unarmed']) if (!skills.has(k)) out.push(`${where}: skill "${k}" is missing (the engine trains it)`);
  const items = new Map(m.items.items.map((i) => [i.id, i]));
  const tables = new Set(m.items.treasure.map((t) => t.id));
  for (const i of m.items.items) {
    if (i.weapon && !skills.has(i.weapon.skill)) out.push(`${where}: item "${i.id}" trains unknown skill "${i.weapon.skill}"`);
    if (i.weapon && !(i.weapon.damage[0] > 0 && i.weapon.damage[0] <= i.weapon.damage[1])) out.push(`${where}: item "${i.id}" damage must be a rising range above 0`);
    if (i.slot && !SLOTS.includes(i.slot)) out.push(`${where}: item "${i.id}" slot "${i.slot}" is unknown`);
    if ((i.kind === 'weapon' || i.kind === 'shield' || i.kind === 'armour') && !i.slot) out.push(`${where}: item "${i.id}" is worn but has no slot`);
  }
  for (const u of m.items.uniques) {
    if (!items.has(u.base)) out.push(`${where}: unique "${u.id}" base "${u.base}" is unknown`);
    for (const k of Object.keys(u.bonuses)) if (!skills.has(k)) out.push(`${where}: unique "${u.id}" raises unknown skill "${k}"`);
  }
  for (const b of m.backgrounds) {
    for (const k of Object.keys(b.skills)) if (!skills.has(k)) out.push(`${where}: background "${b.id}" raises unknown skill "${k}"`);
    for (const [slot, id] of Object.entries(b.kit.worn)) if (items.get(id)?.slot !== slot) out.push(`${where}: background "${b.id}" wears "${id}" in ${slot}, which does not go there`);
    for (const id of b.kit.pack) if (!items.has(id)) out.push(`${where}: background "${b.id}" carries unknown item "${id}"`);
    if (!b.known.length) out.push(`${where}: background "${b.id}" is known by no one in town`);
    for (const k of b.known) if (!k.line.includes('{hero}')) out.push(`${where}: background "${b.id}": the ${k.trade}'s greeting must name {hero}`);
  }
  for (const t of m.items.treasure) for (const [id] of t.items) if (!items.has(id)) out.push(`${where}: treasure "${t.id}" holds unknown item "${id}"`);
  for (const k of Object.keys(m.items.affixes)) if (!skills.has(k)) out.push(`${where}: affix for unknown skill "${k}"`);
  const ids = new Set<string>();
  for (const c of m.creatures) {
    if (ids.has(c.id)) out.push(`${where}: creature "${c.id}" defined twice`);
    ids.add(c.id);
    if (!(c.health > 0) || !c.attacks.length || !(c.speed > 0)) out.push(`${where}: creature "${c.id}" needs health, speed and an attack`);
    if (!(c.morale >= 0 && c.morale <= 1)) out.push(`${where}: creature "${c.id}" morale must be 0..1`);
    for (const a of c.attacks) if (!DAMAGE_KINDS.includes(a.kind) || !(a.time > 0)) out.push(`${where}: creature "${c.id}" attack "${a.name}" needs a known kind and time > 0`);
    if (c.loot && !tables.has(c.loot)) out.push(`${where}: creature "${c.id}" loot "${c.loot}" is unknown`);
    if (c.body.kind === 'humanoid' && c.body.held && !items.has(c.body.held)) out.push(`${where}: creature "${c.id}" holds unknown item "${c.body.held}"`);
  }
  for (const [kind, lore] of Object.entries(m.dungeons)) for (const d of lore?.dwellers ?? []) for (const c of d.creatures) if (!ids.has(c)) out.push(`${where}: ${kind} dweller "${d.id}" creature "${c}" is unknown`);
  for (const w of m.wild) {
    for (const c of w.creatures) if (!ids.has(c)) out.push(`${where}: wild "${w.id}" creature "${c}" is unknown`);
    if (!w.creatures.length || w.count[0] < 1 || w.count[1] < w.count[0] || w.ring[1] < w.ring[0] || w.range <= 0) out.push(`${where}: wild "${w.id}" needs creatures, a count, a ring and a range`);
  }
  if (!m.abilities.length) out.push(`${where}: no abilities`);
  return out;
}

/** Day plans: rising hours from midnight, known tasks, a rest day in the week, every role covered. */
export function validateRoutines(r: RoutinesDef, where: string): string[] {
  const out: string[] = [];
  if (!(Number.isInteger(r.week) && r.week >= 1)) out.push(`${where}: routines.week must be a whole number of days`);
  if (!(Number.isInteger(r.restDay) && r.restDay >= 0 && r.restDay < r.week)) out.push(`${where}: routines.restDay must be a day of the week`);
  if (!(r.shift >= 0 && r.shift <= 2) || !(r.jitter >= 0 && r.jitter <= 1)) out.push(`${where}: routines.shift must be 0..2 h and jitter 0..1 h`);
  const day = (name: string, parts: readonly DayPart[]) => {
    if (!parts.length || parts[0].at !== 0) out.push(`${where}: routine ${name} must start at hour 0`);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!(p.at >= 0 && p.at < 24) || (i > 0 && !(p.at > parts[i - 1].at))) out.push(`${where}: routine ${name} hours must rise within 0..24`);
      for (const t of [p.do, p.or?.do]) if (t && !DAY_TASKS.includes(t)) out.push(`${where}: routine ${name} task "${t}" is unknown`);
      if (p.or && !(p.or.chance >= 0 && p.or.chance <= 1)) out.push(`${where}: routine ${name} chance must be 0..1`);
    }
  };
  day('restday', r.restday);
  for (const [k, d] of [...Object.entries(r.roles).map(([k, d]) => [`role ${k}`, d] as const), ...Object.entries(r.trades).map(([k, d]) => [`trade ${k}`, d] as const)]) {
    day(`${k} workday`, d.workday);
    if (d.restday) day(`${k} restday`, d.restday);
  }
  for (const k of ['trade', 'trader', 'keeper', 'hand', 'homemaker', 'child', 'traveller']) if (!r.roles[k]) out.push(`${where}: routines.roles has no "${k}"`);
  return out;
}

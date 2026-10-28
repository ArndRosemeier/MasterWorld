/**
 * The setting module contract (docs/design/masterworld-plan.md section 12, D14): everything world-related
 * that the engine must not hard-code. One module per game; a save records its id and version.
 *
 * First cut: identity, the shape of the land and the start. Peoples, places, creatures, items, magic,
 * lore, VGM templates and the Conversations package are added as the milestones need them.
 */

import type { GradeKey } from '@futuremagic/stage';
import type { SettlementSize } from '@futuremagic/settlement';

export const CONTRACT_VERSION = 12;

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
  /** What grazes the farms' paddocks (the game draws each kind its own way). */
  readonly livestock: LivestockKind;
}

/** Farm animals the game can draw. Sheep and pigs join when Actors has them. */
export type LivestockKind = 'horse' | 'cow';

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
  'candle', 'lantern', 'ledger', 'chest', 'web', 'nest', 'vat', 'bricks', 'beam', 'puddle', 'bin', 'jar', 'ladder', 'door',
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
  /** Who they are: an encounter met below (its id), and its creatures (the setting's names; the encounter's, as `who` gives them). */
  readonly encounter: string;
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

/** How a kind of dungeon is spoken of once it is quiet; `{place}` is what it is called (going in is seen, not told). */
export interface DungeonWords {
  /** The Director's line when it has gone quiet. */
  readonly quiet: string;
  /** What the household says when told it is quiet (the promise kept); `{coins}` the reward, `{place}` the place. */
  readonly thanks: string;
}

/** The setting's material for a kind of dungeon (plan 8: cellars in milestone 3, barrows after). */
/**
 * How a kind of dungeon takes shape inside (plan 8: "each kind has its own space rules"): how big it may
 * grow, which way it goes (a cellar down under its house, a tower up), how its way out looks, whether its
 * rock is carved (a natural cave) or built, and how its walls look.
 */
export interface DungeonSpace {
  /** Half extent of the layout grid, cells (a tower stands on a small foot). */
  readonly radius: number;
  /** Most rooms in all. */
  readonly maxRooms: number;
  /** Deepest storey the graph may reach: without an older layer below, and with one. */
  readonly depth: readonly [number, number];
  /** Storeys the rooms climb as the way goes on (a tower: the goal near the top); 0: they stay where the graph put them. */
  readonly rise: number;
  /** The way back out, standing in the entrance room (a ladder up to a hatch, a tower's door). */
  readonly way: DungeonProp;
  /** How far props stand in from a wall's line, metres (a cave's rock bulges into the room). */
  readonly inset: number;
  /** The entrance room's size, cells: the house's footprint above it, or fixed. */
  readonly entrance: 'footprint' | readonly [number, number];
  /** Its rock is carved (a signed distance field meshed with surface nets), not built of walls and floors. */
  readonly carved: boolean;
  /** Wall torches by its doors (a natural cave has none: the lantern is all the light there is). */
  readonly torches: boolean;
  /** The hero comes in standing in the middle of the entrance room (a tower's door, a cave's rock step), else by the way out. */
  readonly arriveMid: boolean;
  /** Its built walls: rubble and brick (a cellar), or dressed stone with boarded upper floors (a tower). */
  readonly walls: 'rubble' | 'dressed';
}

/**
 * A kind of dungeon as the engine reads it (C6c, D51): where it stands, what stands on the land over it,
 * and its space. The code reads this, never the kind's name, so a new kind is data (and at most a new shell).
 */
export interface DungeonForm {
  /** Under a house of a town; out on the land on a rise, at the foot of a slope going into its hill, or on level raised ground. */
  readonly stands: 'house' | 'rise' | 'slope' | 'level';
  /** Metres from the town's market it lies, at least and at most (out on the land). */
  readonly ring?: readonly [number, number];
  /** What people call one out on the land, `{dir}` the way from the town ("the barrow {dir} of the town"). */
  readonly called?: string;
  /** One word for it ("this cave"). */
  readonly word: string;
  /** What the VGM may ask one for (`dungeonFor`): a lead (a place to promise), a hideout, a den. */
  readonly purposes: readonly string[];
  /** What stands on the land over it, an engine builder by name: a hatch in a house, a mound, a mouth in a crag, a keep. */
  readonly shell: 'hatch' | 'mound' | 'mouth' | 'keep';
  /** Trees keep off it: the clearing's middle this far behind its door, and its radius (metres). */
  readonly clearing?: { readonly back: number; readonly r: number };
  /** Set pieces made for these other kinds fit it too. */
  readonly pieces?: readonly string[];
  readonly space: DungeonSpace;
}

export interface CellarLore {
  /** How the kind takes shape and stands (C6c). */
  readonly form: DungeonForm;
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

/** The skills a character can learn from trainers (plan 10, 11.4, D30, D54): no classes, no XP. */
export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly group: 'combat' | 'magic' | 'utility' | 'survival' | 'social';
  /** Where a fresh character starts (0..100). */
  readonly start: number;
  /**
   * A dangerous skill (fire, shadow, stealth; D54): the reputation it asks on top of
   * each rank's, the opening too. None: as any other.
   */
  readonly danger?: number;
  /** Everyone can use it from the start (with guilds, D49: other skills wait for a trainer or a past). */
  readonly open?: boolean;
  /** Its colour (sRGB 0..1): a school of magic's spells glow in it. */
  readonly color?: readonly [number, number, number];
  /** How a school's spells move and shimmer (C4): one of the engine's motifs; radiance by default. */
  readonly motif?: SpellMotif;
}

/** The spell looks the engine draws (C4): flickering tongues, glittering ice, dull grit, pulsing growth, rays, a hollow dark. */
export const SPELL_MOTIFS = ['flame', 'frost', 'stone', 'bloom', 'radiance', 'shade'] as const;
export type SpellMotif = (typeof SPELL_MOTIFS)[number];

/** How a blow lands: the engine reads it for armour, sounds and the clip. */
export const DAMAGE_KINDS = ['cut', 'pierce', 'blunt', 'bite', 'claw', 'cold', 'fire', 'radiant', 'shadow'] as const;
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
    readonly kind: 'humanoid'; readonly race: string; readonly height: number; readonly skin?: string; readonly outfit: 'rags' | 'bandit' | 'grave' | 'guard'; readonly gaunt?: boolean;
    /** What it holds (an item id). */
    readonly held?: string;
    /** Only its bones: the raised dead. */
    readonly bones?: boolean;
  }
  | { readonly kind: 'rat' | 'spider'; readonly length: number; readonly color: string }
  /** An animal of the land: Actors' wolf and deer, a boar grown by @futuremagic/creatures. `length` nose to rump. */
  | { readonly kind: 'beast'; readonly species: 'wolf' | 'deer' | 'boar'; readonly length: number; readonly color: string };

/** Where an encounter is met: in a place below, under thick trees, on open land, by a road. */
export type EncounterWhere = 'below' | 'wood' | 'open' | 'road';

/**
 * An encounter (C6b, docs/design/vgm.md 3): who the hero meets together, how many, and where. The one
 * definition that a dungeon's dwellers, the wild's groups and a story event's band all come from; the VGM
 * picks and fills one with `encounterFor` (vgm/encounters.ts).
 */
export interface EncounterDef {
  readonly id: string;
  /** Who (creature ids): the first leads, the others follow at random. */
  readonly creatures: readonly string[];
  /** How many met together, at least and at most. */
  readonly count: readonly [number, number];
  /** Where they may be met. */
  readonly where: readonly EncounterWhere[];
  /** What meeting them gives the hero (the Director's need it meets): a fight, or a sight. */
  readonly need: 'challenge' | 'discovery';
}

/**
 * Who lives on the land around a town (plan 9.3, the world simulation): a kind of group (an encounter),
 * where its territories lie and how many there are. The VGM places them from the seed into the log
 * (vgm/wild.ts `wildFor`).
 */
export interface WildDef {
  readonly id: string;
  /** Who they are and how many (an encounter's id; it is met in this habitat). */
  readonly encounter: string;
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
 * A good day in a town (C11, plan 4.5): `feast`: the town the hero did a deed for (a promise kept: a place
 * cleared, a band beaten) feasts them the next evening; `market`: every `every` days the town holds a market
 * day. Its people gather at the market in the day's `hours`. The words: `title`, the `news` the hero hears in
 * town, `told` how its people tell it while it is to come or on, `done` once it is over; `{place}` (a
 * feast's: what the hero cleared) and `{town}`.
 */
export interface FestivityDef {
  readonly id: string;
  readonly kind: 'feast' | 'market';
  readonly hours: readonly [number, number];
  /** market: days between two. */
  readonly every?: number;
  readonly words: { readonly title: string; readonly news: string; readonly told: string; readonly done: string };
}

/**
 * A story event (plan 4.2, C6): the world moves on its own when a thing is left alone, it goes into the
 * ledger, the land changes and the town hears of it, and there is something new to do.
 * `spill`: the dwellers of a place promised long ago and never cleared come out and roam the land near it.
 */
export interface StoryEventDef {
  readonly id: string;
  /**
   * `spill`: a place promised and never cleared spills its dwellers onto the land near it. `raid`: a wild
   * group (`by`) still living near a town comes down on a farm and drives off animals from its paddock.
   * `take`: a wild group (`by`) takes a settlement of the size `takes` near it; its folk flee, the band
   * holds it, and the rest of the group lies up in a place asked for (`lair`) near it.
   */
  readonly kind: 'spill' | 'raid' | 'take';
  /** A raid's or take's raiders: the setting's wild group (WildDef id) that comes down while any of it lives. */
  readonly by?: string;
  /** A take's: the size of settlement taken (classic: a waystation), within `reach` metres of the raiders' ground. */
  readonly takes?: SettlementSize;
  readonly reach?: number;
  /** A take's: what the raiders' place near it is asked for (`dungeonFor`'s purpose; classic: a hideout). */
  readonly lair?: string;
  /** Game hours first: a spill's place must have stood open that long, raiders bide that long after the world began. */
  readonly after: number;
  /** Least game hours between two events in one town. */
  readonly cooldown: number;
  /** How many come out, at least and at most. */
  readonly count: readonly [number, number];
  /** Game hours the town's people gather at the market to talk it over (0 or none: they do not). */
  readonly gather?: number;
  /**
   * How it is told: the lead's title, the `cry` a townsman shouts when the hero comes into the town (word reaches
   * the hero as it reaches anyone: shouted, talked of, seen; no narrator), the journal's note once heard, and the line when
   * it is over. `{creatures}` (the plural), `{place}` (a raid's: the farm; a take's: the settlement), `{town}`, `{dir}` (which way from
   * the town the band is), and a raid's `{animals}` (the setting's livestock). `told`: how the townsfolk tell
   * it when asked (C11: talk knows events; none: the news).
   */
  readonly words: { readonly title: string; readonly cry: string; readonly note: string; readonly done: string; readonly told?: string; readonly faded?: string };
  /**
   * Game hours an event left alone runs (C11: an ignored promise resolves): then it ends without the hero, as
   * `words.faded` tells it (the band goes, a raid's beasts with it for good). None: it waits for the hero.
   */
  readonly fades?: number;
}

/**
 * What fills a region the VGM opens (plan 5.2, 5.5, B1): plain country, or a place (a hamlet, a camp,
 * ruins, a barrow field) on dry, gentle ground inside it. The VGM picks among the fills that fit by
 * weight, keeping places of a kind apart.
 */
export interface RegionFillDef {
  readonly id: string;
  /** As the log and the map say it ("a hamlet"). */
  readonly name: string;
  /** Region size: 250 m × 2^level. */
  readonly level: number;
  /** How often, against the other fills that fit. */
  readonly weight: number;
  /** What stands there (none: plain country, nothing placed). */
  readonly place: 'none' | 'waystation' | 'hamlet' | 'village' | 'camp' | 'ruin' | 'barrows';
  /** Footprint radius of the place, metres (trees keep out of it); a hamlet's or village's outline radius (its fields reach farther). */
  readonly radius?: number;
  /** How much farther round the footprint the trees keep off, metres (fields and gardens cleared, firewood cut). */
  readonly clearing?: number;
  /** Biomes it may lie in (none: any on land). */
  readonly biomes?: readonly string[];
  /** Metres from the start where it may lie, at least (and at most). */
  readonly ring?: readonly [number, number?];
  /** Places of this fill keep at least this far apart, metres. */
  readonly apart?: number;
}

/** The regions the VGM opens as the hero walks (plan 5.5): the fills, which is plain country, and the start's. */
export interface RegionsDef {
  readonly fills: readonly RegionFillDef[];
  /** The fill for land with nothing on it, and for the free rest of a square partly taken. */
  readonly country: string;
}

/**
 * Small life (plan 9.3): birds and squirrels about the land, in the world simulation, never fought and
 * never steered by the VGM. They forage, flee into the trees or take wing when someone comes near, and
 * keep to their roosts by night.
 */
export interface SmallLifeDef {
  readonly birds: readonly BirdKindDef[];
  /** The squirrel's looks (Actors' squirrel presets: grey, red, fox, black), picked by seed; empty: none. */
  readonly squirrels: readonly string[];
  /** Chance of a squirrel in a 32 m square of closed wood (less where the wood is thinner). */
  readonly squirrelChance: number;
}

/** A kind of bird (plan 9.3). */
export interface BirdKindDef {
  readonly id: string;
  /** Length, metres (a sparrow 0.15, a crow 0.45). */
  readonly size: number;
  /** Colours of the back (sRGB 0xRRGGBB), one picked per bird; the belly is paler. */
  readonly colours: readonly number[];
  /**
   * wood: a few forage on the woodland floor and flee up into the crowns; open: the same on meadows and
   * at wood edges, fleeing to the nearest trees or farther over the grass; flock: many wheel over open
   * land and fields, settle to feed, and rise together.
   */
  readonly habitat: 'wood' | 'open' | 'flock';
  /** How many together, at least and at most. */
  readonly count: readonly [number, number];
  /** Chance of a group in a square where they live (32 m; flocks 128 m). */
  readonly chance: number;
  /** Wing beats per second. */
  readonly beat: number;
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
  readonly kind: 'weapon' | 'shield' | 'armour' | 'potion' | 'food' | 'tool' | 'valuable' | 'writing';
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
  /** Writings (tomes, scrolls; C3, D49): the taught ability read from it (it opens the ability's school too). */
  readonly teaches?: string;
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
  /** An ability only items give (D31, C5): the hero has it while wearing this. */
  readonly grants?: string;
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

/** How a sight stands on the land (world/sites.ts `layOutSight`). */
export const SIGHT_SHAPES = ['stones', 'waystone', 'cairn', 'stash'] as const;
export type SightShape = (typeof SIGHT_SHAPES)[number];

/**
 * A sight by the way (plan 4.1, C9): the VGM's cheapest answer to an overdue Discovery, something old or
 * strange the hero comes upon (a ring of standing stones, a carved waystone of the old realm, a cairn).
 * `seen`: the line as the hero comes upon it.
 */
export interface SightDef {
  readonly id: string;
  readonly shape: SightShape;
  readonly seen: string;
  readonly weight?: number;
  /**
   * The need it answers (default Discovery). A Reward's sight is a find: something hidden by the way, its
   * `loot` (a treasure table) the hero takes when they come upon it.
   */
  readonly need?: 'discovery' | 'reward';
  readonly loot?: string;
}

/** The situations the engine knows how to stage (C10). */
export const SITUATION_KINDS = ['hurt-traveller', 'paddock-wolves', 'raid-smoke', 'stray-beast', 'refugees'] as const;
export type SituationKind = (typeof SITUATION_KINDS)[number];

/**
 * A situation (D52, C10): something the hero walks into and sees, not a quest handed out. `hurt-traveller`:
 * a town's traveller sits hurt by the hero's way (People's answer, now and then instead of one resting).
 * `paddock-wolves`: at dusk, `encounter` (wolves) prowl outside a paddock of the town the hero is in, once a
 * town every `every` days. `raid-smoke`: smoke rises over the barn of a farm a raid came down on (C6) for
 * `lasts` game hours, seen over the trees from afar. `stray-beast`: in the day `hours`, one of the beasts of
 * a paddock of the town the hero is in gets out and wanders off, and someone of its farm goes after it (once
 * a town every `every` days, for `lasts` hours at most). `refugees` (C11): the folk of a settlement a band
 * holds (a take) camp by the road outside the nearest town until it is freed, one of them hurt. `cry` is the one urgent line someone there calls out in a speech bubble (D52: rare,
 * only a cry for help), and only once the hero is within `seen` metres of what it is about, so the hero sees
 * it before they are told.
 */
export interface SituationDef {
  readonly id: string;
  readonly kind: SituationKind;
  /** None: nobody cries out (it is no emergency). */
  readonly cry?: string;
  /** How near the hero must be (m) to the situation before the cry (they see it first). */
  readonly seen: number;
  /** hurt-traveller: the share of People's travellers that are hurt (0..1). */
  readonly chance?: number;
  /**
   * hurt-traveller: the talk topic to see to the hurt one, and what they say to it. Chosen, the hero kneels by
   * them and binds the wound, and they get up again (a good deed, D54).
   */
  readonly tend?: { readonly topic: string; readonly line: string };
  /** paddock-wolves: the encounter, the game hours of the day it may begin in, and the days between two in one town. */
  readonly encounter?: string;
  readonly hours?: readonly [number, number];
  readonly every?: number;
  /** raid-smoke: how long the barn smoulders (game hours). */
  readonly lasts?: number;
}

/** How far the hero sees a situation clearly (m): a cry never comes from farther (its `seen` is at most this). */
export const SEEN_MOST = 60;

/**
 * Fast travel (plan 5.4, D37): a seat on the cart from an inn to the inn of another town the hero has been
 * to. The cart keeps to the roads at `speed` (m/s, the hero's metres: the clock runs on as it would for
 * someone walking it), its way `road` times longer than the straight line; the fare is `perKm` copper a
 * kilometre of that way, at least `least`. The innkeeper offers the `offers` nearest towns.
 */
export interface TravelDef {
  readonly speed: number;
  readonly road: number;
  readonly perKm: number;
  readonly least: number;
  readonly offers: number;
  readonly words: {
    /** The innkeeper's topic (`{place}`: "the hamlet 2 km north", `{price}`), the answer as the seat is taken or the purse is too light. */
    readonly topic: string;
    readonly given: string;
    readonly tooDear: string;
    /** The screen while the cart goes. */
    readonly going: string;
    /** The note on arriving (`{place}`, `{hours}`). */
    readonly arrived: string;
  };
}

/**
 * A kind of shop (plan 11.5): who keeps it, what they keep in stock and buy, and how much coin they hold.
 * Prices follow what the town has: what a shop here makes is cheaper, and the more of a thing the town's
 * merchants already hold, the less they pay for it and ask for it.
 */
export interface ShopDef {
  /** The keeper's trade ('smith', 'innkeeper'), or 'trader' for a stall on the market. */
  readonly keeper: string;
  /** What the shop is called ("The smithy"). */
  readonly name: string;
  /** The talk topic that opens it ("Show me your wares."). */
  readonly topic: string;
  /** What the keeper says as the trade window opens. */
  readonly line: string;
  /** What they make or keep: item ids with how many they like to have in stock. */
  readonly goods: readonly (readonly [string, number])[];
  /** The kinds of thing they buy from the hero. */
  readonly buys: readonly ItemDef['kind'][];
  /** The coin they keep (copper); spent on what they buy, it comes back over the days. */
  readonly purse: number;
  /** Share of a thing's worth they pay for it, and ask for it (before the hero's speech). */
  readonly pays: number;
  readonly asks: number;
  /** At most this many keep the shop in a town (the market's first stalls; absent: every keeper). */
  readonly most?: number;
  /** Days between restocks (each shop on its own day): the shelves are filled again and coin comes back. */
  readonly restock: number;
  /**
   * Fine work, the price ladder above the plain goods (plan 11.5): this many uncommon pieces and rare
   * ones made of the shop's wearable goods (the rare of the dearest), their bonuses as found at
   * `danger`. Fixed by the shop, never by the hero (D29).
   */
  readonly fine?: { readonly uncommon: number; readonly rare: number; readonly danger: number };
}

/**
 * A teacher (plan 11.4, 11.5): a townsperson of this trade sells lessons in a few skills. A lesson is one
 * point of the skill and some hours; it costs more the higher the skill, and above `upTo` they have
 * nothing more to teach (from there only use and harder masters).
 */
export interface TrainerDef {
  /** The teacher's trade ('smith', 'carter', 'innkeeper'), or 'trader' / 'keeper' by role. */
  readonly keeper: string;
  /** Who they are as a teacher ("Borin, the smith"), shown on the window: `{name}`. */
  readonly title: string;
  /** The talk topic that opens the lessons, and their line as it opens. */
  readonly topic: string;
  readonly line: string;
  readonly skills: readonly string[];
  readonly upTo: number;
  /** Copper for a lesson at skill 0; it grows with the square of (1 + skill / 20). */
  readonly price: number;
  /** Game hours one lesson takes. */
  readonly hours: number;
}

/**
 * A skill's ranks (D49, D54): how far lessons may raise it once a guild's trainer has opened that rank. Rank
 * 0 is the opening. Each rank is paid in coin, and may ask the guild's task done and the hero's reputation (one
 * for the whole world, raised by good deeds; more for a dangerous skill: SkillDef.danger). Nothing rises by use.
 */
export interface SkillRankDef {
  /** The highest the skill rises at this rank. */
  readonly upTo: number;
  /** Copper the trainer asks to open it. */
  readonly price: number;
  /** The guild's task must be done first. */
  readonly task?: boolean;
  /** The reputation needed (0..100, game/standing.ts `renown`). */
  readonly renown?: number;
}

/** A guild's task for a higher rank: clear a place (below a house, or out on the land with `out`). */
export interface GuildTaskDef {
  /** What the trainer asks, and says when it is done. */
  readonly ask: string;
  readonly done: string;
  /** Only a place out on the land counts (a barrow, a cave, a tower), not a cellar. */
  readonly out?: boolean;
}

/**
 * A deed a guild's master asks once, for what no trainer sells (C14, D52): once the hero has opened one of
 * the house's skills and its people trust them enough, the master speaks of a place the VGM makes for it
 * (vgm/quests.ts); cleared and told back to the master's household, its reward is the master's gift.
 */
export interface GuildQuestDef {
  /** The taught ability given for it (classic: bird form); no guild sells it. */
  readonly reward: string;
  /** The dungeon kinds the place may be, tried in this order (each a lead's kind). */
  readonly kinds: readonly string[];
  /** The hero's reputation before the master speaks of it (0..100). */
  readonly renown: number;
  /** What the master says of it (`{place}`: what the place is called, "the old tower north of the town"). */
  readonly ask: string;
  /** What the master says when told it is done, and gives the reward. */
  readonly done: string;
}

/**
 * A guild house (D49): a trainer who opens a few skills and their ranks, and sells lessons within a rank
 * (as a TrainerDef, `keeper` is the guild's id). Each town of the listed sizes has one, in a plain house
 * near what it names; a hidden house is not on the map, and the bard gives its way in.
 */
export interface GuildDef extends TrainerDef {
  /** The house's name ("the Hall of Arms"). */
  readonly name: string;
  /** In towns of these sizes ('town' is the start town's). */
  readonly sizes: readonly SettlementSize[];
  /**
   * Which plain house it takes: the one nearest the smithy, the inn, or on the town's edge; `out`: its master
   * keeps a place of their own out on the land past the fields (a half-ruined tower, C3), and the house
   * nearest it is only where the household lives.
   */
  readonly near: 'smithy' | 'inn' | 'edge' | 'out';
  readonly hidden?: boolean;
  /** For a hidden house: how the bard tells the way in. */
  readonly way?: string;
  /** How its trainer dresses (none: as the townsfolk; a hidden house's keeper never stands out). */
  readonly dress?: 'fighter' | 'traveller';
  /** The colour of the round shield over its door ('#rrggbb'; none: no sign, as for a hidden house). */
  readonly sign?: string;
  /** What the trainer says on opening a skill or a rank, and when they do not trust the hero enough for it yet (`{skill}`). */
  readonly opens: string;
  readonly distrust: string;
  readonly task: GuildTaskDef;
  /**
   * A magic teacher (plan 10, C3): copper for one of its schools' spells (the taught abilities of its skills),
   * at a spell's level 0; dearer by a tenth per level. Opening a school gives its first spells; the others
   * are taught once the school has reached their level. None: the house teaches no abilities.
   */
  readonly spellPrice?: number;
  /** Copper to open a skill here, instead of its first rank's price (a magic teacher asks little: a fresh hero can start). */
  readonly openPrice?: number;
  /** Further taught abilities of no school it teaches as well, at `spellPrice`. */
  readonly abilities?: readonly string[];
  /** What the teacher says on teaching a spell (`{spell}`). */
  readonly teachesSpell?: string;
  /** Its master's one deed for a gift no trainer sells (C14). */
  readonly quest?: GuildQuestDef;
}

/** The teller at the inn (D49): "where can I learn …?" names every guild house and marks it on the map. */
export interface BardDef {
  readonly topic: string;
  readonly line: string;
  /** How he tells of one house (`{house}`, `{skills}`, `{keeper}`; `{way}` for a hidden one). */
  readonly tells: string;
  readonly tellsHidden: string;
  /** Of a master out on the land (`near: 'out'`; `{dir}`: which way from the town); none: as `tells`. */
  readonly tellsOut?: string;
}

/** A weapon ability on the belt (plan 11.2; Norgo's recipe format comes with milestone 6). */
/**
 * An ability (plan 10): its costs, cooldown and cast time, and a recipe of steps (`ops`) the recipe runner
 * (game/recipe.ts) plays, ported from Norgo's format. Weapon abilities are recipes too: a `blow` step lands on
 * the next swing. Numbers are base values; the ability's skill scales damage, healing and effects.
 */
export interface AbilityDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** Its glyph on the action bar and in the ability book. */
  readonly icon?: string;
  /**
   * Not known at the start: a teacher opens it (D49), or the debug menu does. Absent: every hero knows it.
   */
  readonly taught?: boolean;
  /** Only an item gives it (D31, C5): known while a worn item grants it, never taught. */
  readonly item?: boolean;
  /** How its spell shows when not as its skill's school does (an item's ability): colour (sRGB 0..1) and motif. */
  readonly glow?: { readonly color: readonly [number, number, number]; readonly motif: SpellMotif };
  /** The skill that powers it and that its use trains (absent: the weapon's). */
  readonly skill?: string;
  /** How good at its skill the hero must be to use it (absent: 0); a teacher opens it by rank (C3). */
  readonly level?: number;
  /** What it is aimed at: a foe (the target), or the hero themself. Absent: a foe when a step needs one. */
  readonly aim?: 'foe' | 'self';
  /** How far the target may be, metres (absent: the weapon's reach for a blow, else 24). */
  readonly range?: number;
  /** What it costs, paid when it goes off. */
  readonly cost?: AbilityCost;
  /** Seconds before it can be used again. */
  readonly cooldown: number;
  /** Seconds standing still to cast it (absent or 0: at once). Moving breaks the cast. */
  readonly cast?: number;
  readonly ops: readonly AbilityOp[];
}

export interface AbilityCost {
  readonly stamina?: number;
  readonly mana?: number;
  readonly health?: number;
}

/** Where a recipe step is centred: the caster, the target, or the point the cast (or zone) works at. */
export type OpAnchor = 'self' | 'target' | 'point';
/** Whom an area touches. */
export type OpWho = 'foes' | 'friends' | 'all';

/** A status effect put on someone (the setting's `effects`); magnitude is per second for damage and healing. */
export interface EffectApply {
  readonly id: string;
  readonly magnitude: number;
  readonly duration: number;
  /** 0..1 (absent: always). */
  readonly chance?: number;
}

/** Shapes the land may take for a terrain step (geomancy; the world decides where it can). */
export type TerrainShape = 'wall' | 'pillar' | 'mound' | 'crater' | 'bridge';

/** One step of an ability's recipe (Norgo's format, plan 10). `look` names how the game shows it. */
export type AbilityOp =
  /** A weapon blow at the target on the next swing; `again` keeps swinging (Strike). */
  | { readonly op: 'blow'; readonly power: number; readonly aim?: number; readonly stagger?: number; readonly again?: boolean }
  /** Something thrown or loosed at the target: it flies at `speed` m/s and lands on whatever it meets first. */
  | {
      readonly op: 'projectile'; readonly speed: number; readonly damage?: number; readonly kind?: DamageKind; readonly radius?: number;
      readonly effect?: EffectApply; readonly onHit?: readonly AbilityOp[]; readonly look?: string;
    }
  /** At once on everyone in a sphere. */
  | {
      readonly op: 'area'; readonly radius: number; readonly at?: OpAnchor; readonly damage?: number; readonly kind?: DamageKind; readonly heal?: number;
      readonly effect?: EffectApply; readonly who?: OpWho; readonly look?: string;
    }
  /** A lasting place that plays its own steps every `tick` seconds (at its middle) for `duration` seconds. */
  | { readonly op: 'zone'; readonly radius: number; readonly duration: number; readonly tick: number; readonly at?: OpAnchor; readonly ops: readonly AbilityOp[]; readonly look?: string }
  /** A status effect on the caster or the target. */
  | { readonly op: 'effect'; readonly to: 'self' | 'target'; readonly effect: EffectApply }
  /** Health back: `amount`, or with `share` that share of the most health. */
  | { readonly op: 'heal'; readonly to: 'self' | 'target'; readonly amount: number; readonly share?: boolean }
  /** The land reshaped (a wall, a pillar…), where the world allows it (volumes, D9). */
  | { readonly op: 'terrain'; readonly shape: TerrainShape; readonly at?: OpAnchor; readonly radius: number; readonly height?: number; readonly length?: number }
  /** A change of the hero's shape (bird form). */
  | { readonly op: 'shape'; readonly into: 'bird'; readonly change: number; readonly back: number }
  /** Its steps, `t` seconds later. */
  | { readonly op: 'delay'; readonly t: number; readonly ops: readonly AbilityOp[] }
  /** Only for the eye and the ear. */
  | { readonly op: 'look'; readonly look: string; readonly at?: OpAnchor };

/** A change of the hero's shape (an ability's `shape` step). */
export type ShapeDef = Extract<AbilityOp, { op: 'shape' }>;

/** A status effect (plan 10): what it does per unit of magnitude while it lasts. */
export interface EffectDef {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  /** Good or bad for whoever has it. */
  readonly kind: 'boon' | 'bane';
  /** Damage of this kind, magnitude per second. */
  readonly dot?: DamageKind;
  /** Health back, magnitude per second. */
  readonly hot?: boolean;
  /** Slowed by magnitude (0..1, a share of the speed). */
  readonly slow?: boolean;
  /** Cannot act at all (staggered, frozen). */
  readonly hold?: boolean;
  /** Magnitude added to armour. */
  readonly ward?: boolean;
  /** Runs from whoever put it on (a creature's terror). */
  readonly fear?: boolean;
  /** Harder to see and hear, by magnitude (0..1, a share). */
  readonly veil?: boolean;
}

/** How the VGM's Director paces play (plan 4.1): how fast each need grows (per real minute). */
export interface DirectorDef {
  readonly needs: Readonly<Record<'discovery' | 'challenge' | 'reward' | 'people' | 'purpose', number>>;
  /**
   * The player model's leans (C12, vgm/playerModel.ts): for each playstyle, how many times faster a need it
   * enjoys grows (1: as usual). Mixed by how much of each style the player shows. None: no lean.
   */
  readonly styles?: Readonly<Partial<Record<'explorer' | 'fighter' | 'socializer' | 'crafter' | 'mage', Readonly<Partial<Record<'discovery' | 'challenge' | 'reward' | 'people' | 'purpose', number>>>>>>;
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
  /** How the household calls the cellar under their own house ("our cellar"). */
  readonly ownCellar: string;
  /** The household's own source, as in "I know it from our own house". */
  readonly ownHouse: string;
  /** How a lead reads in the journal (`{cellar}`). */
  readonly lead: string;
  /** The note when a place is marked on the player's map (`{name}` who marks it, `{house}`). */
  readonly marked: string;
  /** The line in the talk as the hero hands over the map to be marked (`{name}` who takes it). */
  readonly handOver: string;
  /** Someone the guide sends over (vgm/guide.ts) as they come: a note (`{name}`); one is picked per person. */
  readonly comes: readonly string[];
  /** How they open the talk then: why they came over, leading to the news. */
  readonly beckon: readonly string[];
  /**
   * Telling a household their place is safe again (plan 4.2): the topic (`{place}` as they call it),
   * how the household's own cellar is named to them ("your cellar"), the journal's note once it is quiet
   * (`{name}` who to tell, `{house}` where they live), and the words before a rumour of the next lead.
   */
  readonly cleared: { readonly topic: string; readonly yours: string; readonly note: string; readonly rumour: string };
  /**
   * Story events in talk (C11): where the townsfolk have it from, as in "I know it from {source}": those who
   * saw it themselves (a raided farm's household), and everyone else.
   */
  readonly happened?: { readonly saw: string; readonly heard: string };
  /** The hero's own first journal page in a new game (`{inn}`: the inn as it is called): where to ask. */
  readonly arrival: { readonly title: string; readonly text: string; readonly from: string };
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

/** How the hero stands with a people (plan 11.6, D34), from the lowest to the highest. */
export const TIERS = ['hated', 'unwelcome', 'stranger', 'friend', 'honoured'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * A people as a faction (plan 11.6, D34): what they think of the hero is one number, −100 .. 100, that
 * the game reads for greetings, prices, who will talk and whether the guards let the hero in.
 */
export interface PeopleDef {
  /** Actors' race id (human, dwarf, halfling, elf). */
  readonly id: string;
  /** One of them, and all of them ("dwarf", "dwarves"). */
  readonly name: string;
  readonly plural: string;
  /** What they think of a stranger at first, and of one of their own kin (−100 .. 100). */
  readonly regard: number;
  readonly kin: number;
  /** How they open a talk, by standing (one picked per person; none for a tier: the talk's own greeting). */
  readonly greet: Partial<Readonly<Record<Tier, readonly string[]>>>;
  /** What they say instead of talking, hated (one picked per person). */
  readonly refuse: readonly string[];
  /** Unwelcome: what they say instead of their news. */
  readonly curt: readonly string[];
  /** Their own place (none: they live among others). */
  readonly hold?: HoldDef;
}

/**
 * A people's own place (plan 11.6): the gate of a hold cut into a hillside, a court before it and its
 * guards. Walking in unwelcome is dangerous: the guards warn twice, then fight.
 */
export interface HoldDef {
  /** What it is called ("Durgan's Gate"). */
  readonly name: string;
  /** Metres from the start town's market where it lies (the VGM picks a hillside in that ring). */
  readonly ring: readonly [number, number];
  /** The least standing the guards let in. */
  readonly welcome: Tier;
  /** Who keeps the gate (a creature id) and how many. */
  readonly guard: string;
  readonly guards: number;
  /** What the guards call out: the first warning, the last, as they attack, and to someone welcome. */
  readonly warn: readonly string[];
  readonly last: readonly string[];
  readonly attack: string;
  readonly hail: readonly string[];
  /** Their own people in a town tell of it: the topic, the answer (`{hold}`), and the journal's title. */
  readonly topic: string;
  readonly told: string;
  readonly lead: string;
}

/**
 * What changes the hero's standing (plan 11.6, D54): every good deed, once. A promise kept for one of a
 * people's households, or a town freed of a story event's band (`kept`; the other peoples in town hear of it
 * too, a third as much); a guild's task done (with its trainer's people); a smaller help (`help`: a hurt
 * traveller tended, wolves beaten off a paddock, with the people helped); a gift. And the bad: walking into a
 * hold unwelcome, striking its guards, killing one.
 */
export interface StandingDef {
  readonly kept: number;
  readonly task: number;
  readonly help: number;
  /** A gift: what it costs (copper; each gift to the same people costs this much more) and how much it raises standing, up to `giftsUpTo`. */
  readonly gift: { readonly price: number; readonly raise: number; readonly upTo: number; readonly topic: string; readonly line: string };
  readonly trespass: number;
  readonly struck: number;
  readonly killed: number;
  /** How far standing moves prices: the merchant's margin at −100 and at 100 (×, e.g. 1.3 and 0.85). */
  readonly prices: readonly [number, number];
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
  /** The kinds of dungeon, by id (plan 8, C6c): each its lore and its form. A cellar is the fallback. */
  readonly dungeons: { readonly cellar: CellarLore; readonly [kind: string]: CellarLore | undefined };
  /** Names of the peoples, by Actors' race id (human, dwarf, halfling, elf). */
  readonly names: Readonly<Record<string, NamesDef>>;
  /** The peoples as factions (plan 11.6, D34), and what changes the hero's standing with them. */
  readonly peoples: readonly PeopleDef[];
  readonly standing: StandingDef;
  readonly talk: TalkDef;
  readonly skills: readonly SkillDef[];
  readonly creatures: readonly CreatureDef[];
  readonly items: ItemCatalog;
  /** Rooms and mending (plan 11.5). */
  readonly upkeep: UpkeepDef;
  /** Sights the VGM may put by the hero's way when Discovery is overdue (C9); none: it has no such answer. */
  readonly sights?: readonly SightDef[];
  /** The situations the VGM stages (C10). */
  readonly situations?: readonly SituationDef[];
  /** Carts between towns (plan 5.4, C7); without it no cart goes. */
  readonly travel?: TravelDef;
  /** The town's shops (plan 11.5), by who keeps them. */
  readonly shops: readonly ShopDef[];
  /** Who teaches what in town (plan 11.4). */
  readonly trainers: readonly TrainerDef[];
  /** The guild houses (D49), the ranks they open and the bard who knows them; without them every skill rises freely. */
  readonly guilds?: readonly GuildDef[];
  readonly skillRanks?: readonly SkillRankDef[];
  readonly bard?: BardDef;
  readonly abilities: readonly AbilityDef[];
  /** Status effects abilities put on (plan 10). */
  readonly effects?: readonly EffectDef[];
  readonly director: DirectorDef;
  readonly hero: HeroLooksDef;
  /** The pasts a hero can choose (plan 11.4), the first the default. */
  readonly backgrounds: readonly BackgroundDef[];
  /** How the townsfolk spend their days. */
  readonly routines: RoutinesDef;
  /** What lives on the land around a town. */
  readonly wild: readonly WildDef[];
  /** Everyone the hero can meet, in groups (C6b): the dwellers below, the wild's groups and the events' bands are these. */
  readonly encounters: readonly EncounterDef[];
  /** Story events (plan 4.2, C6): what the world does on its own when the hero leaves it be. None: nothing. */
  readonly events?: readonly StoryEventDef[];
  /** Good days in the towns (C11): feasts for the hero's deeds, market days. None: no such days. */
  readonly festivities?: readonly FestivityDef[];
  /** Birds and squirrels about the land; without it the land has none. */
  readonly smallLife?: SmallLifeDef;
  /** What fills the regions the VGM opens as the hero walks; without it no regions open beyond the start. */
  readonly regions?: RegionsDef;
  /** The setting's colour key over the day; without it the engine's neutral grade. */
  readonly look?: LookDef;
}

/** The picture's colour key: grade keys at sun heights, sorted by `at` (warm dusk, blue night, ...). */
export interface LookDef {
  readonly grade: readonly GradeKey[];
}

/** Authoring errors, one line each (empty: the module is valid). */
/** The setting's ability of this id, if there is one. */
export function abilityOf(m: Pick<SettingModule, 'abilities'>, id: string | undefined): AbilityDef | undefined {
  return id === undefined ? undefined : m.abilities.find((a) => a.id === id);
}

/** A skill of the setting by id (undefined: none such). */
export function skillOf(m: Pick<SettingModule, 'skills'>, id: string | undefined): SkillDef | undefined {
  return id === undefined ? undefined : m.skills.find((s) => s.id === id);
}

/** A guild by its keeper's id (none: the setting has no such guild). */
export function guildOf(m: Pick<SettingModule, 'guilds'>, keeper: string | undefined): GuildDef | undefined {
  return keeper === undefined ? undefined : m.guilds?.find((g) => g.keeper === keeper);
}

export function validateSetting(m: SettingModule): string[] {
  const out: string[] = [];
  const where = `setting "${m.id}"`;
  if (m.contractVersion !== CONTRACT_VERSION) out.push(`${where}: contract version ${m.contractVersion}, engine speaks ${CONTRACT_VERSION}`);
  if (!/^[a-z][a-z0-9-]*$/.test(m.id)) out.push(`${where}: id must be a lowercase slug`);
  if (!Number.isInteger(m.version) || m.version < 1) out.push(`${where}: version must be a positive integer`);
  const sightIds = new Set<string>();
  for (const g of m.sights ?? []) {
    if (sightIds.has(g.id)) out.push(`${where}: sight "${g.id}" defined twice`);
    sightIds.add(g.id);
    if (!SIGHT_SHAPES.includes(g.shape)) out.push(`${where}: sight "${g.id}" shape "${g.shape}" is unknown`);
    if (!g.seen) out.push(`${where}: sight "${g.id}" has no words`);
    if (g.need === 'reward' && !m.items.treasure.some((t) => t.id === g.loot)) out.push(`${where}: sight "${g.id}" answers Reward but its loot "${g.loot}" is no treasure table`);
  }
  for (const t of m.situations ?? []) {
    if (!SITUATION_KINDS.includes(t.kind)) out.push(`${where}: situation "${t.id}" kind "${t.kind}" is unknown`);
    if (t.cry !== undefined && (!t.cry || t.cry.length > 60)) out.push(`${where}: situation "${t.id}" cry must be short (a speech bubble, at most 60 letters)`);
    if (!(t.seen > 0 && t.seen <= SEEN_MOST)) out.push(`${where}: situation "${t.id}" seen must be in 0..${SEEN_MOST} m`);
    if (t.kind === 'stray-beast' && !(t.hours && t.hours[0] < t.hours[1] && (t.every ?? 0) > 0 && (t.lasts ?? 0) > 0)) out.push(`${where}: situation "${t.id}" needs hours, every and lasts`);
    if (t.kind === 'paddock-wolves' && !(m.encounters.some((e) => e.id === t.encounter) && t.hours && t.hours[0] < t.hours[1] && (t.every ?? 0) > 0)) out.push(`${where}: situation "${t.id}" needs an encounter, hours and every`);
    if (t.kind === 'raid-smoke' && !((t.lasts ?? 0) > 0)) out.push(`${where}: situation "${t.id}" needs lasts > 0`);
    if (t.kind === 'hurt-traveller' && !(t.chance !== undefined && t.chance >= 0 && t.chance <= 1)) out.push(`${where}: situation "${t.id}" needs a chance in 0..1`);
  }
  const tr = m.travel;
  if (tr && !(tr.speed > 0 && tr.road >= 1 && tr.perKm >= 0 && tr.least >= 0 && Number.isInteger(tr.offers) && tr.offers >= 1)) out.push(`${where}: travel needs speed > 0, road >= 1, fares >= 0 and offers >= 1`);
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
  if (m.regions) {
    const fills = new Set(m.regions.fills.map((f) => f.id));
    if (fills.size !== m.regions.fills.length) out.push(`${where}: a region fill is defined twice`);
    if (!fills.has(m.regions.country)) out.push(`${where}: regions.country "${m.regions.country}" is not a fill`);
    for (const f of m.regions.fills) {
      if (!(Number.isInteger(f.level) && f.level >= 0 && f.level <= 6)) out.push(`${where}: region fill "${f.id}" level must be 0..6`);
      if (!(f.weight >= 0)) out.push(`${where}: region fill "${f.id}" weight must be >= 0`);
      if (f.place !== 'none' && !(f.radius && f.radius > 0 && f.radius * 2 + 20 < 250 * 2 ** f.level)) out.push(`${where}: region fill "${f.id}" needs a radius that fits its region`);
      for (const b of f.biomes ?? []) if (!ids.has(b)) out.push(`${where}: region fill "${f.id}" biome "${b}" is not defined`);
    }
  }
  for (const [kind, c] of Object.entries(m.dungeons) as [string, CellarLore | undefined][]) {
    if (!c) continue;
    const f = c.form, sp = f.space;
    // A kind stands under a house (its hatch) or out on the land at a distance (a shell of its own).
    if ((f.stands === 'house') !== (f.shell === 'hatch') || (f.stands !== 'house' && !(f.ring && f.ring[0] > 0 && f.ring[1] >= f.ring[0]))) out.push(`${where}: ${kind} form needs a hatch under a house, or a ring and a shell out on the land`);
    if (!(sp.radius > 2 && sp.maxRooms >= 3 && sp.depth[1] <= sp.depth[0] && sp.inset >= 0) || !DUNGEON_PROPS.includes(sp.way)) out.push(`${where}: ${kind} space needs a radius, rooms, depths (older not above) and a known way out`);
    for (const k of f.pieces ?? []) if (!m.dungeons[k]) out.push(`${where}: ${kind} borrows set pieces of unknown kind "${k}"`);
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
  out.push(...validatePeoples(m, where));
  out.push(...validateRoutines(m.routines, where));
  return out;
}

/** The peoples: one for every people with names, sensible regard, and a hold's guard that exists. */
function validatePeoples(m: SettingModule, where: string): string[] {
  const out: string[] = [];
  const ids = new Set(m.peoples.map((p) => p.id));
  if (ids.size !== m.peoples.length) out.push(`${where}: a people is defined twice`);
  for (const id of Object.keys(m.names)) if (!ids.has(id)) out.push(`${where}: people "${id}" has names but no faction`);
  for (const p of m.peoples) {
    if (!(Math.abs(p.regard) <= 100 && Math.abs(p.kin) <= 100)) out.push(`${where}: people "${p.id}" regard and kin must be in −100..100`);
    if (!p.refuse.length || !p.curt.length) out.push(`${where}: people "${p.id}" needs refuse and curt lines`);
    const h = p.hold;
    if (!h) continue;
    if (!m.creatures.some((c) => c.id === h.guard)) out.push(`${where}: hold "${h.name}" guard "${h.guard}" is unknown`);
    if (!(h.guards >= 1) || !(h.ring[0] > 0 && h.ring[0] < h.ring[1])) out.push(`${where}: hold "${h.name}" needs guards and a rising ring`);
    if (!h.warn.length || !h.last.length || !h.hail.length) out.push(`${where}: hold "${h.name}" needs warn, last and hail lines`);
    if (!h.told.includes('{hold}')) out.push(`${where}: hold "${h.name}" told must name {hold}`);
  }
  const s = m.standing;
  if (!(s.prices[0] > 1 && s.prices[1] > 0 && s.prices[1] < 1)) out.push(`${where}: standing.prices must be above 1 when hated and below 1 when honoured`);
  if (!(s.gift.price > 0 && s.gift.raise > 0)) out.push(`${where}: standing.gift needs a price and a raise`);
  if (!(s.kept > 0 && s.task > 0 && s.help > 0)) out.push(`${where}: standing.kept, task and help must raise standing`);
  return out;
}

/** Skills, creatures, items and abilities: every name points at something that exists. */
function validateFight(m: SettingModule, where: string): string[] {
  const out: string[] = [];
  const skills = new Set(m.skills.map((s) => s.id));
  if (skills.size !== m.skills.length) out.push(`${where}: a skill is defined twice`);
  for (const s of m.skills) if (!(s.start >= 0 && s.start <= 100) || !((s.danger ?? 0) >= 0)) out.push(`${where}: skill "${s.id}" needs start 0..100 and no negative danger`);
  for (const k of ['dodge', 'armour', 'shields', 'unarmed']) if (!skills.has(k)) out.push(`${where}: skill "${k}" is missing (the engine trains it)`);
  const items = new Map(m.items.items.map((i) => [i.id, i]));
  const tables = new Set(m.items.treasure.map((t) => t.id));
  for (const i of m.items.items) {
    if (i.weapon && !skills.has(i.weapon.skill)) out.push(`${where}: item "${i.id}" trains unknown skill "${i.weapon.skill}"`);
    if (i.weapon && !(i.weapon.damage[0] > 0 && i.weapon.damage[0] <= i.weapon.damage[1])) out.push(`${where}: item "${i.id}" damage must be a rising range above 0`);
    if (i.slot && !SLOTS.includes(i.slot)) out.push(`${where}: item "${i.id}" slot "${i.slot}" is unknown`);
    if ((i.kind === 'weapon' || i.kind === 'shield' || i.kind === 'armour') && !i.slot) out.push(`${where}: item "${i.id}" is worn but has no slot`);
  }
  for (const sh of m.shops) {
    for (const [id, n] of sh.goods) if (!items.has(id) || !(n > 0)) out.push(`${where}: shop "${sh.keeper}" keeps unknown item "${id}" or none of it`);
    if (!(sh.pays > 0 && sh.pays < sh.asks) || !(sh.purse > 0)) out.push(`${where}: shop "${sh.keeper}" must pay less than it asks, and hold some coin`);
    if (!(sh.restock >= 1)) out.push(`${where}: shop "${sh.keeper}" must restock every day or more`);
    if (sh.fine && !sh.goods.some(([id]) => items.get(id)?.slot)) out.push(`${where}: shop "${sh.keeper}" has fine work but no wearable goods`);
  }
  for (const t of m.trainers) {
    for (const k of t.skills) if (!skills.has(k)) out.push(`${where}: trainer "${t.keeper}" teaches unknown skill "${k}"`);
    if (!(t.price > 0 && t.hours > 0 && t.upTo > 0 && t.upTo <= 100)) out.push(`${where}: trainer "${t.keeper}" needs a price, hours and upTo 1..100`);
  }
  for (const g of m.guilds ?? []) {
    for (const k of g.skills) if (!skills.has(k)) out.push(`${where}: guild "${g.keeper}" teaches unknown skill "${k}"`);
    if (g.hidden && !g.way) out.push(`${where}: hidden guild "${g.keeper}" needs a way in`);
    if (!m.skillRanks?.length) out.push(`${where}: guilds need skillRanks`);
    for (const id of g.abilities ?? []) if (!m.abilities.some((a) => a.id === id && a.taught)) out.push(`${where}: guild "${g.keeper}" teaches unknown or untaught ability "${id}"`);
    if ((g.abilities?.length || g.teachesSpell) && !(g.spellPrice! > 0)) out.push(`${where}: guild "${g.keeper}" teaches abilities but has no spellPrice`);
    const q = g.quest;
    if (q) {
      if (!m.abilities.some((a) => a.id === q.reward && a.taught)) out.push(`${where}: guild "${g.keeper}" quest rewards unknown or untaught ability "${q.reward}"`);
      if (m.guilds!.some((o) => o.abilities?.includes(q.reward))) out.push(`${where}: quest reward "${q.reward}" is sold by a guild too`);
      if (!q.kinds.length || q.kinds.some((k) => !m.dungeons[k]?.form.purposes.includes('lead'))) out.push(`${where}: guild "${g.keeper}" quest asks for a place no lead kind is`);
    }
  }
  if (m.skillRanks?.some((r, i, a) => i > 0 && r.upTo <= a[i - 1].upTo)) out.push(`${where}: skill ranks must rise`);
  if (new Set(m.shops.map((s) => s.keeper)).size !== m.shops.length) out.push(`${where}: a shop keeper is defined twice`);
  for (const it of m.items.items) if (it.teaches && !m.abilities.some((a) => a.id === it.teaches && a.taught)) out.push(`${where}: item "${it.id}" teaches unknown or untaught ability "${it.teaches}"`);
  for (const u of m.items.uniques) {
    if (!items.has(u.base)) out.push(`${where}: unique "${u.id}" base "${u.base}" is unknown`);
    for (const k of Object.keys(u.bonuses)) if (!skills.has(k)) out.push(`${where}: unique "${u.id}" raises unknown skill "${k}"`);
    if (u.grants && !m.abilities.some((a) => a.id === u.grants && a.item)) out.push(`${where}: unique "${u.id}" grants unknown or not item-only ability "${u.grants}"`);
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
  const encounter = (id: string) => m.encounters.find((e) => e.id === id);
  for (const e of m.encounters) {
    for (const c of e.creatures) if (!ids.has(c)) out.push(`${where}: encounter "${e.id}" creature "${c}" is unknown`);
    if (!e.creatures.length || e.count[0] < 1 || e.count[1] < e.count[0] || !e.where.length) out.push(`${where}: encounter "${e.id}" needs creatures, a count and where it is met`);
  }
  for (const [kind, lore] of Object.entries(m.dungeons)) for (const d of lore?.dwellers ?? []) {
    const e = encounter(d.encounter);
    if (!e || !e.where.includes('below')) out.push(`${where}: ${kind} dweller "${d.id}" needs an encounter met below ("${d.encounter}")`);
    else if (e.creatures.join() !== d.creatures.join()) out.push(`${where}: ${kind} dweller "${d.id}" creatures are not its encounter's`);
  }
  for (const b of m.smallLife?.birds ?? []) {
    if (b.size <= 0 || !b.colours.length || b.count[0] < 1 || b.count[1] < b.count[0] || b.beat <= 0) out.push(`${where}: bird "${b.id}" needs a size, colours, a count and a beat`);
  }
  for (const e of m.events ?? []) {
    if (!(e.after >= 0) || !(e.cooldown >= 0) || e.count[0] < 1 || e.count[1] < e.count[0]) out.push(`${where}: event "${e.id}" needs after, cooldown and a count`);
    if ((e.kind === 'raid' || e.kind === 'take') && !m.wild.some((w) => w.id === e.by)) out.push(`${where}: ${e.kind} "${e.id}" needs its raiders (a wild group's id in by)`);
    if (e.kind === 'take' && (!e.takes || !(e.reach! > 0))) out.push(`${where}: take "${e.id}" needs the settlement it takes and a reach`);
    if (e.lair && !Object.values(m.dungeons).some((l) => l?.form.purposes.includes(e.lair!))) out.push(`${where}: event "${e.id}" asks for a ${e.lair}, which no dungeon kind is for`);
    if (e.fades !== undefined && (!(e.fades > 0) || !e.words.faded)) out.push(`${where}: event "${e.id}" fades: it needs the hours and how it is told (words.faded)`);
  }
  for (const f of m.festivities ?? []) {
    if (!(f.hours[1] > f.hours[0]) || (f.kind === 'market' && !(f.every! >= 1))) out.push(`${where}: festivity "${f.id}" needs its hours (and a market its days between)`);
  }
  for (const w of m.wild) {
    if (!encounter(w.encounter)?.where.includes(w.habitat)) out.push(`${where}: wild "${w.id}" needs an encounter met in its habitat ("${w.encounter}", ${w.habitat})`);
    if (w.ring[1] < w.ring[0] || w.range <= 0) out.push(`${where}: wild "${w.id}" needs a ring and a range`);
  }
  if (!m.abilities.length) out.push(`${where}: no abilities`);
  out.push(...validateAbilities(m, skills, where));
  return out;
}

/** Abilities: known skills and effects, sane numbers, and every step of every recipe well formed. */
function validateAbilities(m: SettingModule, skills: ReadonlySet<string>, where: string): string[] {
  const out: string[] = [];
  const effects = new Set((m.effects ?? []).map((e) => e.id));
  if (effects.size !== (m.effects ?? []).length) out.push(`${where}: an effect is defined twice`);
  const ids = new Set<string>();
  for (const a of m.abilities) {
    const at = `${where}: ability "${a.id}"`;
    if (ids.has(a.id)) out.push(`${at} defined twice`);
    ids.add(a.id);
    if (a.skill && !skills.has(a.skill)) out.push(`${at} trains unknown skill "${a.skill}"`);
    if (a.item && a.taught) out.push(`${at} is item-only and cannot be taught too`);
    if (a.level !== undefined && (!a.skill || !(a.level >= 0 && a.level <= 100))) out.push(`${at} needs a skill for its level, and a level 0..100`);
    if (!(a.cooldown >= 0) || !((a.cast ?? 0) >= 0) || Object.values(a.cost ?? {}).some((v) => !(v >= 0))) out.push(`${at} needs cooldown, cast and costs of 0 or more`);
    if (!a.ops.length) out.push(`${at} has no steps`);
    const check = (ops: readonly AbilityOp[], depth: number): void => {
      if (depth > 4) { out.push(`${at} nests its steps too deep`); return; }
      for (const o of ops) {
        const eff = 'effect' in o ? o.effect : undefined;
        if (eff && (!effects.has(eff.id) || !(eff.duration > 0))) out.push(`${at} puts on unknown effect "${eff.id}" or for no time`);
        if ('kind' in o && o.kind && !DAMAGE_KINDS.includes(o.kind)) out.push(`${at} deals unknown damage "${o.kind}"`);
        if (o.op === 'projectile' && !(o.speed > 0)) out.push(`${at}: a projectile needs speed`);
        if ((o.op === 'area' || o.op === 'zone' || o.op === 'terrain') && !(o.radius > 0)) out.push(`${at}: ${o.op} needs a radius`);
        if (o.op === 'zone' && !(o.tick > 0 && o.duration >= o.tick)) out.push(`${at}: a zone needs a tick within its duration`);
        if (o.op === 'shape' && !(o.change > 0 && o.back > 0)) out.push(`${at}: a change of shape needs its times`);
        if (o.op === 'delay' && !(o.t > 0)) out.push(`${at}: a delay needs time`);
        if (o.op === 'blow' && ops !== a.ops) out.push(`${at}: a blow belongs at the top of a recipe`);
        if ('onHit' in o && o.onHit) check(o.onHit, depth + 1);
        if ('ops' in o) check(o.ops, depth + 1);
      }
    };
    check(a.ops, 0);
  }
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

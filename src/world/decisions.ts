/**
 * The decision log (plan 5.1): the world is the seed plus the VGM's decisions. A decision is plain data
 * (saved, replayed, later shared in multiplayer); the generators turn it into land, towns and people.
 */
import type { SettlementSize } from '@futuremagic/settlement';
import type { RegionFillDef } from '../setting/contract';
import type { TownOrder } from '../sim/townLife';
import type { ArchSite } from './volumes';

/** A town stands here (plan 7): its market's middle and its outline's typical radius. */
export interface TownDecision {
  readonly kind: 'town';
  /** Stable id within the log (people, facts and later events refer to it). */
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Typical outline radius, metres. */
  readonly radius: number;
  /** How big (default: a small town, as the start's). */
  readonly size?: SettlementSize;
  /** Its own seed (default: the world's, as the start town's). */
  readonly seed?: number;
  /** A harbour town's shore (S2): a point on it near the town and the way out to sea (AssetGenerator HarbourSite). */
  readonly harbour?: HarbourAt;
  /** It stands on an island out at sea (S7: an island's fishing village). */
  readonly isle?: true;
}

/** A point on the shore and the way out to sea from it (a unit vector). */
export interface HarbourAt { readonly x: number; readonly z: number; readonly dx: number; readonly dz: number }

/** A rock volume stands here (plan 5.6): milestone 1's arch. */
export interface VolumeDecision {
  readonly kind: 'volume';
  readonly id: string;
  readonly site: ArchSite;
}

/**
 * A dungeon promised under a building of a town (plan 4.2, 8): the seed and the set piece fix what it
 * is; it is sketched, outlined and built from this as the player comes closer (world/dungeon).
 */
/** A kind of dungeon: a key of the setting's `dungeons` (classic: cellar, barrow, cave, tower). */
export type DungeonTemplate = string;

export interface DungeonDecision {
  readonly kind: 'dungeon';
  readonly id: string;
  /** A cellar under a house of the town; a barrow, a cave or a ruined tower out on the land near it (plan 8: dungeon kinds). */
  readonly template: DungeonTemplate;
  /** The town's decision id. */
  readonly town: string;
  /** Index into the town plan's buildings: the house above (a cellar), the household who knows of it (a barrow). */
  readonly building: number;
  /** The doorway of a place out on the land (a barrow's passage, a cave's mouth, a tower's door): world metres, and the way it faces (yaw: 0 faces −z, as the walker). */
  readonly site?: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly seed: number;
  /** The signature set piece (world/dungeon/setPieces.ts). */
  readonly setPiece: string;
  /**
   * The most danger the place may hold (D29): fixed when it is promised, from how far it lies from the
   * start; who moves in is chosen to fit. None: anything.
   */
  readonly danger?: number;
  /** When it was promised, game hours since the world began (none: when the world was opened). */
  readonly at?: number;
  /** Who lives there, when the one who asked for it said (an encounter's id, `dungeonFor`); else the lore picks. */
  readonly dwellers?: string;
  /** The story event whose band lies up here (a take's lair), if any. */
  readonly event?: string;
  /** The guild whose master asked for it, as their one deed (C14: a keeper's id); its household is the master's. */
  readonly quest?: string;
}

/**
 * A promise kept (plan 4.2): its goal was reached (the dwellers are gone and the household paid). The
 * promise is a dungeon decision's id or a move-in's.
 */
export interface KeptDecision {
  readonly kind: 'kept';
  readonly id: string;
  readonly promise: string;
  /** Game hours since the world began. */
  readonly at: number;
  /** It ended without the hero (C11: a story event left alone ran its course; the VGM's 'fade' tool). */
  readonly faded?: true;
}

/**
 * A story event (plan 8.1, D10: repopulation): new dwellers move into a dungeon that was cleared. The
 * layout stays; who lives there, what they left and what the household above has noticed change. It is a
 * promise of its own (the household wants it cleared again).
 */
export interface MoveInDecision {
  readonly kind: 'move-in';
  readonly id: string;
  /** The dungeon decision's id. */
  readonly dungeon: string;
  /** The dweller (id in the setting's lore) who moves in. */
  readonly dweller: string;
  readonly seed: number;
  /** Game hours since the world began. */
  readonly at: number;
}

/**
 * A place taken by others while it stands (plan 8, D10, C6c): goblins drive out the kobolds, bandits make it
 * their hideout. The layout stays; who lives there and the top of its story change. Not a promise of its own
 * (an open place's lead stays the lead); a cleared place moved into is a move-in.
 */
export interface RetakeDecision {
  readonly kind: 'retake';
  readonly id: string;
  /** The dungeon decision's id. */
  readonly dungeon: string;
  /** The dweller (id in the setting's lore) who takes it. */
  readonly dweller: string;
  readonly seed: number;
  /** Game hours since the world began. */
  readonly at: number;
}

/**
 * The VGM steers a town's people (plan 9.3): a festival, a gathering, a curfew. They live their own
 * lives otherwise; the order only says what everyone awake does for its while.
 */
export interface OrderDecision {
  readonly kind: 'order';
  readonly id: string;
  /** The town's decision id. */
  readonly town: string;
  readonly order: TownOrder;
}

/**
 * A people's own place (plan 11.6, D34): the gate of a hold cut into a hillside, with a level court before
 * it. The ground is shaped for it (world/hold.ts): the court levelled at `level`, a rock face rising behind
 * the gate. Its doorway's middle, and the way it faces (yaw as a barrow's: facing the gate is facing yaw).
 */
export interface HoldDecision {
  readonly kind: 'hold';
  readonly id: string;
  /** The people's id (an Actors race id). */
  readonly people: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** The court's height above the sea, metres. */
  readonly level: number;
}

/**
 * A region opened (plan 5.2, 5.5, D16): the VGM opened the aligned square `(level, x, z)` of side
 * 250 m × 2^level ahead of the hero and filled it from the setting (`fill`: a fill id of the setting's
 * regions, such as a hamlet, a camp, ruins or a barrow field). Where smaller regions inside the square were
 * open already, the free rest opens as plain country (RegionMap.open); replaying the log rebuilds it so.
 */
export interface RegionDecision {
  readonly kind: 'region';
  readonly id: string;
  readonly level: number;
  readonly x: number;
  readonly z: number;
  readonly fill: string;
  readonly seed: number;
  /** What the fill placed: its middle (world metres), the way it faces (yaw) and its footprint's radius (m). */
  readonly site?: { readonly x: number; readonly z: number; readonly yaw: number; readonly r: number; readonly harbour?: HarbourAt };
  /** Game hours since the world began. */
  readonly at: number;
}

/** A path (people on foot), a cart track (to hamlets and farms) or a road (between towns): plan 7. */
export type RoadWay = 'path' | 'track' | 'road';

/**
 * A road links a place to the network (plan 7): its centre line, routed over the land when it was
 * decided (vgm/roads.ts), with the height it runs at (its profile; the ground is cut and filled to it).
 * The route is kept, not routed again, so the road never moves once seen.
 */
export interface RoadDecision {
  readonly kind: 'road';
  readonly id: string;
  readonly way: RoadWay;
  /** What it links: the place it was made for, and the place or road it joins. */
  readonly from: string;
  readonly to: string;
  /** Centre line x, y, z per point (about 6 m apart), from `from` to `to`. */
  readonly pts: readonly number[];
  /** When it was decided, game hours since the world began (none: when the world was opened). */
  readonly at?: number;
}

/** A region place that is a settlement, planned as a town of its size (a waystation, a hamlet, a village, the capital). */
export const settles = (place: RegionFillDef['place']): place is 'waystation' | 'hamlet' | 'village' | 'capital' => place === 'waystation' || place === 'hamlet' || place === 'village' || place === 'capital';

/**
 * The settlement a region's place is (plan B3: hamlets and villages are planned like towns, by the one
 * planner), or null for other places. `fills`: the setting's region fills.
 */
export function settlementOf(d: RegionDecision, fills: readonly RegionFillDef[]): TownDecision | null {
  const f = d.site ? fills.find((x) => x.id === d.fill) : undefined;
  if (!f || !d.site || !settles(f.place)) return null;
  return { kind: 'town', id: d.id, x: d.site.x, z: d.site.z, radius: d.site.r, size: f.place, seed: d.seed, ...(d.site.harbour ? { harbour: d.site.harbour } : {}), ...(f.island ? { isle: true as const } : {}) };
}

/**
 * A teacher's own place out on the land (plan 10, C3, D49): a guild whose master keeps a half-ruined tower
 * past a town's fields (`near: 'out'`). Chosen when the world opens; the master stands watch at its door.
 */
export interface RetreatDecision {
  readonly kind: 'retreat';
  readonly id: string;
  /** The guild's keeper id. */
  readonly keeper: string;
  /** The town whose people the master counts among. */
  readonly town: string;
  readonly x: number;
  readonly z: number;
  /** Its door faces the town (the walker's yaw). */
  readonly yaw: number;
}

/**
 * A story event (plan 4.2, C6): the world moved on its own. `spill`: dwellers of the place `from` (a promise
 * left open too long) came out and roam the land round (x, z), `r` metres; they are a lead of their own until
 * they are dead (a `kept` decision with this id).
 */
export interface EventDecision {
  readonly kind: 'event';
  readonly id: string;
  /** The setting's event id. */
  readonly event: string;
  /** The town whose people it concerns. */
  readonly town: string;
  /** What it grew from: a spill's promise (a dungeon's or a move-in's id), a raid's raiders (their territory id). */
  readonly from: string;
  /** A take's: the settlement the band holds (a town's id); its folk have fled. */
  readonly held?: string;
  /** A raid's: the paddock (its id in the town's plan) and how many animals were driven off. */
  readonly paddock?: number;
  readonly taken?: number;
  readonly x: number;
  readonly z: number;
  readonly r: number;
  /** Who is out on the land: the setting's encounter, and its members (creature ids). */
  readonly encounter?: string;
  readonly members: readonly string[];
  readonly seed: number;
  /** Game hours since the world began. */
  readonly at: number;
}

/** A group of the wild round a town (C6b, vgm/wild.ts): an encounter living on its territory. */
export interface WildDecision {
  readonly kind: 'wild';
  /** Also the territory's id (saves name the dead by it). */
  readonly id: string;
  readonly town: string;
  /** The setting's wild group it is one of. */
  readonly group: string;
  /** Who they are (the setting's encounter), and its members (creature ids, the leader first). */
  readonly encounter: string;
  readonly members: readonly string[];
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly seed: number;
  /** Game hours since the world began. */
  readonly at: number;
  /** A situation it is (C10: the setting's, wolves at a paddock at dusk); none: a group of the wild. */
  readonly situation?: string;
}

/**
 * The hero takes the cart from one town to another (plan 4.4, 5.4, C7): a journey is a promise too, so the
 * VGM knows where the hero will be before they get there. Town ids; game hours.
 */
export interface JourneyDecision {
  readonly kind: 'journey';
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Copper paid. */
  readonly fare: number;
  readonly at: number;
  readonly arrive: number;
  /** By sea (S4): passage aboard a ship between harbour towns, along its way over the water (x, z, ...). */
  readonly by?: 'sea';
  readonly route?: readonly number[];
}

/**
 * A sight by the hero's way (plan 4.1, C9): the VGM's answer to an overdue Discovery. It stands at (x, z),
 * facing `yaw`, from game hour `at` on.
 */
export interface SightDecision {
  readonly kind: 'sight';
  readonly id: string;
  /** The setting's sight. */
  readonly sight: string;
  /** The need it answers, if not Discovery (a find by the way answers Reward). */
  readonly need?: 'reward';
  /** It lies on the sea bed (a wreck, S8: `vgm/wrecks.ts`), its yaw the way her bow points. */
  readonly sea?: true;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly seed: number;
  readonly at: number;
}

/**
 * People's answer (C9): a town's traveller (the one who comes and goes, lodging at its inn) met by the
 * hero's way, resting there facing the way the hero comes from, from game hour `at` until `until`; then on
 * their way again.
 */
export interface TravellerDecision {
  readonly kind: 'traveller';
  readonly id: string;
  /** The town whose traveller it is. */
  readonly town: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly seed: number;
  readonly at: number;
  readonly until: number;
  /** A situation it is (C10: the setting's, a hurt traveller); none: one resting. */
  readonly situation?: string;
}

/**
 * A situation (C10): one of a town's beasts got out of its paddock (`paddock`, its id in the town's plan) and
 * wanders to (x, z); someone of its farm goes after it. From game hour `at` until `until` at most.
 */
export interface StrayDecision {
  readonly kind: 'stray';
  readonly id: string;
  readonly town: string;
  readonly paddock: number;
  readonly x: number;
  readonly z: number;
  readonly seed: number;
  readonly at: number;
  readonly until: number;
  /** The setting's situation. */
  readonly situation: string;
}

/**
 * A good day in a town (C11): a feast for a deed of the hero's (`for`: the promise they kept), or a market
 * day. Its people gather at the market from game hour `from` to `to`; logged at `at`.
 */
export interface FestivityDecision {
  readonly kind: 'festivity';
  readonly id: string;
  /** The setting's festivity. */
  readonly festivity: string;
  readonly town: string;
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly for?: string;
}

export type Decision = FestivityDecision | StrayDecision | TravellerDecision | SightDecision | JourneyDecision | RetakeDecision | WildDecision | EventDecision | TownDecision | VolumeDecision | DungeonDecision | OrderDecision | KeptDecision | MoveInDecision | RoadDecision | RegionDecision | HoldDecision | RetreatDecision;

export type DecisionLog = readonly Decision[];

/** How far other places keep from a people's hold, metres. */
const HOLD_KEEP = 90;
/** How far other places keep from a teacher's tower, metres. */
const RETREAT_KEEP = 40;

/**
 * Ground the log has put something on out on the land: barrows (`dungeonR` metres round each), the places
 * in opened regions (their own footprint), the peoples' holds and the teachers' towers. New places keep away from it.
 */
export function sitesIn(log: DecisionLog, dungeonR: number): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const d of log) {
    if (d.kind === 'dungeon' && d.site) out.push({ x: d.site.x, z: d.site.z, r: dungeonR });
    else if (d.kind === 'region' && d.site) out.push({ x: d.site.x, z: d.site.z, r: d.site.r });
    else if (d.kind === 'hold') out.push({ x: d.x, z: d.z, r: HOLD_KEEP });
    else if (d.kind === 'retreat') out.push({ x: d.x, z: d.z, r: RETREAT_KEEP });
  }
  return out;
}

/** The dungeon a promise is about: a dungeon decision itself, or the one a move-in moved into (else null). */
export function dungeonOf(log: DecisionLog, d: Decision | undefined): DungeonDecision | null {
  if (d?.kind === 'dungeon') return d;
  if (d?.kind !== 'move-in') return null;
  return log.find((x): x is DungeonDecision => x.kind === 'dungeon' && x.id === d.dungeon) ?? null;
}

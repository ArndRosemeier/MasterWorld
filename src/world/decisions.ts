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
}

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
export type DungeonTemplate = 'cellar' | 'barrow' | 'cave' | 'tower';

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
  readonly site?: { readonly x: number; readonly z: number; readonly yaw: number; readonly r: number };
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

/**
 * The settlement a region's place is (plan B3: hamlets and villages are planned like towns, by the one
 * planner), or null for other places. `fills`: the setting's region fills.
 */
export function settlementOf(d: RegionDecision, fills: readonly RegionFillDef[]): TownDecision | null {
  const f = d.site ? fills.find((x) => x.id === d.fill) : undefined;
  if (!f || !d.site || (f.place !== 'hamlet' && f.place !== 'village')) return null;
  return { kind: 'town', id: d.id, x: d.site.x, z: d.site.z, radius: d.site.r, size: f.place, seed: d.seed };
}

export type Decision = TownDecision | VolumeDecision | DungeonDecision | OrderDecision | KeptDecision | MoveInDecision | RoadDecision | RegionDecision | HoldDecision;

export type DecisionLog = readonly Decision[];

/** How far other places keep from a people's hold, metres. */
const HOLD_KEEP = 90;

/**
 * Ground the log has put something on out on the land: barrows (`dungeonR` metres round each), the places
 * in opened regions (their own footprint) and the peoples' holds. New places keep away from it.
 */
export function sitesIn(log: DecisionLog, dungeonR: number): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const d of log) {
    if (d.kind === 'dungeon' && d.site) out.push({ x: d.site.x, z: d.site.z, r: dungeonR });
    else if (d.kind === 'region' && d.site) out.push({ x: d.site.x, z: d.site.z, r: d.site.r });
    else if (d.kind === 'hold') out.push({ x: d.x, z: d.z, r: HOLD_KEEP });
  }
  return out;
}

/** The dungeon a promise is about: a dungeon decision itself, or the one a move-in moved into (else null). */
export function dungeonOf(log: DecisionLog, d: Decision | undefined): DungeonDecision | null {
  if (d?.kind === 'dungeon') return d;
  if (d?.kind !== 'move-in') return null;
  return log.find((x): x is DungeonDecision => x.kind === 'dungeon' && x.id === d.dungeon) ?? null;
}

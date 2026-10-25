/**
 * The decision log (plan 5.1): the world is the seed plus the VGM's decisions. A decision is plain data
 * (saved, replayed, later shared in multiplayer); the generators turn it into land, towns and people.
 */
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
export interface DungeonDecision {
  readonly kind: 'dungeon';
  readonly id: string;
  readonly template: 'cellar';
  /** The town's decision id. */
  readonly town: string;
  /** Index into the town plan's buildings: the house above. */
  readonly building: number;
  readonly seed: number;
  /** The signature set piece (world/dungeon/setPieces.ts). */
  readonly setPiece: string;
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

export type Decision = TownDecision | VolumeDecision | DungeonDecision | OrderDecision;

export type DecisionLog = readonly Decision[];

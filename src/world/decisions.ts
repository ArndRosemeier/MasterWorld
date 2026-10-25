/**
 * The decision log (plan 5.1): the world is the seed plus the VGM's decisions. A decision is plain data
 * (saved, replayed, later shared in multiplayer); the generators turn it into land, towns and people.
 */
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

export type Decision = TownDecision | VolumeDecision;

export type DecisionLog = readonly Decision[];

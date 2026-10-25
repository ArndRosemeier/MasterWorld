/**
 * What a saved game holds (plan 17, 5.1): the world is its seed and the decision log, so a save is small:
 * the game and setting versions, the seed, the log, the clock, the hero, what changed in the places the
 * hero went (per-site diffs: doors opened, keys taken, notes read), what the townsfolk learned and the
 * journal. Loading builds the world from the seed again and lays the save over it.
 */
import type { TownTalkSave } from '../talk/townTalk';
import { clock } from './dom';
import type { Lead } from '../talk/journal';
import type { DecisionLog } from '../world/decisions';

/** Bump when the shape below changes; `upgrade` brings older saves along. */
export const SAVE_VERSION = 1;

export interface CellarDiff {
  readonly open: readonly number[];
  readonly keys: readonly number[];
  /** Clues read (indices into the cellar's clues). */
  readonly read: readonly number[];
}

export interface SaveData {
  readonly version: number;
  /** The game's release ("0.014"). */
  readonly game: string;
  readonly setting: { readonly id: string; readonly version: number };
  readonly seed: string;
  readonly log: DecisionLog;
  readonly clock: { readonly day: number; readonly hour: number };
  readonly hero: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly below: boolean };
  /** By dungeon decision id. */
  readonly cellars: Readonly<Record<string, CellarDiff>>;
  readonly talk: TownTalkSave | null;
  readonly journal: readonly Lead[];
}

/** A save read back (from a slot or a file), checked; a reason if it cannot be loaded here. */
export function checkSave(raw: unknown, setting: { id: string; version: number }): SaveData | string {
  const s = upgrade(raw);
  if (typeof s === 'string') return s;
  if (s.setting.id !== setting.id) return `this save is for the setting "${s.setting.id}"`;
  if (s.setting.version > setting.version) return 'this save is from a newer version of the setting';
  return s;
}

function upgrade(raw: unknown): SaveData | string {
  if (!raw || typeof raw !== 'object') return 'not a MasterWorld save';
  const s = raw as Partial<SaveData>;
  if (typeof s.version !== 'number' || typeof s.seed !== 'string' || !Array.isArray(s.log) || !s.hero || !s.clock || !s.setting) return 'not a MasterWorld save';
  if (s.version > SAVE_VERSION) return 'this save is from a newer version of the game';
  // Version 1 is the first: nothing to bring along yet.
  return s as SaveData;
}

/** A save's one-line description for the slot list. */
export function saveLabel(s: SaveData, where: string): string {
  return `Day ${s.clock.day + 1}, ${clock(s.clock.hour)}, ${where}`;
}

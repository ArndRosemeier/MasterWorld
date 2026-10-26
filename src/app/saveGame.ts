/**
 * What a saved game holds (plan 17, 5.1): the world is its seed and the decision log, so a save is small:
 * the game and setting versions, the seed, the log, the clock, the hero, what changed in the places the
 * hero went (per-site diffs: doors opened, keys taken, notes read), what the townsfolk learned and the
 * journal. Loading builds the world from the seed again and lays the save over it.
 */
import type { CharacterPatch } from '@actors/generator';
import type { CharacterSave } from '../game/character';
import { remainsLead, type GameMode, type Remains } from '../game/death';
import type { DelveSave } from '../game/delve';
import type { StandingSave } from '../game/standing';
import type { MarketSave } from '../game/trade';
import type { DirectorSave } from '../vgm/director';
import type { TownTalkSave } from '../talk/townTalk';
import { clock } from './dom';
import type { Lead } from '../talk/journal';
import type { DecisionLog } from '../world/decisions';

/** Bump when the shape below changes; `upgrade` brings older saves along. */
export const SAVE_VERSION = 4;

/** The one slot a roguelike game writes (plan 11.1): it is never saved into or loaded by hand. */
export const ROGUE_SLOT = 'roguelike';

export interface CellarDiff {
  readonly open: readonly number[];
  readonly keys: readonly number[];
  /** Clues read (indices into the cellar's clues). */
  readonly read: readonly number[];
  /** Who fell, who was spared, what was searched (version 2). */
  readonly delve?: DelveSave;
  /** The household paid for it made safe. */
  readonly paid?: boolean;
}

export interface SaveData {
  readonly version: number;
  /** The game's release ("0.014"). */
  readonly game: string;
  readonly setting: { readonly id: string; readonly version: number };
  readonly seed: string;
  readonly log: DecisionLog;
  readonly clock: { readonly day: number; readonly hour: number };
  /** `cellar`: the dungeon the hero is down in (none in older saves: the first). */
  readonly hero: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly below: boolean; readonly cellar?: string };
  /** By promise id: a dungeon decision's (its rooms, and its first dwellers), a move-in's (those dwellers). */
  readonly cellars: Readonly<Record<string, CellarDiff>>;
  /** The wild's groups met, by territory id: who died, was spared, was searched (none in older saves). */
  readonly wild?: Readonly<Record<string, DelveSave>>;
  readonly talk: TownTalkSave | null;
  readonly journal: readonly Lead[];
  /** The hero's skills, health, gear and purse (version 2; none: a fresh hero). */
  readonly character: CharacterSave | null;
  /** The Director's needs and tension (version 2). */
  readonly director: DirectorSave | null;
  /** The town's merchants: their stock and coin (none in older saves: fresh shelves). */
  readonly market?: MarketSave;
  /** The hero's name and look as made in the character creator (Actors' character config; version 3; none: a new hero drawn from the seed). */
  readonly looks: { readonly name: string; readonly look: CharacterPatch } | null;
  /** Classic or roguelike (version 4; older saves are classic). */
  readonly mode: GameMode;
  /** What fallen heroes left where they fell: packs, and roguelike graves (version 4). */
  readonly remains: readonly Remains[];
  /** The hero's standing with each people (plan 11.6; none in older saves: as a stranger, kin a little better). */
  readonly standing?: StandingSave;
  /** A people's hold: who of its wardens fell, was searched (none: all at their posts). */
  readonly hold?: DelveSave;
  /** A roguelike hero fell: the world goes on and the next start makes a new hero in it. */
  readonly heir?: boolean;
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
  // Version 1 had no hero sheet and no Director: a fresh hero, fresh needs.
  // Version 2 had no look: the hero gets one drawn from the seed.
  // Version 3 had no modes: classic, nothing left behind anywhere.
  const v4 = { mode: 'classic' as const, remains: [] };
  if (s.version < 2) return { ...(s as SaveData), version: SAVE_VERSION, character: null, director: null, looks: null, ...v4 };
  if (s.version < 3) return { ...(s as SaveData), version: SAVE_VERSION, looks: null, ...v4 };
  if (s.version < 4) return { ...(s as SaveData), version: SAVE_VERSION, ...v4 };
  return s as SaveData;
}

/** The journal's lead to remains (its id is the remains' id; the map marks it). */
export function remainsEntry(r: Remains): Lead {
  const l = remainsLead(r);
  return { id: r.id, title: l.title, notes: [{ text: l.text, from: l.from }], mark: { x: r.at.mark.x, z: r.at.mark.z, label: l.label }, done: false };
}

/**
 * A roguelike hero fell (plan 11.1): the save the next start begins from. The world stays as it is (the
 * ledger, the places, what the townsfolk know, the clock); the hero goes, and their grave stays where they
 * fell. The next hero starts at `start` knowing only one thing: where the last one fell.
 */
export function heirSave(s: SaveData, grave: Remains, start: SaveData['hero']): SaveData {
  return {
    ...s, mode: 'roguelike', heir: true, hero: start, character: null, looks: null,
    remains: [...s.remains, grave], journal: [remainsEntry(grave)],
  };
}

/** A save's one-line description for the slot list. */
export function saveLabel(s: SaveData, where: string): string {
  return `Day ${s.clock.day + 1}, ${clock(s.clock.hour)}, ${where}`;
}

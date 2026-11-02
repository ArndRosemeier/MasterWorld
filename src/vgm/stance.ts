/**
 * What a group of foes knows of the hero (D64, phase R, docs/design/vgm.md): the VGM reads the log when it wakes or places a group and
 * decides whether the group attacks the hero at once, and why. Two reasons are the VGM's (the rest is the den's and the standing's, game/standing.ts):
 *
 * - `hired`: the hero was hired against this very group. A household that has the hero keep watch for a named band (the `watch` ask)
 *   has told the world, and the band knows who waits at the door.
 * - `kin`: the hero lately cleared a place of the group's own kind in the same town (a kept promise within `KIN_HOURS`): word got round.
 *
 * The app only applies the answer (`Den.knows`); the den says the reason aloud (a bubble, game/foeSpeech.ts). Pure.
 */
import type { SettingModule } from '../setting/contract';
import { leadOf } from '../sim/factions';
import { dungeonOf, type DecisionLog, type DungeonDecision } from '../world/decisions';
import { sketchCellar } from '../world/dungeon/cellar';
import type { Town } from '../world/town';
import { loreOf, placeOf } from './dungeons';

/** Why a group attacks the hero at once, if the VGM knows a reason. */
export type Known = 'hired' | 'kin';

/** How long (game hours) word of a place cleared stays with the town's kind of foe. */
export const KIN_HOURS = 72;

/** The group: its id (a dungeon's, or a wild group's or an event band's territory id), who is in it (creature ids) and which town it lies by. */
export interface GroupFacts {
  readonly id: string;
  readonly members: readonly string[];
  readonly town?: string;
}

export interface StanceContext {
  readonly setting: Pick<SettingModule, 'creatures' | 'dungeons'>;
  readonly log: DecisionLog;
  readonly towns: readonly Town[];
  /** Game hours. */
  readonly hours: number;
  readonly group: GroupFacts;
}

/** The faction of a group (its first member's). */
const factionOf = (setting: Pick<SettingModule, 'creatures'>, members: readonly string[]): string | null => leadOf(setting, members)?.faction ?? null;

/** Is the hero's watch against this group still on (the promise that named it is open)? */
function hired(c: StanceContext): boolean {
  const kept = new Set(c.log.flatMap((d) => (d.kind === 'kept' ? [d.promise] : [])));
  const watching = (id: string | undefined): boolean => !!id && !kept.has(id);
  for (const d of c.log) {
    // A band that came out in the night on a watch (WildDecision.watch), or the place the watch is for.
    if (d.kind === 'wild' && d.id === c.group.id && watching(d.watch)) return true;
    if (d.kind === 'dungeon' && d.id === c.group.id && d.ask?.verb === 'watch' && watching(d.id)) return true;
  }
  return false;
}

/** The faction of the dwellers of place `d` (as its story goes), if the setting says. */
function dwellersFaction(c: StanceContext, d: DungeonDecision): string | null {
  const place = placeOf(d, c.towns, c.setting.dungeons);
  if (!place) return null;
  return factionOf(c.setting, sketchCellar(d, place, loreOf(c.setting, d.template)).dweller.creatures);
}

/** Did the hero lately clear a place of this group's kind in its town? */
function kin(c: StanceContext): boolean {
  const mine = factionOf(c.setting, c.group.members);
  if (!mine) return false;
  for (const k of c.log) {
    if (k.kind !== 'kept' || k.failed || k.faded || c.hours - k.at > KIN_HOURS) continue;
    const d = dungeonOf(c.log, c.log.find((x) => x.id === k.promise));
    if (!d || d.id === c.group.id || (c.group.town && d.town !== c.group.town) || d.ask?.verb === 'parley') continue;
    if (dwellersFaction(c, d) === mine) return true;
  }
  return false;
}

/** The VGM's answer for a group woken or placed now: why it attacks the hero at once, or null (the den and the standing decide). */
export function stanceFor(c: StanceContext): Known | null {
  if (hired(c)) return 'hired';
  if (kin(c)) return 'kin';
  return null;
}

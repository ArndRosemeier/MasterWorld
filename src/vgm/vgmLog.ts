/**
 * The VGM's log (D53, C8): the VGM stays out of sight in play, and this is where it can be seen. Every
 * decision in the log gets one line: the tool that made it, the need behind it and why (what the tool read,
 * where the toolbox kept that as a `Made`; otherwise what the decision itself says). It is read from the
 * decision log, so a loaded game shows its whole history. The debug menu shows it; the game settings show
 * the VGM's pacing, which scales how fast the Director's needs grow. Pure.
 */
import type { Decision, DecisionLog } from '../world/decisions';
import type { Need } from './director';
import { TOOLS, toolOf, type Made } from './toolbox';

/** How eventful the VGM makes the world (the game settings): its needs grow at this times the setting's rates. */
export const PACING = { calm: 0.6, normal: 1, eventful: 1.6 } as const;
export type Pacing = keyof typeof PACING;

/** One move of the VGM, as its log shows it. */
export interface VgmLine {
  readonly id: string;
  readonly kind: Decision['kind'];
  /** The tool's id and its name in vgm.md. */
  readonly tool: string;
  readonly name: string;
  readonly need: Need | null;
  readonly reason: string;
  /** Game hours, when known. */
  readonly at?: number;
  /** Where on the land it is (world metres), when it has a place (`placeOf`). */
  readonly where?: readonly [number, number];
}

/**
 * Where a decision is on the land (world metres): its own spot, else its place's (a cellar under its town, a
 * kept promise at the dungeon it promised, an order in its town); null for what has no place (the land's shape,
 * open land).
 */
export function placeOf(d: Decision, log: DecisionLog, depth = 0): readonly [number, number] | null {
  const by = (id: string): readonly [number, number] | null => {
    const o = depth < 3 ? log.find((x) => x.id === id) : undefined;
    return o ? placeOf(o, log, depth + 1) : null;
  };
  switch (d.kind) {
    case 'volume': return null;
    case 'dungeon': return d.site ? [d.site.x, d.site.z] : by(d.town);
    case 'move-in': case 'retake': return by(d.dungeon);
    case 'kept': return by(d.promise);
    case 'order': case 'festivity': return by(d.town);
    case 'journey': return by(d.to);
    case 'delay': return by(d.journey);
    // Open land has nothing placed in it to see.
    case 'region': return d.site ? [d.site.x, d.site.z] : null;
    case 'road': {
      const k = Math.floor(d.pts.length / 4) * 2;
      return d.pts.length >= 2 ? [d.pts[k], d.pts[k + 1]] : null;
    }
    default: return [d.x, d.z];
  }
}

/**
 * The tool that wrote `d` (the toolbox's `writes`): where two tools write one kind, the decision says which
 * (a dungeon for an event's band is the event's; roads laid before the first region are the world's first).
 */
export function toolFor(d: Decision, log: DecisionLog): string {
  switch (d.kind) {
    case 'town': case 'volume': case 'hold': case 'retreat': return 'open-world';
    case 'road': {
      const i = log.indexOf(d), first = log.findIndex((x) => x.kind === 'region');
      return first < 0 || (i >= 0 && i < first) ? 'open-world' : 'road';
    }
    case 'dungeon': return d.event ? 'event' : 'promise';
    case 'move-in': return 'promise';
    case 'event': return 'event';
    case 'region': return 'region';
    case 'wild': return d.group === 'ambush' ? 'ambush' : d.group === 'paddock' ? 'paddock-wolves' : 'wild';
    case 'kept': return d.faded ? 'fade' : 'keep';
    case 'retake': return 'retake';
    case 'order': return 'order';
    case 'journey': return 'journey';
    case 'delay': return 'hold-ship';
    case 'sight': return d.sea ? 'wreck' : d.strand ? 'washed-up' : d.need === 'reward' ? 'cache' : 'sight';
    case 'traveller': return d.situation ? 'hurt-traveller' : 'traveller';
    case 'stray': return 'stray-beast';
    case 'castaway': return 'castaway';
    case 'festivity': return 'festivity';
  }
}

/** What a decision says of itself, for a move no tool explained. */
export function decisionSays(d: Decision): string {
  const at = (x: number, z: number) => `at ${Math.round(x)}, ${Math.round(z)}`;
  switch (d.kind) {
    case 'town': return `the ${d.size ?? 'town'} ${d.id} ${at(d.x, d.z)}`;
    case 'volume': return `${d.id}, the land shaped in the round`;
    case 'hold': return `the ${d.people} hold ${at(d.x, d.z)}`;
    case 'retreat': return `the ${d.keeper}'s retreat of ${d.town} ${at(d.x, d.z)}`;
    case 'road': return `a ${d.way} from ${d.from} to ${d.to}`;
    case 'dungeon': return `a ${d.template} for ${d.town}${d.dwellers ? ` (${d.dwellers})` : ''}`;
    case 'move-in': return `${d.dweller} into ${d.dungeon}`;
    case 'retake': return `${d.dweller} take ${d.dungeon}`;
    case 'kept': return `${d.promise} ${d.faded ? 'ran its course' : 'kept'}`;
    case 'event': return `${d.event} in ${d.town}`;
    case 'region': return `${d.fill} ${at(d.x, d.z)}${d.site ? '' : ' (open land)'}`;
    case 'wild': return `${d.encounter} round ${d.town} (${d.members.length})`;
    case 'order': return `${d.order.kind} in ${d.town}`;
    case 'journey': return `the hero takes the cart from ${d.from} to ${d.to}`;
    case 'delay': return `${d.journey}'s ship held in harbour by a storm until ${Math.round(d.until)} h`;
    case 'sight': return `${d.sight} by the hero's way at ${Math.round(d.x)}, ${Math.round(d.z)}`;
    case 'festivity': return `${d.festivity} in ${d.town}, ${Math.round(d.from)} to ${Math.round(d.to)} h`;
    case 'stray': return `a beast out of its paddock in ${d.town}, wandering to ${Math.round(d.x)}, ${Math.round(d.z)}`;
    case 'castaway': return `a fisher of ${d.town} clinging to their upturned boat ${at(d.x, d.z)}`;
    case 'traveller': return `the traveller of ${d.town} ${d.situation ? 'hurt' : 'resting'} by the hero's way at ${Math.round(d.x)}, ${Math.round(d.z)}`;
  }
}

/** Why the VGM made a decision, kept in the save (a `Made` without its decision), so its log reads the same after a reload. */
export interface VgmWhy {
  readonly id: string;
  readonly tool: string;
  readonly reason: string;
  readonly at: number;
}

/** The reasons a save keeps (the newest; older moves fall back to what their decision says). */
export const WHY_KEPT = 1000;

export const whyOf = (m: Made): VgmWhy => ({ id: m.decision.id, tool: m.tool, reason: m.reason, at: m.at });

/** A save's reasons, checked (anything else is dropped). */
export function cleanWhys(raw: unknown): VgmWhy[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is VgmWhy => !!w && typeof w === 'object' && typeof w.id === 'string' && typeof w.tool === 'string' && typeof w.reason === 'string' && typeof w.at === 'number' && TOOLS.some((t) => t.id === w.tool)).slice(-WHY_KEPT);
}

/** One line per decision in the log (from the `from`th on), oldest first, with the tool, its need and why. */
export function vgmLines(log: DecisionLog, made: readonly (Made | VgmWhy)[] = [], from = 0): VgmLine[] {
  const why = new Map(made.map((m) => ['decision' in m ? m.decision.id : m.id, m]));
  return log.slice(from).map((d) => {
    const m = why.get(d.id), tool = toolOf(m?.tool ?? toolFor(d, log));
    const at = m?.at ?? ('at' in d ? d.at : undefined);
    const where = placeOf(d, log);
    return { id: d.id, kind: d.kind, tool: tool.id, name: tool.name, need: tool.need, reason: m?.reason ?? decisionSays(d), ...(at !== undefined ? { at } : {}), ...(where ? { where } : {}) };
  });
}

/**
 * The VGM's moves since the last look, for its alerts on screen (a developer's aid; D53 keeps it out of play
 * otherwise). What the log held when the watch began is not news; a log that shrank (another game loaded)
 * starts over from its end.
 */
export class VgmWatch {
  constructor(private seen: number) {}

  see(log: DecisionLog, made: readonly (Made | VgmWhy)[] = []): VgmLine[] {
    if (log.length < this.seen) this.seen = log.length;
    if (log.length === this.seen) return [];
    const lines = vgmLines(log, made, this.seen);
    this.seen = log.length;
    return lines;
  }
}

const WAYS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** How far and which way a place lies from the hero (north is −z), for the VGM window: "1.2 km to the south-east", "here". */
export function wayTo(from: readonly [number, number], to: readonly [number, number]): string {
  const dx = to[0] - from[0], dz = to[1] - from[1], d = Math.hypot(dx, dz);
  if (d < 15) return 'here';
  const way = WAYS[(Math.round((Math.atan2(dx, -dz) / (2 * Math.PI)) * 8) + 8) % 8];
  return `${d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`} to the ${way}`;
}

/**
 * The VGM's log (D53, C8): the VGM stays out of sight in play, and this is where it can be seen. Every
 * decision in the log gets one line: the tool that made it, the need behind it and why (what the tool read,
 * where the toolbox kept that as a `Made`; otherwise what the decision itself says). It is read from the
 * decision log, so a loaded game shows its whole history. The debug menu shows it; the game settings show
 * the VGM's pacing, which scales how fast the Director's needs grow. Pure.
 */
import type { Decision, DecisionLog } from '../world/decisions';
import type { Need } from './director';
import { toolOf, type Made } from './toolbox';

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
    case 'wild': return d.group === 'ambush' ? 'ambush' : 'wild';
    case 'kept': return 'keep';
    case 'retake': return 'retake';
    case 'order': return 'order';
    case 'journey': return 'journey';
    case 'sight': return d.need === 'reward' ? 'cache' : 'sight';
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
    case 'kept': return `${d.promise} kept`;
    case 'event': return `${d.event} in ${d.town}`;
    case 'region': return `${d.fill} ${at(d.x, d.z)}${d.site ? '' : ' (open land)'}`;
    case 'wild': return `${d.encounter} round ${d.town} (${d.members.length})`;
    case 'order': return `${d.order.kind} in ${d.town}`;
    case 'journey': return `the hero takes the cart from ${d.from} to ${d.to}`;
    case 'sight': return `${d.sight} by the hero's way at ${Math.round(d.x)}, ${Math.round(d.z)}`;
  }
}

/** One line per decision in the log, oldest first, with the tool, its need and why. */
export function vgmLines(log: DecisionLog, made: readonly Made[] = []): VgmLine[] {
  const why = new Map(made.map((m) => [m.decision.id, m]));
  return log.map((d) => {
    const m = why.get(d.id), tool = toolOf(m?.tool ?? toolFor(d, log));
    const at = m?.at ?? ('at' in d ? d.at : undefined);
    return { id: d.id, kind: d.kind, tool: tool.id, name: tool.name, need: tool.need, reason: m?.reason ?? decisionSays(d), ...(at !== undefined ? { at } : {}) };
  });
}

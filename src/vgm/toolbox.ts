/**
 * The VGM's toolbox (D51, docs/design/vgm.md): every tool the Builder has, in one shape. A tool says what it
 * makes (the decision kinds it writes), which of the Director's needs it meets, and who asks it: the start of
 * a game, the hero walking (the frontier), the Builder's turn every few seconds, or another tool or the game
 * calling it. The Builder's turn asks its tools in order (`vgmTurn`); the game only applies what they decided
 * (keyed by decision kind), it never decides on its own what the world gets. Pure.
 */
import type { SettingModule } from '../setting/contract';
import type { Decision } from '../world/decisions';
import type { Need } from './director';
import { ambushFor, travellerFor, sightFor, type NeedContext } from './answers';
import { fadedFor, lairFor, nextEvent, type EventsContext } from './events';
import { festivityFor } from './festivities';
import { hurtTravellerFor, paddockWolvesFor, strayBeastFor } from './situations';
import { nextPromise, openPromises, type LeadsContext } from './leads';

/** Who asks a tool: the start of a game, the hero walking, the Builder's turn, an overdue need (C9), or another tool or the game. */
export type Asked = 'start' | 'walk' | 'turn' | 'need' | 'call';

/** What the Builder's turn knows: the log, the land and towns, the hours, the hero and the setting. */
export type TurnContext = Omit<LeadsContext, 'dungeons' | 'terrain'> & Omit<EventsContext, 'setting'> & {
  readonly setting: EventsContext['setting'] & Pick<SettingModule, 'situations' | 'festivities' | 'world'>;
  /** Ask only these turn tools (by id); none: all of them. */
  readonly tools?: readonly string[];
  /** How much this player enjoys a need (C12: the player model); none: no lean. */
  readonly lean?: (n: Need) => number;
  /** Told how long each tool took (the hitch log): its id and ms, by `timeNow`. */
  readonly spent?: (tool: string, ms: number) => void;
  readonly timeNow?: () => number;
};

export interface Tool {
  readonly id: string;
  /** Its name in docs/design/vgm.md section 2. */
  readonly name: string;
  /** The decision kinds it writes (none: it only steers or speaks). */
  readonly writes: readonly Decision['kind'][];
  /** The Director's need it meets (null: none in particular). */
  readonly need: Need | null;
  readonly asked: Asked;
  /** A turn tool's move: its next decision, if one is due now. */
  readonly next?: (c: TurnContext) => Decision | null;
  /** A need tool's answer when its need is overdue (C9): its cheapest fitting move, if one fits now. */
  readonly answer?: (c: NeedContext) => Decision | null;
  /** Why it made `d` (one line, for the VGM's log: the debug menu, later the settings, D53). */
  readonly why?: (d: Decision, c: TurnContext) => string;
}

/** What a tool made, and why: the VGM's log reads these (C8). */
export interface Made {
  readonly decision: Decision;
  readonly tool: string;
  readonly need: Need | null;
  readonly reason: string;
  /** Game hours. */
  readonly at: number;
}

export const TOOLS: readonly Tool[] = [
  { id: 'open-world', name: 'Open the world', writes: ['town', 'volume', 'hold', 'retreat', 'road'], need: null, asked: 'start' },
  { id: 'region', name: 'Open a region', writes: ['region'], need: 'discovery', asked: 'walk' },
  { id: 'road', name: 'Lay a road', writes: ['road'], need: 'discovery', asked: 'call' },
  { id: 'wild', name: 'Place the wild', writes: ['wild'], need: 'challenge', asked: 'call' },
  { id: 'promise', name: 'Promise a place', writes: ['dungeon', 'move-in'], need: 'purpose', asked: 'turn', next: (c) => nextPromise({ ...c, dungeons: c.setting.dungeons }),
    why: (d, c) => {
      const open = openPromises(c.log).length;
      const what = d.kind === 'move-in' ? `new dwellers into ${d.dungeon}` : d.kind === 'dungeon' ? `a ${d.template} for ${d.town}` : d.kind;
      return `${what}: ${c.purposeOverdue ? 'Purpose is overdue' : `only ${open} lead${open === 1 ? '' : 's'} open`}${c.near && c.near !== c.towns[0] ? `, the hero is in ${c.near.decision.id}` : ''}`;
    } },
  { id: 'keep', name: 'Keep a promise', writes: ['kept'], need: 'reward', asked: 'call' },
  { id: 'event', name: 'Story event', writes: ['event', 'dungeon'], need: 'challenge', asked: 'turn', next: (c) => lairFor(c) ?? nextEvent(c),
    why: (d) => (d.kind === 'event' ? `${d.event} in ${d.town}: ${d.paddock !== undefined || d.held ? `the raiders of ${d.from} were left alone` : `${d.from} was left open too long`}` : d.kind === 'dungeon' && d.event ? `a ${d.template} for the band of ${d.event} to lie up in` : d.kind) },
  { id: 'fade', name: 'An event runs its course', writes: ['kept'], need: null, asked: 'turn', next: fadedFor,
    why: (d, c) => {
      const e = d.kind === 'kept' ? c.log.find((x) => x.id === d.promise) : undefined;
      return e?.kind === 'event' ? `${e.event} in ${e.town} was left alone ${Math.round(c.hours - e.at)} h: it ends without the hero` : d.kind;
    } },
  { id: 'festivity', name: 'A good day', writes: ['festivity'], need: 'people', asked: 'turn', next: festivityFor,
    why: (d) => (d.kind === 'festivity' ? `${d.festivity} in ${d.town}${d.for ? `: the hero kept ${d.for}` : ''}` : d.kind) },
  { id: 'retake', name: 'Others take a place', writes: ['retake'], need: 'challenge', asked: 'call' },
  { id: 'sight', name: 'A sight by the way', writes: ['sight'], need: 'discovery', asked: 'need', answer: (c) => sightFor(c) },
  { id: 'cache', name: 'A find by the way', writes: ['sight'], need: 'reward', asked: 'need', answer: (c) => sightFor(c, 'reward') },
  { id: 'ambush', name: 'An ambush', writes: ['wild'], need: 'challenge', asked: 'need', answer: ambushFor },
  { id: 'paddock-wolves', name: 'Wolves at the paddock', writes: ['wild'], need: 'challenge', asked: 'turn', next: paddockWolvesFor,
    why: (d) => (d.kind === 'wild' ? `dusk in ${d.town}: ${d.encounter} (${d.members.length}) at a paddock` : d.kind) },
  { id: 'stray-beast', name: 'A beast got out', writes: ['stray'], need: 'people', asked: 'turn', next: strayBeastFor,
    why: (d) => (d.kind === 'stray' ? `a day in ${d.town}: a beast out of its paddock, its farm after it` : d.kind) },
  { id: 'hurt-traveller', name: 'A hurt traveller', writes: ['traveller'], need: 'people', asked: 'need', answer: hurtTravellerFor },
  { id: 'traveller', name: 'A traveller by the way', writes: ['traveller'], need: 'people', asked: 'need', answer: travellerFor },
  { id: 'journey', name: 'A journey', writes: ['journey'], need: null, asked: 'call' },
  { id: 'quest', name: "A master's deed", writes: ['dungeon'], need: 'purpose', asked: 'call' },
  { id: 'order', name: 'Steer a town', writes: ['order'], need: 'people', asked: 'call' },
  { id: 'guide', name: 'Guide', writes: [], need: 'purpose', asked: 'call' },
];

/** The tool of this id. */
export function toolOf(id: string): Tool {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`no VGM tool "${id}"`);
  return t;
}

/** The Builder's turn: each turn tool in order (or those `c.tools` names) makes its move, each seeing the ones before; what each made, and why. */
export function vgmTurn(c: TurnContext): Made[] {
  const out: Made[] = [];
  let log = c.log;
  for (const t of TOOLS) {
    if (t.asked !== 'turn' || !t.next || (c.tools && !c.tools.includes(t.id))) continue;
    const t0 = c.timeNow?.() ?? 0, at = { ...c, log }, d = t.next(at);
    if (c.spent && c.timeNow) c.spent(t.id, c.timeNow() - t0);
    if (!d) continue;
    out.push(madeBy(t.id, d, t.why?.(d, at) ?? t.name, c.hours));
    log = [...log, d];
  }
  return out;
}

/** A tool's decision as the VGM's log keeps it (a tool asked by name says its own reason). */
export function madeBy(tool: string, decision: Decision, reason: string, at: number): Made {
  return { decision, tool, need: toolOf(tool).need, reason, at };
}

/**
 * An overdue need asks the tools that meet it (C9), in the toolbox's order (cheapest first), for a move:
 * the first that fits, and why; null if none does now.
 */
export function answerNeed(need: Need, c: NeedContext): Made | null {
  for (const t of TOOLS) {
    if (t.asked !== 'need' || t.need !== need || !t.answer) continue;
    const t0 = c.timeNow?.() ?? 0, d = t.answer(c);
    if (c.spent && c.timeNow) c.spent(t.id, c.timeNow() - t0);
    if (d) return madeBy(t.id, d, `${need} is overdue: ${d.kind === 'sight' ? d.sight : d.kind === 'wild' ? `${d.encounter} (${d.members.length}) lying in wait` : d.kind} by the hero's way${c.toward ? ` to ${Math.round(c.toward.x)}, ${Math.round(c.toward.z)}` : ''}`, c.hours);
  }
  return null;
}

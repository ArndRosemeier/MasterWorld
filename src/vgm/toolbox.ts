/**
 * The VGM's toolbox (D51, docs/design/vgm.md): every tool the Builder has, in one shape. A tool says what it
 * makes (the decision kinds it writes), which of the Director's needs it meets, and who asks it: the start of
 * a game, the hero walking (the frontier), the Builder's turn every few seconds, or another tool or the game
 * calling it. The Builder's turn asks its tools in order (`vgmTurn`); the game only applies what they decided
 * (keyed by decision kind), it never decides on its own what the world gets. Pure.
 */
import type { Decision } from '../world/decisions';
import type { Need } from './director';
import { nextEvent, type EventsContext } from './events';
import { nextPromise, type LeadsContext } from './leads';

/** Who asks a tool: the start of a game, the hero walking, the Builder's turn, or another tool or the game. */
export type Asked = 'start' | 'walk' | 'turn' | 'call';

/** What the Builder's turn knows: the log, the land and towns, the hours, the hero and the setting. */
export type TurnContext = Omit<LeadsContext, 'dungeons' | 'terrain'> & EventsContext & {
  /** Ask only these turn tools (by id); none: all of them. */
  readonly tools?: readonly string[];
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
}

export const TOOLS: readonly Tool[] = [
  { id: 'open-world', name: 'Open the world', writes: ['town', 'volume', 'hold', 'retreat', 'road'], need: null, asked: 'start' },
  { id: 'region', name: 'Open a region', writes: ['region'], need: 'discovery', asked: 'walk' },
  { id: 'road', name: 'Lay a road', writes: ['road'], need: 'discovery', asked: 'call' },
  { id: 'promise', name: 'Promise a place', writes: ['dungeon', 'move-in'], need: 'purpose', asked: 'turn', next: (c) => nextPromise({ ...c, dungeons: c.setting.dungeons }) },
  { id: 'keep', name: 'Keep a promise', writes: ['kept'], need: 'reward', asked: 'call' },
  { id: 'event', name: 'Story event', writes: ['event'], need: 'challenge', asked: 'turn', next: nextEvent },
  { id: 'order', name: 'Steer a town', writes: ['order'], need: 'people', asked: 'call' },
  { id: 'guide', name: 'Guide', writes: [], need: 'purpose', asked: 'call' },
];

/** The tool of this id. */
export function toolOf(id: string): Tool {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`no VGM tool "${id}"`);
  return t;
}

/** The Builder's turn: each turn tool in order (or those `c.tools` names) makes its move, each seeing the ones before. */
export function vgmTurn(c: TurnContext): Decision[] {
  const out: Decision[] = [];
  let log = c.log;
  for (const t of TOOLS) {
    if (t.asked !== 'turn' || !t.next || (c.tools && !c.tools.includes(t.id))) continue;
    const d = t.next({ ...c, log });
    if (!d) continue;
    out.push(d);
    log = [...log, d];
  }
  return out;
}

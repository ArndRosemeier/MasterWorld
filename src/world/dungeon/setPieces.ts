/**
 * Set pieces (plan 8.1, layer 3): hand-designed moments, each with what it needs from the dungeon and
 * what it does to it. A dungeon has one; the VGM picks one the world has not used yet, so none repeats
 * until the library has been used through.
 *
 * Puzzles only as detective work with an in-world reason (Arnd's rule): the clue is something the place's
 * history left, and reading it right is what opens the way.
 */
import type { Rng } from '@futuremagic/core';
import type { DungeonGraph, Link } from '@futuremagic/dungeon';
import type { DungeonProp, DwellerDef, HistoryDef } from '../../setting/contract';
import type { DungeonTemplate } from '../decisions';
import type { CellarRoom, HistoryLayer } from './cellar';

/** What a set piece may do while its dungeon is furnished. */
export interface PieceDress {
  readonly link: Link;
  readonly graph: DungeonGraph;
  readonly rooms: readonly CellarRoom[];
  readonly trouble: HistoryDef;
  readonly dweller: DwellerDef;
  readonly rng: Rng;
  /** A prop against a wall of the room (a trace of `trace`, telling clue `clue`). */
  put(room: number, kind: DungeonProp, trace?: HistoryLayer, clue?: number): void;
  /** A clue to read; returns its index (for `put`). */
  clue(text: string, room: number, link?: number): number;
}

export interface SetPieceDef {
  readonly id: string;
  /** What the player meets, in a line. */
  readonly about: string;
  /** The kinds of dungeon it belongs in (none: every kind). */
  readonly kinds?: readonly DungeonTemplate[];
  /** Layers of history it needs, by kind: forces these choices (ids from the setting's cellar lore). */
  readonly troubles?: readonly string[];
  /** Needs a storey below (an older layer). */
  readonly older?: boolean;
  /** Main cycle patterns that make room for it. */
  readonly main?: readonly string[];
  /** Patterns to favour for the inserted cycles. */
  readonly prefer?: readonly string[];
  /** The graph has what it needs: returns the link it hangs on, or null. */
  find(g: DungeonGraph): Link | null;
  /** A room it gives a use of its own (a use id of the setting's lore), unless that is the entrance or the goal. */
  readonly use?: { readonly id: string; readonly era?: HistoryLayer; room(g: DungeonGraph, l: Link): number };
  /** Its own dressing and clues. */
  dress(c: PieceDress): void;
  /** The note when its link opens (a hidden way found, a bar lifted). */
  readonly found?: string;
  /** The hidden door's face, if it differs from the walls (sRGB). */
  readonly tint?: readonly [number, number, number];
}

const other = (l: Link, room: number) => (l.a === room ? l.b : l.a);
const tagged = (g: DungeonGraph, room: number, tag: string) => g.rooms[room].tags.includes(tag);

export const SET_PIECES: readonly SetPieceDef[] = [
  {
    id: 'broken-floor',
    kinds: ['cellar'],
    about: 'The floor of a cellar room has fallen into an older hall below; from the broken edge the goal is in sight, far down, and the way to it leads around.',
    troubles: ['collapse'],
    older: true,
    main: ['drop-in'],
    find: (g) => g.links.find((l) => l.kind === 'drop') ?? null,
    use: { id: 'collapse', room: (_g, l) => l.a },
    dress({ link, put, clue }) {
      const k = clue('The boards end in splinters over a drop. Far below, an older hall: stone, not timber. Someone lives down there.', link.a, link.id);
      put(link.a, 'rubble', 'trouble', k); put(link.a, 'beam', 'trouble');
      put(link.b, 'rubble', 'trouble'); put(link.b, 'beam', 'trouble');
    },
  },
  {
    id: 'bricked-wall',
    kinds: ['cellar'],
    about: 'A wall bricked up later than the others. The mortar is paler, a ledger pays a mason for work the house never shows, and the wall rings hollow; behind it, the hidden way.',
    troubles: ['sealed', 'debt'],
    prefer: ['hidden-shortcut', 'secret-key', 'side-loop'],
    find: (g) => g.links.find((l) => l.kind === 'secret') ?? null,
    found: 'The pale bricks give under your shoulder: a way through.',
    tint: [200, 190, 170],
    dress({ link, rooms, graph, trouble, put, clue }) {
      const by = trouble.id === 'debt' ? 'the owner, the week before he fled' : 'the household, the summer of the sickness';
      const a = clue('The mortar on this stretch of wall is paler than the rest, and it rings hollow under a knock.', link.b, link.id);
      const ledgerRoom = rooms.find((r) => r.use.id === 'counting-room')?.id ?? graph.entrance;
      const b = clue(`A ledger: "To the mason, for bricking the north wall below, three silver." Paid by ${by}. The house has no such wall on any plan.`, ledgerRoom, link.id);
      put(link.b, 'bricks', 'trouble', a);
      put(ledgerRoom, 'ledger', 'trouble', b);
    },
  },
  {
    id: 'false-cask',
    kinds: ['cellar'],
    about: 'A great cask against a wall that never empties and never fills: its tap is dry, it rings hollow, and the floor before it is worn in an arc. It swings out on hinges.',
    prefer: ['hidden-shortcut', 'side-loop', 'secret-key'],
    find: (g) => g.links.find((l) => l.kind === 'secret' && l.b !== g.entrance) ?? g.links.find((l) => l.kind === 'secret') ?? null,
    found: 'You pull at the cask and it swings out on hidden hinges: a doorway behind it.',
    tint: [92, 70, 52],
    dress({ link, put, clue }) {
      const a = clue('A cask taller than a man. The tap is dry and furred with dust, but the flagstones before it are worn smooth in an arc, as if it often swung out.', link.a, link.id);
      put(link.a, 'cask', 'now', a); put(link.a, 'lantern', 'now');
      put(link.b, 'crate', 'now');
    },
  },
  {
    id: 'barred-view',
    about: 'Through the bars of an old grating the lair is seen long before it is reached: what lives there, and what it has gathered.',
    main: ['seen-goal', 'gallery'],
    prefer: ['seen-key'],
    find: (g) => g.links.find((l) => l.kind === 'grate' && (l.a === g.goal || l.b === g.goal)) ?? null,
    dress({ link, graph, dweller, put, clue }) {
      const near = other(link, graph.goal);
      const k = clue(`Through the bars, by your lantern's edge: ${dweller.signs[0].charAt(0).toLowerCase()}${dweller.signs[0].slice(1).replace(/[.!]$/, '')}, and beyond it, the place where they sleep. The way there is not this one.`, near, link.id);
      put(near, 'candle', 'now', k);
      put(graph.goal, 'bones', 'now');
    },
  },
  {
    id: 'last-stand',
    about: 'A barricade of casks and beams where someone once held a door; scratched into a beam, how it ended. Lifting the bar opens the way back.',
    prefer: ['barred-return', 'lock-key', 'bolt-hole'],
    find: (g) => g.links.find((l) => l.kind === 'oneway' && l.a !== g.goal && l.a !== g.entrance) ?? g.links.find((l) => l.kind === 'oneway') ?? null,
    use: { id: 'stand', room: (_g, l) => l.a },
    found: 'You heave the beams aside and lift the bar. Whoever held this door is long gone.',
    dress({ link, trouble, put, clue }) {
      const why = trouble.id === 'robbed' ? 'the dead came out of the walls' : trouble.id === 'sealed' ? 'they bricked us in with the sick' : trouble.id === 'flood' ? 'the water rose behind us' : 'they came up from below';
      const k = clue(`Scratched into the beam: "Held the door three nights. No more water. ${why.charAt(0).toUpperCase()}${why.slice(1)}." The bar is still down on this side.`, link.a, link.id);
      put(link.a, 'beam', 'trouble', k); put(link.a, 'barrel', 'trouble'); put(link.a, 'bones', 'trouble');
    },
  },
  {
    id: 'flooded-way',
    about: 'The low way beneath stands in water: someone stuffed the drain on purpose, to keep it flooded, and the reason lies at its end.',
    troubles: ['flood'],
    older: true,
    main: ['low-road'],
    find: (g) => g.links.find((l) => l.tags.includes('stairs') && (tagged(g, l.a, 'low') || tagged(g, l.b, 'low'))) ?? null,
    use: { id: 'flooded-way', room: (g, l) => (tagged(g, l.b, 'low') ? l.b : l.a) },
    dress({ link, graph, put, clue }) {
      const low = tagged(graph, link.b, 'low') ? link.b : link.a;
      const k = clue('The drain grate is stuffed with rags and pitch, and not long ago. Someone wanted this water to stay.', low, link.id);
      put(low, 'puddle', 'trouble', k); put(low, 'puddle', 'trouble'); put(low, 'rubble', 'trouble');
    },
  },
  {
    id: 'stewards-key',
    kinds: ['cellar'],
    about: "The far door is locked. The steward's ledger says where the key was left, if one reads it right.",
    prefer: ['lock-key', 'secret-key', 'seen-key'],
    find: (g) => g.links.find((l) => l.kind === 'locked' && l.key !== undefined) ?? null,
    dress({ link, rooms, graph, put, clue }) {
      const keyRoom = link.key!;
      const where = rooms[keyRoom].use.name;
      const k = clue(`In the steward's hand: "The key of the far door I left in ${where}, on the high nail, where the boy cannot reach it."`, graph.entrance, link.id);
      put(graph.entrance, 'ledger', 'built', k);
      put(keyRoom, 'shelf', 'built');
    },
  },
  {
    id: 'dug-round',
    about: 'The old way fell in long ago. Claw marks in the clay show where something dug round the fall, from the far side.',
    troubles: ['collapse', 'fire'],
    main: ['collapsed-way'],
    find: (g) => g.links.find((l) => l.kind === 'blocked' && !l.tags.includes('false')) ?? null,
    dress({ link, graph, put, clue }) {
      const k = clue('Claw marks in the clay beside the fall, deep and many. Something dug round it, and it dug from the other side.', link.a, link.id);
      put(link.a, 'rubble', 'trouble', k); put(link.a, 'beam', 'trouble');
      const dug = graph.rooms.find((r) => r.tags.includes('dug'));
      if (dug) put(dug.id, 'bones', 'now');
    },
  },
  {
    id: 'ward-niche',
    about: 'Down in the older layer, a niche of the old realm with a carved ward-stone; its lines, dead since the Fading, glimmer again, and the dwellers keep away from it.',
    older: true,
    prefer: ['gallery', 'low-road', 'drop-in', 'split-descent'],
    find: (g) => g.links.find((l) => l.b !== g.goal && l.a !== g.goal && g.rooms[l.b].level < 0 && g.rooms[l.a].level < 0) ?? g.links.find((l) => l.b !== g.goal && g.rooms[l.b].level < 0) ?? null,
    use: { id: 'ward-niche', era: 'older', room: (_g, l) => l.b },
    dress({ link, put, clue }) {
      const k = clue('A niche of the old realm, a ward-stone carved with interlaced lines. Dead since the Fading, the lines glimmer faintly now under your hand. No tracks come near it.', link.b, link.id);
      put(link.b, 'candle', 'older', k); put(link.b, 'bricks', 'older');
    },
  },
  {
    id: 'bolt-hole',
    about: 'The way in is long, through doors; the dwellers dug themselves a bolt-hole straight back, hidden under a sack.',
    main: ['bolt-hole'],
    find: (g) => g.links.find((l) => l.tags.includes('dug') && l.tags.includes('shortcut')) ?? null,
    found: 'You push through the hole and come out under a sack, near the way in.',
    dress({ link, put, clue }) {
      const k = clue('Fresh earth spilled from under a sack. Behind it, a hole dug by small hands, running back towards the way in.', link.a, link.id);
      put(link.a, 'sack', 'now', k); put(link.a, 'straw', 'now');
    },
  },
  {
    id: 'guarded-hoard',
    about: "Off the way, a nook where the dwellers keep what they value most, with someone's bedding across its door.",
    prefer: ['gambit', 'ring-hall', 'side-loop'],
    find: (g) => g.links.find((l) => tagged(g, l.b, 'reward') && l.b !== g.goal) ?? null,
    use: { id: 'hoard-nook', era: 'now', room: (_g, l) => l.b },
    dress({ link, put, clue }) {
      const k = clue('Bedding laid across the doorway, still warm. Whoever sleeps here sleeps between the world and what lies behind them.', link.a, link.id);
      put(link.a, 'straw', 'now', k);
      put(link.b, 'chest', 'now');
    },
  },
  {
    id: 'false-trail',
    about: 'Fresh tracks and a lantern lead to a dead end of rubble. Looked at closely, the tracks were laid to fool: the real way goes round.',
    main: ['false-goal'],
    find: (g) => g.links.find((l) => l.kind === 'blocked' && l.tags.includes('false')) ?? null,
    dress({ link, put, clue }) {
      const k = clue('Footprints lead up to the rubble and stop. They are pressed deep at the heel: someone walked here backwards, to make a trail.', link.a, link.id);
      put(link.a, 'lantern', 'now', k); put(link.a, 'rubble', 'trouble');
    },
  },
  {
    id: 'empty-bier',
    kinds: ['barrow'],
    about: 'Before the tomb, a great bier of grey stone, the grave-cloth thrown back and nobody on it; the dust tells which way its sleeper went.',
    prefer: ['seen-goal', 'lock-key', 'gallery'],
    find: (g) => g.links.find((l) => l.b === g.goal && l.a !== g.entrance) ?? g.links.find((l) => l.a === g.goal && l.b !== g.entrance) ?? null,
    use: { id: 'bier-hall', era: 'trouble', room: (g, l) => other(l, g.goal) },
    dress({ link, graph, put, clue }) {
      const hall = other(link, graph.goal);
      const k = clue('A bier of grey stone, the grave-cloth thrown back. The dust on it keeps the shape of a long body, and the drag of its feet leads on, deeper in.', hall, link.id);
      put(hall, 'candle', 'trouble', k); put(hall, 'bones', 'trouble');
    },
  },
  {
    id: 'robbers-hole',
    kinds: ['barrow'],
    about: "Grave-robbers dug a hole of their own past the sealed rooms; their tally on the wall says how many went in, and how many came back.",
    prefer: ['bolt-hole', 'collapsed-way', 'hidden-shortcut'],
    troubles: ['robbed'],
    find: (g) => g.links.find((l) => l.tags.includes('dug')) ?? g.links.find((l) => l.kind === 'secret') ?? null,
    found: "You crawl through the robbers' hole and come out where they meant to.",
    dress({ link, put, clue }) {
      const k = clue('A pick-head rusted through, and a tally scratched in the wall: seven strokes for those who went in, two for those who came out.', link.a, link.id);
      put(link.a, 'lantern', 'trouble', k); put(link.a, 'rubble', 'trouble');
    },
  },
];

/** The set pieces of a kind of dungeon. */
export function setPiecesFor(kind: DungeonTemplate): readonly SetPieceDef[] {
  return SET_PIECES.filter((p) => !p.kinds || p.kinds.includes(kind));
}

export function setPieceById(id: string): SetPieceDef {
  const s = SET_PIECES.find((p) => p.id === id);
  if (!s) throw new Error(`no set piece "${id}"`);
  return s;
}

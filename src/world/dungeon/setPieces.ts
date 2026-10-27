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
    tint: [92, 70, 52],
    dress({ link, put, clue }) {
      const a = clue('A cask taller than a man. The tap is dry and furred with dust, but the flagstones before it are worn smooth in an arc, as if it often swung out.', link.a, link.id);
      put(link.a, 'cask', 'now', a); put(link.a, 'lantern', 'now');
      put(link.b, 'crate', 'now');
    },
  },
  {
    id: 'barred-view',
    kinds: ['cellar', 'barrow', 'tower'],
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
    dress({ link, trouble, put, clue }) {
      const why = trouble.id === 'robbed' ? 'the dead came out of the walls' : trouble.id === 'sealed' ? 'they bricked us in with the sick' : trouble.id === 'flood' ? 'the water rose behind us' : 'they came up from below';
      const k = clue(`Scratched into the beam: "Held the door three nights. No more water. ${why.charAt(0).toUpperCase()}${why.slice(1)}." The bar is still down on this side.`, link.a, link.id);
      put(link.a, 'beam', 'trouble', k); put(link.a, 'barrel', 'trouble'); put(link.a, 'bones', 'trouble');
    },
  },
  {
    id: 'flooded-way',
    kinds: ['cellar', 'barrow'],
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
    kinds: ['cellar', 'barrow', 'cave'],
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
    kinds: ['cellar', 'barrow', 'tower'],
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
    dress({ link, put, clue }) {
      const k = clue('A pick-head rusted through, and a tally scratched in the wall: seven strokes for those who went in, two for those who came out.', link.a, link.id);
      put(link.a, 'lantern', 'trouble', k); put(link.a, 'rubble', 'trouble');
    },
  },
  {
    id: 'sump',
    kinds: ['cave'],
    about: 'The way on dips under a hanging lip of rock into still black water. A rope tied off to a spur runs down into it and comes out on the far side: someone goes through often.',
    main: ['low-road'],
    prefer: ['seen-goal', 'twin-paths'],
    find: (g) => g.links.find((l) => l.tags.includes('stairs') && (tagged(g, l.a, 'low') || tagged(g, l.b, 'low'))) ?? null,
    use: { id: 'pool', era: 'built', room: (g, l) => (tagged(g, l.b, 'low') ? l.b : l.a) },
    dress({ link, graph, dweller, put, clue }) {
      const low = tagged(graph, link.b, 'low') ? link.b : link.a;
      const who = dweller.creatures.some((c) => c === 'bandit' || c === 'highwayman' || c === 'goblin') ? 'and the rope is new' : 'but the rope is old and green, and nothing has used it in years';
      const k = clue(`A rope tied off to a spur of rock runs down into the water under the lip and out again beyond it, ${who}.`, low, link.id);
      put(low, 'puddle', 'built', k); put(low, 'puddle', 'built'); put(low, 'lantern', 'now');
    },
  },
  {
    id: 'light-shaft',
    kinds: ['cave'],
    about: 'A shaft in the roof lets down a grey light onto a heap of old bones and leaves: what fell in from the hill above. From the rim of the drop below it, the lair is in sight.',
    main: ['drop-in'],
    prefer: ['gallery', 'seen-goal'],
    find: (g) => g.links.find((l) => l.kind === 'drop') ?? null,
    use: { id: 'shaft', era: 'older', room: (_g, l) => l.b },
    dress({ link, put, clue }) {
      const k = clue('Grey light falls from a crack high in the roof. Under it, bones of sheep and deer and leaves of many autumns: what fell in from the hill. Below the edge, something has picked the bones clean.', link.a, link.id);
      put(link.a, 'rubble', 'older', k);
      put(link.b, 'bones', 'older'); put(link.b, 'bones', 'older');
    },
  },
  {
    id: 'miners-mark',
    kinds: ['cave'],
    about: "A miner's mark scratched on the rock, an arrow and three strokes: the old sign for 'worked on behind'. The rock there is stacked stone, not the hill's own.",
    prefer: ['secret-key', 'hidden-shortcut', 'side-loop'],
    find: (g) => g.links.find((l) => l.kind === 'secret') ?? null,
    tint: [168, 160, 146],
    dress({ link, put, clue }) {
      const k = clue("Scratched into the rock at shoulder height: an arrow and three strokes, the miners' old sign for 'worked on behind'. The wall under it is stones stacked dry, not the hill's own rock.", link.b, link.id);
      put(link.b, 'rubble', 'built', k); put(link.b, 'beam', 'built');
    },
  },
  {
    id: 'narrow-crack',
    kinds: ['cave'],
    about: 'Through a crack too narrow for anyone bigger than a child the lair is seen, and what lies in it; the way there is longer.',
    main: ['seen-goal', 'gallery'],
    prefer: ['seen-key'],
    find: (g) => g.links.find((l) => l.kind === 'grate' && (l.a === g.goal || l.b === g.goal)) ?? null,
    dress({ link, graph, dweller, put, clue }) {
      const near = other(link, graph.goal);
      const k = clue(`Through a crack in the rock no wider than a hand, by your lantern's edge: ${dweller.signs[0].charAt(0).toLowerCase()}${dweller.signs[0].slice(1).replace(/[.!]$/, '')}. A draught comes through it, and the smell of where they sleep.`, near, link.id);
      put(near, 'rubble', 'now', k);
      put(graph.goal, 'bones', 'now');
    },
  },
  {
    id: 'pulled-ladder',
    kinds: ['cave'],
    about: 'A rope ladder hangs down a step of rock, pulled up and tied off on the high side by whoever went on beyond it; let down, it is the short way back.',
    prefer: ['barred-return', 'bolt-hole', 'lock-key'],
    find: (g) => g.links.find((l) => l.kind === 'oneway' && l.a !== g.goal && l.a !== g.entrance) ?? g.links.find((l) => l.kind === 'oneway') ?? null,
    dress({ link, dweller, put, clue }) {
      const who = dweller.creatures.some((c) => c === 'bandit' || c === 'highwayman' || c === 'goblin') ? 'The knots are fresh' : 'The rope is grey with damp and the knots have not been undone in years';
      const k = clue(`A rope ladder lies coiled at the top of a step of rock, tied off to a spur so that nobody below could climb it. ${who}.`, link.a, link.id);
      put(link.a, 'rubble', 'built', k); put(link.a, 'lantern', 'now');
    },
  },
  {
    id: 'burned-floor',
    kinds: ['tower'],
    about: 'The floor of an upper room burned through into the hall beneath; from its charred edge the hall is in sight, and the way back up goes round.',
    main: ['drop-in'],
    prefer: ['gallery', 'split-descent'],
    find: (g) => g.links.find((l) => l.kind === 'drop') ?? null,
    use: { id: 'collapse', era: 'trouble', room: (_g, l) => l.a },
    dress({ link, trouble, put, clue }) {
      const how = trouble.id === 'fire' ? 'The fire came up through here' : trouble.id === 'siege' ? 'Pitch was poured here in the siege, and it caught' : 'Lightning struck the roof one summer, and the fire came down through here';
      const k = clue(`${how}: the joists end in charcoal over the hall below, and the boards that are left would not hold a cat.`, link.a, link.id);
      put(link.a, 'beam', 'trouble', k); put(link.a, 'rubble', 'trouble');
      put(link.b, 'beam', 'trouble'); put(link.b, 'rubble', 'trouble');
    },
  },
  {
    id: 'inner-bar',
    kinds: ['tower'],
    about: 'The inner door of the stair was barred from above by the last who held the tower; arrow-scars on the outside, and the bar still down on the inside.',
    prefer: ['barred-return', 'bolt-hole', 'lock-key'],
    find: (g) => g.links.find((l) => l.kind === 'oneway' && l.a !== g.goal && l.a !== g.entrance) ?? g.links.find((l) => l.kind === 'oneway') ?? null,
    use: { id: 'stand', era: 'trouble', room: (_g, l) => l.a },
    dress({ link, trouble, put, clue }) {
      const why = trouble.id === 'siege' ? 'held it against the siege, as long as the water lasted' : trouble.id === 'fire' ? 'barred it against the smoke from below' : 'barred it, and nobody ever lifted the bar again';
      const k = clue(`The bar across the inner door is oak as thick as a thigh, and still down. Somebody ${why}. The door's far face, by the look of the light through its cracks, is all arrow-scars.`, link.a, link.id);
      put(link.a, 'beam', 'trouble', k); put(link.a, 'bones', 'trouble');
    },
  },
  {
    id: 'watch-log',
    kinds: ['tower'],
    about: "The upper door is locked. The last page of the garrison's watch-log says who kept its key, and where he was when the writing stops.",
    prefer: ['lock-key', 'seen-key', 'secret-key'],
    find: (g) => g.links.find((l) => l.kind === 'locked' && l.key !== undefined) ?? null,
    dress({ link, rooms, graph, put, clue }) {
      const keyRoom = link.key!;
      const where = rooms[keyRoom].use.name;
      const k = clue(`The last page of the watch-log, the hand shaking: "Orrin has the key of the upper door, as ever. Orrin has not come back from ${where} since the second night. Nobody will go and look."`, graph.entrance, link.id);
      put(graph.entrance, 'ledger', 'trouble', k);
      put(keyRoom, 'bones', 'trouble');
    },
  },
  {
    id: 'wall-stair',
    kinds: ['tower'],
    about: 'A hanging gnawed to rags stirs where there is no wind: behind it, a narrow stair runs up inside the wall, the way the keepers came and went unseen.',
    prefer: ['hidden-shortcut', 'secret-key', 'side-loop'],
    find: (g) => g.links.find((l) => l.kind === 'secret') ?? null,
    tint: [150, 136, 120],
    dress({ link, put, clue }) {
      const k = clue('What is left of a wall-hanging stirs, though no air moves in the room. The stones behind it are cooler than the rest, and a draught comes round its edges.', link.b, link.id);
      put(link.b, 'candle', 'built', k); put(link.b, 'stool', 'built');
    },
  },
];

/** The set pieces of a kind of dungeon (and of the kinds it borrows from, `DungeonForm.pieces`). */
export function setPiecesFor(kind: DungeonTemplate, also: readonly string[] = []): readonly SetPieceDef[] {
  return SET_PIECES.filter((p) => !p.kinds || p.kinds.includes(kind) || also.some((k) => p.kinds!.includes(k)));
}

export function setPieceById(id: string): SetPieceDef {
  const s = SET_PIECES.find((p) => p.id === id);
  if (!s) throw new Error(`no set piece "${id}"`);
  return s;
}

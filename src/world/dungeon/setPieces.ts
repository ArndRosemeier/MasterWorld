/**
 * Set pieces (plan 8.1, layer 3): hand-designed moments, each with what it needs from the dungeon and
 * what it does to it. A cellar has one; the VGM picks one the player has not seen yet.
 *
 * Puzzles only as detective work with an in-world reason (Arnd's rule): the clue is something the place's
 * history left, and reading it right is what opens the way.
 */
import type { DungeonGraph, Link } from '@futuremagic/dungeon';

export interface SetPieceDef {
  readonly id: string;
  /** What the player meets, in a line. */
  readonly about: string;
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
}

export const SET_PIECES: readonly SetPieceDef[] = [
  {
    id: 'broken-floor',
    about: 'The floor of a cellar room has fallen into an older hall below; from the broken edge the goal is in sight, far down, and the way to it leads around.',
    troubles: ['collapse'],
    older: true,
    main: ['drop-in'],
    find: (g) => g.links.find((l) => l.kind === 'drop') ?? null,
  },
  {
    id: 'bricked-wall',
    about: 'A wall bricked up later than the others. The mortar is paler, a ledger pays a mason for work the house never shows, and the wall rings hollow; behind it, the hidden way.',
    troubles: ['sealed', 'debt'],
    prefer: ['hidden-shortcut', 'secret-key', 'side-loop'],
    find: (g) => g.links.find((l) => l.kind === 'secret') ?? null,
  },
];

export function setPieceById(id: string): SetPieceDef {
  const s = SET_PIECES.find((p) => p.id === id);
  if (!s) throw new Error(`no set piece "${id}"`);
  return s;
}

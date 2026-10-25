/**
 * The player's journal (plan 9.1, 17): the open leads, each with what the player was told and by whom,
 * and the place it points at (the map marks it). Plain data, saved with the game. Pure.
 */

export interface LeadNote {
  readonly text: string;
  /** Who said it. */
  readonly from: string;
}

export interface Lead {
  /** The promise it belongs to (a dungeon decision's id). */
  readonly id: string;
  readonly title: string;
  readonly notes: LeadNote[];
  /** Where it points, world metres, and what is there. */
  readonly mark: { readonly x: number; readonly z: number; readonly label: string };
  /** Kept (the promise's goal reached) or still open. */
  done: boolean;
}

export class Journal {
  readonly leads: Lead[] = [];

  constructor(saved?: readonly Lead[]) {
    if (saved) this.leads.push(...saved.map((l) => ({ ...l, notes: [...l.notes] })));
  }

  /** The player heard of a promise: a new lead, or one more note on it. Returns the lead when it is new. */
  hear(id: string, title: string, note: LeadNote, mark: Lead['mark']): Lead | null {
    const had = this.leads.find((l) => l.id === id);
    if (had) {
      if (!had.notes.some((n) => n.text === note.text)) had.notes.push(note);
      return null;
    }
    const lead: Lead = { id, title, notes: [note], mark, done: false };
    this.leads.push(lead);
    return lead;
  }

  get open(): Lead[] { return this.leads.filter((l) => !l.done); }

  /** For the save. */
  entries(): Lead[] { return this.leads.map((l) => ({ ...l, notes: [...l.notes] })); }
}

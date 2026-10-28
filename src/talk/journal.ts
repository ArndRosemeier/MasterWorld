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
  /** Where it points, world metres, and what is there (once the place is quiet: whom to tell). */
  mark: { readonly x: number; readonly z: number; readonly label: string };
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

  /** A lead the hero gave themselves (where they fell, plan 11.1). */
  remember(lead: Lead): void {
    if (!this.knows(lead.id)) this.leads.push({ ...lead, notes: [...lead.notes] });
  }

  /** Has the hero heard of promise `id` (open or done)? */
  knows(id: string): boolean {
    return this.leads.some((l) => l.id === id);
  }

  /**
   * The place is quiet (plan 4.2): a note on what is left to do, and the mark moves to whom to tell.
   * Nothing for a lead the hero never heard of.
   */
  quiet(id: string, note: LeadNote, mark: Lead['mark']): void {
    const l = this.leads.find((x) => x.id === id);
    if (!l || l.done) return;
    if (!l.notes.some((n) => n.text === note.text)) l.notes.push(note);
    l.mark = mark;
  }

  /** A lead's goal reached. */
  fulfil(id: string): void {
    const l = this.leads.find((x) => x.id === id);
    if (l) l.done = true;
  }

  /** A lead that ran its course without the hero (C11): how it ended, and it is closed. Nothing for one never heard of. */
  lapse(id: string, note: LeadNote): void {
    const l = this.leads.find((x) => x.id === id);
    if (l) { this.quiet(id, note, l.mark); this.fulfil(id); }
  }

  get open(): Lead[] { return this.leads.filter((l) => !l.done); }

  /** For the save. */
  entries(): Lead[] { return this.leads.map((l) => ({ ...l, notes: [...l.notes] })); }
}

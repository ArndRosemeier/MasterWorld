/**
 * The journal window (plan 17.1): the open leads, newest first, each with what the player was told and by
 * whom. The journal key (J) opens and closes it; a lead heard since it was last opened is starred. In warded
 * brass (windows.css): a brass-bound book that swings open, the leads write themselves in, and a ward-lit
 * bookmark sits at the newest one.
 */
import type { Journal } from '../talk/journal';
import { el } from './dom';
import { KeyWindow, type WindowHost } from './window';

export class JournalUi extends KeyWindow {
  private readonly body: HTMLDivElement;
  /** Leads already seen in the window. */
  private readonly seen = new Set<string>();

  constructor(private readonly journal: Journal, host: WindowHost) {
    const body = el('div', { className: 'body' });
    super('Journal', 'journal', 'journal', host, body);
    this.body = body;
  }

  protected opened(): void {
    const leads = [...this.journal.open].reverse();
    if (!leads.length) {
      this.body.replaceChildren(el('p', { className: 'hint', textContent: 'No leads yet. Talk to the townsfolk (T): ask whether anything strange has happened lately.' }));
      return;
    }
    this.body.replaceChildren(...leads.map((l, k) => el('div', { className: `lead${this.seen.has(l.id) ? '' : ' new'}${k === 0 ? ' newest' : ''}` },
      el('h4', { textContent: l.title }),
      ...l.notes.map((n) => el('p', {}, `“${n.text}” `, el('span', { className: 'from', textContent: `— ${n.from}` }))),
      el('p', { className: 'from', textContent: `Marked on your map: ${l.mark.label}.` }))));
  }

  protected closed(): void {
    for (const l of this.journal.leads) this.seen.add(l.id);
  }
}

/**
 * The saves window (plan 17): the autosave and three slots, each to save into, load or export as a file,
 * and a file to import. Loading starts the game again from the save (the world is rebuilt from its seed),
 * so it goes through a reload. Opened from the corner's Saves button.
 */
import { loadLocal, saveLocal } from '../persist/local';
import { listSlots, readSlot, writeSlot, type SlotInfo } from '../persist/saves';
import { button, el } from './dom';
import { checkSave, saveLabel, type SaveData } from './saveGame';
import { KeyWindow, type WindowHost } from './window';

export const AUTOSAVE = 'autosave';
const SLOTS = [AUTOSAVE, 'slot 1', 'slot 2', 'slot 3'];
/** The slot to load at the next start (set before the reload). */
const PENDING = 'load';

export interface SavesHost extends WindowHost {
  /** The game as it is now, and where the hero is ("in the town"). */
  capture(): { data: SaveData; where: string };
  readonly setting: { id: string; version: number };
  say(text: string): void;
}

/** The save to start from, if a load was asked for before this start (taken once). */
export async function pendingLoad(setting: { id: string; version: number }): Promise<SaveData | string | null> {
  const slot = loadLocal(PENDING);
  if (typeof slot !== 'string') return null;
  saveLocal(PENDING, null);
  try {
    return checkSave(await readSlot(slot), setting);
  } catch (e) {
    return `could not read the save (${e instanceof Error ? e.message : String(e)})`;
  }
}

/** Starts the game again from a slot: the next start loads it (see pendingLoad). */
export function loadAtRestart(slot: string): void {
  saveLocal(PENDING, slot);
  location.reload();
}

/** The most recent save, if any (for the title's Continue). */
export async function latestSave(): Promise<SlotInfo | null> {
  return (await listSlots()).reduce<SlotInfo | null>((best, s) => (!best || s.at > best.at ? s : best), null);
}

/** Save into a slot now; false if the browser refused. */
export async function saveNow(host: SavesHost, slot: string): Promise<boolean> {
  const { data, where } = host.capture();
  try {
    await writeSlot(slot, saveLabel(data, where), data);
    return true;
  } catch {
    return false;
  }
}

export class SavesUi extends KeyWindow {
  private readonly list: HTMLDivElement;

  constructor(private readonly saves: SavesHost) {
    const list = el('div', { className: 'body saves' });
    const file = el('input', { type: 'file', accept: '.json,application/json' });
    file.style.display = 'none';
    super('Saved games', 'saves', null, saves, list, el('div', { className: 'foot' },
      button('Import a file…', () => file.click()),
      el('span', { className: 'hint', textContent: 'Autosave: every 5 minutes and at every door down or up.' })), file);
    this.list = list;
    file.addEventListener('change', () => void this.importFile(file));
  }

  /** Put the Saves button in the corner (once the menu has made it). */
  dock(): void {
    document.getElementById('corner')?.insertBefore(button('Saves', () => this.setOpen(true)), document.querySelector('#corner button'));
  }

  protected opened(): void { void this.render(); }

  private async render(): Promise<void> {
    const slots = new Map<string, SlotInfo>((await listSlots()).map((s) => [s.slot, s]));
    this.list.replaceChildren(...SLOTS.map((slot) => {
      const s = slots.get(slot);
      return el('div', { className: 'row saverow' },
        el('span', {}, el('b', { textContent: slot === AUTOSAVE ? 'Autosave' : slot.replace(/^s/, 'S') }), el('br'),
          el('span', { className: 'hint', textContent: s ? `${s.label} · saved ${new Date(s.at).toLocaleString()}` : 'empty' })),
        el('span', { className: 'buttons' },
          ...(slot === AUTOSAVE ? [] : [button('Save', () => void this.save(slot))]),
          ...(s ? [button('Load', () => this.load(slot)), button('Export', () => void this.exportSlot(slot))] : [])));
    }));
  }

  private async save(slot: string): Promise<void> {
    this.saves.say(await saveNow(this.saves, slot) ? `Saved to ${slot}.` : 'The browser would not keep the save. Export it to a file instead.');
    await this.render();
  }

  private load(slot: string): void { loadAtRestart(slot); }

  private async exportSlot(slot: string): Promise<void> {
    const data = await readSlot(slot);
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `masterworld-${slot.replace(' ', '-')}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private async importFile(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    let raw: unknown;
    try { raw = JSON.parse(await f.text()); } catch { this.saves.say('That file is not a save.'); return; }
    const s = checkSave(raw, this.saves.setting);
    if (typeof s === 'string') { this.saves.say(`Cannot load it: ${s}.`); return; }
    await writeSlot('imported', saveLabel(s, 'from a file'), s);
    this.load('imported');
  }
}

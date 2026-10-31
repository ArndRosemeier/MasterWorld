/**
 * The saves window (plan 17): the autosave and three slots, each to save into, load or export as a file,
 * and a file to import. Loading starts the game again from the save (the world is rebuilt from its seed),
 * so it goes through a reload. Opened from the corner's Saves button.
 */
import { PENDING_LOAD as PENDING, loadLocal, saveLocal } from '../persist/local';
import { listSlots, readSlot, writeSlot, type SlotInfo } from '../persist/saves';
import { button, el } from './dom';
import { ROGUE_SLOT, checkSave, saveLabel, type SaveData } from './saveGame';
import type { GameMode } from '../game/death';
import { KeyWindow, type WindowHost } from './window';

export const AUTOSAVE = 'autosave';
const SLOTS = [AUTOSAVE, 'slot 1', 'slot 2', 'slot 3'];

export interface SavesHost extends WindowHost {
  /** The game as it is now, and where the hero is ("in the town"). */
  capture(): { data: SaveData; where: string };
  readonly setting: { id: string; version: number };
  say(text: string): void;
  /** Classic, or roguelike: then the game keeps its one save and nothing is saved or loaded by hand. */
  readonly mode: GameMode;
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

/**
 * The most recent save this version can continue, if any (for the title's Continue): one it cannot read, or
 * that `fits` turns down, is passed over (offered, it would only bring the player back to the title).
 */
export async function latestSave(setting: { id: string; version: number }, fits: (s: SaveData) => boolean = () => true): Promise<SlotInfo | null> {
  for (const s of (await listSlots()).sort((a, b) => b.at - a.at)) {
    try {
      const data = checkSave(await readSlot(s.slot), setting);
      if (typeof data === 'object' && fits(data)) return s;
    } catch { /* unreadable: the next one */ }
  }
  return null;
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
  private readonly foot: HTMLDivElement;
  private readonly importer: HTMLInputElement;

  constructor(private readonly saves: SavesHost) {
    const list = el('div', { className: 'body saves' });
    const file = el('input', { type: 'file', accept: '.json,application/json' });
    file.style.display = 'none';
    const foot = el('div', { className: 'foot' });
    super('Saved games', 'saves', null, saves, list, foot, file);
    this.list = list;
    this.foot = foot;
    this.importer = file;
    file.addEventListener('change', () => void this.importFile(file));
  }

  /** Put the Saves button in the corner (once the menu has made it). */
  dock(): void {
    document.getElementById('corner')?.insertBefore(button('Saves', () => this.setOpen(true)), document.querySelector('#corner button'));
  }

  protected opened(): void { void this.render(); }

  private async render(): Promise<void> {
    const slots = new Map<string, SlotInfo>((await listSlots()).map((s) => [s.slot, s]));
    const rogue = this.saves.mode === 'roguelike';
    this.foot.replaceChildren(...(rogue
      ? [el('span', { className: 'hint', textContent: 'A roguelike tale: the game keeps its one save, every minute and at every door. There is no going back.' })]
      : [button('Import a file…', () => this.importer.click()), el('span', { className: 'hint', textContent: 'Autosave: every 5 minutes and at every door down or up.' })]));
    if (rogue) {
      const s = slots.get(ROGUE_SLOT);
      this.list.replaceChildren(el('div', { className: 'row saverow' }, el('span', {}, el('b', { textContent: 'This tale' }), el('br'),
        el('span', { className: 'hint', textContent: s ? `${s.label} · saved ${new Date(s.at).toLocaleString()}` : 'not saved yet' }))));
      return;
    }
    // A roguelike tale kept beside the classic slots: it can be taken up again, never saved into or exported.
    const tale = slots.get(ROGUE_SLOT);
    const shown = tale ? [...SLOTS, ROGUE_SLOT] : SLOTS;
    this.list.replaceChildren(...shown.map((slot) => {
      const s = slots.get(slot);
      if (slot === ROGUE_SLOT && s) {
        return el('div', { className: 'row saverow' },
          el('span', {}, el('b', { textContent: 'Roguelike tale' }), el('br'), el('span', { className: 'hint', textContent: `${s.label} · saved ${new Date(s.at).toLocaleString()}` })),
          el('span', { className: 'buttons' }, button('Take it up', () => this.load(slot))));
      }
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

/**
 * The saves window (plan 17): the autosave and any number of the player's own saves, each to save over, load,
 * export as a file or delete;
 * the game saved straight to a file, and a file to load (the browser's file dialogs where it has them). Loading starts the game again from the save (the world is rebuilt from its seed),
 * so it goes through a reload. Opened from the corner's Saves button.
 */
import { PENDING_LOAD as PENDING, loadLocal, saveLocal } from '../persist/local';
import { deleteSlot, listSlots, readSlot, writeSlot, type SlotInfo } from '../persist/saves';
import { button, el } from './dom';
import { AUTOSAVE, KEPT, ROGUE_SLOT, checkSave, saveLabel, saveName, type SaveData } from './saveGame';
import type { GameMode } from '../game/death';
import { KeyWindow, type WindowHost } from './window';

export { AUTOSAVE };

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

const JSON_TYPE = { description: 'MasterWorld save', accept: { 'application/json': ['.json'] } };
type OpenPicker = (o: object) => Promise<{ getFile(): Promise<File> }[]>;
type SavePicker = (o: object) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;

/**
 * Writes a save as a JSON file: through the browser's save dialog where it has one (the player picks the
 * place and name), else as a download. False if the player closed the dialog.
 */
async function writeFile(data: unknown, name: string): Promise<boolean> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    let handle;
    try { handle = await picker({ suggestedName: name, types: [JSON_TYPE] }); } catch { return false; }
    const out = await handle.createWritable();
    await out.write(blob);
    await out.close();
    return true;
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
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
    const all = await listSlots();
    const slots = new Map<string, SlotInfo>(all.map((s) => [s.slot, s]));
    const when = (s: SlotInfo) => `${s.label} · saved ${new Date(s.at).toLocaleString()}`;
    const row = (title: string, hint: string, ...buttons: HTMLElement[]) => el('div', { className: 'row saverow' },
      el('span', {}, el('b', { textContent: title }), el('br'), el('span', { className: 'hint', textContent: hint })),
      el('span', { className: 'buttons' }, ...buttons));
    if (this.saves.mode === 'roguelike') {
      this.foot.replaceChildren(el('span', { className: 'hint', textContent: 'A roguelike tale: the game keeps its one save, every minute and at every door. There is no going back.' }));
      const s = slots.get(ROGUE_SLOT);
      this.list.replaceChildren(row('This tale', s ? when(s) : 'not saved yet'));
      return;
    }
    // A new save: a name to type (or none: "Save N"), then into the list.
    const name = el('input', { type: 'text', maxLength: 40, spellcheck: false, placeholder: 'Name (optional)', ariaLabel: 'Name of the new save' });
    const make = () => void this.save(saveName(name.value, all.map((s) => s.slot)));
    name.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') make(); });
    this.foot.replaceChildren(
      el('div', { className: 'newsave' }, name, button('New save', make)),
      el('div', { className: 'buttons' }, button('Save to file…', () => void this.saveToFile()), button('Load from file…', () => void this.loadFromFile())),
      el('span', { className: 'hint', textContent: 'Autosave: every 5 minutes and at every door down or up.' }));
    const auto = slots.get(AUTOSAVE);
    const tale = slots.get(ROGUE_SLOT);
    // The player's own saves, newest first.
    const own = all.filter((s) => !KEPT.has(s.slot)).sort((a, b) => b.at - a.at);
    this.list.replaceChildren(
      row('Autosave', auto ? when(auto) : 'empty', ...(auto ? [button('Load', () => this.load(AUTOSAVE)), button('Export', () => void this.exportSlot(AUTOSAVE))] : [])),
      // A roguelike tale kept beside them: it can be taken up again, never saved into or exported.
      ...(tale ? [row('Roguelike tale', when(tale), button('Take it up', () => this.load(ROGUE_SLOT)))] : []),
      ...own.map((s) => row(s.slot.replace(/^./, (c) => c.toUpperCase()), when(s),
        button('Save', () => void this.save(s.slot), { title: 'Save the game as it is now over this one' }),
        button('Load', () => this.load(s.slot)),
        button('Export', () => void this.exportSlot(s.slot)),
        this.deleteButton(s.slot))),
      ...(own.length ? [] : [el('p', { className: 'hint', textContent: 'No saves of your own yet: name one below, or just press New save.' })]));
  }

  /** Delete asks once more on the button itself before the save goes. */
  private deleteButton(slot: string): HTMLButtonElement {
    const b = button('Delete', () => {
      if (b.dataset.sure) { void deleteSlot(slot).then(() => this.render(), () => this.saves.say('The browser would not delete it.')); return; }
      b.dataset.sure = '1';
      b.textContent = 'Sure?';
      setTimeout(() => { delete b.dataset.sure; b.textContent = 'Delete'; }, 3000);
    });
    return b;
  }

  private async save(slot: string): Promise<void> {
    this.saves.say(await saveNow(this.saves, slot) ? `Saved as ${slot}.` : 'The browser would not keep the save. Save it to a file instead.');
    await this.render();
  }

  private load(slot: string): void { loadAtRestart(slot); }

  private async exportSlot(slot: string): Promise<void> {
    await writeFile(await readSlot(slot), `masterworld-${slot.replace(' ', '-')}.json`);
  }

  /** The game as it is now, straight into a file the player picks (the browser's save dialog where it has one). */
  private async saveToFile(): Promise<void> {
    const { data, where } = this.saves.capture();
    const name = `masterworld-${saveLabel(data, where).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'save'}.json`;
    try {
      if (await writeFile(data, name)) this.saves.say('Saved to a file.');
    } catch {
      this.saves.say('The file could not be written.');
    }
  }

  /** A save file the player picks (the browser's open dialog where it has one, else the file input). */
  private async loadFromFile(): Promise<void> {
    const picker = (window as unknown as { showOpenFilePicker?: OpenPicker }).showOpenFilePicker;
    if (!picker) { this.importer.click(); return; }
    let file: File;
    try {
      const [handle] = await picker({ types: [JSON_TYPE], multiple: false });
      file = await handle.getFile();
    } catch { return; /* closed without a file */ }
    await this.loadFile(file);
  }

  private async importFile(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (f) await this.loadFile(f);
  }

  private async loadFile(f: File): Promise<void> {
    let raw: unknown;
    try { raw = JSON.parse(await f.text()); } catch { this.saves.say('That file is not a save.'); return; }
    const s = checkSave(raw, this.saves.setting);
    if (typeof s === 'string') { this.saves.say(`Cannot load it: ${s}.`); return; }
    const slot = saveName(f.name.replace(/\.json$/i, ''), (await listSlots()).map((x) => x.slot));
    await writeSlot(slot, saveLabel(s, 'from a file'), s);
    this.load(slot);
  }
}

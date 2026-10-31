/**
 * Saved games (plan 17): slots in the browser's IndexedDB, and files to export and import. A save is plain
 * data (see app/saveGame.ts for what is in it). IndexedDB can be missing or refuse (private windows): then
 * the slots stay empty and saving reports that it failed, and export to a file still works.
 */

const DB = 'masterworld';
const STORE = 'saves';

/** What a slot list shows without loading the whole save. */
export interface SlotInfo {
  readonly slot: string;
  /** Real time of the save (ms since 1970). */
  readonly at: number;
  /** A line about where and when in the game ("Day 2, 14:30, in the town"). */
  readonly label: string;
}

interface Row { slot: string; at: number; label: string; data: unknown }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB here')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'slot' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
    });
  } finally {
    db.close();
  }
}

export async function writeSlot(slot: string, label: string, data: unknown): Promise<void> {
  await withStore('readwrite', (s) => s.put({ slot, at: Date.now(), label, data } satisfies Row));
}

export async function readSlot(slot: string): Promise<unknown> {
  const row = await withStore<Row | undefined>('readonly', (s) => s.get(slot));
  return row?.data ?? null;
}

export async function listSlots(): Promise<SlotInfo[]> {
  try {
    const rows = await withStore<Row[]>('readonly', (s) => s.getAll());
    return rows.map(({ slot, at, label }) => ({ slot, at, label }));
  } catch {
    return [];
  }
}

export async function deleteSlot(slot: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(slot));
}

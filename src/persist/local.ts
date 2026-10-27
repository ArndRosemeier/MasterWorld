/**
 * Small values kept in this browser (settings). Storage can be missing or refuse (private windows,
 * blocked site data): then reads give null and writes are dropped, and the game runs on its defaults.
 */
const PREFIX = 'masterworld.';

/** The save slot to load at the next start (set by Continue and Load just before the page restarts). */
export const PENDING_LOAD = 'load';

export function loadLocal(key: string): unknown {
  try {
    const s = globalThis.localStorage?.getItem(PREFIX + key);
    return s ? (JSON.parse(s) as unknown) : null;
  } catch {
    return null;
  }
}

export function saveLocal(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not kept; the setting still holds until the page closes.
  }
}

/**
 * The action bar (plan 17.1): ten slots, keys 1 to 0, each holding one thing the hero can do (an ability's
 * id, or the potion's quick slot) or nothing. The player arranges it (the ability book drags onto it, slots
 * swap or are cleared); a new ability goes into the first free slot. Pure: saved with the hero.
 */

/** How many slots the bar has. */
export const BAR_SLOTS = 10;

/** The potion's quick slot: not an ability, but on the bar like one. */
export const POTION = 'potion';

/** Sit down to rest (or stand up again): not an ability either, but on the bar like one. */
export const REST = 'rest';

/** What every hero can put on the bar besides their abilities, in the bar's order. */
export const BAR_EXTRAS: readonly string[] = [POTION, REST];

/** What each slot holds (null: empty), always BAR_SLOTS long. */
export type Bar = readonly (string | null)[];

/** A fresh hero's bar: what they know, in order, the potion and resting after the abilities. */
export function defaultBar(known: readonly string[]): Bar {
  const out: (string | null)[] = [...known.filter((id) => !BAR_EXTRAS.includes(id)), ...BAR_EXTRAS].slice(0, BAR_SLOTS);
  while (out.length < BAR_SLOTS) out.push(null);
  return out;
}

/**
 * A bar read back from a save: unknown or doubled entries dropped, its length fixed; none saved (an older
 * save) gives the default bar.
 */
export function cleanBar(raw: unknown, known: readonly string[]): Bar {
  if (!Array.isArray(raw)) return defaultBar(known);
  const ok = new Set([...known, ...BAR_EXTRAS]), seen = new Set<string>();
  const out: (string | null)[] = [];
  for (let i = 0; i < BAR_SLOTS; i++) {
    const v = raw[i];
    if (typeof v === 'string' && ok.has(v) && !seen.has(v)) { out.push(v); seen.add(v); } else out.push(null);
  }
  return out;
}

/** `id` put into `slot`; where it was before (if on the bar) gets what the slot held: a swap. */
export function placeOnBar(bar: Bar, slot: number, id: string): Bar {
  if (slot < 0 || slot >= BAR_SLOTS) return bar;
  const out = [...bar];
  const was = out.indexOf(id);
  if (was >= 0) out[was] = out[slot];
  out[slot] = id;
  return out;
}

/** Two slots swapped. */
export function swapOnBar(bar: Bar, a: number, b: number): Bar {
  if (a < 0 || b < 0 || a >= BAR_SLOTS || b >= BAR_SLOTS) return bar;
  const out = [...bar];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** A slot emptied. */
export function clearSlot(bar: Bar, slot: number): Bar {
  if (slot < 0 || slot >= BAR_SLOTS) return bar;
  const out = [...bar];
  out[slot] = null;
  return out;
}

/** `id` into the first free slot, unless it is on the bar already or the bar is full. */
export function addToBar(bar: Bar, id: string): Bar {
  if (bar.includes(id)) return bar;
  const free = bar.indexOf(null);
  return free < 0 ? bar : placeOnBar(bar, free, id);
}

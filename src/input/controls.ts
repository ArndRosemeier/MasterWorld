/**
 * The player's keys: which key does what (rebindable in the settings), which actions are held, and
 * autorun. Plain data fed with `KeyboardEvent.code`s, so it is tested without a browser.
 *
 * Autorun works as in WoW: its key toggles running forward; the forward or back key, or the autorun key
 * again, stops it.
 */

export const ACTIONS = [
  { id: 'forward', label: 'Move forward' },
  { id: 'back', label: 'Move back' },
  { id: 'turnLeft', label: 'Turn left' },
  { id: 'turnRight', label: 'Turn right' },
  { id: 'strafeLeft', label: 'Strafe left' },
  { id: 'strafeRight', label: 'Strafe right' },
  { id: 'autorun', label: 'Autorun' },
  { id: 'walk', label: 'Walk (hold)' },
  { id: 'jump', label: 'Jump / swim up' },
  { id: 'dive', label: 'Sit down to rest / dive' },
  { id: 'mount', label: 'Mount / dismount' },
  { id: 'fly', label: 'Fly (free camera, debug: ?fly or the debug menu)' },
  { id: 'talk', label: 'Talk to someone' },
  { id: 'journal', label: 'Journal' },
  { id: 'map', label: 'Map' },
  { id: 'pack', label: 'Pack and level' },
  { id: 'target', label: 'Next target' },
  { id: 'bar1', label: 'Action bar 1' },
  { id: 'bar2', label: 'Action bar 2' },
  { id: 'bar3', label: 'Action bar 3' },
  { id: 'bar4', label: 'Action bar 4' },
  { id: 'bar5', label: 'Action bar 5' },
  { id: 'bar6', label: 'Action bar 6' },
  { id: 'bar7', label: 'Action bar 7' },
  { id: 'bar8', label: 'Action bar 8' },
  { id: 'bar9', label: 'Action bar 9' },
  { id: 'bar10', label: 'Action bar 10' },
  { id: 'book', label: 'Abilities (arrange the bar)' },
  { id: 'search', label: 'Search, open, take' },
  { id: 'use', label: 'Use: climb down a hatch, up a ladder' },
  { id: 'vgm', label: 'The game master (for building the game)' },
] as const;

export type Action = (typeof ACTIONS)[number]['id'];

/** The action bar's slot keys, slot 0 first. */
export const BAR_KEYS = ['bar1', 'bar2', 'bar3', 'bar4', 'bar5', 'bar6', 'bar7', 'bar8', 'bar9', 'bar10'] as const satisfies readonly Action[];

/** The bar slot `code` uses (−1: none). */
export function barSlotOf(b: Bindings, code: string): number {
  return code === '' ? -1 : BAR_KEYS.findIndex((a) => b[a].includes(code));
}

/** Up to two keys per action (`KeyboardEvent.code`s; '' is a free slot). */
export type Bindings = Record<Action, [string, string]>;

export const DEFAULT_BINDINGS: Bindings = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  strafeLeft: ['KeyQ', ''],
  strafeRight: ['KeyE', ''],
  autorun: ['KeyR', 'NumLock'],
  walk: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space', ''],
  dive: ['KeyX', ''],
  mount: ['KeyH', ''],
  fly: ['KeyF', ''],
  talk: ['KeyT', ''],
  journal: ['KeyJ', ''],
  map: ['KeyM', ''],
  pack: ['KeyI', ''],
  target: ['Tab', ''],
  bar1: ['Digit1', ''],
  bar2: ['Digit2', ''],
  bar3: ['Digit3', ''],
  bar4: ['Digit4', ''],
  bar5: ['Digit5', ''],
  bar6: ['Digit6', ''],
  bar7: ['Digit7', ''],
  bar8: ['Digit8', ''],
  bar9: ['Digit9', ''],
  bar10: ['Digit0', ''],
  book: ['KeyK', ''],
  search: ['KeyG', ''],
  // E also strafes right: it uses only what is there to use (a hatch at one's feet, a ladder in front).
  use: ['KeyE', ''],
  vgm: ['F9', ''],
};

/** Keys that are never bound: Escape opens the settings. */
export const RESERVED_KEYS = new Set(['Escape']);

/** A copy of `b` with `code` on `action`'s `slot`, taken off whatever action had it before. */
export function bind(b: Bindings, action: Action, slot: 0 | 1, code: string): Bindings {
  const out = Object.fromEntries(Object.entries(b).map(([a, keys]) => [a, keys.map((k) => (code && k === code ? '' : k))])) as Bindings;
  out[action][slot] = code;
  return out;
}

/** Bindings read back from storage: unknown actions dropped, missing ones and bad keys from the defaults. */
export function cleanBindings(raw: unknown): Bindings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as Bindings;
  for (const { id } of ACTIONS) {
    const k = src[id];
    const ok = Array.isArray(k) && k.length === 2 && k.every((c) => typeof c === 'string' && c.length < 40 && !RESERVED_KEYS.has(c));
    out[id] = ok ? [k[0] as string, k[1] as string] : [...DEFAULT_BINDINGS[id]];
  }
  return out;
}

export class Controls {
  private readonly down = new Set<string>();
  /** Running forward on its own (the autorun key). */
  autorun = false;

  constructor(public bindings: Bindings = DEFAULT_BINDINGS) {}

  /** A key went down (not a repeat). */
  press(code: string): void {
    this.down.add(code);
    if (this.bindings.autorun.includes(code)) this.autorun = !this.autorun;
    else if (this.bindings.forward.includes(code) || this.bindings.back.includes(code)) this.autorun = false;
  }

  release(code: string): void {
    this.down.delete(code);
  }

  /** Let go of everything (the window lost focus, or a dialog opened); autorun keeps going. */
  clear(): void {
    this.down.clear();
  }

  held(action: Action): boolean {
    const [a, b] = this.bindings[action];
    return (a !== '' && this.down.has(a)) || (b !== '' && this.down.has(b));
  }

  /** −1, 0 or +1 from a pair of opposite actions. */
  axis(minus: Action, plus: Action): number {
    return (this.held(plus) ? 1 : 0) - (this.held(minus) ? 1 : 0);
  }
}

const NAMED: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', NumLock: 'Num Lock',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', MetaLeft: 'Left Meta', MetaRight: 'Right Meta', Enter: 'Enter', Tab: 'Tab',
  Backspace: 'Backspace', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Backslash: '\\', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};

/**
 * What a key is called, for the settings (`layout`: the keyboard's own letters, where the browser tells
 * them, so a German keyboard shows Z where it is).
 */
export function keyLabel(code: string, layout?: ReadonlyMap<string, string>): string {
  if (code === '') return '';
  const own = layout?.get(code);
  if (own && own.trim()) return own.length === 1 ? own.toUpperCase() : own;
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/**
 * The player's settings, kept in this browser. URL flags (`?gl`, `?hud`, `trees=0`, `day=`) still win
 * for the session they are given in, so links and screenshots look the same everywhere.
 */
import { clamp } from '@futuremagic/core';
import { cleanBindings, DEFAULT_BINDINGS, type Bindings } from '../input/controls';
import { loadLocal, saveLocal } from '../persist/local';
import { params } from './params';
import { PACING, type Pacing } from '../vgm/vgmLog';

export interface Settings {
  /** Mouse look speed, times the default. */
  mouseSpeed: number;
  invertMouse: boolean;
  bindings: Bindings;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Rendered pixels per screen pixel, times the screen's own (lower is faster). */
  renderScale: number;
  /** Trees and grass (the next start: their shaders are built while loading). */
  trees: boolean;
  grass: boolean;
  /** Draw with WebGL 2 even where WebGPU exists (the next start). */
  webgl: boolean;
  /** The frame time line in the corner. */
  hud: boolean;
  /** Real minutes per game day; 0 stops the clock. */
  /** Real minutes a game day takes (D37: 60; 0 stops the clock). Was `dayMinutes`, stopped by default: renamed so old saves start with the game's day. */
  dayLength: number;
  /** All sound, 0..1 (the master volume). */
  volume: number;
  /** Each kind of sound under the master, 0..1 (the engine's buses: music, the world around, your own body, menus). */
  musicVolume: number;
  worldVolume: number;
  bodyVolume: number;
  uiVolume: number;
  /** All sound off, the levels kept (the title's Sound on/off). */
  muted: boolean;
  /** Calm motion: the title shows its still picture and windows open without their show (plan 17.1). */
  calm: boolean;
  /** How eventful the game master makes the world (D53: the one place the VGM shows; vgm/vgmLog.ts PACING). */
  pacing: Pacing;
  /** A developer's aid (D53 keeps the VGM out of play): each move of the VGM shown as a brass slip on screen. On while the game is built. */
  vgmAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mouseSpeed: 1,
  invertMouse: false,
  bindings: DEFAULT_BINDINGS,
  fov: 55,
  renderScale: 1,
  trees: true,
  grass: true,
  webgl: false,
  hud: false,
  dayLength: 60,
  volume: 0.8,
  musicVolume: 1,
  worldVolume: 1,
  bodyVolume: 1,
  uiVolume: 1,
  muted: false,
  calm: false,
  pacing: 'normal',
  vgmAlerts: true,
};

/** The ranges the dialog offers (and stored values are held to). */
export const RANGES = {
  mouseSpeed: [0.25, 3],
  fov: [40, 90],
  renderScale: [0.5, 1],
  dayLength: [0, 120],
  volume: [0, 1],
  musicVolume: [0, 1],
  worldVolume: [0, 1],
  bodyVolume: [0, 1],
  uiVolume: [0, 1],
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

/** Settings read back from storage (or anything else): every field checked, the rest from the defaults. */
export function cleanSettings(raw: unknown): Settings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (k: keyof typeof RANGES): number => {
    const v = s[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, RANGES[k][0], RANGES[k][1]) : DEFAULT_SETTINGS[k];
  };
  const flag = (k: 'invertMouse' | 'trees' | 'grass' | 'webgl' | 'hud' | 'calm' | 'muted' | 'vgmAlerts'): boolean => (typeof s[k] === 'boolean' ? (s[k] as boolean) : DEFAULT_SETTINGS[k]);
  return {
    mouseSpeed: num('mouseSpeed'),
    invertMouse: flag('invertMouse'),
    bindings: cleanBindings(s.bindings),
    fov: num('fov'),
    renderScale: num('renderScale'),
    trees: flag('trees'),
    grass: flag('grass'),
    webgl: flag('webgl'),
    hud: flag('hud'),
    dayLength: num('dayLength'),
    volume: num('volume'),
    musicVolume: num('musicVolume'),
    worldVolume: num('worldVolume'),
    bodyVolume: num('bodyVolume'),
    uiVolume: num('uiVolume'),
    muted: flag('muted'),
    calm: flag('calm'),
    pacing: typeof s.pacing === 'string' && s.pacing in PACING ? (s.pacing as Pacing) : DEFAULT_SETTINGS.pacing,
    vgmAlerts: flag('vgmAlerts'),
  };
}

const KEY = 'settings';

/** The settings, and who wants to hear when they change. */
export class SettingsStore {
  private value: Settings = cleanSettings(loadLocal(KEY));
  private readonly listeners = new Set<(s: Settings) => void>();

  get current(): Readonly<Settings> { return this.value; }

  set(change: Partial<Settings>): void {
    this.value = cleanSettings({ ...this.value, ...change });
    saveLocal(KEY, this.value);
    for (const f of this.listeners) f(this.value);
  }

  reset(): void { this.set(DEFAULT_SETTINGS); }

  /** Called now and on every change. */
  watch(f: (s: Settings) => void): void {
    this.listeners.add(f);
    f(this.value);
  }

  /** What this start uses, with the URL's flags over the stored ones. */
  get start(): { webgl: boolean; trees: boolean; grass: boolean; dayMinutes: number } {
    return {
      webgl: params.gl || this.value.webgl,
      trees: params.trees && this.value.trees,
      grass: params.grass && this.value.grass,
      dayMinutes: params.dayMinutes ?? this.value.dayLength,
    };
  }
}

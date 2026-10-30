/**
 * The weather (pure, deterministic): what the sky does at a place and a moment, from the seed, the
 * setting's climate and the VGM's orders. No three.js, so tests, workers, NPCs and the VGM read the same
 * weather the renderer draws.
 *
 * Natural weather is a slowly changing field of "wet air" that drifts with the prevailing wind, so
 * fronts come in from one side, pass over and clear again. Where it is wet enough the sky clouds over,
 * then it rains (snow where it is cold), and where rain meets unstable air thunderstorms grow. Calm, damp
 * mornings bring mist to the low ground. The ground stays wet for hours after rain.
 *
 * The VGM drives the weather with orders (`WeatherOrder`: a kind of weather, a time span, optionally a
 * place). An order blends the natural weather towards its kind and back again, so even a summoned storm
 * rolls in instead of switching on. Orders are plain data: they go into the decision log with the rest.
 */
import { Noise, clamp, deriveSeed, hash2f, lerp, smoothstep, Rng } from '@futuremagic/core';
import type { WeatherDef } from '../setting/contract';
import { LAPSE } from './skeleton';

export interface WeatherState {
  /** Cloud cover 0..1. */
  cover: number;
  /** Cloud opacity 0..1. */
  density: number;
  /** Storm darkness of the clouds 0..1. */
  dark: number;
  /** Direct sunlight left 0..1. */
  sun: number;
  /** Haze and fog over everything 0..1 (1: a few dozen metres of sight). */
  fog: number;
  /** Mist lying in the low ground 0..1. */
  mist: number;
  /** Precipitation 0..1 (drizzle .. downpour). */
  rain: number;
  /** Share of it that falls as snow 0..1. */
  snow: number;
  /** Wind 0 calm .. 1 gale. */
  wind: number;
  /** Where the wind blows to, radians in the xz plane (x = cos, z = sin). */
  windDir: number;
  /** Thunderstorm 0..1: how often lightning strikes. */
  storm: number;
  /** Wet ground 0..1: rises with rain, dries over hours. */
  wet: number;
  /** Snow lying on the ground 0..1: from recent snowfall, melting over hours. */
  lying: number;
  /**
   * Fresh snow by height, for drawing the land far below or above this spot: up to `snowCover` (0..1) lies
   * where it is cold enough, half of it at `snowLine` (m), and the share runs from none to all over
   * 2 * SNOW_BAND around it. The air is colder up high (LAPSE), so a peak can be snowed in while the
   * valley it looks down on is green.
   */
  snowCover: number;
  snowLine: number;
}

/** The kinds of weather the VGM can order (and a URL can ask for). */
export const WEATHER_KINDS = ['clear', 'fair', 'overcast', 'rain', 'storm', 'fog', 'snow'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

type Preset = Omit<WeatherState, 'windDir' | 'wet' | 'lying' | 'snow' | 'snowCover' | 'snowLine'> & { snow?: number };

/** What each kind looks like at its height. Snow follows the temperature unless a kind sets it. */
export const PRESETS: Readonly<Record<WeatherKind, Readonly<Preset>>> = {
  clear: { cover: 0.08, density: 0.35, dark: 0, sun: 1, fog: 0, mist: 0, rain: 0, wind: 0.2, storm: 0 },
  fair: { cover: 0.42, density: 0.5, dark: 0, sun: 1, fog: 0.02, mist: 0, rain: 0, wind: 0.3, storm: 0 },
  overcast: { cover: 0.92, density: 0.8, dark: 0.25, sun: 0.25, fog: 0.12, mist: 0, rain: 0, wind: 0.4, storm: 0 },
  rain: { cover: 1, density: 0.9, dark: 0.45, sun: 0.1, fog: 0.25, mist: 0.15, rain: 0.65, wind: 0.5, storm: 0 },
  storm: { cover: 1, density: 1, dark: 0.85, sun: 0.04, fog: 0.3, mist: 0.1, rain: 1, wind: 0.9, storm: 1 },
  fog: { cover: 0.9, density: 0.6, dark: 0.1, sun: 0.3, fog: 0.75, mist: 1, rain: 0, wind: 0.05, storm: 0 },
  snow: { cover: 1, density: 0.85, dark: 0.3, sun: 0.15, fog: 0.35, mist: 0.1, rain: 0.6, wind: 0.35, storm: 0, snow: 1 },
};

/** An order from the VGM: this weather from `from` to `to` (absolute game hours), here or everywhere. */
export interface WeatherOrder {
  readonly kind: WeatherKind;
  readonly from: number;
  readonly to: number;
  /** Hours it takes to roll in and to clear (default 0.75). */
  readonly ramp?: number;
  /** Where (metres); absent: everywhere. The order fades out over the outer third of the radius. */
  readonly at?: { readonly x: number; readonly z: number; readonly radius: number };
  /** How far towards the kind, 0..1 (default 1). */
  readonly strength?: number;
}

/**
 * The climate at a place: what the skeleton says (mean annual temperature °C, moisture 0..1), and the
 * height (m) the temperature is for (absent: sea level).
 */
export interface Climate { temperature: number; moisture: number; elevation?: number }

/** Half the height band (m) over which falling snow turns from none to all: 1.25 °C of air either side. */
export const SNOW_BAND = 1.25 / LAPSE;
/** The snow line when no snow lies anywhere (m): above every peak. */
const NO_SNOW_LINE = 9000;

/**
 * One moment of the ground's memory, for the snow by height: how much it fell (0..1, faded by age), the
 * air's temperature at sea level then (°C) and how the VGM's orders bent the snow share (share * a + b).
 */
interface SnowFit { fell: number; t: number; a: number; b: number }

/** Hours of past rain that wet ground remembers, and the step between the samples. */
const MEMORY = 6, MEMORY_STEP = 0.5;
/** Climate is looked up on a lattice this far apart (m) and cached; it changes over kilometres. */
const CLIMATE_CELL = 512;

export class Weather {
  private readonly air: Noise;
  private readonly gusts: Noise;
  /** Where the wind usually blows to (radians); the sea's swell runs this way. */
  readonly prevailing: number;
  private readonly orders: WeatherOrder[] = [];
  private readonly climates = new Map<string, Climate>();
  private readonly fits: SnowFit[] = Array.from({ length: MEMORY / MEMORY_STEP + 1 }, () => ({ fell: 0, t: 0, a: 1, b: 0 }));

  constructor(readonly seed: number, readonly def: WeatherDef, private readonly climateAt: (x: number, z: number) => Climate) {
    this.air = new Noise(deriveSeed(seed, 'weather', 'air'));
    this.gusts = new Noise(deriveSeed(seed, 'weather', 'gusts'));
    this.prevailing = prevailingWind(seed);
  }

  /** The VGM's orders, oldest first. */
  get ordered(): readonly WeatherOrder[] { return this.orders; }

  /** Adds an order; later orders blend on top of earlier ones. */
  order(o: WeatherOrder): void {
    if (!(o.to > o.from)) throw new Error(`weather order "${o.kind}" ends before it starts`);
    if (!WEATHER_KINDS.includes(o.kind)) throw new Error(`weather kind "${o.kind}" is unknown`);
    this.orders.push(o);
  }

  /** Withdraws every order still holding at `hours`: the natural weather is back at once (the ground stays wet). */
  cancel(hours: number): void {
    for (let i = 0; i < this.orders.length; i++) {
      const o = this.orders[i], ramp = o.ramp ?? 0.75;
      if (o.to + ramp > hours) this.orders[i] = { ...o, to: hours - ramp };
    }
  }

  /** Forgets orders that ended before `hours` (they no longer change anything, the ground has dried). */
  forget(hours: number): void {
    for (let i = this.orders.length - 1; i >= 0; i--) if (this.orders[i].to + (this.orders[i].ramp ?? 0.75) + MEMORY < hours) this.orders.splice(i, 1);
  }

  /** The weather at world (x, z) at `hours` (absolute game time: day * 24 + hour of the day). */
  state(x: number, z: number, hours: number, out: WeatherState = calm()): WeatherState {
    const fits = this.fits;
    this.now(x, z, hours, out, fits[0]);
    fits[0].fell = Math.min(1, out.rain * 2);
    // Wet ground: the strongest recent rain, fading as it dries (snow lies dry here).
    let wet = out.rain * (1 - out.snow), lying = out.rain * out.snow;
    const s = calm();
    for (let k = 1; k < fits.length; k++) {
      const ago = k * MEMORY_STEP;
      this.now(x, z, hours - ago, s, fits[k]);
      // Older than the memory counts for nothing; fade towards it so nothing snaps away.
      const keep = smoothstep(MEMORY, MEMORY * 0.6, ago);
      wet = Math.max(wet, Math.min(1, s.rain * 1.6) * (1 - s.snow) * Math.exp(-ago / this.def.drying) * keep);
      fits[k].fell = Math.min(1, s.rain * 2) * Math.exp(-ago / (this.def.drying * 3)) * keep;
      lying = Math.max(lying, fits[k].fell * s.snow);
    }
    out.wet = clamp(wet, 0, 1);
    out.lying = clamp(Math.max(lying, fits[0].fell * out.snow), 0, 1);
    snowByHeight(fits, out);
    return out;
  }

  /** The weather at a moment, without the ground's memory. */
  private now(x: number, z: number, hours: number, out: WeatherState, fit?: SnowFit): void {
    this.natural(x, z, hours, out, fit);
    let a = 1, b = 0;
    for (const o of this.orders) {
      const w = orderWeight(o, x, z, hours);
      if (w <= 0) continue;
      const p = PRESETS[o.kind];
      blendTowards(out, p, w);
      // The order bends the snow share the same at every height: share * (1 - w) + snow * w.
      if (p.snow !== undefined) { a *= 1 - w; b = lerp(b, p.snow, w); }
    }
    if (fit) { fit.a = a; fit.b = b; }
  }

  private natural(x: number, z: number, hours: number, out: WeatherState, fit?: SnowFit): void {
    const d = this.def, c = this.climate(x, z);
    // The air mass drifts with the prevailing wind and changes as it goes.
    const px = x - Math.cos(this.prevailing) * d.frontSpeed * hours, pz = z - Math.sin(this.prevailing) * d.frontSpeed * hours;
    const f = this.air.fbm3(px / d.frontSize, pz / d.frontSize, hours / d.change, 2, 2.3, 0.4);
    const wetAir = clamp(0.5 + f * 1.15 + (c.moisture - 0.5) * 0.35 + (d.rainfall - 0.5) * 0.4, 0, 1);
    // Unstable air: where showers turn to thunderstorms.
    const unstable = this.air.fbm3(px / (d.frontSize * 0.4) + 71.3, pz / (d.frontSize * 0.4) - 12.9, hours / (d.change * 0.5), 2) * 0.5 + 0.5;
    const hour = ((hours % 24) + 24) % 24;
    const gust = this.gusts.fbm2(hours / 3 + 5.5, 0.37, 2);

    out.cover = smoothstep(0.05, 0.8, wetAir);
    out.rain = smoothstep(0.66, 0.9, wetAir);
    out.storm = out.rain * smoothstep(0.75, 0.95, unstable + d.storms * 0.25);
    out.density = lerp(0.4, 0.95, out.cover);
    out.dark = clamp(out.storm * 0.85 + out.rain * 0.35 + smoothstep(0.7, 1, out.cover) * 0.1, 0, 1);
    out.sun = clamp(1 - smoothstep(0.5, 1, out.cover) * 0.88 - out.storm * 0.08, 0, 1);
    out.wind = clamp(0.12 + d.windiness * 0.3 + gust * 0.22 + out.rain * 0.2 + out.storm * 0.4, 0, 1);
    out.windDir = this.prevailing + this.gusts.fbm2(hours / d.change + 31.7, 8.1, 2) * 0.9;
    // Mist: damp, calm air in the hours around dawn (a little at dusk), not while it rains.
    const dawn = Math.exp(-(((hour - 6.5) / 2.2) ** 2)) + 0.35 * Math.exp(-(((hour - 20.5) / 1.8) ** 2));
    const damp = smoothstep(0.25, 0.65, wetAir + c.moisture * 0.2);
    const misty = smoothstep(0.35, 0.8, this.gusts.fbm2(hours / 24 + 0.71, 17.3, 2) * 0.5 + 0.5 + (d.mist - 0.5) * 0.6);
    out.mist = clamp(dawn * damp * misty * (1 - out.wind) ** 2 * 1.6 * (1 - out.rain), 0, 1) + out.rain * 0.12;
    out.fog = clamp(out.mist * 0.35 + out.rain * 0.22 + out.cover * 0.04, 0, 1);
    // Snow where it is cold: the mean temperature, colder at night, and rain cools the air.
    const daily = -Math.cos(((hour - 3) / 24) * Math.PI * 2) * 4;
    const air = c.temperature + daily - out.rain * 2;
    out.snow = snowShare(air);
    if (fit) fit.t = air + (c.elevation ?? 0) * LAPSE;
    out.wet = 0;
    out.lying = 0;
  }

  private climate(x: number, z: number): Climate {
    const i = Math.round(x / CLIMATE_CELL), j = Math.round(z / CLIMATE_CELL), key = `${i},${j}`;
    let c = this.climates.get(key);
    if (!c) {
      if (this.climates.size > 4096) this.climates.clear();
      const got = this.climateAt(i * CLIMATE_CELL, j * CLIMATE_CELL);
      c = { temperature: got.temperature, moisture: got.moisture, elevation: got.elevation ?? 0 };
      this.climates.set(key, c);
    }
    return c;
  }
}

/** Fresh snow lying on ground at height `y` (m), 0..1: what the shaders draw (render/materials/weather.ts freshSnowAt). */
export function freshSnow(s: Readonly<WeatherState>, y: number): number {
  return s.snowCover * smoothstep(s.snowLine - SNOW_BAND, s.snowLine + SNOW_BAND, y);
}

/** The share of precipitation that falls as snow at an air temperature (°C). */
const snowShare = (t: number): number => smoothstep(1.5, -1, t);

/**
 * The fresh snow by height from the ground's memory: lying at height h is the most any recent snowfall left
 * there (max over the moments of fell * share at h's temperature). That rises with height, so it is found as
 * the most it can be (`snowCover`, on the coldest peaks) and the height where half of that lies (`snowLine`).
 */
function snowByHeight(fits: readonly SnowFit[], out: WeatherState): void {
  const lyingAt = (h: number): number => {
    let most = 0;
    for (const f of fits) if (f.fell > 0) most = Math.max(most, f.fell * (snowShare(f.t - h * LAPSE) * f.a + f.b));
    return most;
  };
  const top = lyingAt(NO_SNOW_LINE);
  out.snowCover = clamp(top, 0, 1);
  if (top < 1e-3) { out.snowLine = NO_SNOW_LINE; return; }
  let lo = -1000, hi = NO_SNOW_LINE;
  if (lyingAt(lo) >= top * 0.5) { out.snowLine = lo; return; }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (lyingAt(mid) >= top * 0.5) hi = mid; else lo = mid;
  }
  out.snowLine = (lo + hi) / 2;
}

/** The prevailing wind of a world (radians): the same for the swell, the clouds and the weather. */
export function prevailingWind(seed: number): number {
  return new Rng(deriveSeed(seed, 'wind')).float() * Math.PI * 2;
}

const CALM: Readonly<WeatherState> = { cover: 0, density: 0, dark: 0, sun: 1, fog: 0, mist: 0, rain: 0, snow: 0, wind: 0, windDir: 0, storm: 0, wet: 0, lying: 0, snowCover: 0, snowLine: NO_SNOW_LINE };

/** A still, cloudless moment (a state to fill). */
export const calm = (): WeatherState => ({ ...CALM });

/** How much an order holds at a place and time, 0..1. */
export function orderWeight(o: WeatherOrder, x: number, z: number, hours: number): number {
  const ramp = Math.max(1e-3, o.ramp ?? 0.75);
  let w = smoothstep(o.from - ramp, o.from, hours) * (1 - smoothstep(o.to, o.to + ramp, hours));
  if (o.at) w *= 1 - smoothstep(o.at.radius * 0.66, o.at.radius, Math.hypot(x - o.at.x, z - o.at.z));
  return w * clamp(o.strength ?? 1, 0, 1);
}

/** Moves `s` a share `w` of the way towards a preset (the wind keeps its direction). */
export function blendTowards(s: WeatherState, p: Readonly<Preset>, w: number): void {
  s.cover = lerp(s.cover, p.cover, w);
  s.density = lerp(s.density, p.density, w);
  s.dark = lerp(s.dark, p.dark, w);
  s.sun = lerp(s.sun, p.sun, w);
  s.fog = lerp(s.fog, p.fog, w);
  s.mist = lerp(s.mist, p.mist, w);
  s.rain = lerp(s.rain, p.rain, w);
  s.wind = lerp(s.wind, p.wind, w);
  s.storm = lerp(s.storm, p.storm, w);
  if (p.snow !== undefined) s.snow = lerp(s.snow, p.snow, w);
}

/** A lightning flash: 0 dark .. 1 the brightest moment, and the bearing it lights from (radians). */
export interface Flash { light: number; bearing: number }

/** Slot length (s): at most one strike per slot. */
const STRIKE_SLOT = 0.9;

/**
 * Lightning at `seconds` (real time since start) in a storm of strength `storm`: deterministic from the
 * seed, so a replay flashes the same. A strike is a quick double or triple flicker.
 */
export function lightning(seed: number, seconds: number, storm: number, out: Flash = { light: 0, bearing: 0 }): Flash {
  out.light = 0;
  if (storm <= 0) return out;
  const slot = Math.floor(seconds / STRIKE_SLOT);
  // A strike every ~15 s in a full storm, rarer at its edge.
  if (hash2f(seed, slot, 1) >= storm * storm * 0.06) return out;
  const t = seconds - slot * STRIKE_SLOT;
  const pulses = 1 + Math.floor(hash2f(seed, slot, 2) * 3);
  for (let p = 0; p < pulses; p++) {
    const at = p * (0.09 + hash2f(seed, slot, 3 + p) * 0.12), dt = t - at;
    if (dt >= 0) out.light = Math.max(out.light, Math.exp(-dt * 16) * (p === 0 ? 1 : 0.55 + 0.45 * hash2f(seed, slot, 9 + p)));
  }
  out.light *= 0.45 + 0.55 * hash2f(seed, slot, 7);
  out.bearing = hash2f(seed, slot, 8) * Math.PI * 2;
  return out;
}

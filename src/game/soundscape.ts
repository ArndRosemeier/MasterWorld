/**
 * What the player hears (plan 16, D44), decided as numbers (pure, so it runs in tests): the ambience beds and how
 * loud each is, the echo and muffling, the music's mood, and the ground under a footstep. The game samples the world
 * round the listener a few times a second into a `Hearing`; `src/app/soundDirector.ts` plays the result.
 */
import { clamp, smoothstep } from '@futuremagic/core';

/** Where the listener is. */
export type Place = 'land' | 'room' | 'cellar';

export interface Hearing {
  /** Hour of the day, 0..24. */
  hour: number;
  place: Place;
  /** The building's kind, in a room ('inn', 'temple', 'smithy', ...). */
  room: string | null;
  /** The ears are under water. */
  under: boolean;
  /** The weather as shown (0..1 each). */
  rain: number;
  snow: number;
  wind: number;
  storm: number;
  /** Ground height at the listener (m above the sea). */
  height: number;
  /** Distance to the sea's water (m; Infinity: not near). */
  sea: number;
  /** Distance to a lake or a river's water (m). */
  water: number;
  /** A river near: how far from its bank (m) and its half width (m); null: none. */
  river: { bank: number; half: number } | null;
  /** A waterfall near: how far (m) and how high (m); null: none. */
  fall: { dist: number; drop: number } | null;
  /** How far inside the town, 0 (outside) .. 1 (at the market). */
  town: number;
  /** Woods over the listener: cover 0..1 and the share of conifers. */
  woods: number;
  conifer: number;
  /** On a ship's deck (S10). */
  aboard?: boolean;
}

/** What to play for a hearing. */
export interface Scape {
  /** Every bed (an id in public/sound) and its level 0..1; beds not named are silent. */
  beds: Record<string, number>;
  /** The world's sound through a low-pass (Hz; null: open). */
  muffle: number | null;
  /** The room's echo: T60 (s) and how much. */
  echo: { t60: number; wet: number };
  /** Daylight 0 (night) .. 1 (day), for the birds. */
  day: number;
}

/** Day 0..1 from the hour: dawn from 5 to 7, dusk from 19.5 to 21. */
export const daylight = (hour: number): number => smoothstep(5, 7, hour) * (1 - smoothstep(19.5, 21, hour));

/** 1 at `near` m or closer, fading to 0 at `far`. */
const close = (d: number, near: number, far: number): number => 1 - smoothstep(near, far, d);

/** The rooms' own beds and echoes. */
const ROOMS: Record<string, { beds: Record<string, number>; t60: number; wet: number }> = {
  inn: { beds: { 'bed/inn': 0.9, 'bed/hearth': 0.35 }, t60: 0.6, wet: 0.12 },
  temple: { beds: { 'bed/temple': 0.8 }, t60: 2.6, wet: 0.35 },
  hall: { beds: { 'bed/temple': 0.5, 'bed/hearth': 0.3 }, t60: 1.4, wet: 0.22 },
  smithy: { beds: { 'loop/smithy': 0.7, 'bed/hearth': 0.4 }, t60: 0.8, wet: 0.15 },
  mill: { beds: { 'loop/mill': 0.7 }, t60: 0.9, wet: 0.15 },
  bakery: { beds: { 'bed/hearth': 0.6, 'bed/house': 0.3 }, t60: 0.5, wet: 0.1 },
  stable: { beds: { 'bed/house': 0.3 }, t60: 0.5, wet: 0.08 },
};
const HOUSE = { beds: { 'bed/house': 0.45, 'bed/hearth': 0.3 }, t60: 0.45, wet: 0.1 };

export function soundscape(h: Hearing): Scape {
  const beds: Record<string, number> = {};
  const add = (id: string, v: number): void => { if (v > 0.003) beds[id] = Math.min(1, (beds[id] ?? 0) + v); };
  const day = daylight(h.hour);
  if (h.under) {
    add('bed/underwater', 1);
    return { beds, muffle: 450, echo: { t60: 0, wet: 0 }, day };
  }
  if (h.place === 'cellar') {
    add('bed/cellar', 0.8);
    return { beds, muffle: null, echo: { t60: 1.1, wet: 0.3 }, day };
  }
  const wet = h.rain * (1 - h.snow);
  if (h.place === 'room') {
    const r = ROOMS[h.room ?? ''] ?? HOUSE;
    for (const [id, v] of Object.entries(r.beds)) add(id, v);
    // The weather outside, through the roof and the walls.
    add('bed/rain-roof', wet * 0.9);
    add('bed/storm-wind', Math.max(h.storm, smoothstep(0.6, 1, h.wind)) * 0.25);
    add('bed/wind-soft', h.wind * 0.12);
    return { beds, muffle: null, echo: { t60: r.t60, wet: r.wet }, day };
  }
  // Out on the land. The wind: soft, open or (high up) thin; a gale or storm roars.
  const high = smoothstep(500, 1200, h.height), gale = Math.max(h.storm * 0.8, smoothstep(0.6, 1, h.wind));
  const calm = 1 - gale;
  add('bed/wind-soft', (1 - h.wind) * (1 - high) * 0.5 * calm);
  add('bed/wind-open', h.wind * (1 - high) * 0.8 * calm);
  add('bed/wind-high', high * (0.4 + 0.6 * h.wind));
  add('bed/storm-wind', gale);
  // Trees and grass in the wind.
  const stir = 0.3 + 0.7 * h.wind, open = (1 - h.woods) * (1 - h.town) * smoothstep(20, 60, h.sea);
  add('bed/leaves-broad', h.woods * (1 - h.conifer) * stir * 0.8);
  add('bed/leaves-conifer', h.woods * h.conifer * stir * 0.8);
  add('bed/grass', open * (1 - high) * (0.2 + 0.5 * h.wind));
  // Life: birds by day (fewer in rain and snow), crickets at night, bees at warm midday.
  const dry = 1 - smoothstep(0.1, 0.5, h.rain), noSnow = 1 - h.snow;
  add('bed/birds-wood', h.woods * day * dry * 0.8);
  add('bed/birds-meadow', open * day * dry * noSnow * 0.55);
  add('bed/birds-water', close(h.water, 10, 80) * day * dry * 0.5);
  add('bed/crickets', (1 - day) * (1 - h.woods * 0.5) * dry * noSnow * (1 - high) * (1 - h.town) * 0.6);
  add('bed/night', (1 - day) * dry * noSnow * 0.35);
  add('bed/bees', smoothstep(9, 11, h.hour) * (1 - smoothstep(15, 17, h.hour)) * open * dry * noSnow * (1 - high) * 0.25);
  // Water: the sea on a beach or against cliffs below, lakes, rivers, falls.
  const sea = close(h.sea, 25, 300), cliff = smoothstep(8, 20, h.height);
  add('bed/sea', sea * (1 - cliff) * (h.aboard ? 0.4 : 1));
  add('bed/surf-rocks', sea * cliff);
  // Aboard a ship (S10): her timbers creak and work, the more as the sea gets up; in a gale the sea roars, out there and on the shore.
  const rough = smoothstep(0.5, 1, Math.max(h.wind, h.storm));
  add('bed/ship-creak', h.aboard ? 0.45 + 0.55 * h.wind : 0);
  add('bed/sea-storm', (h.aboard ? 1 : sea) * rough);
  add('bed/lake', close(h.water, 3, 40) * (h.river ? 0 : 0.7));
  if (h.river) {
    const near = close(h.river.bank, 4, h.river.half > 6 ? 140 : 60);
    if (h.river.half > 6) add('bed/river-slow', near * 0.9);
    else add('bed/river-riffle', near * 0.9);
  }
  if (h.fall) add('bed/falls', close(h.fall.dist, 25, 400 + h.fall.drop * 15) * clamp(0.4 + h.fall.drop / 30, 0, 1));
  // Rain and snow.
  add('bed/rain', wet * (1 - smoothstep(0.45, 0.85, h.rain)));
  add('bed/rain-heavy', wet * smoothstep(0.45, 0.85, h.rain));
  add('bed/snow', h.snow * h.rain * 0.7);
  // The town: busy by day, quiet at night, less so in the rain.
  add('bed/town-day', h.town * day * (1 - wet * 0.5));
  add('bed/town-night', h.town * (1 - day) * 0.8);
  return { beds, muffle: null, echo: { t60: 0, wet: 0 }, day };
}

/** The threat the fights report (the Director's mood): music for danger or a fight wins over the place's. */
export type Threat = 'tension' | 'fight' | null;

/** The music's mood for a hearing. */
export function musicMood(h: Hearing, threat: Threat = null): string {
  if (threat === 'fight') return 'fight';
  if (threat === 'tension') return 'danger';
  if (h.place === 'cellar') return 'cellar';
  const day = daylight(h.hour);
  if (h.place === 'room') return h.room === 'inn' ? 'inn' : day > 0.5 ? 'town' : 'night';
  if (h.storm > 0.4 || h.rain * (1 - h.snow) > 0.7) return 'storm';
  if (h.town > 0.3) return day > 0.5 ? 'town' : 'night';
  if (h.hour >= 5 && h.hour < 7.5) return 'dawn';
  return day > 0.5 ? 'day' : 'night';
}

/** The pieces of each mood (public/sound/music). */
export const MUSIC: Readonly<Record<string, readonly string[]>> = {
  day: ['music/day-1', 'music/day-2', 'music/day-3'],
  dawn: ['music/dawn'],
  night: ['music/night-1', 'music/night-2'],
  town: ['music/town-1', 'music/town-2'],
  inn: ['music/inn-1', 'music/inn-2'],
  cellar: ['music/cellar-1', 'music/cellar-2'],
  danger: ['music/danger'],
  fight: ['music/fight-1', 'music/fight-2'],
  storm: ['music/storm'],
};

/** What is under a foot, as the game knows it. */
export interface Footing {
  place: Place;
  room: string | null;
  /** Standing in shallow water. */
  wading: boolean;
  /** The town's ground here: 'street', 'market', 'yard' or null outside the town. */
  town: 'street' | 'market' | 'yard' | null;
  /** The biome's surface (setting contract: grass, forest, sand, scree). */
  surface: string | null;
  /** Rock: a steep slope or a rock volume. */
  rock: boolean;
  /** Snow lying 0..1 (the weather's, or the snow line's). */
  snow: number;
  /** On the shore's sand. */
  beach: boolean;
}

/** The footstep sound for a footing (an id in public/sound). */
export function stepSound(f: Footing): string {
  if (f.place === 'cellar') return 'step/rock';
  if (f.place === 'room') return f.room === 'temple' || f.room === 'hall' ? 'step/stone' : 'step/boards';
  if (f.wading) return 'step/water';
  if (f.snow > 0.5) return 'step/snow';
  if (f.town === 'street' || f.town === 'market') return 'step/cobbles';
  if (f.town === 'yard') return 'step/dirt';
  if (f.rock) return 'step/stone';
  if (f.beach) return 'step/sand';
  return { grass: 'step/grass', forest: 'step/litter', sand: 'step/sand', scree: 'step/gravel' }[f.surface ?? 'grass'] ?? 'step/grass';
}

/** A hoof beat's sound for a footing and gait: a gallop drums; on cobbles shoes clop; on soft ground they thud. */
export function hoofSound(f: Footing, gait: string): string {
  if (gait === 'gallop') return f.town === 'street' || f.town === 'market' ? 'hoof/cobbles' : 'hoof/gallop';
  const step = stepSound(f);
  if (step === 'step/cobbles' || step === 'step/stone' || step === 'step/boards' || step === 'step/rock') return 'hoof/cobbles';
  if (step === 'step/water') return 'step/water';
  return step === 'step/grass' || step === 'step/litter' || step === 'step/sand' || step === 'step/snow' ? 'hoof/grass' : 'hoof/walk';
}

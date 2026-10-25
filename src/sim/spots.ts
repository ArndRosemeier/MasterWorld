/**
 * Smart objects (plan 9.3): the places in a town that offer something to do. Each fixture of the plan
 * (an anvil, a well, a bench ...) and each building's door becomes a spot; a spot says what can be done
 * there, by whom, for how long and by how many at once. Pure.
 */
import type { Fixture, FixtureKind, TownPlan } from '@futuremagic/settlement';

/** What a person is doing (the renderer picks an animation by it). */
export type ActivityKind =
  | 'sleep' | 'indoors' | 'walk' | 'wait' | 'away'
  | 'smith' | 'stoke' | 'quench' | 'bake' | 'craft' | 'sell' | 'serve' | 'tend'
  | 'fetchWater' | 'fetchWood' | 'chop' | 'garden' | 'washing' | 'feedHens'
  | 'browse' | 'sit' | 'chat' | 'drink' | 'pray' | 'mourn' | 'play' | 'stroll' | 'gather';

/** Who may use a spot: its building's workers, its household, the market's traders, or anyone. */
export type SpotUse = 'work' | 'home' | 'trade' | 'any';

export interface SpotDef {
  activity: ActivityKind;
  use: SpotUse;
  /** People at once. */
  cap: number;
  /** How long one turn there lasts, real seconds (min, max). */
  secs: [number, number];
  /** Out of doors (rain cuts it short and makes it rarer). */
  outside: boolean;
}

/** What each fixture offers. */
export const SPOT_DEFS: Readonly<Record<FixtureKind, SpotDef>> = {
  anvil: { activity: 'smith', use: 'work', cap: 1, secs: [40, 90], outside: true },
  forge: { activity: 'stoke', use: 'work', cap: 1, secs: [20, 45], outside: true },
  quench: { activity: 'quench', use: 'work', cap: 1, secs: [8, 18], outside: true },
  oven: { activity: 'bake', use: 'work', cap: 1, secs: [40, 100], outside: true },
  workbench: { activity: 'craft', use: 'work', cap: 1, secs: [60, 150], outside: true },
  trough: { activity: 'tend', use: 'work', cap: 1, secs: [30, 70], outside: true },
  barrel: { activity: 'serve', use: 'work', cap: 1, secs: [30, 80], outside: true },
  stall: { activity: 'browse', use: 'any', cap: 2, secs: [15, 45], outside: true },
  well: { activity: 'fetchWater', use: 'any', cap: 2, secs: [20, 40], outside: true },
  bench: { activity: 'sit', use: 'any', cap: 2, secs: [40, 140], outside: true },
  table: { activity: 'drink', use: 'any', cap: 3, secs: [60, 200], outside: true },
  woodpile: { activity: 'fetchWood', use: 'home', cap: 1, secs: [10, 25], outside: true },
  chopblock: { activity: 'chop', use: 'home', cap: 1, secs: [40, 90], outside: true },
  garden: { activity: 'garden', use: 'home', cap: 2, secs: [60, 180], outside: true },
  washline: { activity: 'washing', use: 'home', cap: 1, secs: [30, 70], outside: true },
  chickens: { activity: 'feedHens', use: 'home', cap: 1, secs: [20, 45], outside: true },
  grave: { activity: 'mourn', use: 'any', cap: 1, secs: [30, 70], outside: true },
  offering: { activity: 'pray', use: 'any', cap: 3, secs: [25, 60], outside: true },
};

export interface Spot {
  id: number;
  activity: ActivityKind;
  use: SpotUse;
  cap: number;
  secs: [number, number];
  outside: boolean;
  /** Where the user stands, and which way they face (radians, xz atan2). */
  x: number;
  z: number;
  dir: number;
  /** The building it belongs to (-1: the town's). */
  building: number;
  /** A door: going in hides the person (activity 'indoors' or 'sleep'). */
  door: boolean;
  /** People using it or on their way. */
  users: number;
  /** Who has each place at it (person id, -1 free; cap places, side by side across `dir`). */
  seats?: number[];
}

/** Between two people side by side at one spot (m). */
export const SEAT_GAP = 0.75;

/** Where the place `seat` of a spot is: side by side, across the way its users face. */
export function seatAt(s: Spot, seat: number): [number, number] {
  if (s.cap <= 1 || s.door) return [s.x, s.z];
  const off = (seat - (s.cap - 1) / 2) * SEAT_GAP;
  return [s.x - Math.sin(s.dir) * off, s.z + Math.cos(s.dir) * off];
}

/** Every spot of a town: its fixtures, then one door per building. */
export function townSpots(plan: TownPlan): Spot[] {
  const out: Spot[] = [];
  for (const f of plan.fixtures) {
    out.push(fixtureSpot(out.length, f));
    // A stall also has its seller, behind it, facing the market.
    if (f.kind === 'stall') out.push({ id: out.length, activity: 'sell', use: 'trade', cap: 1, secs: [90, 300], outside: true, x: f.x - Math.cos(f.yaw) * 0.9, z: f.z - Math.sin(f.yaw) * 0.9, dir: f.yaw, building: -1, door: false, users: 0 });
  }
  for (const b of plan.buildings) {
    const [x, z, dir] = b.door;
    out.push({ id: out.length, activity: 'indoors', use: 'home', cap: 99, secs: [60, 240], outside: false, x, z, dir: dir + Math.PI, building: b.id, door: true, users: 0 });
  }
  return out;
}

function fixtureSpot(id: number, f: Fixture): Spot {
  const d = SPOT_DEFS[f.kind];
  // Stand a step in front of the thing, facing it (a stall's buyer in front, facing the seller).
  const dir = f.kind === 'stall' ? f.yaw + Math.PI : f.yaw;
  const back = f.kind === 'stall' ? 1.4 : 0.9;
  return { id, ...d, secs: [...d.secs] as [number, number], x: f.x - Math.cos(dir) * back, z: f.z - Math.sin(dir) * back, dir, building: f.building, door: false, users: 0 };
}

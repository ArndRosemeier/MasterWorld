/**
 * Smart objects (plan 9.3): the places in a town that offer something to do. Each fixture of the plan
 * (an anvil, a well, a bench ...) and each building's door becomes a spot; a spot says what can be done
 * there, by whom, for how long and by how many at once. Pure.
 */
import { hash2f } from '@futuremagic/core';
import { distSqPointSeg, fixtureStand, pointInPoly, type CropKind, type Fixture, type FixtureKind, type TownPlan } from '@futuremagic/settlement';

/** What a person is doing (the renderer picks an animation by it). */
export type ActivityKind =
  | 'sleep' | 'indoors' | 'walk' | 'wait' | 'away'
  | 'smith' | 'stoke' | 'quench' | 'bake' | 'craft' | 'sell' | 'serve' | 'tend'
  | 'fetchWater' | 'fetchWood' | 'chop' | 'garden' | 'washing' | 'feedHens'
  | 'browse' | 'sit' | 'chat' | 'drink' | 'pray' | 'mourn' | 'play' | 'stroll' | 'gather'
  /** Farm work: in the fields by what grows there, with the animals in the paddock, hay and dung in the stable. */
  | 'plough' | 'sow' | 'hoe' | 'reap' | 'tendStock' | 'muckOut'
  /** Hurt, sitting on the ground (a situation, C10). */
  | 'hurt'
  /** Marking the hero's map, held in both hands (the hand-over, D35). */
  | 'mark';

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
  // A field's activity follows its crop (fieldWork); 'reap' is only the default.
  field: { activity: 'reap', use: 'work', cap: 2, secs: [120, 300], outside: true },
  paddock: { activity: 'tendStock', use: 'work', cap: 1, secs: [40, 100], outside: true },
  hayrack: { activity: 'muckOut', use: 'work', cap: 1, secs: [40, 110], outside: true },
};

/** The work a field asks for, by what grows there (the season is not modelled yet: a late summer's mix). */
export const FIELD_WORK: Readonly<Record<CropKind, ActivityKind>> = {
  wheat: 'reap', rye: 'reap', barley: 'reap', oats: 'reap', beans: 'hoe', flax: 'hoe', cabbage: 'hoe',
  ploughed: 'sow', fallow: 'plough', meadow: 'reap', pasture: 'tendStock',
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
  /** Who has each place at it (person id, -1 free; cap places, side by side across `dir`, or round it for a chat). */
  seats?: number[];
  /** On the market (a stall, its seller, a knot of people talking): people come to it from all over the town. */
  market?: boolean;
}

/** Between two people side by side at one spot (m). */
export const SEAT_GAP = 0.75;

/** How far from a chat's middle its people stand (m). */
const CHAT_R = 0.65;

/** Where the place `seat` of a spot is: side by side, across the way its users face; round the middle of a chat. */
export function seatAt(s: Spot, seat: number): [number, number] {
  if (s.cap <= 1 || s.door) return [s.x, s.z];
  if (s.activity === 'chat') { const a = s.dir + (seat * 2 * Math.PI) / s.cap; return [s.x + Math.cos(a) * CHAT_R, s.z + Math.sin(a) * CHAT_R]; }
  const off = (seat - (s.cap - 1) / 2) * SEAT_GAP;
  return [s.x - Math.sin(s.dir) * off, s.z + Math.cos(s.dir) * off];
}

/** The way someone at place `seat` of a spot faces: the spot's way; at a chat, in towards its middle. */
export function seatDir(s: Spot, seat: number): number {
  return s.activity === 'chat' && !s.door ? s.dir + (seat * 2 * Math.PI) / s.cap + Math.PI : s.dir;
}

/** On a market, a knot of people talking for about every this many square metres of open ground (a walled city's market: busier). */
const CHAT_EVERY = 110, CITY_CHAT_EVERY = 70;
/** A knot keeps this far from the stalls, the well and the benches (m), and from the market's edge. */
const CHAT_CLEAR = 3;

/** Knots of people talking on the market (a town with stalls): spread over its open ground, clear of its fixtures. */
export function marketChats(plan: TownPlan, first: number): Spot[] {
  const m = plan.market;
  if (!plan.fixtures.some((f) => f.kind === 'stall') || m.length < 6) return [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < m.length; i += 2) { x0 = Math.min(x0, m[i]); x1 = Math.max(x1, m[i]); z0 = Math.min(z0, m[i + 1]); z1 = Math.max(z1, m[i + 1]); }
  const step = Math.sqrt(plan.wall ? CITY_CHAT_EVERY : CHAT_EVERY), near = plan.fixtures.filter((f) => f.x > x0 - 9 && f.x < x1 + 9 && f.z > z0 - 9 && f.z < z1 + 9);
  const edge = (x: number, z: number) => { let d = Infinity; for (let i = 0; i < m.length; i += 2) { const j = (i + 2) % m.length; d = Math.min(d, distSqPointSeg(x, z, m[i], m[i + 1], m[j], m[j + 1])); } return Math.sqrt(d); };
  const out: Spot[] = [];
  for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
    // A little off the lattice, by the place itself (the same every time the town is planned).
    const i = Math.round(x), j = Math.round(z), px = x + (hash2f(1, i, j) - 0.5) * step * 0.6, pz = z + (hash2f(2, i, j) - 0.5) * step * 0.6;
    if (!pointInPoly(m, px, pz) || edge(px, pz) < CHAT_CLEAR || near.some((f) => Math.hypot(f.x - px, f.z - pz) < CHAT_CLEAR + 1)) continue;
    out.push({ id: first + out.length, activity: 'chat', use: 'any', cap: 3, secs: [45, 140], outside: true, x: px, z: pz, dir: hash2f(3, i, j) * Math.PI * 2, building: -1, door: false, users: 0, market: true });
  }
  return out;
}


/** Every spot of a town: its fixtures, the knots on its market, then one door per building. */
export function townSpots(plan: TownPlan): Spot[] {
  const out: Spot[] = [];
  for (const f of plan.fixtures) {
    const s = fixtureSpot(out.length, f);
    if (f.kind === 'field') {
      const field = plan.fields.find((x) => x.paddock < 0 && pointInPoly(x.poly, f.x, f.z));
      if (field) s.activity = FIELD_WORK[field.crop];
    }
    out.push(s);
    // A stall also has its seller, behind it, facing the market.
    if (f.kind === 'stall') { s.market = true; out.push({ id: out.length, activity: 'sell', use: 'trade', cap: 1, secs: [90, 300], outside: true, x: f.x - Math.cos(f.yaw) * 0.9, z: f.z - Math.sin(f.yaw) * 0.9, dir: f.yaw, building: -1, door: false, users: 0, market: true }); }
  }
  out.push(...marketChats(plan, out.length));
  for (const b of plan.buildings) {
    const [x, z, dir] = b.door;
    out.push({ id: out.length, activity: 'indoors', use: 'home', cap: 99, secs: [60, 240], outside: false, x, z, dir: dir + Math.PI, building: b.id, door: true, users: 0 });
  }
  return out;
}

function fixtureSpot(id: number, f: Fixture): Spot {
  const d = SPOT_DEFS[f.kind];
  // Stand a step in front of the thing, facing it (a stall's buyer in front, facing the seller); on a bench, sit on it.
  const [x, z, dir] = fixtureStand(f);
  return { id, ...d, secs: [...d.secs] as [number, number], x, z, dir, building: f.building, door: false, users: 0 };
}

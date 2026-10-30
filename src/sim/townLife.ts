/**
 * Life in a town (plan 9.3, the citizens' part of the world simulation): every townsperson is an agent
 * that is always either on the way somewhere or doing something there. What they are about comes from
 * their day plan (routines.ts: the setting's routine for their part in town, the rest day, their
 * traits); where and how from their trade, home and the smart objects around (spots.ts), the weather,
 * the dark and the VGM's orders. Turns at a spot last real seconds; the game clock only says which part of the day it
 * is, so a stopped clock still gives a busy town. Agents far from the focus (the player) skip their
 * walks. Deterministic for a seed and a sequence of steps. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { Footprints, distSqPointSeg, polyCentroid, wayRound, type TownPlan } from '@futuremagic/settlement';
import { NavGraph, aroundHouse } from './nav';
import type { DayTask, RoutinesDef } from '../setting/contract';
import { routines as classicRoutines } from '../setting/classic/routines';
import { away, buildingOf, OLD_AGE, townsfolk, type Person } from './people';
import { dayPlan, taskAt, type DayPlan } from './routines';
import { seatAt, seatDir, townSpots, type ActivityKind, type Spot } from './spots';
import { inRoom } from './roomCast';
import { onCircle } from '../world/sites';

/** What someone is about: their plan's task, a VGM order, or out of town. */
export type Task = DayTask | 'order' | 'away';

/** A VGM order for the town (plain data, logged with the decisions): times in game hours since the start (day × 24 + hour). */
export type TownOrder =
  /**
   * Everyone awake comes together around a place (a festival, a speech, a hanging). `mood` says what they do there:
   * at a feast they dance in a ring round it, drink and cheer round the ring, and the children run about; on a
   * market day they go round the stalls; otherwise they stand and talk it over.
   */
  | { kind: 'gather'; x: number; z: number; radius: number; from: number; to: number; mood?: 'feast' | 'market' }
  /** Everyone stays indoors (a curfew, a storm). */
  | { kind: 'stayIn'; from: number; to: number };

export interface Agent {
  person: Person;
  x: number;
  z: number;
  /** Facing (radians, xz atan2). */
  dir: number;
  /** What they are doing now ('walk' on the way to `next`). */
  act: ActivityKind;
  /** What they will do on arrival. */
  next: ActivityKind;
  /** The spot they are at or heading to (-1: a free point), and their place at it. */
  spot: number;
  seat: number;
  /** Indoors or out of town: not to be drawn. */
  hidden: boolean;
  /** When the turn ends (sim seconds). */
  until: number;
  /** The walk: x, z pairs, and the index of the next point. */
  path: number[];
  pi: number;
  /** What the current choice was made for. */
  task: Task;
  /** Today's plan. */
  plan: DayPlan;
  rng: Rng;
  /** Stopped for a talk with the player: stands, faces them, and goes on with the day when let go. */
  held?: boolean;
  /** Waiting for someone in the way to move (s): after `CROWD.wait` they squeeze past (never through the hero). */
  waited?: number;
  /** Stood still this step, held up by someone in the way. */
  stalled?: boolean;
  /** The sim time of their last walked step (who walked already this step). */
  stepped?: number;
  /** Stepped aside off their way since the last point of it they reached. */
  off?: boolean;
  /**
   * Still crossing a room drawn open on the way out (sim seconds): they set off from its doorstep once the time
   * passes this (app/interiorVisit keeps it ahead while they walk to the door).
   */
  stay?: number;
  /** Held in a building's room (they were in it when the talk began): drawn there, not where they stand outside (read only while `held`). */
  heldIn?: boolean;
  /** Running, not walking (children at play at a feast): RUN times their pace. */
  run?: boolean;
  /** Turns to face this point on arrival (a feast's ring faces its middle). */
  faceTo?: { x: number; z: number };
  /** Sent over by the VGM (plan D27): walks up to (x, z), then waits there facing `face` until let go or `until`. */
  seek?: { x: number; z: number; face: { x: number; z: number } };
  /** Keeps watch at a place of their own out on the land (C3: the warden at the tower's door), day and night. */
  post?: { x: number; z: number; dir: number; act?: ActivityKind };
}

export interface TownWeather {
  /** 0 dry .. 1 pouring. */
  rain: number;
}

/** The facing (as `Agent.dir`) from `a` towards (x, z). */
const facing = (a: Agent, x: number, z: number): number => Math.atan2(z - a.z, x - a.x);

/** Work done facing a thing that stands between the worker and whoever comes up to them (the thing 0.9 m before them). */
const AT_A_THING = new Set<ActivityKind>(['smith', 'stoke', 'quench', 'bake', 'craft', 'tend', 'serve', 'haul', 'carry', 'mendNets']);

/** A walker going through a gateway passes this close to its middle (m); their way is looked at this many points ahead. */
const GATEWAY = 4, AHEAD = 4;

/**
 * Whether `a` is on their way through the gateway at (x, z) and within `r` of it: walking, their way ahead
 * passing through it (someone going along a street inside the wall does not open the town's gate at night).
 */
export function goingThrough(a: Agent, x: number, z: number, r: number): boolean {
  if (a.hidden || a.act !== 'walk' || Math.abs(a.x - x) > r || Math.abs(a.z - z) > r) return false;
  let px = a.x, pz = a.z;
  for (let i = a.pi; i < Math.min(a.pi + AHEAD, a.path.length / 2); i++) {
    const qx = a.path[i * 2], qz = a.path[i * 2 + 1];
    if (distSqPointSeg(x, z, px, pz, qx, qz) < GATEWAY * GATEWAY) return true;
    px = qx; pz = qz;
  }
  return false;
}

/**
 * The way round the thing someone at spot `s` works at, to stand by it on the side of (x, z) (who wants to talk),
 * or null if it is not in between: a step to the side, then out beside it.
 */
export function roundTheWork(s: Spot, a: { x: number; z: number }, x: number, z: number): number[] | null {
  if (!AT_A_THING.has(s.activity) || s.door) return null;
  const fx = s.x + Math.cos(s.dir) * 0.9, fz = s.z + Math.sin(s.dir) * 0.9;
  const dx = x - a.x, dz = z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((fx - a.x) * dx + (fz - a.z) * dz) / l2)) : 0;
  if (Math.hypot(a.x + dx * t - fx, a.z + dz * t - fz) > 0.75) return null;
  // Across the way they face: to whichever side the other stands.
  const px = -Math.sin(s.dir), pz = Math.cos(s.dir), side = (x - fx) * px + (z - fz) * pz >= 0 ? 1 : -1;
  const hx = x - fx, hz = z - fz, hl = Math.hypot(hx, hz) || 1;
  return [a.x + px * side * 1.1, a.z + pz * side * 1.1, fx + px * side * 1.1 + (hx / hl) * 0.5, fz + pz * side * 1.1 + (hz / hl) * 0.5];
}

/** Held up by someone in the way (on a walk, not moving): seen standing, not walking on the spot. */
export function waitsInWay(a: Agent): boolean {
  return a.act === 'walk' && !!a.stalled;
}

/**
 * Would one at (ax, az) stepping to (x, z) come nearer a body at (ox, oz): within `touch` at all, or within
 * `min` by more than `share` of the step?
 */
function pressesInto(a: { x: number; z: number }, x: number, z: number, ox: number, oz: number, touch: number, min: number, share: number): boolean {
  const ex = ox - x, ez = oz - z, e2 = ex * ex + ez * ez;
  if (e2 >= min * min) return false;
  const fx = ox - a.x, fz = oz - a.z, closes = Math.sqrt(fx * fx + fz * fz) - Math.sqrt(e2);
  return closes > (e2 < touch * touch ? 1e-4 : Math.max(1e-4, share * Math.hypot(x - a.x, z - a.z)));
}

/** A townsperson's radius as an obstacle (m). */
const BODY = 0.28;
/**
 * Bodies in the streets (Arnd 2026-10-30: nobody walks through another): the hero's radius (m), the room a walker
 * keeps to others beyond touching (m), the turns tried to get round one (radians, all the same hand first, so
 * two meeting both step to the same side and pass), the share of the pace a step aside goes, how long one waits
 * for a body that will not move before squeezing past (s), the size of the lookup grid (m), how near the focus it
 * is minded (m; FolkView draws them within 70), how near a bend of the way one crowded there takes it as passed
 * (m), how much of a step must close on someone short of touching for it to be heading at them, how a step round someone counts
 * towards the wait (a share of a second stood), and how near a door one going in (or coming out) walks on through
 * a crowd at it (m).
 */
const CROWD = { hero: 0.35, space: 0.2, turns: [-0.3, -0.6, -1.2, -1.65, 0.3, 0.6, 1.2, 1.65], aside: 1, wait: 4, cell: 2, near: 75, pass: 1.5, heading: 0.3, round: 0.25, door: 2.5 } as const;
/** Cells along each side of the crowd grid round the focus (a margin of a cell and more beyond `CROWD.near`). */
const CROWD_CELLS = Math.ceil((2 * CROWD.near) / CROWD.cell) + 4;

/** Trades one goes into on an errand (to buy bread, have shoes mended ...). */
const SHOPS = new Set(['baker', 'butcher', 'chandler', 'cobbler', 'tailor', 'potter', 'weaver', 'cooper', 'smith', 'miller', 'fletcher', 'bowyer', 'armourer', 'jeweller', 'bookbinder', 'glazier']);

/** Market spots weigh as if this many metres away per step of 1 (25 for the rest): the market draws from all over the town. */
const MARKET_REACH = 110;

/** A step whose clock moves more than this (game hours) skipped time: everyone goes straight to what they do now. */
const SKIP_HOURS = 0.5;

/** Agents farther than this from the focus skip their walks (m). */
const DETAIL = 260;
/** A child at play keeps this far off a wall (m). */
const PLAY_CLEAR = 0.6;
/** Running is this many times one's walking pace. */
export const RUN = 2.3;
/** A feast (TownOrder mood 'feast'): the ring dances this far from the middle (m), the share of the grown who dance in it, revellers stand round it from REVEL out. */
const FEAST = { ring: 3.6, dancers: 0.35, revel: 5.5 } as const;

/** How fast `a` goes when on the move (m/s). */
export const paceOf = (a: Agent): number => a.person.speed * (a.run ? RUN : 1);

export class TownLife {
  readonly nav: NavGraph;
  readonly spots: Spot[];
  /** The spots (no doors) by `building:use`, and the town's own (no building) by their activity. */
  private readonly spotsBy = new Map<string, Spot[]>();
  readonly agents: Agent[] = [];
  /** People still to come in (`grow`: a big town is made over several frames), and the seed their days come from. */
  private readonly waiting: readonly Person[];
  private readonly seed: number;
  /** Sim seconds. */
  time = 0;
  /** Where detail matters (the player). */
  focus = { x: 0, z: 0 };
  /** The hero on foot among them: a body they walk round like anyone (null: not in the town). */
  hero: { readonly x: number; readonly z: number } | null = null;
  /** This step's length (s). */
  private dt = 0;
  /** Those out of doors by grid cell, for who is in whose way (made each step). */
  private readonly crowdHead = new Int32Array(CROWD_CELLS * CROWD_CELLS);
  private crowdNext = new Int32Array(0);
  /** The crowd grid's corner (world x, z). */
  private crowdX = 0;
  private crowdZ = 0;
  /** Within a step after skipped time: walks are not walked, everyone arrives (`step`). */
  private skipping = false;
  private readonly orders: TownOrder[] = [];
  /** Everyone has fled (a band holds the place, vgm/events.ts take): all are away until it is false again. */
  gone = false;
  private readonly market: [number, number];
  /** Every building's footprint (walks go round them). */
  private readonly footprints: Footprints;
  /** Where each road out leaves the town (travellers come and go there). */
  private readonly roadEnds: [number, number][] = [];
  private hour = 12;
  /** Game hours since the start (orders are timed in these). */
  private hours = 12;
  private weather: TownWeather = { rain: 0 };

  /** Who a map mark points at, kept to that building while awake (sim/marked.ts): by person id, the building. */
  private kept = new Map<number, number>();

  /** The town's inn and temple doors (-1: none). */
  private readonly inn: number;
  private readonly temple: number;
  /** Doors of the places one goes into on an errand (the baker, the butcher ...). */
  private readonly shops: number[];

  /** `routines`: the setting's (the classic one by default); every town of a setting lives by them. */
  /** `people`: who lives here (townsfolk(plan, seed) unless given: the town's core passes its own). */
  /** `parts`: its street graph and spots if made already; `later`, its people come in by `grow` (none at first). */
  constructor(readonly plan: TownPlan, seed: number, hour: number, readonly routines: RoutinesDef = classicRoutines, people: readonly Person[] = townsfolk(plan, seed), parts: { nav?: NavGraph; spots?: Spot[]; later?: boolean } = {}) {
    this.nav = parts.nav ?? new NavGraph(plan);
    this.spots = parts.spots ?? townSpots(plan);
    // The spots by building and use, and the town's own by activity (looked up at every choice).
    const by = (k: string, sp: Spot) => { let l = this.spotsBy.get(k); if (!l) this.spotsBy.set(k, (l = [])); l.push(sp); };
    for (const sp of this.spots) {
      if (sp.building === -1) by(sp.activity, sp);
      if (!sp.door) by(`${sp.building}:${sp.use}`, sp);
    }
    this.seed = seed;
    this.waiting = people;
    this.market = polyCentroid(plan.market) as [number, number];
    this.footprints = new Footprints(plan.buildings.map((b) => b.poly));
    this.focus = { x: this.market[0], z: this.market[1] };
    for (const st of plan.streets) {
      if (st.kind !== 'road') continue;
      const [cx, cz] = plan.centre, n = st.pts.length;
      const first = Math.hypot(st.pts[0] - cx, st.pts[1] - cz) > Math.hypot(st.pts[n - 2] - cx, st.pts[n - 1] - cz);
      this.roadEnds.push(first ? [st.pts[0], st.pts[1]] : [st.pts[n - 2], st.pts[n - 1]]);
    }
    this.hour = hour % 24;
    this.hours = hour;
    const doorOfKind = (k: string) => { const b = buildingOf(plan, k); return b ? this.doorOf(b.id) : -1; };
    this.inn = doorOfKind('inn');
    this.temple = doorOfKind('temple');
    this.shops = plan.buildings.filter((b) => SHOPS.has(b.trade)).map((b) => this.doorOf(b.id));
    if (!parts.later) this.grow(Infinity);
  }

  /** Whether everyone has come in (`grow`). */
  get ready(): boolean { return this.agents.length === this.waiting.length; }

  /**
   * Brings in the people still to come, for about `ms` milliseconds (a capital's 2700 take a tenth of a second:
   * spread over frames); true once everyone is in. Each starts in the middle of something, already there.
   */
  grow(ms: number): boolean {
    const t0 = performance.now();
    while (this.agents.length < this.waiting.length) {
      const p = this.waiting[this.agents.length], d = this.plan.buildings[p.home].door;
      const a: Agent = { person: p, x: d[0], z: d[1], dir: d[2], act: 'wait', next: 'wait', spot: -1, seat: 0, hidden: false, until: 0, path: [], pi: 0, task: 'sleep', plan: { day: NaN, rest: false, at: [0], task: ['sleep'] }, rng: new Rng(deriveSeed(this.seed, 'life', p.id)) };
      this.choose(a, true);
      a.until = this.time + a.rng.range(0, 1) * (a.until - this.time);
      this.agents.push(a);
      if ((this.agents.length & 31) === 0 && performance.now() - t0 > ms) break;
    }
    return this.ready;
  }

  /** Everyone living here (the agents' persons, in their order). */
  get persons(): Person[] { return this.agents.map((a) => a.person); }

  /**
   * Who keeps to which building from now on (by person id; sim/marked.ts keptAt): those newly kept go there now,
   * those let go pick up their day.
   */
  keep(kept: ReadonlyMap<number, number>): void {
    const was = this.kept;
    if (was.size === kept.size && [...kept].every(([id, b]) => was.get(id) === b)) return;
    this.kept = new Map(kept);
    for (const a of this.agents) {
      const id = a.person.id;
      if (was.get(id) === kept.get(id) || a.held || a.post) continue;
      if (a.seek) a.seek = undefined;
      this.choose(a, false);
    }
  }

  /** Whether a map mark keeps this person where they are. */
  isKept(id: number): boolean { return this.kept.has(id); }

  /** Give the town an order (the VGM's way in). */
  order(o: TownOrder): void { this.orders.push(o); }

  /** Advance `dt` real seconds at `hours` game hours since the start (day × 24 + hour). */
  step(dt: number, hours: number, weather: TownWeather = this.weather): void {
    this.time += dt;
    // The clock skipped ahead (a night's sleep, a wait, the hour set): in the hours nobody saw, everyone got where
    // that time took them, so each goes straight to what they do now, unseen, and nobody is left walking home
    // across the town at night (a farmhand coming in from the fields held the capital's gate open).
    const skipped = Math.abs(hours - this.hours) > SKIP_HOURS;
    this.hours = hours;
    this.hour = ((hours % 24) + 24) % 24;
    this.weather = weather;
    if (skipped) this.skipAhead();
    this.dt = dt;
    this.placeCrowd();
    for (const a of this.agents) {
      // Held for a talk, one coming round their work walks on (`hold`).
      if (a.held) { if (a.act === 'walk') this.walk(a, dt); continue; }
      if (a.post) continue;
      if (a.stay !== undefined) {
        if (this.time < a.stay) continue;
        a.stay = undefined;
      }
      if (a.act === 'walk') this.walk(a, dt);
      else if (a.seek && this.time < a.until) continue;
      else if (this.time >= a.until || this.taskOf(a) !== a.task) this.choose(a, false);
    }
  }

  /** After skipped time: everyone not held goes straight to what they do now, without walking there. */
  private skipAhead(): void {
    this.skipping = true;
    for (const a of this.agents) if (!a.held && !a.post) { a.stay = undefined; this.choose(a, false); }
    this.skipping = false;
  }

  /**
   * Stop someone for a talk: they turn to (x, z) where they stand; one at their work behind a barrel, an anvil or
   * an oven (the thing between them and the one talking) first comes round it, and is seen walking there. One
   * sitting on a bench stays sitting, as they sat, and talks from there (standing up on the spot stood them in it).
   */
  hold(a: Agent, x: number, z: number): void {
    const s = a.spot >= 0 ? this.spots[a.spot] : null;
    a.heldIn = !!s && inRoom(a, s);
    a.held = true;
    a.hidden = false;
    if (a.act === 'sit') return;
    a.act = 'chat';
    a.dir = facing(a, x, z);
    const way = s && !a.heldIn && a.path.length === 0 ? roundTheWork(s, a, x, z) : null;
    if (!way) return;
    a.path = way;
    a.pi = 0;
    a.act = 'walk';
    a.next = 'chat';
    a.seek = { x: way[way.length - 2], z: way[way.length - 1], face: { x, z } };
  }

  /**
   * The VGM sends someone over (plan D27; vgm/guide.ts): they leave what they are doing (out of their door
   * if indoors), walk along the streets to (x, z) and wait there `secs` facing `face`, then go on with their
   * day. Sent again while on the way, they turn towards the new point.
   */
  seek(a: Agent, x: number, z: number, face: { x: number; z: number }, secs: number): void {
    if (a.post || this.kept.has(a.person.id)) return;
    const was = a.spot >= 0 ? this.spots[a.spot] : null;
    this.freeSpot(a);
    a.spot = -1;
    a.seek = { x, z, face: { ...face } };
    a.next = 'chat';
    a.until = this.time + secs;
    a.path = this.wayTo(a, a.act === 'walk' ? null : was, x, z, null);
    a.pi = 0;
    a.act = 'walk';
    a.hidden = false;
  }

  /** Keeps `a` at their doorstep `secs` longer: they are still walking out through the room (drawn open). */
  linger(a: Agent, secs: number): void {
    a.stay = this.time + secs;
  }

  /** The talk is over: they pick up their day from here. */
  letGo(a: Agent): void {
    a.held = false;
    if (a.post) this.station(a, a.post.x, a.post.z, a.post.dir, a.post.act);
    else this.choose(a, false);
  }

  /** Someone keeps watch at (x, z) from now on, facing `dir` (as `Agent.dir`), doing `act`: they stay there and never walk the town. */
  station(a: Agent, x: number, z: number, dir: number, act: ActivityKind = 'wait'): void {
    this.freeSpot(a);
    Object.assign(a, { post: { x, z, dir, act }, x, z, dir, spot: -1, act, next: act, hidden: false, path: [], pi: 0, seek: undefined });
  }

  /**
   * Their watch is over (a traveller rested by the way, C9): they are on the road again, out of sight, and
   * come back into town where its road leaves it when their day says so.
   */
  /** The agent of person `id` (undefined: nobody of that id lives here). */
  agentOf(id: number | null | undefined): Agent | undefined {
    return this.agents.find((a) => a.person.id === id);
  }

  unstation(a: Agent): void {
    const door = this.spots[this.doorOf(a.person.home)], [x, z] = this.roadEnds[0] ?? [door.x, door.z];
    Object.assign(a, { post: undefined, x, z, act: 'away', next: 'away', task: 'away', hidden: true, path: [], pi: 0, until: this.time + 600 });
  }

  /**
   * Does a body of radius `r` at (x, z) touch someone out of doors (each about `BODY` wide)? People
   * already touching (ax, az), where the asker stands now, are let through, so one walked into is
   * never stuck.
   */
  touches(x: number, z: number, r: number, ax: number, az: number): boolean {
    const d = r + BODY;
    for (const a of this.agents) {
      if (a.hidden || Math.abs(a.x - x) > d || Math.abs(a.z - z) > d) continue;
      if ((a.x - x) ** 2 + (a.z - z) ** 2 < d * d && (a.x - ax) ** 2 + (a.z - az) ** 2 >= d * d) return true;
    }
    return false;
  }

  /** How many are doing what (for the HUD and tests). */
  census(): Map<ActivityKind, number> {
    const m = new Map<ActivityKind, number>();
    for (const a of this.agents) m.set(a.act, (m.get(a.act) ?? 0) + 1);
    return m;
  }

  private activeOrder(): TownOrder | null {
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      if (this.hours >= o.from && this.hours < o.to) return o;
    }
    return null;
  }

  /** What they should be about now (today's plan is made on the day's first ask). */
  taskOf(a: Agent): Task {
    if (this.gone || away(a.person, this.hours)) return 'away';
    const day = Math.floor(this.hours / 24);
    if (a.plan.day !== day) a.plan = dayPlan(this.routines, a.person, day);
    const t = taskAt(a.plan, this.hour);
    return t !== 'sleep' && this.activeOrder() ? 'order' : t;
  }

  /** Whether it is dark out (the routines' night hours). */
  get dark(): boolean {
    const [from, to] = this.routines.dark;
    return from > to ? this.hour >= from || this.hour < to : this.hour >= from && this.hour < to;
  }

  /** Pick the next thing to do and set off (or, `here`, start there at once). */
  private choose(a: Agent, here: boolean): void {
    const was = a.spot >= 0 ? this.spots[a.spot] : null;
    this.freeSpot(a);
    a.seek = undefined;
    a.task = this.taskOf(a);
    const pick = this.pick(a);
    a.spot = pick.spot;
    const s = pick.spot >= 0 ? this.spots[pick.spot] : null;
    if (s) {
      s.users++;
      // A place of one's own at it (two on one bench sit side by side, not in each other's lap).
      if (s.cap > 1 && !s.door) {
        const seats = (s.seats ??= new Array<number>(s.cap).fill(-1));
        const keep = s === was && seats[a.seat] === -1 ? a.seat : -1;
        a.seat = keep >= 0 ? keep : Math.max(0, seats.indexOf(-1));
        seats[a.seat] = a.person.id;
      } else a.seat = 0;
    }
    const [tx, tz] = s ? seatAt(s, a.seat) : [pick.x, pick.z];
    a.next = pick.act;
    a.run = pick.run;
    a.faceTo = pick.face;
    a.until = this.time + a.rng.range(pick.secs[0], pick.secs[1]) * (s?.outside && (this.weather.rain > 0.5 || this.dark) ? 0.5 : 1);
    if (here || this.skipping || (s && s === was) || (Math.hypot(a.x - this.focus.x, a.z - this.focus.z) > DETAIL && Math.hypot(tx - this.focus.x, tz - this.focus.z) > DETAIL)) {
      this.arrive(a, tx, tz, s ? seatDir(s, a.seat) : pick.face ? Math.atan2(pick.face.z - tz, pick.face.x - tx) : a.dir);
      return;
    }
    a.path = this.wayTo(a, was, tx, tz, s);
    a.pi = 0;
    a.act = 'walk';
    a.hidden = false;
  }

  /**
   * At a feast round (order.x, order.z): children run from one place to the next and play there a moment; some of
   * the grown (not the old) dance in a ring facing its middle; the rest stand round the ring, facing it, drinking,
   * laughing and cheering. Each finds open ground (never inside a stall or a house).
   */
  private feast(a: Agent, order: { x: number; z: number; radius: number }): ReturnType<TownLife['pick']> {
    const r = a.rng, p = a.person, face = { x: order.x, z: order.z };
    const openSpot = (from: number, to: number): [number, number] => {
      for (let k = 0; k < 8; k++) {
        const [x, z] = onCircle(order, r.range(0, Math.PI * 2), r.range(from, to));
        if (this.freeGround(x, z)) return [x, z];
      }
      return [order.x + r.range(-1, 1), order.z + r.range(-1, 1)];
    };
    if (p.role === 'child') {
      const [x, z] = openSpot(1, order.radius * 0.8);
      return { spot: -1, x, z, act: 'play', secs: [3, 9], run: true };
    }
    if (p.age < OLD_AGE && r.chance(FEAST.dancers)) {
      const [x, z] = openSpot(FEAST.ring - 0.4, FEAST.ring + 0.4);
      return { spot: -1, x, z, act: 'dance', secs: [60, 180], face };
    }
    const [x, z] = openSpot(FEAST.revel, Math.max(FEAST.revel + 1, order.radius));
    return { spot: -1, x, z, act: 'revel', secs: [60, 200], face };
  }

  /** Open ground: no house there, nor a wall within a child's reach. */
  private freeGround(x: number, z: number): boolean {
    return !this.footprints.blocked(x, z, PLAY_CLEAR);
  }

  /** Give up the spot (and seat) the agent holds. */
  private freeSpot(a: Agent): void {
    const was = a.spot >= 0 ? this.spots[a.spot] : null;
    if (was) { was.users--; if (was.seats?.[a.seat] === a.person.id) was.seats[a.seat] = -1; }
  }

  private arrive(a: Agent, x: number, z: number, dir: number): void {
    a.x = x; a.z = z; a.dir = dir;
    a.act = a.next;
    a.hidden = a.act === 'sleep' || a.act === 'indoors' || a.act === 'away';
    a.path = [];
  }

  /** Who is out of doors where, near the focus (the grid `inWay` looks in). */
  private placeCrowd(): void {
    this.crowdHead.fill(-1);
    if (this.crowdNext.length < this.agents.length) this.crowdNext = new Int32Array(this.agents.length * 2);
    this.crowdX = this.focus.x - (CROWD_CELLS / 2) * CROWD.cell;
    this.crowdZ = this.focus.z - (CROWD_CELLS / 2) * CROWD.cell;
    this.agents.forEach((a, i) => {
      if (a.hidden) return;
      const c = this.cellOf(a.x, a.z);
      if (c < 0) return;
      this.crowdNext[i] = this.crowdHead[c];
      this.crowdHead[c] = i;
    });
  }

  /** The crowd grid's cell holding (x, z), or -1 off the grid. */
  private cellOf(x: number, z: number): number {
    const i = Math.floor((x - this.crowdX) / CROWD.cell), j = Math.floor((z - this.crowdZ) / CROWD.cell);
    return i < 0 || j < 0 || i >= CROWD_CELLS || j >= CROWD_CELLS ? -1 : i * CROWD_CELLS + j;
  }

  /**
   * Would `a` stepping to (x, z) come nearer someone within `space` of touching there: another out of doors
   * (`people`), or the hero? Moving apart, or past, is always let.
   */
  private inWay(a: Agent, x: number, z: number, space: number, people = true): boolean {
    // Short of touching only heading at them counts (walking beside, or behind one as fast, is no reason to step aside).
    const h = this.hero, share = space > 0 ? CROWD.heading : 0;
    if (h && pressesInto(a, x, z, h.x, h.z, BODY + CROWD.hero, BODY + CROWD.hero + space, share)) return true;
    if (!people) return false;
    const min = BODY * 2 + space, i0 = Math.floor((x - this.crowdX) / CROWD.cell), j0 = Math.floor((z - this.crowdZ) / CROWD.cell);
    for (let i = Math.max(0, i0 - 1); i <= Math.min(CROWD_CELLS - 1, i0 + 1); i++) for (let j = Math.max(0, j0 - 1); j <= Math.min(CROWD_CELLS - 1, j0 + 1); j++) {
      for (let k = this.crowdHead[i * CROWD_CELLS + j]; k >= 0; k = this.crowdNext[k]) {
        const o = this.agents[k];
        if (o === a || o.hidden) continue;
        // One walking on is judged where it will be (else who follows whom in a file hangs on the order of the steps).
        const go = o.act === 'walk' && !o.stalled && o.stepped !== this.time ? paceOf(o) * this.dt : 0;
        if (pressesInto(a, x, z, o.x + Math.cos(o.dir) * go, o.z + Math.sin(o.dir) * go, BODY * 2, min, share)) return true;
      }
    }
    return false;
  }

  /** A step aside of `len` off (ux, uz), keeping `space` to all and never into a house: true if it took one. */
  private aside(a: Agent, ux: number, uz: number, len: number, space: number): boolean {
    for (const t of CROWD.turns) {
      const c = Math.cos(t), s = Math.sin(t), vx = ux * c - uz * s, vz = ux * s + uz * c, l = len * CROWD.aside;
      const x = a.x + vx * l, z = a.z + vz * l;
      if (this.footprints.blocked(x, z, BODY) || this.inWay(a, x, z, space)) continue;
      a.x = x; a.z = z; a.dir = Math.atan2(vz, vx);
      a.off = true;
      return true;
    }
    return false;
  }

  /**
   * Someone in the way of a step of `len` along (ux, uz): with room to spare a step aside round them; else
   * straight on while not touching; else a closer step aside, else standing to wait. One waited on too long is
   * squeezed past (a jam never holds for ever), but never the hero. True if it took the step (or a way round).
   */
  private giveWay(a: Agent, ux: number, uz: number, len: number, dt: number): boolean {
    const x = a.x + ux * len, z = a.z + uz * len;
    a.stalled = false;
    // Inside a house (between its door and their place) its walls hide them: nobody is minded there.
    if (!this.inWay(a, x, z, CROWD.space) || this.footprints.blocked(a.x, a.z, 0)) { a.waited = 0; return false; }
    // Held up too long (round and round a crowd, or stood): straight on through, but never through the hero.
    if ((a.waited ?? 0) >= CROWD.wait && !this.inWay(a, x, z, 0, false)) return false;
    // Round them counts as held up too, a little (never round and round a crowd for ever).
    if (this.aside(a, ux, uz, len, CROWD.space)) { a.waited = (a.waited ?? 0) + dt * CROWD.round; return true; }
    if (!this.inWay(a, x, z, 0)) return false;
    if (this.aside(a, ux, uz, len, 0)) { a.waited = (a.waited ?? 0) + dt * CROWD.round; return true; }
    a.waited = (a.waited ?? 0) + dt;
    a.stalled = true;
    a.dir = Math.atan2(uz, ux);
    return true;
  }

  /**
   * In a doorway, going in or coming out: through whoever crowds it (one going in is out of the way at once,
   * one coming out cannot wait in the door for a crowd that waits for them).
   */
  private atDoor(a: Agent): boolean {
    const p = a.path, n = p.length;
    const goingIn = (a.next === 'indoors' || a.next === 'sleep') && Math.hypot(a.x - p[n - 2], a.z - p[n - 1]) < CROWD.door;
    return goingIn || (a.pi <= 1 && Math.hypot(a.x - p[0], a.z - p[1]) < CROWD.door && this.footprints.blocked(p[0], p[1], 0.05));
  }

  /** No house on the straight way from (x0, z0) to (x1, z1) (a bend cut short never cuts through one). */
  private openLine(x0: number, z0: number, x1: number, z1: number): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 1; i <= n; i++) if (this.footprints.blocked(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, BODY * 0.5)) return false;
    return true;
  }

  private walk(a: Agent, dt: number): void {
    a.stepped = this.time;
    let left = paceOf(a) * dt;
    const minded = Math.abs(a.x - this.focus.x) < CROWD.near && Math.abs(a.z - this.focus.z) < CROWD.near;
    while (left > 0 && a.pi * 2 < a.path.length) {
      const px = a.path[a.pi * 2], pz = a.path[a.pi * 2 + 1];
      const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
      // Stepped aside, the straight way on to the next point would cut through a house's corner: back to the last first.
      if (a.off && a.pi > 0 && d > 1e-6 && this.footprints.blocked(a.x + (dx / d) * Math.min(left, d), a.z + (dz / d) * Math.min(left, d), BODY * 0.5)) { a.pi--; a.off = false; continue; }
      if (minded && d > 1e-6 && !this.atDoor(a)) {
        // A bend of the way with someone at it: on to the next point already (everyone's way meets at the
        // street graph's points; held to them exactly, a crowd knots there).
        const l = Math.min(left, d);
        if (d < CROWD.pass && a.pi * 2 + 2 < a.path.length && this.inWay(a, a.x + (dx / d) * l, a.z + (dz / d) * l, CROWD.space) && this.openLine(a.x, a.z, a.path[a.pi * 2 + 2], a.path[a.pi * 2 + 3])) { a.pi++; continue; }
        // Someone in the way: round them, or wait.
        if (this.giveWay(a, dx / d, dz / d, l, dt)) return;
      }
      if (d <= left) { a.x = px; a.z = pz; left -= d; a.pi++; a.off = false; continue; }
      a.x += (dx / d) * left; a.z += (dz / d) * left; a.dir = Math.atan2(dz, dx);
      left = 0;
    }
    if (a.pi * 2 >= a.path.length) {
      const s = a.spot >= 0 ? this.spots[a.spot] : null;
      // The turn starts on arrival: its length counts from now.
      const length = a.until - this.time;
      const f = a.seek?.face ?? a.faceTo;
      this.arrive(a, a.x, a.z, f ? facing(a, f.x, f.z) : s ? seatDir(s, a.seat) : a.dir);
      a.until = this.time + Math.max(length, 5);
    }
  }

  /** The way from where the agent is to a target: out around their building, along the streets, in around the next. */
  private wayTo(a: Agent, from: Spot | null, x: number, z: number, to: Spot | null): number[] {
    const out: number[] = [];
    const b0 = from && from.building >= 0 ? this.plan.buildings[from.building] : null;
    const b1 = to && to.building >= 0 ? this.plan.buildings[to.building] : null;
    const exit = b0 && !from!.door ? aroundHouse(b0, a.x, a.z) : [];
    for (let k = exit.length - 2; k >= 0; k -= 2) out.push(exit[k], exit[k + 1]);
    const enter = b1 && !to!.door ? aroundHouse(b1, x, z) : [];
    const sx = out.length ? out[out.length - 2] : a.x, sz = out.length ? out[out.length - 1] : a.z;
    const ex = enter.length ? enter[0] : x, ez = enter.length ? enter[1] : z;
    // Within one plot: no need for the street. Otherwise join the street in front of each building.
    const front = (b: typeof b0): [number, number] | undefined => (b ? [-b.vx, -b.vz] : undefined);
    const street = b0 && b0 === b1 ? [sx, sz, ex, ez] : this.nav.path(sx, sz, ex, ez, front(b0), front(b1));
    out.push(...street.slice(out.length ? 2 : 0), ...enter.slice(2), x, z);
    // Never through a house: the steps off the street (and round a corner) go round any building in the way.
    return wayRound([a.x, a.z, ...out], this.footprints).slice(2);
  }

  /** What to do next for the task at hand: a spot (or a free point), the activity and how long. */
  private pick(a: Agent): { spot: number; x: number; z: number; act: ActivityKind; secs: [number, number]; run?: boolean; face?: { x: number; z: number } } {
    const p = a.person, r = a.rng, rain = this.weather.rain, dark = this.dark;
    const home = this.doorOf(p.home);
    const at = (spot: number, act?: ActivityKind, secs?: [number, number]) => ({ spot, x: 0, z: 0, act: act ?? this.spots[spot].activity, secs: secs ?? this.spots[spot].secs });
    const free = (x: number, z: number, act: ActivityKind, secs: [number, number]) => ({ spot: -1, x, z, act, secs });
    const inside = (spot: number) => at(spot, 'indoors', [120, 400]);
    const stroll = () => { const n = r.int(0, this.nav.xs.length - 1); return free(this.nav.xs[n], this.nav.zs[n], 'stroll', [20, 60]); };
    let task = a.task;
    if (task === 'sleep') return at(home, 'sleep', [600, 1200]);
    if (task === 'away') {
      // On the road: gone where it leaves the town (or still there).
      const [x, z] = this.roadEnds.length ? r.pick(this.roadEnds) : [this.spots[home].x, this.spots[home].z];
      return a.act === 'away' ? free(a.x, a.z, 'away', [600, 1200]) : free(x, z, 'away', [600, 1200]);
    }
    if (task === 'order') {
      const order = this.activeOrder();
      if (order?.kind === 'stayIn') return inside(home);
      if (order?.mood === 'feast') return this.feast(a, order);
      if (order?.mood === 'market') {
        // Round the stalls (where one is free), else about the market looking on.
        const stalls = (this.spotsBy.get('browse') ?? []).filter((s) => s.market && s.users < s.cap);
        if (stalls.length && r.chance(0.7)) return at(r.pick(stalls).id);
      }
      if (order) {
        const ang = r.range(0, Math.PI * 2), rr = order.radius * Math.sqrt(r.float());
        return free(order.x + Math.cos(ang) * rr, order.z + Math.sin(ang) * rr, order.mood === 'market' ? 'browse' : 'gather', [60, 200]);
      }
      task = 'home';
    }
    // Marked on the hero's map: in that building while awake, where the hero was sent to find them.
    const kept = this.kept.get(p.id);
    if (kept !== undefined && this.doorOf(kept) >= 0) return inside(this.doorOf(kept));
    // In the dark only the lit inn and the way home are out of doors.
    if (dark && (task === 'play' || task === 'leisure' || task === 'errands')) task = 'home';
    if (task === 'home') return inside(home);
    if (task === 'lodge') return inside(this.inn >= 0 ? this.inn : home);
    if (task === 'meal') {
      // At home; a guest at the inn; a worker far from home eats at work (bread and cheese in the shop, or out in the field).
      if (p.role === 'traveller') return inside(this.inn >= 0 ? this.inn : home);
      const work = p.work >= 0 && p.work !== p.home ? this.doorOf(p.work) : -1;
      const far = work >= 0 && Math.hypot(this.spots[home].x - this.spots[work].x, this.spots[home].z - this.spots[work].z) > 60;
      // Market folk, and some who work far from home, eat on the market by day (a pie from a stall, standing about).
      if (!dark && rain < 0.4 && (p.role === 'trader' || far) && r.chance(p.role === 'trader' ? 0.7 : 0.4)) {
        const free = (this.spotsBy.get('chat') ?? []).filter((s) => s.users < s.cap);
        if (free.length) return at(r.pick(free).id, 'drink', [240, 600]);
      }
      return inside(far ? work : home);
    }
    if (task === 'temple') {
      // The gathering: inside the temple (the room shows them), a few at the offering before going in.
      if (this.temple < 0) task = 'leisure';
      else if (p.role === 'keeper' || !r.chance(0.15)) return at(this.temple, 'indoors', [300, 900]);
    }
    if (task === 'inn') {
      if (this.inn < 0) return inside(home);
      // Most sit inside; in the dry some take a table out front.
      if (r.chance(0.6 + rain * 0.4)) return at(this.inn, 'indoors', [200, 600]);
    }
    // Candidates with weights; the first free one by weight wins.
    const options: [number, number][] = [];
    const offer = (spot: number, w: number) => {
      if (spot < 0) return;
      const s = this.spots[spot];
      // Nearer is likelier: nobody crosses the town for a bench (but they do for the market).
      const far = 1 + Math.hypot(s.x - a.x, s.z - a.z) / (s.market ? MARKET_REACH : 25);
      // Another turn at the same spot is fine indoors and at one's own work, rarer elsewhere.
      const again = spot === a.spot ? (s.door || s.use === 'work' || s.use === 'trade' ? 1 : 0.3) : 1;
      if (w > 0 && (s.users < s.cap || spot === a.spot)) options.push([spot, (again * w * (s.outside ? 1 - rain * 0.7 : 1 + rain * 2)) / far]);
    };
    const mine = (building: number, use: 'work' | 'home') => this.spotsBy.get(`${building}:${use}`) ?? [];
    const town = (activity: ActivityKind) => this.spotsBy.get(activity) ?? [];
    const each = (activity: ActivityKind, w: number) => { for (const s of this.spots) if (s.activity === activity) offer(s.id, w); };
    const homeWork = p.role === 'homemaker' || p.role === 'child' || p.role === 'traveller';
    if (task === 'work' && homeWork) task = 'chores';
    if (task === 'work') {
      if (p.role === 'trader') for (const s of this.spots) if (s.use === 'trade') offer(s.id, 8);
      if (p.role === 'keeper') for (const s of this.spots) if (s.building === p.work && !s.door) offer(s.id, s.activity === 'pray' ? 4 : 1);
      // The master works the tools; a hand works them too, fetches and carries for the shop.
      for (const s of mine(p.work, 'work')) offer(s.id, p.role === 'hand' ? 3 : 6);
      if (p.role === 'hand') {
        for (const s of mine(p.work, 'home')) offer(s.id, 2);
        for (const s of town('fetchWater')) offer(s.id, 0.6);
      }
      if (p.work >= 0) offer(this.doorOf(p.work), p.role === 'keeper' ? 3 : 1.5);
      // A break now and then, for the less diligent.
      for (const s of town('fetchWater')) offer(s.id, 0.15 * (1 - p.diligent));
      for (const s of town('sit')) offer(s.id, 0.1 * (1 - p.diligent));
    } else if (task === 'play') {
      // Children play by the house and on the market.
      const [hx, hz] = [this.spots[home].x, this.spots[home].z];
      if (r.chance(0.8 - rain * 0.6)) {
        const b = this.plan.buildings[p.home];
        if (r.chance(0.8) || Math.hypot(hx - this.market[0], hz - this.market[1]) > 80) {
          // In front of the house, on its side of the street.
          const side = r.range(-1, 1) * b.hu, out = r.range(1.5, 4);
          const px = hx + Math.cos(b.angle) * side - b.vx * out, pz = hz + Math.sin(b.angle) * side - b.vz * out;
          // Not where a house across the lane stands.
          if (this.freeGround(px, pz)) return free(px, pz, 'play', [30, 120]);
        }
        for (let k = 0; k < 4; k++) {
          const ang = r.range(0, Math.PI * 2), d = r.range(2, 9), px = this.market[0] + Math.cos(ang) * d, pz = this.market[1] + Math.sin(ang) * d;
          if (this.freeGround(px, pz)) return free(px, pz, 'play', [30, 120]);
        }
      }
      offer(home, 1);
    } else if (task === 'rise') {
      // Up and about: wood for the fire, the hens, water from the well (if it is light enough).
      for (const s of mine(p.home, 'home')) offer(s.id, s.activity === 'fetchWood' || s.activity === 'feedHens' ? 3 : 0.3);
      if (!dark) for (const s of town('fetchWater')) offer(s.id, 2);
      offer(home, 2);
    } else if (task === 'chores') {
      // Keeping house: the garden, the washing, wood and hens, and the cooking and sweeping indoors. Children help.
      const kid = p.role === 'child', yard = mine(p.home, 'home');
      for (const s of yard) offer(s.id, dark ? 0 : kid ? (s.activity === 'feedHens' || s.activity === 'garden' ? 2 : 0.3) : 2);
      // Water from the well (the house's one outdoor chore if it has no yard).
      if (!dark) for (const s of town('fetchWater')) offer(s.id, (kid ? 0.8 : 0.5) + (yard.length ? 0 : 2));
      offer(home, dark ? 6 : 2.5);
    } else if (task === 'errands') {
      // The well, the stalls and the shops, nearer ones first; a prayer on the way for the pious.
      for (const s of town('fetchWater')) offer(s.id, 2);
      for (const s of town('browse')) offer(s.id, 2.5);
      for (const s of town('chat')) offer(s.id, 1.2 + p.social);
      for (const d of this.shops) if (this.spots[d].building !== p.home && this.spots[d].building !== p.work) offer(d, 1.5);
      each('pray', 0.5 * p.pious);
    } else if (task === 'leisure' || task === 'inn' || task === 'temple') {
      // Free time: a bench, a table at the inn, the market, the temple; the inn's tables if the inn it is.
      const inn = task === 'inn';
      for (const s of this.spots) {
        if (s.activity === 'drink') offer(s.id, inn ? 4 : 0.4 + p.social * 1.2);
        else if (inn) continue;
        else if (s.activity === 'sit') offer(s.id, 1 + p.social * 2);
        else if (s.activity === 'browse') offer(s.id, 1);
        else if (s.activity === 'chat') offer(s.id, 0.8 + p.social * 1.6);
        else if (s.activity === 'pray') offer(s.id, task === 'temple' ? 4 : 1.2 * p.pious);
        else if (s.activity === 'mourn') offer(s.id, 0.1 * p.pious);
      }
      if (!inn) offer(home, 0.8);
      if (!inn && p.role === 'traveller' && r.chance(0.2)) return stroll();
    }
    if (options.length) {
      let total = 0;
      for (const [, w] of options) total += w;
      let x = r.float() * total;
      for (const [spot, w] of options) if ((x -= w) <= 0) return at(spot, undefined, this.spots[spot].door && task === 'errands' ? [25, 80] : undefined);
      return at(options[options.length - 1][0]);
    }
    // Nothing free: indoors at home in the dark, otherwise a stroll along the streets (never standing about).
    return dark ? inside(home) : stroll();
  }

  private readonly doors = new Map<number, number>();
  private doorOf(building: number): number {
    let d = this.doors.get(building);
    if (d === undefined) { d = this.spots.findIndex((s) => s.door && s.building === building); this.doors.set(building, d); }
    return d;
  }
}

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
import { polyCentroid, type TownPlan } from '@futuremagic/settlement';
import { NavGraph, aroundHouse } from './nav';
import type { DayTask, RoutinesDef } from '../setting/contract';
import { routines as classicRoutines } from '../setting/classic/routines';
import { away, buildingOf, townsfolk, type Person } from './people';
import { dayPlan, taskAt, type DayPlan } from './routines';
import { seatAt, seatDir, townSpots, type ActivityKind, type Spot } from './spots';
import { inRoom } from './roomCast';

/** What someone is about: their plan's task, a VGM order, or out of town. */
export type Task = DayTask | 'order' | 'away';

/** A VGM order for the town (plain data, logged with the decisions): times in game hours since the start (day × 24 + hour). */
export type TownOrder =
  /** Everyone awake comes together around a place (a festival, a speech, a hanging). */
  | { kind: 'gather'; x: number; z: number; radius: number; from: number; to: number }
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
  /**
   * Still crossing a room drawn open on the way out (sim seconds): they set off from its doorstep once the time
   * passes this (app/interiorVisit keeps it ahead while they walk to the door).
   */
  stay?: number;
  /** Held in a building's room (they were in it when the talk began): drawn there, not where they stand outside (read only while `held`). */
  heldIn?: boolean;
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
const AT_A_THING = new Set<ActivityKind>(['smith', 'stoke', 'quench', 'bake', 'craft', 'tend', 'serve']);

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

/** A townsperson's radius as an obstacle (m). */
const BODY = 0.28;

/** Trades one goes into on an errand (to buy bread, have shoes mended ...). */
const SHOPS = new Set(['baker', 'butcher', 'chandler', 'cobbler', 'tailor', 'potter', 'weaver', 'cooper', 'smith', 'miller', 'fletcher', 'bowyer', 'armourer', 'jeweller', 'bookbinder', 'glazier']);

/** Market spots weigh as if this many metres away per step of 1 (25 for the rest): the market draws from all over the town. */
const MARKET_REACH = 110;

/** Agents farther than this from the focus skip their walks (m). */
const DETAIL = 260;

export class TownLife {
  readonly nav: NavGraph;
  readonly spots: Spot[];
  readonly agents: Agent[] = [];
  /** People still to come in (`grow`: a big town is made over several frames), and the seed their days come from. */
  private readonly waiting: readonly Person[];
  private readonly seed: number;
  /** Sim seconds. */
  time = 0;
  /** Where detail matters (the player). */
  focus = { x: 0, z: 0 };
  private readonly orders: TownOrder[] = [];
  /** Everyone has fled (a band holds the place, vgm/events.ts take): all are away until it is false again. */
  gone = false;
  private readonly market: [number, number];
  /** Where each road out leaves the town (travellers come and go there). */
  private readonly roadEnds: [number, number][] = [];
  private hour = 12;
  /** Game hours since the start (orders are timed in these). */
  private hours = 12;
  private weather: TownWeather = { rain: 0 };

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
    this.seed = seed;
    this.waiting = people;
    this.market = polyCentroid(plan.market) as [number, number];
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

  /** Give the town an order (the VGM's way in). */
  order(o: TownOrder): void { this.orders.push(o); }

  /** Advance `dt` real seconds at `hours` game hours since the start (day × 24 + hour). */
  step(dt: number, hours: number, weather: TownWeather = this.weather): void {
    this.time += dt;
    this.hours = hours;
    this.hour = ((hours % 24) + 24) % 24;
    this.weather = weather;
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

  /**
   * Stop someone for a talk: they turn to (x, z) where they stand; one at their work behind a barrel, an anvil or
   * an oven (the thing between them and the one talking) first comes round it, and is seen walking there.
   */
  hold(a: Agent, x: number, z: number): void {
    const s = a.spot >= 0 ? this.spots[a.spot] : null;
    a.heldIn = !!s && inRoom(a, s);
    a.held = true;
    a.act = 'chat';
    a.hidden = false;
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
    if (a.post) return;
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
    a.until = this.time + a.rng.range(pick.secs[0], pick.secs[1]) * (s?.outside && (this.weather.rain > 0.5 || this.dark) ? 0.5 : 1);
    if (here || (s && s === was) || (Math.hypot(a.x - this.focus.x, a.z - this.focus.z) > DETAIL && Math.hypot(tx - this.focus.x, tz - this.focus.z) > DETAIL)) {
      this.arrive(a, tx, tz, s ? seatDir(s, a.seat) : a.dir);
      return;
    }
    a.path = this.wayTo(a, was, tx, tz, s);
    a.pi = 0;
    a.act = 'walk';
    a.hidden = false;
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

  private walk(a: Agent, dt: number): void {
    let left = a.person.speed * dt;
    while (left > 0 && a.pi * 2 < a.path.length) {
      const px = a.path[a.pi * 2], pz = a.path[a.pi * 2 + 1];
      const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
      if (d <= left) { a.x = px; a.z = pz; left -= d; a.pi++; continue; }
      a.x += (dx / d) * left; a.z += (dz / d) * left; a.dir = Math.atan2(dz, dx);
      left = 0;
    }
    if (a.pi * 2 >= a.path.length) {
      const s = a.spot >= 0 ? this.spots[a.spot] : null;
      // The turn starts on arrival: its length counts from now.
      const length = a.until - this.time;
      const f = a.seek?.face;
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
    return out;
  }

  /** What to do next for the task at hand: a spot (or a free point), the activity and how long. */
  private pick(a: Agent): { spot: number; x: number; z: number; act: ActivityKind; secs: [number, number] } {
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
      if (order) {
        const ang = r.range(0, Math.PI * 2), rr = order.radius * Math.sqrt(r.float());
        return free(order.x + Math.cos(ang) * rr, order.z + Math.sin(ang) * rr, 'gather', [60, 200]);
      }
      task = 'home';
    }
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
        const free = this.spots.filter((s) => s.activity === 'chat' && s.users < s.cap);
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
    const mine = (building: number, use: 'work' | 'home') => this.spots.filter((s) => s.building === building && s.use === use && !s.door);
    const town = (activity: ActivityKind) => this.spots.filter((s) => s.building === -1 && s.activity === activity);
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
          return free(hx + Math.cos(b.angle) * side - b.vx * out, hz + Math.sin(b.angle) * side - b.vz * out, 'play', [30, 120]);
        }
        const ang = r.range(0, Math.PI * 2), d = r.range(2, 9);
        return free(this.market[0] + Math.cos(ang) * d, this.market[1] + Math.sin(ang) * d, 'play', [30, 120]);
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

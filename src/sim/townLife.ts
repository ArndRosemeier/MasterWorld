/**
 * Life in a town (plan 9.3, the citizens' part of the world simulation): every townsperson is an agent
 * that is always either on the way somewhere or doing something there. What they do comes from their
 * part of the day (people.ts), their trade, the smart objects around (spots.ts), the weather and the
 * VGM's orders. Turns at a spot last real seconds; the game clock only says which part of the day it
 * is, so a stopped clock still gives a busy town. Agents far from the focus (the player) skip their
 * walks. Deterministic for a seed and a sequence of steps. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { polyCentroid, type TownPlan } from '@futuremagic/settlement';
import { NavGraph, aroundHouse } from './nav';
import { blockAt, townsfolk, type Block, type Person } from './people';
import { townSpots, type ActivityKind, type Spot } from './spots';

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
  /** The spot they are at or heading to (-1: a free point). */
  spot: number;
  /** Indoors: not to be drawn. */
  hidden: boolean;
  /** When the turn ends (sim seconds). */
  until: number;
  /** The walk: x, z pairs, and the index of the next point. */
  path: number[];
  pi: number;
  /** The part of the day the current choice was made for. */
  block: Block | 'order';
  rng: Rng;
}

export interface TownWeather {
  /** 0 dry .. 1 pouring. */
  rain: number;
}

/** Agents farther than this from the focus skip their walks (m). */
const DETAIL = 260;

export class TownLife {
  readonly nav: NavGraph;
  readonly spots: Spot[];
  readonly agents: Agent[];
  /** Sim seconds. */
  time = 0;
  /** Where detail matters (the player). */
  focus = { x: 0, z: 0 };
  private readonly orders: TownOrder[] = [];
  private readonly market: [number, number];
  private hour = 12;
  /** Game hours since the start (orders are timed in these). */
  private hours = 12;
  private weather: TownWeather = { rain: 0 };

  constructor(readonly plan: TownPlan, seed: number, hour: number) {
    this.nav = new NavGraph(plan);
    this.spots = townSpots(plan);
    this.market = polyCentroid(plan.market) as [number, number];
    this.focus = { x: this.market[0], z: this.market[1] };
    this.hour = hour % 24;
    this.hours = hour;
    this.agents = townsfolk(plan, seed).map((p) => {
      const d = plan.buildings[p.home].door;
      const a: Agent = { person: p, x: d[0], z: d[1], dir: d[2], act: 'wait', next: 'wait', spot: -1, hidden: false, until: 0, path: [], pi: 0, block: 'sleep', rng: new Rng(deriveSeed(seed, 'life', p.id)) };
      // Start in the middle of something, already there.
      this.choose(a, true);
      a.until = this.time + a.rng.range(0, 1) * (a.until - this.time);
      return a;
    });
  }

  /** Give the town an order (the VGM's way in). */
  order(o: TownOrder): void { this.orders.push(o); }

  /** Advance `dt` real seconds at `hours` game hours since the start (day × 24 + hour). */
  step(dt: number, hours: number, weather: TownWeather = this.weather): void {
    this.time += dt;
    this.hours = hours;
    this.hour = ((hours % 24) + 24) % 24;
    this.weather = weather;
    for (const a of this.agents) {
      if (a.act === 'walk') this.walk(a, dt);
      else if (this.time >= a.until || this.blockOf(a) !== a.block) this.choose(a, false);
    }
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

  private blockOf(a: Agent): Block | 'order' {
    const b = blockAt(a.person, this.hour);
    return b !== 'sleep' && this.activeOrder() ? 'order' : b;
  }

  /** Pick the next thing to do and set off (or, `here`, start there at once). */
  private choose(a: Agent, here: boolean): void {
    const was = a.spot >= 0 ? this.spots[a.spot] : null;
    if (was) was.users--;
    a.block = this.blockOf(a);
    const pick = this.pick(a);
    a.spot = pick.spot;
    if (pick.spot >= 0) this.spots[pick.spot].users++;
    const s = pick.spot >= 0 ? this.spots[pick.spot] : null;
    const tx = s ? s.x : pick.x, tz = s ? s.z : pick.z;
    a.next = pick.act;
    a.until = this.time + a.rng.range(pick.secs[0], pick.secs[1]) * (s?.outside && this.weather.rain > 0.5 ? 0.5 : 1);
    if (here || (s && s === was) || (Math.hypot(a.x - this.focus.x, a.z - this.focus.z) > DETAIL && Math.hypot(tx - this.focus.x, tz - this.focus.z) > DETAIL)) {
      this.arrive(a, tx, tz, s ? s.dir : a.dir);
      return;
    }
    a.path = this.wayTo(a, was, tx, tz, s);
    a.pi = 0;
    a.act = 'walk';
    a.hidden = false;
  }

  private arrive(a: Agent, x: number, z: number, dir: number): void {
    a.x = x; a.z = z; a.dir = dir;
    a.act = a.next;
    a.hidden = a.act === 'sleep' || a.act === 'indoors';
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
      this.arrive(a, a.x, a.z, s ? s.dir : a.dir);
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

  /** What to do next: a spot (or a free point), the activity and how long. */
  private pick(a: Agent): { spot: number; x: number; z: number; act: ActivityKind; secs: [number, number] } {
    const p = a.person, r = a.rng, rain = this.weather.rain;
    const home = this.doorOf(p.home);
    const at = (spot: number, act?: ActivityKind, secs?: [number, number]) => ({ spot, x: 0, z: 0, act: act ?? this.spots[spot].activity, secs: secs ?? this.spots[spot].secs });
    const free = (x: number, z: number, act: ActivityKind, secs: [number, number]) => ({ spot: -1, x, z, act, secs });
    const block = a.block;
    if (block === 'sleep') return at(home, 'sleep', [600, 1200]);
    const order = this.activeOrder();
    if (block === 'order' && order) {
      if (order.kind === 'stayIn') return at(home, 'indoors', [120, 400]);
      const ang = r.range(0, Math.PI * 2), rr = order.radius * Math.sqrt(r.float());
      return free(order.x + Math.cos(ang) * rr, order.z + Math.sin(ang) * rr, 'gather', [60, 200]);
    }
    // Candidates with weights; the first free one by weight wins.
    const options: [number, number][] = [];
    const offer = (spot: number, w: number) => {
      const s = this.spots[spot];
      // Nearer is likelier: nobody crosses the town for a bench.
      const far = 1 + Math.hypot(s.x - a.x, s.z - a.z) / 35;
      // Another turn at the same spot is fine indoors and at one's own work, rarer elsewhere.
      const again = spot === a.spot ? (s.door || s.use === 'work' || s.use === 'trade' ? 1 : 0.3) : 1;
      if (w > 0 && (s.users < s.cap || spot === a.spot)) options.push([spot, (again * w * (s.outside ? 1 - rain * 0.7 : 1 + rain * 2)) / far]);
    };
    const mine = (building: number, use: 'work' | 'home') => this.spots.filter((s) => s.building === building && s.use === use && !s.door);
    const town = (activity: ActivityKind) => this.spots.filter((s) => s.building === -1 && s.activity === activity);
    if (block === 'work' && p.role !== 'homemaker' && p.role !== 'child') {
      if (p.role === 'trader') for (const s of this.spots) if (s.use === 'trade') offer(s.id, 8);
      if (p.role === 'keeper') for (const s of this.spots) if (s.building === p.work && !s.door) offer(s.id, s.activity === 'pray' ? 4 : 1);
      // The master works the tools; a hand fetches and carries for the shop.
      if (p.role === 'hand') for (const s of mine(p.work, 'home')) offer(s.id, 3);
      else for (const s of mine(p.work, 'work')) offer(s.id, 6);
      if (p.role === 'hand') for (const s of town('fetchWater')) offer(s.id, 1);
      if (p.role === 'hand') for (const s of town('browse')) offer(s.id, 0.6);
      if (p.work >= 0) offer(this.doorOf(p.work), 1.5);
      // A break now and then.
      for (const s of town('fetchWater')) offer(s.id, 0.3 * (1 - p.diligent));
      for (const s of town('sit')) offer(s.id, 0.2 * (1 - p.diligent));
    } else if (block === 'work' && p.role === 'child' || p.role === 'child' && block === 'evening') {
      // Children play by the house and on the market, and help a little.
      const [hx, hz] = [this.spots[home].x, this.spots[home].z];
      if (r.chance(0.65 - rain * 0.5)) {
        const b = this.plan.buildings[p.home];
        if (r.chance(0.85) || Math.hypot(hx - this.market[0], hz - this.market[1]) > 80) {
          // In front of the house, on its side of the street.
          const side = r.range(-1, 1) * b.hu, out = r.range(1.5, 4);
          return free(hx + Math.cos(b.angle) * side - b.vx * out, hz + Math.sin(b.angle) * side - b.vz * out, 'play', [30, 120]);
        }
        const ang = r.range(0, Math.PI * 2), d = r.range(2, 9);
        return free(this.market[0] + Math.cos(ang) * d, this.market[1] + Math.sin(ang) * d, 'play', [30, 120]);
      }
      for (const s of mine(p.home, 'home')) offer(s.id, s.activity === 'feedHens' ? 3 : 0.5);
      offer(home, 1);
    } else {
      // Keeping house, mornings, meals and evenings.
      const morning = block === 'morning', meal = block === 'meal', evening = block === 'evening';
      // A worker far from home eats at work (bread and cheese in the shop).
      const farWork = p.work >= 0 && Math.hypot(this.spots[home].x - this.spots[this.doorOf(p.work)].x, this.spots[home].z - this.spots[this.doorOf(p.work)].z) > 60;
      offer(meal && farWork ? this.doorOf(p.work) : home, meal ? 10 : morning ? 2 : evening ? 2 + (1 - p.social) * 3 : 1.5);
      for (const s of mine(p.home, 'home')) offer(s.id, meal ? 0.2 : evening ? 0.4 : 2);
      for (const s of town('fetchWater')) offer(s.id, morning ? 3 : 1);
      for (const s of town('browse')) offer(s.id, evening ? 1 : morning ? 0.3 : 1.2);
      for (const s of town('sit')) offer(s.id, evening ? 1 + p.social * 2 : 0.4);
      for (const s of this.spots) {
        if (s.activity === 'drink') offer(s.id, evening ? 0.6 + p.social * 2.5 : meal ? p.social * 0.6 : 0.05);
        else if (s.activity === 'pray') offer(s.id, (evening ? 1 : 0.3) * p.pious);
        else if (s.activity === 'mourn') offer(s.id, 0.04 * p.pious);
      }
    }
    if (options.length) {
      let total = 0;
      for (const [, w] of options) total += w;
      let x = r.float() * total;
      for (const [spot, w] of options) if ((x -= w) <= 0) return at(spot);
      return at(options[options.length - 1][0]);
    }
    // Nothing free: a stroll along the streets (never standing about).
    const n = r.int(0, this.nav.xs.length - 1);
    return free(this.nav.xs[n], this.nav.zs[n], 'stroll', [20, 60]);
  }

  private readonly doors = new Map<number, number>();
  private doorOf(building: number): number {
    let d = this.doors.get(building);
    if (d === undefined) { d = this.spots.findIndex((s) => s.door && s.building === building); this.doors.set(building, d); }
    return d;
  }
}

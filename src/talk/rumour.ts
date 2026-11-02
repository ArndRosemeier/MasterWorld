/**
 * How word gets round a town (D68, phase N2; plan 9.1, 9.2): who meets whom in the town's day, and how long
 * what one knows takes to reach another. A household talks at table, workmates at work, near neighbours over
 * the fence (one talker of each house), and the chatty ones at the inn. The one who tells hurries or dawdles by
 * how sociable they are. Starting from those who saw it, word moves outward hop by hop, so by one hour it has
 * reached the house, by half a day the lane, and the far side of town a day later; each person who hears has
 * someone they heard it from. Pure: a graph of the town's people and a shortest-time search over it.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { TownPlan } from '@futuremagic/settlement';
import type { Person } from '../sim/people';

/** Game hours word takes between two people of a household, of one workplace, of neighbouring houses, and between the inn and its regulars (before the teller's sociability). */
const HOURS = { household: 0.5, work: 2, lane: 6, inn: 10 } as const;
/** Each house talks over the fence with this many of the houses nearest it. */
const LANE = 3;
/** The chatty are those at least this sociable: they go to the inn. */
const CHATTY = 0.5;

/** When one heard, and from whom. */
export interface Word {
  readonly from: number;
  /** Game hours. */
  readonly at: number;
}

/** The parts of a person word travels by. */
export type Gossip = Pick<Person, 'id' | 'home' | 'work' | 'role' | 'social'>;

const grown = (p: Gossip) => p.role !== 'child';

export class Rumour {
  private readonly out = new Map<number, { readonly to: number; readonly hours: number }[]>();
  private readonly byId = new Map<number, Gossip>();

  constructor(people: readonly Gossip[], plan: Pick<TownPlan, 'buildings'>, seed: number) {
    const s = deriveSeed(seed, 'rumour');
    for (const p of people) { this.byId.set(p.id, p); this.out.set(p.id, []); }
    // An edge goes both ways; a seeded third more or less on how long it takes.
    const link = (a: number, b: number, hours: number) => {
      if (a === b) return;
      const h = hours * (0.7 + 0.6 * hash2f(s, Math.min(a, b), Math.max(a, b)));
      this.out.get(a)!.push({ to: b, hours: h });
      this.out.get(b)!.push({ to: a, hours: h });
    };
    const house = new Map<number, Gossip[]>(), work = new Map<number, Gossip[]>();
    for (const p of people) {
      (house.get(p.home) ?? house.set(p.home, []).get(p.home)!).push(p);
      if (p.work >= 0 && grown(p)) (work.get(p.work) ?? work.set(p.work, []).get(p.work)!).push(p);
    }
    for (const group of house.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) link(group[i]!.id, group[j]!.id, HOURS.household);
    for (const group of work.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) link(group[i]!.id, group[j]!.id, HOURS.work);
    // The talker of each house: the most sociable grown-up (the one who tells the neighbours).
    const talker = new Map<number, Gossip>();
    for (const [h, group] of house) {
      const t = group.filter(grown).sort((a, b) => b.social - a.social || a.id - b.id)[0];
      if (t) talker.set(h, t);
    }
    const homes = [...talker.keys()].sort((a, b) => a - b);
    for (const h of homes) {
      const b = plan.buildings[h]!;
      const near = homes.filter((o) => o !== h).sort((x, y) => Math.hypot(plan.buildings[x]!.cx - b.cx, plan.buildings[x]!.cz - b.cz) - Math.hypot(plan.buildings[y]!.cx - b.cx, plan.buildings[y]!.cz - b.cz) || x - y);
      for (const o of near.slice(0, LANE)) link(talker.get(h)!.id, talker.get(o)!.id, HOURS.lane);
    }
    // The inn: its keeper hears from the chatty of every house, and tells them what others said.
    const keeper = people.find((p) => plan.buildings[p.home]?.kind === 'inn' && p.role === 'trade');
    if (keeper) for (const t of talker.values()) if (t.social >= CHATTY && t.home !== keeper.home) link(keeper.id, t.id, HOURS.inn);
  }

  /**
   * When word reaches each person if it starts with `first` (those who saw it or know it first-hand) at game hour `at`: for
   * everyone it reaches, the hour it does and who they heard it from (the one who got it to them soonest).
   */
  reach(first: readonly number[], at: number): Map<number, Word> {
    const done = new Map<number, Word>();
    const best = new Map<number, Word>();
    for (const id of first) if (this.byId.has(id)) best.set(id, { from: id, at });
    while (best.size) {
      let pick: number | null = null;
      for (const [id, w] of best) if (pick === null || w.at < best.get(pick)!.at || (w.at === best.get(pick)!.at && id < pick)) pick = id;
      const w = best.get(pick!)!;
      best.delete(pick!);
      done.set(pick!, w);
      const teller = this.byId.get(pick!)!;
      // Children tell only their own household.
      for (const e of this.out.get(pick!)!) {
        if (done.has(e.to)) continue;
        const to = this.byId.get(e.to)!;
        if (!grown(teller) && to.home !== teller.home) continue;
        // The more sociable the teller, the sooner they tell.
        const t = w.at + e.hours / (0.5 + teller.social);
        const old = best.get(e.to);
        if (!old || t < old.at) best.set(e.to, { from: pick!, at: t });
      }
    }
    return done;
  }
}

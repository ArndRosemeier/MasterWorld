/**
 * A townsperson's day (plan 9.2): the setting's routine for their part in town (or their trade's own
 * hours), on a working day or the rest day, shifted by how early they rise and varied a little from day
 * to day. The choices a routine leaves open (the inn tonight, or home?) are made once a day, from the
 * person's seed and traits, so a day is one story and not a coin toss every minute. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { DayPart, DayTask, RoutinesDef } from '../setting/contract';
import type { Person } from './people';

/** One person's plan for one day: the hours each part starts (rising, the first at 0) and what it is. */
export interface DayPlan {
  day: number;
  rest: boolean;
  at: number[];
  task: DayTask[];
}

/** Whether game day `day` (0 the first) is the rest day. */
export function isRestDay(r: RoutinesDef, day: number): boolean {
  return ((day % r.week) + r.week) % r.week === r.restDay;
}

/** The routine parts for a person on a working day or the rest day. */
export function partsOf(r: RoutinesDef, p: Person, rest: boolean): readonly DayPart[] {
  const own = r.trades[p.trade] && (p.role === 'trade' || p.role === 'hand') ? r.trades[p.trade] : r.roles[p.role] ?? r.roles.homemaker;
  return rest ? own.restday ?? r.restday : own.workday;
}

/** A person's plan for game day `day`. */
export function dayPlan(r: RoutinesDef, p: Person, day: number): DayPlan {
  const rest = isRestDay(r, day);
  const parts = partsOf(r, p, rest);
  const rng = new Rng(deriveSeed(p.seed, 'day', day));
  // Early risers rise early and go to bed early; the whole day moves with them, and a little each day.
  const shift = (0.5 - p.early) * 2 * r.shift + rng.range(-r.jitter, r.jitter);
  const at: number[] = [], task: DayTask[] = [];
  for (const part of parts) {
    let t = part.do;
    if (part.or) {
      const w = part.or.trait ? p[part.or.trait] * 2 : 1;
      if (rng.float() < part.or.chance * w) t = part.or.do;
    }
    const h = part.at === 0 ? 0 : Math.min(23.99, Math.max(0.01, part.at + shift));
    // Two parts in a row doing the same are one.
    if (task.length && task[task.length - 1] === t) continue;
    at.push(h);
    task.push(t);
  }
  return { day, rest, at, task };
}

/** What the plan has them doing at `hour` (0..24). */
export function taskAt(plan: DayPlan, hour: number): DayTask {
  let i = 0;
  while (i + 1 < plan.at.length && plan.at[i + 1] <= hour) i++;
  return plan.task[i];
}

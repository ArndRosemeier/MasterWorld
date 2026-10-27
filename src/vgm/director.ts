/**
 * The VGM's Director (plan 4.1, D4, D29): it keeps play feeling good. Five needs grow with time and fall
 * when play meets them; a tension curve (calm, build-up, peak, relief) follows what happens; messages wait
 * in a queue so the screen never floods; fairness rules say when the world may press the hero. It never
 * scales the world to the hero: it only says how a place compares (the warnings) and which need is most
 * overdue, so the Builder can put something fitting *somewhere*. Pure; saved as plain data.
 */
import type { DirectorDef } from '../setting/contract';
import { threatOf, type Threat } from '../sim/combat';

export const NEEDS = ['discovery', 'challenge', 'reward', 'people', 'purpose'] as const;
export type Need = (typeof NEEDS)[number];

export type Phase = 'calm' | 'build' | 'peak' | 'relief';

/** The music layer the tension asks for (plan 16). */
export type Mood = 'town' | 'explore' | 'tension' | 'fight';

/** What the Director watches this step (plan 4.3). */
export interface Signals {
  /** Creatures fighting the hero. */
  readonly fighting: number;
  /** Danger of the creatures that know of the hero or are close, against the hero's power (0: none). */
  readonly pressure: number;
  /** 0 dead .. 1 unhurt. */
  readonly health: number;
  /** In talk or a dialog. */
  readonly talking: boolean;
  /** Below ground. */
  readonly underground: boolean;
  /** Within a town. */
  readonly inTown: boolean;
  /** Open leads in the journal. */
  readonly leads: number;
}

export interface DirectorSave {
  readonly needs: Readonly<Record<Need, number>>;
  readonly tension: number;
}

interface Queued { readonly text: string; readonly priority: number; readonly at: number }

/** Least seconds between two queued messages. */
const GAP = 2.5;

/**
 * How careful the world is with the hero (plan 11.1): a roguelike hero has one life, so the Director is
 * stricter with fairness. `health`/`rest`: the world presses only above this health and this many seconds
 * after a fight; `fitTop`: a fitting place is at most this times the hero's power; `warnAt`: the least threat
 * a place's door warns of; `retreat`: below this health in a fight the hero is told to get out (0: never).
 */
export interface Fairness {
  readonly health: number;
  readonly rest: number;
  readonly fitTop: number;
  readonly warnAt: Threat;
  readonly retreat: number;
}

export const FAIRNESS: { readonly classic: Fairness; readonly strict: Fairness } = {
  classic: { health: 0.6, rest: 30, fitTop: 1.5, warnAt: 'hard', retreat: 0 },
  strict: { health: 0.85, rest: 60, fitTop: 1.2, warnAt: 'even', retreat: 0.35 },
};

export class Director {
  readonly needs: Record<Need, number>;
  /** 0 .. 1. */
  tension = 0;
  phase: Phase = 'calm';
  /** Seconds since the last fight ended (relief lasts a while). */
  private sinceFight = 999;
  private seconds = 0;
  private gap = 0;
  private readonly waiting: Queued[] = [];
  private signals: Signals | null = null;
  /** Told to get out in this fight already. */
  private urged = false;
  /** One life (roguelike): stricter fairness. */
  strict = false;
  /** The VGM's pacing (the game settings, vgmLog.ts PACING): the needs grow this many times the setting's rates. */
  pace = 1;

  constructor(private readonly def: DirectorDef, saved?: DirectorSave) {
    this.needs = { discovery: 0, challenge: 0, reward: 0, people: 0, purpose: 0, ...(saved?.needs ?? {}) };
    this.tension = saved?.tension ?? 0;
  }

  observe(dt: number, s: Signals): void {
    this.seconds += dt;
    this.signals = s;
    const minutes = dt / 60;
    for (const n of NEEDS) {
      // Purpose is met while there is a lead; People while among them.
      if (n === 'purpose' && s.leads > 0) this.needs.purpose = 0;
      else if (n === 'people' && s.inTown) this.needs.people = Math.max(0, this.needs.people - minutes);
      else this.needs[n] += this.def.needs[n] * this.pace * minutes;
    }
    // Tension: a fight drives it to the top, nearby danger towards it, and it falls slowly after.
    const goal = s.fighting > 0 ? 0.85 + Math.min(0.15, s.pressure * 0.1) : Math.min(0.7, s.pressure * 0.5 + (s.underground ? 0.2 : 0));
    const rate = goal > this.tension ? 1.5 : 0.08;
    this.tension += (goal - this.tension) * Math.min(1, rate * dt);
    if (s.fighting > 0) this.sinceFight = 0;
    else { this.sinceFight += dt; this.urged = false; }
    // One life: badly hurt in a fight, the hero is told to get out while they can.
    if (s.fighting > 0 && !this.urged && s.health > 0 && s.health < this.fairness.retreat) {
      this.urged = true;
      this.queue('You are badly hurt, and there will be no waking at the inn. Get out while you still can.', 3);
    }
    this.phase = s.fighting > 0 ? 'peak' : this.sinceFight < 25 ? 'relief' : this.tension > 0.3 ? 'build' : 'calm';
    this.gap = Math.max(0, this.gap - dt);
  }

  /** Play met a need (a fight met Challenge, a find met Reward, ...): `amount` 1 meets it in full. */
  met(n: Need, amount = 1): void {
    this.needs[n] = Math.max(0, this.needs[n] - amount);
  }

  /** The most overdue need, if any is due (score at least 1). */
  get overdue(): Need | null {
    let best: Need | null = null;
    for (const n of NEEDS) if (this.needs[n] >= 1 && (!best || this.needs[n] > this.needs[best])) best = n;
    return best;
  }

  get mood(): Mood {
    const s = this.signals;
    if (this.phase === 'peak') return 'fight';
    if (this.tension > 0.35) return 'tension';
    return s?.inTown ? 'town' : 'explore';
  }

  get fairness(): Fairness { return this.strict ? FAIRNESS.strict : FAIRNESS.classic; }

  /** May the world press the hero now (an ambush, a spawn): never while hurt, talking or just after a fight (stricter with one life). */
  get fair(): boolean {
    const s = this.signals, f = this.fairness;
    return !!s && !s.talking && s.health > f.health && this.sinceFight > f.rest;
  }

  /** Queue a message; the most important waiting one comes first, one every few seconds. */
  queue(text: string, priority = 1): void {
    if (this.waiting.some((q) => q.text === text)) return;
    this.waiting.push({ text, priority, at: this.seconds });
  }

  /** The next message to show now, if its turn has come. */
  next(): string | null {
    if (this.gap > 0 || !this.waiting.length) return null;
    this.waiting.sort((a, b) => b.priority - a.priority || a.at - b.at);
    this.gap = GAP;
    return this.waiting.shift()!.text;
  }

  snapshot(): DirectorSave {
    return { needs: { ...this.needs }, tension: this.tension };
  }
}

/** How a place's danger reads to a hero of `power` (plan 4.1: dangerous places are signposted). */
export function warning(danger: number, power: number, place: string, f: Fairness = FAIRNESS.classic): string | null {
  const t: Threat = threatOf(danger, power), Place = `${place.charAt(0).toUpperCase()}${place.slice(1)}`;
  if (t === 'deadly') return `Everything in you says to turn back: whatever lives in ${place} is far beyond you yet.`;
  if (t === 'hard') return `A chill runs down your back. ${Place} will be a hard fight.`;
  if (t === 'even' && f.warnAt === 'even') return `${Place} will be an even fight. You have one life: keep a way out behind you.`;
  return null;
}

/**
 * Is there a place at the hero's level among those known (plan 4.1, D29: the VGM makes sure there is
 * always something to find)? Fitting: danger between half and `fitTop` times the hero's power (1.5; 1.2 with one life).
 */
export function fittingPlace(places: readonly { readonly id: string; readonly danger: number; readonly done: boolean }[], power: number, f: Fairness = FAIRNESS.classic): string | null {
  const fit = places.filter((p) => !p.done && p.danger >= power * 0.5 && p.danger <= power * f.fitTop);
  return fit.length ? fit.sort((a, b) => Math.abs(a.danger - power) - Math.abs(b.danger - power))[0].id : null;
}

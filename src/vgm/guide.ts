/**
 * Pointing a new player into the adventure (plan 4.1, D27, D35), in the world and without arrows: while the
 * hero has nothing to follow, the Director's Purpose need sends a townsperson who has heard of a promised
 * place over to them ("a word, traveller"). The first comes soon after the hero steps out; if the player
 * walks on, the next one waits longer each time, so a player who wants to wander is left alone. Hearing a
 * lead ends it; running out of leads again starts it over. Pure.
 */
import type { Lead } from '../talk/journal';
import type { TalkDef } from '../setting/contract';
import { fill } from '../talk/folk';

/** The journal id of the hero's own first page (it is done once a real lead is heard). */
export const ARRIVAL = 'arrival';

/** The hero's own first page in a new game: where to ask, marked at the inn's door. */
export function arrivalEntry(talk: TalkDef, inn: string, door: { readonly x: number; readonly z: number }): Lead {
  const a = talk.arrival;
  return { id: ARRIVAL, title: a.title, notes: [{ text: fill(a.text, { inn }), from: a.from }], mark: { x: door.x, z: door.z, label: inn }, done: false };
}

/** Seconds until each hail while the hero has no lead: the first soon after arrival, then longer each time. */
export const HAIL = {
  first: 12,
  /** After leads ran out again (the hero has played a while). */
  again: 120,
  /** The gap after an ignored hail grows by this, up to `most`. */
  grow: 2,
  most: 900,
  /** How long someone waits by the hero to be talked to, seconds. */
  wait: 75,
  /** Nobody comes from farther than this, metres (they would take too long to arrive). */
  reach: 160,
} as const;

/** What the guide watches this step. */
export interface GuideSignals {
  /** Open leads the hero can follow (a promised place, their own remains). */
  readonly leads: number;
  /** Talking, in a dialog, fighting, below ground, out of town, flying: nobody comes over now. */
  readonly busy: boolean;
}

export class Guide {
  private left: number = HAIL.first;
  private gap: number = HAIL.again;
  private hadLead = false;

  /** Is it time to send someone over? Counts only while the hero is free and has nothing to follow. */
  due(dt: number, s: GuideSignals): boolean {
    if (s.leads > 0) {
      // Something to follow: the next hail, once it is all done, starts over.
      this.hadLead = true;
      return false;
    }
    if (this.hadLead) { this.hadLead = false; this.left = HAIL.again; this.gap = HAIL.again; }
    if (s.busy) return false;
    this.left -= dt;
    return this.left <= 0;
  }

  /** Someone was sent (or none could be): the next one waits longer. */
  hailed(): void {
    this.gap = Math.min(HAIL.most, this.gap * HAIL.grow);
    this.left = this.gap;
  }
}

/** Someone in town the guide could send. */
export interface Hailable {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Indoors (they step out of their door) or asleep. */
  readonly asleep: boolean;
  /** Already talking or held. */
  readonly busy: boolean;
}

/**
 * Who comes over: the nearest awake person within reach who has heard of an open promise (`knows`), so what
 * they tell really leads somewhere. `not`: those sent before (a fresh face each time while others know).
 */
export function hailer(people: readonly Hailable[], knows: ReadonlySet<number>, hero: { readonly x: number; readonly z: number }, not: ReadonlySet<number> = new Set()): number | null {
  let best: Hailable | null = null, bd = Infinity, again: Hailable | null = null, ad = Infinity;
  for (const p of people) {
    if (p.asleep || p.busy || !knows.has(p.id)) continue;
    const d = Math.hypot(p.x - hero.x, p.z - hero.z);
    if (d > HAIL.reach) continue;
    if (not.has(p.id)) { if (d < ad) { again = p; ad = d; } continue; }
    if (d < bd) { best = p; bd = d; }
  }
  return (best ?? again)?.id ?? null;
}

/** Where someone coming over stops: `gap` metres short of the hero, on their side. */
export function besideHero(from: { readonly x: number; readonly z: number }, hero: { readonly x: number; readonly z: number }, gap = 1.6): { x: number; z: number } {
  const dx = from.x - hero.x, dz = from.z - hero.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return { x: hero.x + gap, z: hero.z };
  return { x: hero.x + (dx / d) * gap, z: hero.z + (dz / d) * gap };
}

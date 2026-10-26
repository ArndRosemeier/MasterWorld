/**
 * The hero's standing with each people (plan 11.6, D34): one number per people, −100 .. 100, starting at
 * what they think of a stranger (or of their own kin, for the hero's own people). The game reads it for
 * greetings, prices, who will talk and whether a hold's guards let the hero in; deeds move it (a promise
 * kept for a household, a gift, trespass, striking or killing a guard). Pure: saved as plain data.
 */
import { hash2f } from '@futuremagic/core';
import { TIERS, type PeopleDef, type SettingModule, type StandingDef, type Tier } from '../setting/contract';
import type { Person } from '../sim/people';
import { dungeonOf, type DecisionLog } from '../world/decisions';

/** Where each tier ends (below this it is that tier; honoured has no end). */
const TIER_BELOW: Readonly<Record<Exclude<Tier, 'honoured'>, number>> = { hated: -50, unwelcome: -15, stranger: 15, friend: 50 };

/** The tier of a standing number. */
export function tierOf(n: number): Tier {
  for (const t of TIERS) if (t === 'honoured' || n < TIER_BELOW[t]) return t;
  return 'honoured';
}

/** The least standing that counts as a tier. */
export function tierFloor(t: Tier): number {
  const i = TIERS.indexOf(t);
  return i === 0 ? -100 : TIER_BELOW[TIERS[i - 1] as Exclude<Tier, 'honoured'>];
}

/** At least `t`? */
export const atLeast = (n: number, t: Tier): boolean => TIERS.indexOf(tierOf(n)) >= TIERS.indexOf(t);

export interface StandingSave {
  /** The hero's own people (their kin start higher). */
  readonly race: string;
  /** Standing by people id, and gifts given to each. */
  readonly of: Readonly<Record<string, number>>;
  readonly gifts: Readonly<Record<string, number>>;
}

/** A change of standing, as the game tells it. */
export interface StandingChange {
  readonly people: PeopleDef;
  readonly from: number;
  readonly to: number;
  /** The tier it moved into, if it moved into another. */
  readonly tier: Tier | null;
}

export class Standing {
  private readonly of = new Map<string, number>();
  private readonly gifts = new Map<string, number>();
  private readonly rules: StandingDef;
  private readonly peoples: readonly PeopleDef[];
  race: string;

  constructor(setting: Pick<SettingModule, 'peoples' | 'standing'>, race: string, saved?: StandingSave) {
    this.peoples = setting.peoples;
    this.rules = setting.standing;
    this.race = saved?.race ?? race;
    for (const p of this.peoples) this.of.set(p.id, saved?.of[p.id] ?? this.first(p));
    for (const [k, v] of Object.entries(saved?.gifts ?? {})) this.gifts.set(k, v);
  }

  private first(p: PeopleDef): number { return p.id === this.race ? p.kin : p.regard; }

  /** A new hero (of `race`) in this world: every people thinks of them as of any stranger (or kin) again. */
  begin(race: string): void {
    this.race = race;
    this.gifts.clear();
    for (const p of this.peoples) this.of.set(p.id, this.first(p));
  }

  people(id: string): PeopleDef | null { return this.peoples.find((p) => p.id === id) ?? null; }

  /** Standing with a people (a people the setting does not know: 0). */
  value(id: string): number { return this.of.get(id) ?? 0; }

  tier(id: string): Tier { return tierOf(this.value(id)); }

  /** Move standing with a people by `by` (clamped to −100 .. 100); null when nothing changed. */
  change(id: string, by: number): StandingChange | null {
    const people = this.people(id);
    if (!people || !by) return null;
    const from = this.value(id), to = Math.max(-100, Math.min(100, Math.round(from + by)));
    if (to === from) return null;
    this.of.set(id, to);
    return { people, from, to, tier: tierOf(to) !== tierOf(from) ? tierOf(to) : null };
  }

  /**
   * A promise kept for a household of `id`: their people think better of the hero, and word gets round
   * the others (a third as much).
   */
  keptFor(id: string): StandingChange[] {
    const out: StandingChange[] = [];
    for (const p of this.peoples) {
      const c = this.change(p.id, p.id === id ? this.rules.kept : this.rules.kept / 3);
      if (c) out.push(c);
    }
    return out;
  }

  /** What a gift to a people costs now (null: gifts no longer raise their standing). */
  giftPrice(id: string): number | null {
    if (this.value(id) >= this.rules.gift.upTo || !this.people(id)) return null;
    return this.rules.gift.price * (1 + (this.gifts.get(id) ?? 0));
  }

  /** A gift given (its price paid): standing rises, never above `upTo` by gifts alone. */
  gift(id: string): StandingChange | null {
    if (this.giftPrice(id) === null) return null;
    this.gifts.set(id, (this.gifts.get(id) ?? 0) + 1);
    const room = this.rules.gift.upTo - this.value(id);
    return this.change(id, Math.min(this.rules.gift.raise, room));
  }

  /**
   * How a merchant of a people prices for the hero: their asking price and what they pay, as factors
   * (1 for a stranger at 0; dearer and meaner the worse the standing, kinder the better).
   */
  prices(id: string): { readonly asks: number; readonly pays: number } {
    const n = this.value(id) / 100, [low, high] = this.rules.prices;
    const f = n < 0 ? 1 + (low - 1) * -n : 1 + (high - 1) * n;
    return { asks: f, pays: 1 / f };
  }

  /** How one of a people (seeded by the person) greets the hero, or null for the talk's own greeting. */
  greeting(id: string, seed: number): string | null {
    const p = this.people(id), t = this.tier(id);
    if (!p) return null;
    if (t === 'hated') return lineOf(p.refuse, seed);
    const lines = p.greet[t];
    return lines?.length ? lineOf(lines, seed) : null;
  }

  /** Will one of a people talk (hated: no), and tell their news (unwelcome: no, the curt line instead)? */
  talks(id: string): boolean { return this.tier(id) !== 'hated'; }
  curt(id: string, seed: number): string | null {
    const p = this.people(id);
    return p && TIERS.indexOf(this.tier(id)) <= TIERS.indexOf('unwelcome') ? lineOf(p.curt, seed) : null;
  }

  /** How one of a people (seeded by the person) meets the hero in talk: greeting, refusal, keeping their news to themselves. */
  manner(id: string, seed: number): { greet: string | null; refuse: boolean; curt: string | null } {
    return { greet: this.greeting(id, seed), refuse: !this.talks(id), curt: this.curt(id, seed) };
  }

  save(): StandingSave {
    return { race: this.race, of: Object.fromEntries(this.of), gifts: Object.fromEntries(this.gifts) };
  }
}

const lineOf = (lines: readonly string[], seed: number): string => lines[Math.floor(hash2f(seed, 7, 11) * lines.length) % lines.length];

/** How a change reads to the player ("The dwarves think better of you: friend."). */
export function changeLine(c: StandingChange): string {
  const better = c.to > c.from;
  const p = c.people.plural;
  const head = `The ${p} think ${better ? 'better' : 'worse'} of you`;
  return c.tier ? `${head}: you are ${TIER_WORDS[c.tier]} to them now.` : `${head}.`;
}

/** The tiers in words. */
export const TIER_WORDS: Readonly<Record<Tier, string>> = { hated: 'hated', unwelcome: 'unwelcome', stranger: 'a stranger', friend: 'a friend', honoured: 'honoured' };

/**
 * Whose promise it was (plan 11.6): a grown-up of the household it was made to (a dungeon's building, or
 * the dungeon a move-in moved into), or null.
 */
export function householdOf(log: DecisionLog, promise: string, people: readonly Person[]): Person | null {
  const dungeon = dungeonOf(log, log.find((x) => x.id === promise));
  if (!dungeon) return null;
  return people.find((p) => p.home === dungeon.building && p.role !== 'child' && p.role !== 'traveller') ?? null;
}

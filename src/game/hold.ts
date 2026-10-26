/**
 * A people's hold as the hero meets it (plan 11.6, D34): its wardens at their posts in the court before the
 * gate (a den at peace, on posts), and what they do about the hero. Someone welcome (standing at least the
 * hold's `welcome`) is hailed and walks in peace. Anyone else is warned as they come near, warned a last
 * time once they step into the court, and attacked if they stay; the hated are attacked on sight. Striking
 * a warden ends the peace at once. Trespass, blows and the dead cost standing with the people. Once the
 * hero is gone and the wardens have given up the chase, they go back to their posts in peace. Pure.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { CreatureDef, HoldDef, StandingDef } from '../setting/contract';
import { Den } from '../sim/creatures';
import type { P3 } from '../sim/dungeonNav';
import { OpenGround, type Land } from '../sim/wild';
import type { HoldDecision } from '../world/decisions';
import { COURT, POSTS } from '../world/hold';
import { inFrame, onLand } from '../world/dungeon/site';
import { atLeast, type Standing, type StandingChange } from './standing';

/** The ground of the court: open land whose homes are the wardens' posts, each stands at its own. */
export class PostGround extends OpenGround {
  constructor(land: Land, private readonly posts: readonly { x: number; z: number }[]) {
    super(land, posts.map((p) => ({ ...p, r: 0.5 })));
  }

  override spot(home: number): P3 {
    const p = this.posts[home];
    return { x: p.x, y: this.floorAt(p.x, p.z), z: p.z };
  }
}

/** The wardens' den: one at each post (as many posts as the hold has guards), at peace, the dead staying dead. */
export function holdDen(site: HoldDecision, def: HoldDef, land: Land, defs: readonly CreatureDef[], seed: number, dead: readonly number[] = []): Den {
  const posts = POSTS.slice(0, def.guards).map(([u, v]) => { const [x, z] = onLand(site, u, v); return { x, z }; });
  const den = new Den(new PostGround(land, posts), posts.map((_, room) => ({ creature: def.guard, room })), defs, deriveSeed(seed, 'hold', site.id), dead);
  den.peace = true;
  // At their posts, looking out over the court (dir as the den's: atan2 of z over x).
  const out = Math.atan2(Math.cos(site.yaw), Math.sin(site.yaw));
  for (const c of den.creatures) c.dir = out;
  return den;
}

/** How near (m beyond the court's edge) the wardens call out to an outsider, and how long they give one in the court (s). */
export const HOLD_WARN = 26;
export const HOLD_GRACE = 5;
/** The hero must be this far off (m) before the wardens are at peace again after a fight. */
const CALM_AGAIN = 160;

export type HoldEvent =
  | { readonly kind: 'warn' | 'last' | 'attack' | 'hail'; readonly text: string }
  | { readonly kind: 'standing'; readonly change: StandingChange };

type Mood = 'calm' | 'warned' | 'last' | 'war';

export class HoldWatch {
  private mood: Mood = 'calm';
  private grace = 0;
  private hailed = false;
  private away = 0;
  private dead: number;
  private struck = false;
  private said = 0;
  /** Each warden's health when the peace last began (a blow since ends it). */
  private calm: number[];

  /** `rules`: what trespass, a blow and a death cost (the setting's standing). */
  constructor(readonly site: HoldDecision, private readonly def: HoldDef, readonly den: Den, private readonly standing: Standing, private readonly rules: Pick<StandingDef, 'killed' | 'struck' | 'trespass'>) {
    this.dead = den.dead.length;
    this.calm = den.creatures.map((c) => c.health);
  }

  /** Is the hero welcome now? */
  get welcome(): boolean { return atLeast(this.standing.value(this.site.people), this.def.welcome); }

  /** The wardens are fighting the hero. */
  get atWar(): boolean { return this.mood === 'war'; }

  /** How far (m) the hero at (x, z) is outside the court (0: in it). */
  offCourt(x: number, z: number): number {
    const [u, v] = inFrame(this.site, x, z);
    return Math.hypot(Math.max(0, Math.abs(u) - COURT.half), Math.max(0, v - COURT.depth, -v));
  }

  /** A line of the setting's (seeded, so each warning is not always the same one). */
  private line(lines: readonly string[]): string {
    return lines[Math.floor(hash2f(this.site.x, this.said++, 3) * lines.length) % lines.length];
  }

  /** After the den has stepped: what the wardens make of the hero at (x, z) now. */
  judge(dt: number, hero: { readonly x: number; readonly z: number; readonly alive: boolean }): HoldEvent[] {
    const out: HoldEvent[] = [];
    const people = this.site.people;
    const change = (by: number) => { const c = this.standing.change(people, by); if (c) out.push({ kind: 'standing', change: c }); };
    // Blows and deaths among the wardens, whatever the mood.
    const dead = this.den.dead.length;
    for (let i = this.dead; i < dead; i++) change(this.rules.killed);
    this.dead = dead;
    const blow = this.den.creatures.some((c, i) => c.health < this.calm[i]);
    const hit = blow || this.den.creatures.some((c) => c.state === 'fight');
    if (hit && this.mood !== 'war') {
      if (!this.struck && blow) { this.struck = true; change(this.rules.struck); }
      this.war(out, false);
      return out;
    }
    const off = this.offCourt(hero.x, hero.z);
    if (this.mood === 'war') {
      // Gone, and nobody still chasing: back to their posts, at peace.
      if (off > CALM_AGAIN && !this.den.fighting.length) {
        this.mood = 'calm';
        this.den.peace = true;
        this.struck = false;
        this.hailed = false;
        this.calm = this.den.creatures.map((c) => c.health);
      }
      return out;
    }
    if (!hero.alive) return out;
    if (off > HOLD_WARN + 40) this.hailed = false;
    if (this.welcome) {
      this.mood = 'calm';
      if (!this.hailed && off < HOLD_WARN) { this.hailed = true; out.push({ kind: 'hail', text: this.line(this.def.hail) }); }
      return out;
    }
    if (this.standing.tier(people) === 'hated' && off < HOLD_WARN) { this.war(out, true); return out; }
    switch (this.mood) {
      case 'calm':
        if (off < HOLD_WARN) { this.mood = 'warned'; this.away = 0; out.push({ kind: 'warn', text: this.line(this.def.warn) }); }
        break;
      case 'warned':
        if (off === 0) { this.mood = 'last'; this.grace = 0; out.push({ kind: 'last', text: this.line(this.def.last) }); }
        else if (off > HOLD_WARN + 10 && (this.away += dt) > 20) this.mood = 'calm';
        break;
      case 'last':
        if (off > 0) { this.mood = 'warned'; this.away = 0; break; }
        if ((this.grace += dt) > HOLD_GRACE) this.war(out, true, true);
        break;
    }
    return out;
  }

  /** The peace is over: the wardens fight (`said`: with their battle cry), and trespass costs standing. */
  private war(out: HoldEvent[], said: boolean, trespass = false): void {
    this.mood = 'war';
    this.den.peace = false;
    if (said) out.push({ kind: 'attack', text: this.def.attack });
    if (trespass) { const c = this.standing.change(this.site.people, this.rules.trespass); if (c) out.push({ kind: 'standing', change: c }); }
  }
}

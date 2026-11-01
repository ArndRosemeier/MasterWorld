/**
 * One cellar played (plan 8, 11.2), or a band of the wild met on the land (sim/wild.ts): its den, the
 * hero's fight with it, the bodies of the fallen and (in a cellar) the chests and hoard to search, and what of it is saved (who died, who was spared, what was
 * taken). The game feeds it the hero's pose every frame and turns its events into notes, sounds and the
 * HUD; the bot and the checks drive it the same way. Positions are the cellar's own frame. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { Den, type Creature } from '../sim/creatures';
import type { DenGround } from '../sim/dungeonNav';
import { isEmpty, type Cellar } from '../world/dungeon/cellar';
import type { DungeonSpace } from '../world/dungeon/space';
import { hoardsOf, type Hoard } from '../world/dungeon/treasure';
import type { Character } from './character';
import { Fight, type FightEvent, type HeroPose } from './fight';
import { rollLoot, type Item, type Loot } from './items';
import { askDefOf, askMet, holdsKeepsake, twistOf } from '../vgm/asks';
import type { PromiseAsk } from '../world/decisions';

export interface DelveSave {
  /** Creatures dead and spared, by den index. */
  readonly dead: readonly number[];
  readonly spared: readonly number[];
  /** Bodies searched, by den index; hoards opened, by hoard id. */
  readonly searched: readonly number[];
  readonly opened: readonly number[];
  /** A seal's breach walled up (D62; none in older saves: not). */
  readonly sealed?: boolean;
  /** A parley's end (D62): terms struck, or broken by the hero's blow (none: still to talk). */
  readonly parley?: 'struck' | 'broken';
}

/** Something within reach to search. */
export type Lootable =
  | { readonly kind: 'body'; readonly who: Creature; readonly x: number; readonly y: number; readonly z: number; readonly name: string }
  | { readonly kind: 'hoard'; readonly hoard: Hoard; readonly x: number; readonly y: number; readonly z: number; readonly name: string }
  /** A seal's breach (D62), to wall up: the hero kneels and sets the stones. */
  | { readonly kind: 'breach'; readonly x: number; readonly y: number; readonly z: number; readonly name: string }
  /** A parley's leader (D62), to speak with: the first word hears the terms, the next agrees to them. */
  | { readonly kind: 'chief'; readonly who: Creature; readonly x: number; readonly y: number; readonly z: number; readonly name: string };

/** What the leader said when spoken to: their terms, the deal struck, or the hero short of the price. */
export interface ParleyWord {
  readonly kind: 'terms' | 'struck' | 'short';
  readonly text: string;
}

/** How close the hero must be to search something, metres. */
const REACH = 1.9;
/** A parley's leader is spoken with from this far (m): not up close to someone wary. */
const SPEAK = 2.6;
/** What health the strongest has left after someone got there first (Q3). */
const FIRST_LEFT = 0.55;

export class Delve {
  readonly den: Den;
  readonly fight: Fight;
  readonly hoards: readonly Hoard[];
  private readonly opened = new Set<number>();
  private readonly searched = new Set<number>();

  /** A cellar and its space (or the ground its dwellers live on: a formed cave's), or (no cellar) a den already standing on its ground. */
  constructor(readonly cellar: Cellar | null, ground: DungeonSpace | DenGround | Den, private readonly setting: SettingModule, readonly hero: Character, seed: number, saved?: DelveSave) {
    this.den = ground instanceof Den ? ground : new Den(ground, cellar?.spawns ?? [], setting.creatures, deriveSeed(seed, 'den'), saved?.dead ?? []);
    for (const id of saved?.spared ?? []) {
      const c = this.den.creatures[id];
      if (c && c.state !== 'dead') { c.state = 'meek'; c.act = 'stand'; }
    }
    this.fight = new Fight(hero, this.den, setting, seed);
    this.hoards = cellar ? hoardsOf(cellar, setting.creatures) : [];
    for (const h of saved?.opened ?? []) this.opened.add(h);
    for (const b of saved?.searched ?? []) this.searched.add(b);
    this.sealed = !!saved?.sealed;
    this.parley = saved?.parley ?? null;
    this.fresh = !saved;
    // The fallen not yet searched still carry what they had (rolled from their own seed).
    for (const c of this.den.creatures) if (c.state === 'dead' && !this.searched.has(c.id)) this.fight.restoreBody(c);
  }

  /**
   * The cellar is quiet: nobody left who would fight. An empty one (a sight, D57) is done once what lies at
   * its end has been found and searched.
   */
  get beaten(): boolean {
    if (this.cellar && isEmpty(this.cellar)) return this.hoards.some((h) => !h.prop && this.opened.has(h.id));
    return this.den.beaten;
  }

  /**
   * What the place's household asks (D62), set by whoever opens the place: a keepsake to bring (a fetch's thing,
   * what is left of someone lost dead) lies in the lair's hoard at the end, and searching that hoard puts it in the
   * pack; someone lost alive is `found` once the hero comes up to them.
   */
  get ask(): PromiseAsk | null { return this.asked; }
  set ask(a: PromiseAsk | null) {
    this.asked = a;
    // A parley's dwellers watch the hero and do not fight unless struck (as a hold's wardens), until it is broken.
    if (a?.verb === 'parley' && this.parley !== 'broken') this.makePeace();
    // Someone got there first (Q3): its dwellers lie dead and searched, all but the strongest, hurt (a fresh visit only: the save keeps the rest).
    if (this.fresh && twistOf(this.setting, a)?.kind === 'first') this.beatenBefore();
  }
  /** Nothing of it was saved yet (the first visit). */
  private readonly fresh: boolean;

  /** Someone else fought here before the hero: all but the strongest dead, their bodies searched; the strongest hurt. */
  private beatenBefore(): void {
    const left = this.chief;
    for (const c of this.den.creatures) {
      if (c === left) { c.health = Math.max(1, Math.round(c.health * FIRST_LEFT)); continue; }
      c.health = 0; c.state = 'dead'; c.act = 'dead';
      this.searched.add(c.id);
    }
  }
  private asked: PromiseAsk | null = null;
  keepsake: Item | null = null;
  found = false;
  /** A seal's breach is walled up (D62). */
  sealed = false;

  /** A seal's breach (D62): the prop in the wall of the last room; null if the place has none. */
  get breach(): { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number } | null {
    return this.cellar?.props.find((p) => p.kind === 'breach') ?? null;
  }

  /** Wall up the breach (the hero's kneel has set the last stone). */
  seal(): void { if (this.breach) this.sealed = true; }

  /** A parley (D62): its terms struck, or broken by the hero striking first; null while there is still talking to do. */
  parley: 'struck' | 'broken' | null = null;
  /** The leader has named their terms (the next word agrees to them). */
  heard = false;
  /** Each dweller's health when the parley began (a blow since breaks it). */
  private calmAt: number[] = [];

  private makePeace(): void {
    this.den.peace = true;
    this.calmAt = this.den.creatures.map((c) => c.health);
    // Paid off: they go meekly; a pact: they stay and let the hero be.
    if (this.parley === 'struck' && this.asked?.terms === 'price') for (const c of this.den.creatures) if (c.state !== 'dead') { c.state = 'meek'; c.act = 'stand'; }
  }

  /** The parley is still to be had: its leader alive, nothing struck or broken. */
  get talking(): boolean { return this.asked?.verb === 'parley' && this.parley === null && !!this.chief; }

  /** A parley's leader: the strongest of the dwellers still alive. */
  get chief(): Creature | null {
    let best: Creature | null = null;
    for (const c of this.den.creatures) if (c.state !== 'dead' && (!best || c.def.danger > best.def.danger)) best = c;
    return best;
  }

  /** The promise ended without what it asked (a parley the hero broke, its dwellers then beaten): nobody pays. */
  get failed(): boolean { return this.parley === 'broken' && this.beaten; }

  /**
   * Speak with the parley's leader: the first word hears their terms, the next agrees to them (a price paid
   * from the hero's purse, if they have it; a pact on the hero's word). Null: there is nobody to talk to.
   */
  speak(): ParleyWord | null {
    const p = askDefOf(this.setting, this.asked ?? undefined)?.parley, a = this.asked;
    if (!p || !a?.terms || !this.talking) return null;
    const price = a.price ?? 0;
    const fill = (t: string) => t.replaceAll('{coins}', `${price} copper`);
    if (!this.heard) { this.heard = true; return { kind: 'terms', text: fill(p.terms[a.terms]) }; }
    if (a.terms === 'price') {
      if (this.hero.coins < price) return { kind: 'short', text: fill(p.short) };
      this.hero.coins -= price;
    }
    this.parley = 'struck';
    this.makePeace();
    return { kind: 'struck', text: fill(p.struck[a.terms]) };
  }

  /** What the promise asks is done (D62): only the thing it names counts (beaten, the keepsake in hand, the lost one found). */
  get met(): boolean {
    const k = this.keepsake;
    return askMet(this.ask, { beaten: this.beaten, holds: !!k?.keepsake && holdsKeepsake(this.hero.pack, k.keepsake), found: this.found, sealed: this.sealed, parleyed: this.parley === 'struck' });
  }

  step(dt: number, pose: HeroPose, breathe = true): FightEvent[] {
    const out = this.fight.advance(dt, pose, breathe);
    // A blow before terms are struck breaks a parley for good: they fight now.
    if (this.asked?.verb === 'parley' && this.parley === null && this.den.peace && this.den.creatures.some((c, i) => c.health < (this.calmAt[i] ?? c.health) || c.state === 'fight')) {
      this.parley = 'broken';
      this.den.peace = false;
    }
    return out;
  }

  /** The nearest thing within reach to search (a body with something on it, an unopened chest or hoard). */
  within(p: { x: number; y: number; z: number }): Lootable | null {
    let best: Lootable | null = null, bd = REACH;
    const near = (x: number, y: number, z: number) => (Math.abs(y - p.y) < 1.5 ? Math.hypot(x - p.x, z - p.z) : Infinity);
    for (const c of this.den.creatures) {
      if (c.state !== 'dead' || !this.fight.bodies.has(c.id)) continue;
      const d = near(c.x, c.y, c.z);
      if (d < bd) { bd = d; best = { kind: 'body', who: c, x: c.x, y: c.y, z: c.z, name: `the ${c.def.name}` }; }
    }
    // A parley's leader, spoken with from a little way off.
    const k = this.talking ? this.chief : null;
    if (k) {
      const d = near(k.x, k.y, k.z) - (SPEAK - REACH);
      if (d < bd) { bd = d; best = { kind: 'chief', who: k, x: k.x, y: k.y, z: k.z, name: `the ${k.def.name}` }; }
    }
    // A seal's breach still open: walled up from before it (it stands in the wall: reach it from further off).
    const b = this.breach;
    if (b && !this.sealed && this.ask?.verb === 'seal') {
      const d = near(b.x, b.y, b.z) - 0.6;
      if (d < bd) { bd = d; best = { kind: 'breach', x: b.x, y: b.y, z: b.z, name: 'the breach' }; }
    }
    // A chest stands by the wall: reach it from a little further off.
    for (const h of this.hoards) {
      if (this.opened.has(h.id)) continue;
      const d = near(h.x, h.y, h.z) - (h.prop ? 0.5 : 0);
      if (d < bd) { bd = d; best = { kind: 'hoard', hoard: h, x: h.x, y: h.y, z: h.z, name: h.name }; }
    }
    return best;
  }

  /** Search it: what it held goes into the pack (null if it was already empty or taken). */
  plunder(l: Lootable): Loot | null {
    let loot: Loot | null;
    if (l.kind === 'breach' || l.kind === 'chief') return null;
    if (l.kind === 'body') {
      loot = this.fight.search(l.who);
      if (loot) this.searched.add(l.who.id);
    } else {
      if (this.opened.has(l.hoard.id)) return null;
      this.opened.add(l.hoard.id);
      loot = rollLoot(this.setting.items, l.hoard.table, l.hoard.danger, new Rng(l.hoard.seed));
      // The keepsake asked for lies in the lair's hoard (it is in the pack already if a save had it opened).
      const k = this.keepsake;
      if (k && !l.hoard.prop && !holdsKeepsake(this.hero.pack, k.keepsake!)) loot = { items: [...loot.items, k], coins: loot.coins };
    }
    if (!loot) return null;
    this.hero.pack.push(...loot.items);
    this.hero.coins += loot.coins;
    return loot;
  }

  /** Has this hoard been opened? */
  hasOpened(h: Hoard): boolean { return this.opened.has(h.id); }

  tally(): DelveSave {
    return {
      dead: this.den.dead,
      spared: this.den.creatures.filter((c) => c.state === 'meek').map((c) => c.id),
      searched: [...this.searched],
      opened: [...this.opened],
      ...(this.sealed ? { sealed: true } : {}),
      ...(this.parley ? { parley: this.parley } : {}),
    };
  }
}

/**
 * One cellar played (plan 8, 11.2), or a band of the wild met on the land (sim/wild.ts): its den, the
 * hero's fight with it, the bodies of the fallen and (in a cellar) the chests and hoard to search, and what of it is saved (who died, who was spared, what was
 * taken). The game feeds it the hero's pose every frame and turns its events into notes, sounds and the
 * HUD; the bot and the checks drive it the same way. Positions are the cellar's own frame. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { Den, type Creature } from '../sim/creatures';
import { isEmpty, type Cellar } from '../world/dungeon/cellar';
import type { DungeonSpace } from '../world/dungeon/space';
import { hoardsOf, type Hoard } from '../world/dungeon/treasure';
import type { Character } from './character';
import { Fight, type FightEvent, type HeroPose } from './fight';
import { rollLoot, type Item, type Loot } from './items';
import { askMet, holdsKeepsake } from '../vgm/asks';

export interface DelveSave {
  /** Creatures dead and spared, by den index. */
  readonly dead: readonly number[];
  readonly spared: readonly number[];
  /** Bodies searched, by den index; hoards opened, by hoard id. */
  readonly searched: readonly number[];
  readonly opened: readonly number[];
}

/** Something within reach to search. */
export type Lootable =
  | { readonly kind: 'body'; readonly who: Creature; readonly x: number; readonly y: number; readonly z: number; readonly name: string }
  | { readonly kind: 'hoard'; readonly hoard: Hoard; readonly x: number; readonly y: number; readonly z: number; readonly name: string };

/** How close the hero must be to search something, metres. */
const REACH = 1.9;

export class Delve {
  readonly den: Den;
  readonly fight: Fight;
  readonly hoards: readonly Hoard[];
  private readonly opened = new Set<number>();
  private readonly searched = new Set<number>();

  /** A cellar and its space, or (no cellar) a den already standing on its ground. */
  constructor(readonly cellar: Cellar | null, ground: DungeonSpace | Den, private readonly setting: SettingModule, readonly hero: Character, seed: number, saved?: DelveSave) {
    this.den = ground instanceof Den ? ground : new Den(ground, cellar?.spawns ?? [], setting.creatures, deriveSeed(seed, 'den'), saved?.dead ?? []);
    for (const id of saved?.spared ?? []) {
      const c = this.den.creatures[id];
      if (c && c.state !== 'dead') { c.state = 'meek'; c.act = 'stand'; }
    }
    this.fight = new Fight(hero, this.den, setting, seed);
    this.hoards = cellar ? hoardsOf(cellar, setting.creatures) : [];
    for (const h of saved?.opened ?? []) this.opened.add(h);
    for (const b of saved?.searched ?? []) this.searched.add(b);
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
   * A household's keepsake (D62: a fetch): it lies in the lair's hoard at the end of the place, and searching
   * that hoard puts it in the pack. Set by whoever opens the place (the game names it for the family).
   */
  keepsake: Item | null = null;

  /**
   * What the promise asks is done (D62): only the thing it names counts. A fetch is done with the keepsake in
   * the hero's hands, whether the place is beaten or not; anything else asks the place beaten.
   */
  get met(): boolean {
    const k = this.keepsake;
    return askMet(k ? 'fetch' : 'clear', { beaten: this.beaten, holds: !!k?.keepsake && holdsKeepsake(this.hero.pack, k.keepsake) });
  }

  step(dt: number, pose: HeroPose, breathe = true): FightEvent[] {
    return this.fight.advance(dt, pose, breathe);
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
    };
  }
}

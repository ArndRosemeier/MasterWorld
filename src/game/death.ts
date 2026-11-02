/**
 * Death as designed (plan 11.1, 11.2, D12). Two modes, chosen when a game begins:
 *
 * - **Classic**: falling is not the end. The hero wakes at the inn, sore, with half the purse gone (whoever
 *   carried them up took it), and what they carried in the pack stays where they fell: remains with a mark on
 *   the map, so going back for it is a small quest. What is worn stays on the hero.
 * - **Roguelike**: one save the game writes itself; falling ends the hero. Everything they had stays where
 *   they fell as a grave, the world (its ledger) stays, and the next hero can hear of the place and find it.
 *
 * Pure: plain data, saved with the game.
 */
import type { Character } from './character';
import type { Item } from './items';

export type GameMode = 'classic' | 'roguelike';
export const GAME_MODES: readonly GameMode[] = ['classic', 'roguelike'];

/** How the New game screen (the creator's lever) names each mode and what it means. */
export const MODE_TEXT: Readonly<Record<GameMode, { readonly name: string; readonly text: string }>> = {
  classic: { name: 'Classic', text: 'Save and load as you like. Fall, and you wake at the inn; your pack stays where you fell.' },
  roguelike: { name: 'Roguelike', text: 'One life. The game keeps the only save. Fall, and the tale ends; the world goes on, and your grave stays in it.' },
};

/** Where the hero fell: world metres, the dungeon they were down in (null: out on the land), and where the map marks it. */
export interface FallPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The dungeon's id (its promise) when below, else null. */
  readonly below: string | null;
  /** The map's mark: the place itself, or a dungeon's door above. */
  readonly mark: { readonly x: number; readonly z: number };
  /** As a note names it ("in the Ashby cellar", "out on the land"). */
  readonly label: string;
}

/** What stays where a hero fell: their pack (classic), or all they had (a roguelike hero's grave). */
export interface Remains {
  readonly id: string;
  /** The fallen hero's name for a grave; null for the hero's own pack left behind. */
  readonly grave: string | null;
  readonly at: FallPlace;
  readonly items: readonly Item[];
  readonly coins: number;
  /** The game day it was left. */
  readonly day: number;
}

/** How close the hero must come to take remains up again, metres. */
export const GATHER_REACH = 2.2;

/** The id of remains left at game time `hours` (no two falls share a game minute). */
export const remainsId = (hours: number): string => `remains-${Math.round(hours * 60)}`;

/**
 * A classic fall: the purse halved, the pack left where the hero fell (null if it was empty), health at half
 * and breath back. Returns the remains and the coin lost.
 */
export function fallClassic(hero: Character, at: FallPlace, id: string, day: number): { readonly remains: Remains | null; readonly lost: number } {
  const lost = Math.floor(hero.coins / 2);
  hero.coins -= lost;
  const items = hero.pack.splice(0);
  // (Never none: a hero who woke with no health would not recover any.)
  const half = Math.round(hero.maxHealth * 0.5);
  hero.health = half >= 1 ? half : 1;
  hero.stamina = hero.maxStamina;
  return { remains: items.length ? { id, grave: null, at, items, coins: 0, day } : null, lost };
}

/** A roguelike fall: the hero's tale ends; all they wore and carried, and their purse, stay as a grave. */
export function fallRoguelike(hero: Character, name: string, at: FallPlace, id: string, day: number): Remains {
  const items = [...Object.values(hero.worn).filter((i): i is Item => !!i), ...hero.pack];
  return { id, grave: name, at, items, coins: hero.coins, day };
}

/** Remains the hero stands by (in the same place: the same dungeon, or the land), if any. */
export function remainsNear(all: readonly Remains[], below: string | null, x: number, y: number, z: number): Remains | null {
  for (const r of all) {
    if (r.at.below !== below) continue;
    if (Math.hypot(r.at.x - x, r.at.z - z) <= GATHER_REACH && Math.abs(r.at.y - y) < 2.5) return r;
  }
  return null;
}

/** The hero takes remains up: everything into the pack, the coins into the purse. */
export function gather(hero: Character, r: Remains): void {
  hero.pack.push(...r.items);
  hero.coins += r.coins;
}

/** The journal's lead for remains: its title, what is said of it and who said it. */
export function remainsLead(r: Remains): { readonly title: string; readonly text: string; readonly from: string; readonly label: string } {
  if (r.grave) {
    return {
      title: `Where ${r.grave} fell`,
      text: `${r.grave} went out ${r.at.label} on day ${r.day + 1} and never came back. Whatever they carried must still lie there.`,
      from: 'the talk of the town',
      label: `${r.grave}'s grave`,
    };
  }
  return {
    title: 'Your pack, where you fell',
    text: `You fell ${r.at.label}. ${r.items.length === 1 ? 'One thing' : `${r.items.length} things`} from your pack must still lie there.`,
    from: 'you',
    label: 'Your pack',
  };
}

/** The roguelike end: the line over the fallen hero. */
export function epitaph(name: string, day: number, at: FallPlace): string {
  return `Here ends the tale of ${name}, who fell ${at.label} on day ${day + 1}.`;
}

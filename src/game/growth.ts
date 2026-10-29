/**
 * Levels and experience (plan 11.4, D58): everything the hero does counts. A fight is weighed by the foe's
 * danger against the danger an even fight has at the hero's level, so foes the hero has outgrown give next to
 * nothing; each deed and each discovery counts once (by its key). The level is read for health, stamina and
 * mana, and by the trainers. Pure.
 */
import type { GrowthDef } from '../setting/contract';

/** The highest level of a growth table. */
export const topLevel = (g: GrowthDef): number => g.xp.length;

/** The level reached with `xp` experience (1 .. top). */
export function levelOf(g: GrowthDef, xp: number): number {
  let l = 1;
  while (l < g.xp.length && xp >= g.xp[l]) l++;
  return l;
}

/** The foe danger that is an even fight for a hero of `level`. */
export const evenDanger = (g: GrowthDef, level: number): number => g.even.base + g.even.step * (level - 1);

/** The level whose even fight a foe of `danger` is (the target card's number; at least 1). */
export function levelOfDanger(g: GrowthDef, danger: number): number {
  return Math.max(1, Math.round((danger - g.even.base) / g.even.step + 1));
}

/**
 * Experience for a foe of `danger` beaten at `level`: its danger times `fight`, weighed by how it stands
 * against an even fight. Stronger foes give up to twice as much; weaker ones fall off fast, and one under a
 * quarter of an even fight gives nothing.
 */
export function fightXp(g: GrowthDef, danger: number, level: number): number {
  const r = danger / evenDanger(g, level);
  const w = r >= 1 ? Math.min(2, r) : Math.max(0, (r - 0.25) / 0.75) ** 2;
  return Math.round(danger * g.fight * w * 10) / 10;
}

/** What an old save's reputation (D54, 0..100) is worth in experience. */
export const RENOWN_XP = 10;

/** A save from before levels (D58): its reputation becomes the hero's experience (a save with experience is left be). */
export function carryRenown(hero: { gain(xp: number): number }, saved: { readonly xp?: number } | null | undefined, standing: { readonly renown?: number } | null | undefined): void {
  if (saved && saved.xp === undefined && standing?.renown) hero.gain(standing.renown * RENOWN_XP);
}

/** Share of the way from this level to the next (1 at the top). */
export function towardNext(g: GrowthDef, xp: number): number {
  const l = levelOf(g, xp);
  if (l >= g.xp.length) return 1;
  return (xp - g.xp[l - 1]) / (g.xp[l] - g.xp[l - 1]);
}

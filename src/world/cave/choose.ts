/**
 * What a formed cave is made of (D63, phase K1): the rock, the size and the shares, drawn from the setting's cave
 * data by the seed. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CaveRockDef, CaveSharesDef, CaveSizeDef, CavesDef } from '../../setting/contract';

/** The built, water and lava shares of a cave; they add up to 1. */
export interface CaveShares {
  readonly built: number;
  readonly water: number;
  readonly lava: number;
}

/** The setting's rock setting of this id. */
export function rockById(c: CavesDef, id: string): CaveRockDef {
  const r = c.rocks.find((x) => x.id === id);
  if (!r) throw new Error(`no cave rock "${id}"`);
  return r;
}

/** The rocks a kind of country holds (its own entry, else the `*` one, else none). */
export function rocksOfKind(c: CavesDef, kind: string): Readonly<Record<string, number>> {
  return (c.geology.find((g) => g.kind === kind) ?? c.geology.find((g) => g.kind === '*'))?.rocks ?? {};
}

function pickWeighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  let w = rng.range(0, items.reduce((a, i) => a + i[1], 0));
  for (const [item, weight] of items) { w -= weight; if (w < 0) return item; }
  return items[items.length - 1][0];
}

/** The rock a cave in this kind of country is in (null: the kind holds no solution cave). */
export function rockFor(c: CavesDef, kind: string, seed: number): CaveRockDef | null {
  const rocks = Object.entries(rocksOfKind(c, kind)).filter(([, w]) => w > 0);
  return rocks.length ? rockById(c, pickWeighted(new Rng(deriveSeed(seed, 'cave', 'rock')), rocks)) : null;
}

/** The size of a cave. */
export function sizeFor(c: CavesDef, seed: number): CaveSizeDef {
  return pickWeighted(new Rng(deriveSeed(seed, 'cave', 'size')), c.sizes.map((s) => [s, s.weight] as const));
}

/**
 * The shares of a cave in this kind of country: a pure cave is the norm, a mixed one has two shares and the third at
 * zero, three are rare. Only the shares the land allows are drawn: water where it holds a rock, lava on volcanic
 * country, built anywhere.
 */
export function sharesFor(c: CavesDef, kind: string, seed: number): CaveShares {
  const rng = new Rng(deriveSeed(seed, 'cave', 'shares')), s: CaveSharesDef = c.shares;
  const allowed: (keyof CaveShares)[] = ['built'];
  if (Object.keys(rocksOfKind(c, kind)).length) allowed.push('water');
  if (s.lavaOn.includes(kind)) allowed.push('lava');
  const roll = rng.float(), want = roll < s.pure ? 1 : roll < s.pure + s.two ? 2 : 3, n = Math.min(want, allowed.length);
  const chosen: (keyof CaveShares)[] = [];
  while (chosen.length < n) chosen.push(pickWeighted(rng, allowed.filter((x) => !chosen.includes(x)).map((x) => [x, s.weight[x]] as const)));
  // A mix splits unevenly: each present share gets a random weight in 0.25..1, then they are scaled to 1.
  const parts = chosen.map(() => (n === 1 ? 1 : rng.range(0.25, 1))), sum = parts.reduce((a, b) => a + b, 0);
  const out = { built: 0, water: 0, lava: 0 };
  chosen.forEach((k, i) => { out[k] = parts[i] / sum; });
  return out;
}

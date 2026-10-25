/**
 * The VGM's dungeons (plan 4.2, 8): a promise of a cellar under a house of a town, as a decision. The
 * house is chosen from the town's plan when the promise is made; the set piece is one the world has not
 * used yet (plan 8.1: none repeats until the library has been used through). What the household knows
 * comes from `sketchCellar` (world/dungeon/cellar.ts): hint lines, facts, and who knows them.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { TownBuilding } from '@futuremagic/settlement';
import type { DecisionLog, DungeonDecision } from '../world/decisions';
import { SET_PIECES } from '../world/dungeon/setPieces';
import type { Town } from '../world/town';

/** Houses that dig cellars: lived in, not the temple, the hall or the stable. */
const CELLARED: readonly TownBuilding['kind'][] = ['house', 'cottage', 'inn', 'bakery', 'workshop', 'smithy'];

/** A cellar promised under one of the town's houses; null if the town has none that fits. */
export function promiseCellar(seed: number, town: Town, log: DecisionLog): DungeonDecision | null {
  const dungeons = log.filter((d): d is DungeonDecision => d.kind === 'dungeon');
  const n = dungeons.length + 1;
  const s = deriveSeed(seed, 'vgm', 'cellar', n);
  const taken = new Set(dungeons.filter((d) => d.town === town.decision.id).map((d) => d.building));
  const houses = town.plan.buildings.filter((b) => CELLARED.includes(b.kind) && b.household > 0 && !taken.has(b.id) && b.hu >= 2 && b.hv >= 2);
  if (!houses.length) return null;
  // Rather a house off the market (a cellar under a back lane feels found), then by the seed.
  const [cx, cz] = town.plan.centre;
  const score = (b: TownBuilding) => hash2f(s, b.id, 7) - Math.min(1, Math.hypot(b.cx - cx, b.cz - cz) / (town.decision.radius * 1.2)) * 0.5;
  const house = houses.reduce((a, b) => (score(b) < score(a) ? b : a));
  // The set piece used least so far in this world.
  const used = (id: string) => dungeons.filter((d) => d.setPiece === id).length;
  const fewest = Math.min(...SET_PIECES.map((p) => used(p.id)));
  const fresh = SET_PIECES.filter((p) => used(p.id) === fewest);
  const piece = fresh[Math.floor(hash2f(s, 3, 9) * fresh.length)];
  return { kind: 'dungeon', id: `cellar-${n}`, template: 'cellar', town: town.decision.id, building: house.id, seed: s, setPiece: piece.id };
}

/** The house a dungeon decision lies under. */
export function houseOf(d: DungeonDecision, towns: readonly Town[]): TownBuilding | null {
  const town = towns.find((t) => t.decision.id === d.town);
  return town?.plan.buildings.find((b) => b.id === d.building) ?? null;
}

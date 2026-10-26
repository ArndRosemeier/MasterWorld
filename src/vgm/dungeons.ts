/**
 * The VGM's dungeons (plan 4.2, 8): a promise of a cellar under a house of a town, or of a barrow out on
 * the land near it, as a decision. The
 * house is chosen from the town's plan when the promise is made; the set piece is one the world has not
 * used yet (plan 8.1: none repeats until the library has been used through). What the household knows
 * comes from `sketchCellar` (world/dungeon/cellar.ts): hint lines, facts, and who knows them.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { TownBuilding } from '@futuremagic/settlement';
import type { CellarLore, SettingModule } from '../setting/contract';
import type { DecisionLog, DungeonDecision, DungeonTemplate } from '../world/decisions';
import type { DungeonPlace } from '../world/dungeon/cellar';
import { setPiecesFor } from '../world/dungeon/setPieces';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';

/** Houses that dig cellars: lived in, not the temple, the hall or the stable. */
const CELLARED: readonly TownBuilding['kind'][] = ['house', 'cottage', 'inn', 'bakery', 'workshop', 'smithy'];

/**
 * The most danger a place may hold (D29): within reach of the start, what a fresh hero can take on
 * (about 18 on the hero's power scale, a fresh hero being about 15); more with every kilometre beyond.
 */
export function dangerAt(at: { readonly decision: { readonly x: number; readonly z: number } }, home: { readonly x: number; readonly z: number }): number {
  const km = Math.hypot(at.decision.x - home.x, at.decision.z - home.z) / 1000;
  return Math.round(18 + Math.max(0, km - 1) * 6);
}

/** A cellar promised under one of the town's houses (`home`: where the game starts); null if the town has none that fits. */
export function promiseCellar(seed: number, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision): DungeonDecision | null {
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
  const piece = nextSetPiece(dungeons.map((d) => d.setPiece), s, 'cellar');
  return { kind: 'dungeon', id: `cellar-${n}`, template: 'cellar', town: town.decision.id, building: house.id, seed: s, setPiece: piece, danger: dangerAt(town, home) };
}

/** Where barrows lie: metres from the town's market, at least and at most. */
const BARROW_RING: readonly [number, number] = [550, 1300];

/** The way from one point to another as people say it ("north-east"); north is −z, east +x. */
export function compass(dx: number, dz: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = Math.atan2(dx, -dz);
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

/**
 * A barrow promised out on the land near the town (plan 8: a second kind of dungeon): on dry, gentle
 * ground on a ring around the market, away from `avoid` (the wild's territories, other barrows), its
 * doorway facing the town. The household who knows of it lives on the town's side towards it. Null if
 * no ground fits.
 */
export function promiseBarrow(seed: number, terrain: Terrain, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[] = []): DungeonDecision | null {
  const dungeons = log.filter((d): d is DungeonDecision => d.kind === 'dungeon');
  const n = dungeons.filter((d) => d.template === 'barrow').length + 1;
  const s = deriveSeed(seed, 'vgm', 'barrow', n);
  const { x: tx, z: tz } = town.decision;
  const away = [...avoid, ...dungeons.flatMap((d) => (d.site ? [{ x: d.site.x, z: d.site.z, r: 150 }] : []))];
  let best: { x: number; z: number; score: number } | null = null;
  for (let k = 0; k < 64; k++) {
    const d = BARROW_RING[0] + (BARROW_RING[1] - BARROW_RING[0]) * hash2f(s, k, 1), a = hash2f(s, k, 2) * Math.PI * 2;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    if (terrain.waterDepth(x, z) > 0 || terrain.height(x, z) < 3) continue;
    const h = terrain.height(x, z), slope = Math.max(Math.abs(terrain.height(x + 10, z) - h), Math.abs(terrain.height(x, z + 10) - h)) / 10;
    if (slope > 0.3 || away.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 40)) continue;
    // A barrow stands on a rise: higher than the ground around it scores better.
    const rise = h - (terrain.height(x + 40, z) + terrain.height(x - 40, z) + terrain.height(x, z + 40) + terrain.height(x, z - 40)) / 4;
    const score = Math.max(-1, Math.min(1, rise / 6)) - slope + hash2f(s, k, 3) * 0.3;
    if (!best || score > best.score) best = { x, z, score };
  }
  if (!best) return null;
  const dx = best.x - tx, dz = best.z - tz;
  // Facing into the barrow is facing away from the town (yaw as the walker's: it faces (−sin, −cos)).
  const yaw = Math.atan2(-dx, -dz);
  const houses = town.plan.buildings.filter((b) => CELLARED.includes(b.kind) && b.household > 0);
  if (!houses.length) return null;
  const knower = houses.reduce((a, b) => (Math.hypot(b.cx - best.x, b.cz - best.z) < Math.hypot(a.cx - best.x, a.cz - best.z) ? b : a));
  const piece = nextSetPiece(dungeons.map((d) => d.setPiece), s, 'barrow');
  return { kind: 'dungeon', id: `barrow-${n}`, template: 'barrow', town: town.decision.id, building: knower.id, site: { x: best.x, z: best.z, yaw }, seed: s, setPiece: piece, danger: dangerAt({ decision: best }, home) };
}

/** What a dungeon's making knows of where it lies: the house above a cellar, a barrow's name. */
export function placeOf(d: DungeonDecision, towns: readonly Town[]): DungeonPlace | null {
  if (d.template === 'cellar') return houseOf(d, towns);
  const town = towns.find((t) => t.decision.id === d.town);
  if (!town || !d.site) return null;
  return { kind: d.template, hu: 3, hv: 3, name: `the barrow ${compass(d.site.x - town.decision.x, d.site.z - town.decision.z)} of the town` };
}

/** The setting's lore for a kind of dungeon (the cellar's when the setting has none of its own). */
export function loreOf(setting: Pick<SettingModule, 'dungeons'>, kind: DungeonTemplate): CellarLore {
  return setting.dungeons[kind] ?? setting.dungeons.cellar;
}

/** The set piece for the next dungeon of a kind: one used least so far in this world (plan 8.1: none repeats until the library is used through). */
export function nextSetPiece(used: readonly string[], seed: number, kind: DungeonTemplate = 'cellar'): string {
  const pieces = setPiecesFor(kind);
  const times = (id: string) => used.filter((u) => u === id).length;
  const fewest = Math.min(...pieces.map((p) => times(p.id)));
  const fresh = pieces.filter((p) => times(p.id) === fewest);
  return fresh[Math.floor(hash2f(seed, 3, 9) * fresh.length)].id;
}

/** The house a dungeon decision lies under (a cellar), or whose household knows of it (a barrow). */
export function houseOf(d: DungeonDecision, towns: readonly Town[]): TownBuilding | null {
  const town = towns.find((t) => t.decision.id === d.town);
  return town?.plan.buildings.find((b) => b.id === d.building) ?? null;
}

/** The first dungeon promised in the log, if any. */
export function firstDungeon(log: DecisionLog): DungeonDecision | null {
  for (const d of log) if (d.kind === 'dungeon') return d;
  return null;
}

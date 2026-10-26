/**
 * The VGM's dungeons (plan 4.2, 8): a promise of a cellar under a house of a town, or of a barrow, a cave
 * or a ruined tower out on the land near it, as a decision. The
 * house is chosen from the town's plan when the promise is made; the set piece is one the world has not
 * used yet (plan 8.1: none repeats until the library has been used through). What the household knows
 * comes from `sketchCellar` (world/dungeon/cellar.ts): hint lines, facts, and who knows them.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { TownBuilding } from '@futuremagic/settlement';
import type { CellarLore, SettingModule } from '../setting/contract';
import { sitesIn, type DecisionLog, type DungeonDecision, type DungeonTemplate } from '../world/decisions';
import { woodsOf } from '../world/flora';
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

/** The kinds of place promised out on the land, rather than under a house. */
export type LandKind = Exclude<DungeonTemplate, 'cellar'>;
export const LAND_KINDS: readonly LandKind[] = ['barrow', 'cave', 'tower'];

/** The way from one point to another as people say it ("north-east"); north is −z, east +x. */
export function compass(dx: number, dz: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = Math.atan2(dx, -dz);
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

/** A spot's fitness for a kind of place: higher is better; the way into it (yaw); null if it does not fit. */
type Fit = (x: number, z: number, k: number) => { score: number; yaw?: number } | null;

/**
 * Where each kind lies (metres from the town's market, at least and at most) and what ground it wants:
 * a barrow on a rise; a cave's mouth at the foot of a slope, going into the hill; a tower on a rise of
 * level ground, its door towards the town. Caves and towers keep out of the woods.
 */
const LAND: Readonly<Record<LandKind, { readonly ring: readonly [number, number]; fit(t: Terrain, s: number): Fit }>> = {
  barrow: {
    ring: [550, 1300],
    fit: (t, s) => (x, z, k) => {
      const h = t.height(x, z), slope = Math.max(Math.abs(t.height(x + 10, z) - h), Math.abs(t.height(x, z + 10) - h)) / 10;
      if (slope > 0.3) return null;
      // A barrow stands on a rise: higher than the ground around it scores better.
      const rise = h - (t.height(x + 40, z) + t.height(x - 40, z) + t.height(x, z + 40) + t.height(x, z - 40)) / 4;
      return { score: Math.max(-1, Math.min(1, rise / 6)) - slope + hash2f(s, k, 3) * 0.3 };
    },
  },
  cave: {
    ring: [700, 1600],
    fit: (t, s) => {
      const woods = woodsOf(t);
      return (x, z, k) => {
        const gx = (t.height(x + 6, z) - t.height(x - 6, z)) / 12, gz = (t.height(x, z + 6) - t.height(x, z - 6)) / 12, slope = Math.hypot(gx, gz);
        if (slope < 0.08 || slope > 0.5) return null;
        // Into the hill: uphill from the mouth, with rock enough above it to go into.
        const ix = gx / slope, iz = gz / slope, h = t.height(x, z);
        const rise = t.height(x + ix * 14, z + iz * 14) - h;
        if (rise < 3) return null;
        return { score: Math.min(1.5, rise / 8) - woods(x, z) - Math.max(0, slope - 0.35) + hash2f(s, k, 3) * 0.3, yaw: Math.atan2(-ix, -iz) };
      };
    },
  },
  tower: {
    ring: [700, 1500],
    fit: (t, s) => {
      const woods = woodsOf(t);
      return (x, z, k) => {
        const h = t.height(x, z);
        // Level enough for a keep's foot (some 20 m across).
        let worst = 0;
        for (const [a, b] of [[-9, 0], [9, 0], [0, -9], [0, 9], [-9, -18], [9, -18], [-9, 18], [9, 18], [0, -18], [0, 18], [-18, 0], [18, 0]]) worst = Math.max(worst, Math.abs(t.height(x + a, z + b) - h));
        if (worst > 1.8) return null;
        const rise = h - (t.height(x + 60, z) + t.height(x - 60, z) + t.height(x, z + 60) + t.height(x, z - 60)) / 4;
        return { score: Math.max(-1, Math.min(1, rise / 8)) - worst * 0.2 - woods(x, z) * 1.5 + hash2f(s, k, 3) * 0.3 };
      };
    },
  },
};

/** Spots on the ring tried for a place on the land (a town in a gentle river valley has few slopes for a cave). */
const TRIES = 128;

/**
 * A place promised out on the land near the town (plan 8: dungeon kinds besides cellars): on dry ground
 * that fits its kind (`LAND`), on a ring around the market, away from `avoid` (the wild's territories) and
 * from other places on the land, its doorway facing the town (a cave: going into its hill). The household
 * who knows of it lives on the town's side towards it. Null if no ground fits.
 */
export function promisePlace(kind: LandKind, seed: number, terrain: Terrain, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[] = []): DungeonDecision | null {
  const dungeons = log.filter((d): d is DungeonDecision => d.kind === 'dungeon');
  const n = dungeons.filter((d) => d.template === kind).length + 1;
  const s = deriveSeed(seed, 'vgm', kind, n);
  const { x: tx, z: tz } = town.decision;
  const away = [...avoid, ...sitesIn(log, 150)];
  const rule = LAND[kind], [r0, r1] = rule.ring, fit = rule.fit(terrain, s);
  let best: { x: number; z: number; score: number; yaw?: number } | null = null;
  for (let k = 0; k < TRIES; k++) {
    const d = r0 + (r1 - r0) * hash2f(s, k, 1), a = hash2f(s, k, 2) * Math.PI * 2;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    if (terrain.waterDepth(x, z) > 0 || terrain.height(x, z) < 3) continue;
    if (away.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 40)) continue;
    const f = fit(x, z, k);
    if (f && (!best || f.score > best.score)) best = { x, z, ...f };
  }
  if (!best) return null;
  const dx = best.x - tx, dz = best.z - tz;
  // Facing into it is facing away from the town (yaw as the walker's: it faces (−sin, −cos)), unless its ground says otherwise.
  const yaw = best.yaw ?? Math.atan2(-dx, -dz);
  const houses = town.plan.buildings.filter((b) => CELLARED.includes(b.kind) && b.household > 0);
  if (!houses.length) return null;
  const knower = houses.reduce((a, b) => (Math.hypot(b.cx - best.x, b.cz - best.z) < Math.hypot(a.cx - best.x, a.cz - best.z) ? b : a));
  const piece = nextSetPiece(dungeons.map((d) => d.setPiece), s, kind);
  return { kind: 'dungeon', id: `${kind}-${n}`, template: kind, town: town.decision.id, building: knower.id, site: { x: best.x, z: best.z, yaw }, seed: s, setPiece: piece, danger: dangerAt({ decision: best }, home) };
}

/** A barrow promised out on the land near the town (`promisePlace`). */
export function promiseBarrow(seed: number, terrain: Terrain, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[] = []): DungeonDecision | null {
  return promisePlace('barrow', seed, terrain, town, log, home, avoid);
}

/** What people call a place on the land, by its kind and the way to it from the town. */
const LAND_NAMES: Readonly<Record<LandKind, string>> = { barrow: 'the barrow {dir} of the town', cave: 'the cave {dir} of the town', tower: 'the old tower {dir} of the town' };

/** What a dungeon's making knows of where it lies: the house above a cellar, the name of a place on the land. */
export function placeOf(d: DungeonDecision, towns: readonly Town[]): DungeonPlace | null {
  if (d.template === 'cellar') return houseOf(d, towns);
  const town = towns.find((t) => t.decision.id === d.town);
  if (!town || !d.site) return null;
  return { kind: d.template, hu: 3, hv: 3, name: LAND_NAMES[d.template].replace('{dir}', compass(d.site.x - town.decision.x, d.site.z - town.decision.z)) };
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

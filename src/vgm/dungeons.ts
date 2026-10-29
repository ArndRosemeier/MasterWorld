/**
 * The VGM's dungeons (plan 4.2, 8): a promise of a cellar under a house of a town, or of a barrow, a cave
 * or a ruined tower out on the land near it, as a decision. The
 * house is chosen from the town's plan when the promise is made; the set piece is one the world has not
 * used yet (plan 8.1: none repeats until the library has been used through). What the household knows
 * comes from `sketchCellar` (world/dungeon/cellar.ts): hint lines, facts, and who knows them.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import { farmlandReach, type TownBuilding } from '@futuremagic/settlement';
import type { CellarLore, DungeonForm, SettingModule } from '../setting/contract';
import { sitesIn, type DecisionLog, type DungeonDecision, type DungeonTemplate, type RetakeDecision, type RetreatDecision, type TownDecision } from '../world/decisions';
import { woodsOf } from '../world/flora';
import type { DungeonPlace } from '../world/dungeon/cellar';
import { setPiecesFor } from '../world/dungeon/setPieces';
import type { Terrain } from '../world/terrain';
import { townById, type Town } from '../world/town';

/** Houses that dig cellars: lived in, not the temple, the hall or the stable. */
const CELLARED: readonly TownBuilding['kind'][] = ['house', 'cottage', 'inn', 'bakery', 'workshop', 'smithy'];

/** How far (m) a place (a town, a dungeon: what has a `decision`) lies from `p`. */
export function farFrom(at: { readonly decision: { readonly x: number; readonly z: number } }, p: { readonly x: number; readonly z: number }): number {
  return Math.hypot(at.decision.x - p.x, at.decision.z - p.z);
}

/**
 * The most danger a place may hold (D29): within reach of the start, what a fresh hero can take on
 * (about 18 on the hero's power scale, a fresh hero being about 15); more with every kilometre beyond.
 */
export function dangerAt(at: { readonly decision: { readonly x: number; readonly z: number } }, home: { readonly x: number; readonly z: number }): number {
  const km = farFrom(at, home) / 1000;
  return Math.round(18 + Math.max(0, km - 1) * 6);
}

/** A cellar promised under one of the town's houses (`home`: where the game starts); null if the town has none that fits. */
export function promiseCellar(seed: number, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision, kind: DungeonTemplate = 'cellar', form?: DungeonForm): DungeonDecision | null {
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
  const piece = nextSetPiece(dungeons.map((d) => d.setPiece), s, kind, form?.pieces);
  return { kind: 'dungeon', id: `${kind}-${n}`, template: kind, town: town.decision.id, building: house.id, seed: s, setPiece: piece, danger: dangerAt(town, home) };
}

/** A kind of place promised out on the land, rather than under a house (a key of the setting's `dungeons`). */
export type LandKind = DungeonTemplate;

/** The setting's kinds that stand out on the land (C6c: whatever their `form` says, not their names), those for `purpose` if given. */
export function landKinds(dungeons: SettingModule['dungeons'], purpose?: string): LandKind[] {
  return Object.entries(dungeons).filter(([, l]) => l && l.form.stands !== 'house' && (!purpose || l.form.purposes.includes(purpose))).map(([k]) => k);
}

/** What the one who asks for a place wants (`dungeonFor`). */
export interface DungeonAsk {
  /** What it is for: a kind fits when its form's `purposes` hold it (a lead, a hideout, a den). */
  readonly purpose: string;
  /** The town whose people may know of it (the household nearest it), and whose danger it has (D29). */
  readonly town: Town;
  /** Near this point (world metres), on `ring` round it; none: on the kind's own ring round the town. */
  readonly near?: { readonly x: number; readonly z: number; readonly ring: readonly [number, number] };
  /** Who lives there (an encounter's id): only kinds whose lore has such dwellers. */
  readonly dwellers?: string;
  /** Only these kinds, tried in this order (none: those that fit, from a seeded start). */
  readonly kinds?: readonly string[];
}

export interface DungeonContext {
  readonly seed: number;
  readonly terrain: Terrain;
  readonly log: DecisionLog;
  readonly home: { readonly x: number; readonly z: number };
  readonly dungeons: SettingModule['dungeons'];
  /** Ground a place on the land keeps away from (the wild's territories, the bands out). */
  readonly avoid?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
}

/**
 * The one request for a place (C6c, D51; docs/design/vgm.md 4): leads, story events and encounters ask for
 * a purpose near somewhere, and get the decision of a kind that fits, on ground that suits it, or null. A
 * kind under houses goes under one of the town's; a kind out on the land goes on its ring.
 */
export function dungeonFor(a: DungeonAsk, c: DungeonContext): DungeonDecision | null {
  const fits = Object.keys(c.dungeons).filter((k) => {
    const l = c.dungeons[k];
    return !!l && l.form.purposes.includes(a.purpose) && (!a.kinds || a.kinds.includes(k)) && (!a.dwellers || l.dwellers.some((w) => w.encounter === a.dwellers));
  });
  const order = a.kinds ? a.kinds.filter((k) => fits.includes(k)) : fits;
  const first = a.kinds ? 0 : Math.floor(hash2f(deriveSeed(c.seed, 'vgm', 'place-for', a.purpose), c.log.length, 1) * Math.max(1, order.length));
  for (let i = 0; i < order.length; i++) {
    const kind = order[(first + i) % order.length], form = c.dungeons[kind]!.form;
    const d = form.stands === 'house' ? promiseCellar(c.seed, a.town, c.log, c.home, kind, form) : promisePlace(kind, form, c.seed, c.terrain, a.town, c.log, c.home, c.avoid, a.near);
    if (d) return a.dwellers ? { ...d, dwellers: a.dwellers } : d;
  }
  return null;
}

/**
 * Others take a place while it stands (C6c: plan 8's story change; D10): who of the kind's dwellers are of
 * the encounter asked for move in, the layout stays. Null if the place's lore has none such, or they are
 * there already.
 */
export function retakeOf(log: DecisionLog, dungeons: SettingModule['dungeons'], dungeon: string, encounter: string, seed: number, at: number): RetakeDecision | null {
  const d = log.find((x): x is DungeonDecision => x.kind === 'dungeon' && x.id === dungeon);
  const lore = d && loreOf({ dungeons }, d.template);
  const now = d && [...log].reverse().find((x) => (x.kind === 'move-in' || x.kind === 'retake') && x.dungeon === dungeon);
  const fits = lore?.dwellers.filter((w) => w.encounter === encounter && !(now && 'dweller' in now && now.dweller === w.id)) ?? [];
  if (!d || !fits.length) return null;
  const n = log.filter((x) => x.kind === 'retake').length + 1;
  return { kind: 'retake', id: `retake-${n}`, dungeon, dweller: fits[Math.floor(hash2f(seed, n, 5) * fits.length)].id, seed: deriveSeed(seed, 'retake', n), at };
}

/** The way from one point to another as people say it ("north-east"); north is −z, east +x. */
export function compass(dx: number, dz: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = Math.atan2(dx, -dz);
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

/** A spot's fitness for a kind of place: higher is better; the way into it (yaw); null if it does not fit. */
type Fit = (x: number, z: number, k: number) => { score: number; yaw?: number } | null;

/**
 * What ground a place wants, by how its kind stands (`DungeonForm.stands`): on a rise (a barrow); at the
 * foot of a slope, going into the hill (a cave's mouth); on a rise of level ground, its door towards the
 * town (a tower). Places in slopes and on level ground keep out of the woods.
 */
const GROUND: Readonly<Record<Exclude<DungeonForm['stands'], 'house'>, (t: Terrain, s: number) => Fit>> = {
  rise: (t, s) => (x, z, k) => {
      const h = t.height(x, z), slope = t.steepness(x, z, 10, h);
      if (slope > 0.3) return null;
      // A barrow stands on a rise: higher than the ground around it scores better.
      const rise = h - (t.height(x + 40, z) + t.height(x - 40, z) + t.height(x, z + 40) + t.height(x, z - 40)) / 4;
      return { score: Math.max(-1, Math.min(1, rise / 6)) - slope + hash2f(s, k, 3) * 0.3 };
  },
  slope: (t, s) => {
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
  level: (t, s) => {
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
};

/** Spots on the ring tried for a place on the land (a town in a gentle river valley has few slopes for a cave). */
const TRIES = 128;

/**
 * A place promised out on the land near the town (plan 8: dungeon kinds besides cellars): on dry ground
 * that fits its kind (`LAND`), on a ring around the market, away from `avoid` (the wild's territories) and
 * from other places on the land, its doorway facing the town (a cave: going into its hill). The household
 * who knows of it lives on the town's side towards it. Null if no ground fits.
 */
export function promisePlace(kind: LandKind, form: DungeonForm, seed: number, terrain: Terrain, town: Town, log: DecisionLog, home: { readonly x: number; readonly z: number } = town.decision, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[] = [], near?: { readonly x: number; readonly z: number; readonly ring: readonly [number, number] }): DungeonDecision | null {
  if (form.stands === 'house' || !form.ring) return null;
  const dungeons = log.filter((d): d is DungeonDecision => d.kind === 'dungeon');
  const n = dungeons.filter((d) => d.template === kind).length + 1;
  const s = deriveSeed(seed, 'vgm', kind, n);
  const { x: tx, z: tz } = town.decision;
  const best = spotOnRing(form.stands, near?.ring ?? form.ring, s, terrain, near ?? town.decision, [...avoid, ...sitesIn(log, 150)]);
  if (!best) return null;
  const dx = best.x - tx, dz = best.z - tz;
  // Facing into it is facing away from the town (yaw as the walker's: it faces (−sin, −cos)), unless its ground says otherwise.
  const yaw = best.yaw ?? Math.atan2(-dx, -dz);
  const houses = town.plan.buildings.filter((b) => CELLARED.includes(b.kind) && b.household > 0);
  if (!houses.length) return null;
  const knower = houses.reduce((a, b) => (Math.hypot(b.cx - best.x, b.cz - best.z) < Math.hypot(a.cx - best.x, a.cz - best.z) ? b : a));
  const piece = nextSetPiece(dungeons.map((d) => d.setPiece), s, kind, form.pieces);
  return { kind: 'dungeon', id: `${kind}-${n}`, template: kind, town: town.decision.id, building: knower.id, site: { x: best.x, z: best.z, yaw }, seed: s, setPiece: piece, danger: dangerAt({ decision: best }, home) };
}

/** How far (m) a place may lie up or down a mesa's walls from where it is asked. */
const MESA_LEVEL = 15;

/**
 * The best spot for a kind of place on a ring round `at` (metres from it, at least and at most), on dry
 * ground that fits the kind, away from `avoid`; null if none of the tries fits.
 */

function spotOnRing(stands: keyof typeof GROUND, ring: readonly [number, number], s: number, terrain: Terrain, at: { readonly x: number; readonly z: number }, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[]): { x: number; z: number; score: number; yaw?: number } | null {
  const [r0, r1] = ring, fit = GROUND[stands](terrain, s);
  // On the level of where it is asked from (D56): not up on a mesa's plateau or bench over a valley, whose way up
  // may be kilometres round to a pass.
  const sk = terrain.skeleton, level = sk.mesaRise(at.x, at.z);
  let best: { x: number; z: number; score: number; yaw?: number } | null = null;
  for (let k = 0; k < TRIES; k++) {
    const d = r0 + (r1 - r0) * hash2f(s, k, 1), a = hash2f(s, k, 2) * Math.PI * 2;
    const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
    if (terrain.waterDepth(x, z) > 0 || terrain.height(x, z) < 3) continue;
    if (Math.abs(sk.mesaRise(x, z) - level) > MESA_LEVEL) continue;
    if (avoid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 40)) continue;
    const f = fit(x, z, k);
    if (f && (!best || f.score > best.score)) best = { x, z, ...f };
  }
  return best;
}

/**
 * A teacher's half-ruined tower (C3, D49: a guild with `near: 'out'`): on a rise of level ground a short way
 * past the town's fields, its door towards the town. Chosen when the world opens, on the bare land.
 */
export function retreatSite(keeper: string, seed: number, terrain: Terrain, town: TownDecision, avoid: readonly { readonly x: number; readonly z: number; readonly r: number }[]): RetreatDecision | null {
  const fields = town.radius + farmlandReach(town.radius);
  const best = spotOnRing('level', [fields + 30, fields + 150], deriveSeed(seed, 'vgm', 'retreat', keeper), terrain, town, avoid);
  if (!best) return null;
  return { kind: 'retreat', id: `retreat-${keeper}`, keeper, town: town.id, x: best.x, z: best.z, yaw: Math.atan2(-(best.x - town.x), -(best.z - town.z)) };
}

/** What a dungeon's making knows of where it lies: the house above a cellar, the name of a place on the land (its kind's `called`). */
export function placeOf(d: DungeonDecision, towns: readonly Town[], dungeons: SettingModule['dungeons']): DungeonPlace | null {
  const form = loreOf({ dungeons }, d.template).form;
  if (!d.site) return form.stands === 'house' ? houseOf(d, towns) : null;
  const town = townById(towns, d.town);
  if (!town) return null;
  const called = form.called ?? `the ${form.word} {dir} of the town`;
  return { kind: d.template, hu: 3, hv: 3, name: called.replace('{dir}', compass(d.site.x - town.decision.x, d.site.z - town.decision.z)) };
}

/** The setting's lore for a kind of dungeon (the cellar's when the setting has none of its own). */
export function loreOf(setting: Pick<SettingModule, 'dungeons'>, kind: DungeonTemplate): CellarLore {
  return setting.dungeons[kind] ?? setting.dungeons.cellar;
}

/** The set piece for the next dungeon of a kind: one used least so far in this world (plan 8.1: none repeats until the library is used through). */
export function nextSetPiece(used: readonly string[], seed: number, kind: DungeonTemplate = 'cellar', also?: readonly string[]): string {
  const pieces = setPiecesFor(kind, also);
  const times = (id: string) => used.filter((u) => u === id).length;
  const fewest = Math.min(...pieces.map((p) => times(p.id)));
  const fresh = pieces.filter((p) => times(p.id) === fewest);
  return fresh[Math.floor(hash2f(seed, 3, 9) * fresh.length)].id;
}

/** The house a dungeon decision lies under (a cellar), or whose household knows of it (a barrow). */
export function houseOf(d: DungeonDecision, towns: readonly Town[]): TownBuilding | null {
  const town = townById(towns, d.town);
  return town?.plan.buildings.find((b) => b.id === d.building) ?? null;
}

/** The first dungeon promised in the log, if any. */
export function firstDungeon(log: DecisionLog): DungeonDecision | null {
  for (const d of log) if (d.kind === 'dungeon') return d;
  return null;
}

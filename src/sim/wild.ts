/**
 * The wild (plan 9.3, D27): what lives on the land around a town, in the same simulation as the
 * townsfolk and the dwellers below, without the VGM: deer graze in the meadows and bolt, a wolf pack
 * keeps to its woods, boar root under the trees, bandits camp by a road out of town and watch it. Each
 * group has a territory (seeded from the world, the setting says who lives where and how far out) and is
 * a den of its own (sim/creatures.ts) on open land: they notice the hero by sight and sound, call their
 * own, fight or flee and go home. Far groups rest (they stay home until the hero comes near). Danger is
 * fixed by where they live (D29), never by the hero. Positions are world metres. Pure.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import type { CreatureDef, WildDef } from '../setting/contract';
import { woodsOf } from '../world/flora';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { Den, type Quarry, type DenEvent } from './creatures';
import type { DenGround, P3 } from './dungeonNav';

/** What the wild walks on: the land's height, where it is dry, and what stands in the way. */
export interface Land {
  height(x: number, z: number): number;
  /** Open water deeper than paddling (m; 0 where dry). */
  waterDepth(x: number, z: number): number;
  /** A building's walls, a tree trunk (r: the body's radius). */
  blocked?(x: number, z: number, r: number): boolean;
}

/** A group's home ground. */
export interface Territory {
  readonly def: WildDef;
  readonly x: number;
  readonly z: number;
  readonly r: number;
  /** Who lives there (creature ids), the leader first. */
  readonly members: readonly string[];
  readonly seed: number;
  /** Stable id (saves name the dead by it). */
  readonly id: string;
}

/** How far a group's members spread around where they are gathered, metres. */
const GATHER = 12;

/** Steepest ground a beast walks up, rise per metre. */
const STEEP = 0.9;

/** Open land as a den's ground: the territories are its homes; walking is straight, around water and walls. */
export class OpenGround implements DenGround {
  /** Where each group is gathered now: it drifts about its territory as they move on, together. */
  private readonly at: { x: number; z: number }[];

  constructor(private readonly land: Land, private readonly homes: readonly { x: number; z: number; r: number }[]) {
    this.at = homes.map((h) => ({ x: h.x, z: h.z }));
  }

  /** A point near where the group is gathered (a herd grazes together, a pack keeps close). */
  spot(home: number, rng: { range(a: number, b: number): number }): P3 {
    const h = this.homes[home], c = this.at[home];
    // The group moves on a little: towards somewhere else in its territory.
    const a0 = rng.range(0, Math.PI * 2), d0 = Math.sqrt(rng.range(0, 1)) * h.r;
    const tx = h.x + Math.cos(a0) * d0, tz = h.z + Math.sin(a0) * d0;
    const step = Math.min(1, 4 / Math.max(1, Math.hypot(tx - c.x, tz - c.z)));
    if (this.open(c.x + (tx - c.x) * step, c.z + (tz - c.z) * step, 0.5)) { c.x += (tx - c.x) * step; c.z += (tz - c.z) * step; }
    for (let i = 0; i < 10; i++) {
      const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.range(0, 1)) * GATHER;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (this.open(x, z, 0.5)) return { x, y: this.land.height(x, z), z };
    }
    return { x: c.x, y: this.land.height(c.x, c.z), z: c.z };
  }

  floorAt(x: number, z: number): number { return this.land.height(x, z); }

  clearance(x: number, _y: number, z: number): number { return this.open(x, z, 0.4) ? 2 : -1; }

  /** The land itself hides what is behind a rise (eye height above the ground at each end). */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye = 1.2): boolean {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 4);
    for (let s = 1; s < n; s++) {
      const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (this.land.height(x, z) > ay + eye + (by - ay) * t) return false;
    }
    return true;
  }

  way(_from: P3, to: P3): P3[] { return [to]; }

  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null {
    const ok = (nx: number, nz: number) => this.open(nx, nz, r) && Math.abs(this.land.height(nx, nz) - y) <= STEEP * Math.hypot(nx - x, nz - z) + 0.05;
    if (ok(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    if (Math.abs(dx) > 1e-4 && ok(x + dx, z)) return { x: x + dx, z };
    if (Math.abs(dz) > 1e-4 && ok(x, z + dz)) return { x, z: z + dz };
    return null;
  }

  /** Thirty metres or so straight away from `q`, or off to a side when water or a wall is in the way. */
  away(from: P3, q: P3): P3[] {
    const base = Math.atan2(from.z - q.z, from.x - q.x);
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = base + turn, x = from.x + Math.cos(a) * 30, z = from.z + Math.sin(a) * 30;
      if (this.open(x, z, 0.5) && this.open((from.x + x) / 2, (from.z + z) / 2, 0.5)) return [{ x, y: this.land.height(x, z), z }];
    }
    return [];
  }

  private open(x: number, z: number, r: number): boolean {
    return this.land.waterDepth(x, z) < 0.25 && !this.land.blocked?.(x, z, r);
  }
}

/** How a group's danger compares with the place's (D29): within reach of the start about 18, more farther out. */
export function groupDanger(members: readonly string[], defs: readonly CreatureDef[]): number {
  const ds = members.map((m) => defs.find((d) => d.id === m)?.danger ?? 0).sort((a, b) => b - a);
  return ds.length ? ds[0] + ds.slice(1).reduce((a, d) => a + d * 0.25, 0) : 0;
}

/**
 * The territories around a town: for each kind of the setting's wild, its groups on a ring around the
 * town where the land suits them (woods, open land, by a road out), apart from each other.
 */
export function placeWild(seed: number, terrain: Terrain, town: Town, wild: readonly WildDef[]): Territory[] {
  const out: Territory[] = [];
  const { x: tx, z: tz } = town.decision;
  const woods = woodsOf(terrain);
  const roads = town.plan.streets.filter((s) => s.kind === 'road').map((s) => {
    const n = s.pts.length;
    return Math.atan2(s.pts[n - 1] - tz, s.pts[n - 2] - tx);
  });
  for (const def of wild) {
    for (let g = 0; g < def.groups; g++) {
      const s = deriveSeed(seed, 'wild', def.id, g);
      let best: { x: number; z: number; score: number } | null = null;
      for (let k = 0; k < 48; k++) {
        const d = def.ring[0] + (def.ring[1] - def.ring[0]) * hash2f(s, k, 1);
        let a = hash2f(s, k, 2) * Math.PI * 2;
        // By a road: along one of the roads out, a little off it.
        if (def.habitat === 'road' && roads.length) a = roads[Math.floor(hash2f(s, k, 3) * roads.length)] + (hash2f(s, k, 4) - 0.5) * 0.35;
        const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
        if (terrain.waterDepth(x, z) > 0 || terrain.height(x, z) < 2) continue;
        // Gentle enough to live on.
        const h = terrain.height(x, z), slope = Math.max(Math.abs(terrain.height(x + 8, z) - h), Math.abs(terrain.height(x, z + 8) - h)) / 8;
        if (slope > 0.45) continue;
        const w = woods(x, z);
        const fit = def.habitat === 'wood' ? w : def.habitat === 'open' ? 1 - w : 0.6 + (1 - w) * 0.2;
        // Apart from the other groups, and clear of a people's hold.
        const crowd = out.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + def.range + 60) || terrain.holds.some((h) => Math.hypot(h.x - x, h.z - z) < def.range + 110) ? 1 : 0;
        const score = fit - crowd - slope + hash2f(s, k, 5) * 0.1;
        if (!best || score > best.score) best = { x, z, score };
      }
      if (!best || best.score < 0.2) continue;
      const rng = new Rng(deriveSeed(s, 'members'));
      const n = rng.int(def.count[0], def.count[1]);
      const members = Array.from({ length: n }, (_, i) => (i === 0 ? def.creatures[0] : def.creatures[Math.min(def.creatures.length - 1, rng.int(0, def.creatures.length - 1))]));
      out.push({ def, x: best.x, z: best.z, r: def.range, members, seed: s, id: `${def.id}-${g + 1}` });
    }
  }
  return out;
}

/** One group out on the land: its den, and whether it is awake (near the hero). */
export interface Band {
  readonly territory: Territory;
  readonly den: Den;
  awake: boolean;
}

/** Groups farther than this from the hero rest (at home, unstepped); nearer ones live. */
const WAKE = 260;
/** Hysteresis: a waking group sleeps again only this much farther off. */
const SLEEP = 320;

/** Is a group awake, `d` metres from the hero to its territory's edge (it was `was`)? */
export function awake(was: boolean, d: number): boolean {
  return was ? d <= SLEEP : d <= WAKE;
}

/** The wild around a town, stepped where the hero is (detail by distance, plan 9.2). */
export class Wilds {
  readonly bands: Band[];

  constructor(readonly territories: readonly Territory[], land: Land, defs: readonly CreatureDef[], dead: Readonly<Record<string, readonly number[]>> = {}) {
    this.bands = territories.map((t) => {
      const ground = new OpenGround(land, [t]);
      const den = new Den(ground, t.members.map((creature) => ({ creature, room: 0 })), defs, deriveSeed(t.seed, 'den'), dead[t.id] ?? []);
      return { territory: t, den, awake: false };
    });
  }

  /** Step the groups near the hero; their events, with the band each came from. */
  step(dt: number, q: Quarry): { band: Band; event: DenEvent }[] {
    const out: { band: Band; event: DenEvent }[] = [];
    for (const b of this.bands) {
      const t = b.territory;
      b.awake = awake(b.awake, Math.hypot(q.x - t.x, q.z - t.z) - t.r);
      if (!b.awake) continue;
      for (const event of b.den.step(dt, q)) out.push({ band: b, event });
    }
    return out;
  }

  /** The dead, by territory id (for the save). */
  dead(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const b of this.bands) if (b.den.dead.length) out[b.territory.id] = b.den.dead;
    return out;
  }
}

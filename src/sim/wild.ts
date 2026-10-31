/**
 * The wild (plan 9.3, D27): what lives on the land around a town, in the same simulation as the
 * townsfolk and the dwellers below, without the VGM: deer graze in the meadows and bolt, a wolf pack
 * keeps to its woods, boar root under the trees, bandits camp by a road out of town and watch it. Each
 * group has a territory (the VGM places them into the log, vgm/wild.ts) and is
 * a den of its own (sim/creatures.ts) on open land: they notice the hero by sight and sound, call their
 * own, fight or flee and go home. Far groups rest (they stay home until the hero comes near). Danger is
 * fixed by where they live (D29), never by the hero. Positions are world metres. Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { CreatureDef } from '../setting/contract';
import { Den, type Quarry, type DenEvent } from './creatures';
import type { DenGround, P3 } from './dungeonNav';

/** What the wild walks on: the land's height, where it is dry, and what stands in the way. */
export interface Land {
  height(x: number, z: number): number;
  /** Open water deeper than paddling (m; 0 where dry). */
  waterDepth(x: number, z: number): number;
  /** A building's walls, a tree trunk (r: the body's radius). */
  blocked?(x: number, z: number, r: number): boolean;
  /** The water's surface with its waves (null or none: still water over the bed by `waterDepth`). */
  surface?(x: number, z: number): number | null;
}

/** A group's home ground. */
export interface Territory {
  /** What kind of group (a wild group's id in the setting, or a story event's). */
  readonly kind: string;
  /** Who they are (the setting's encounter). */
  readonly encounter: string;
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

/** Steepest ground a beast walks up, rise per metre (judged over STRIDE, never per frame's step). */
const STEEP = 0.9;
/** The length over which the ground's rise is judged (m). */
const STRIDE = 0.6;
/** What it takes in its stride on top of the slope: a root, a stone, a bank's lip (m). */
const STEP_UP = 0.3;
/** A drop it jumps down, beyond the slope (m). */
const STEP_DOWN = 0.8;
/** Water it wades through on the way (m; spots to stand at stay dry). */
const WADE = 0.5;
/** Ways round something in the way: turned off the heading by these (radians), nearest first. */
const TURNS = [0.35, -0.35, 0.75, -0.75, 1.15, -1.15, 1.55, -1.55, 1.9, -1.9];
/** A hop free (Den.unstick): how far it may go (m) and how high up or down it lands. */
const HOP = { near: 1.2, far: 4.5, up: 1.4, down: 3 } as const;

/**
 * A home in water deeper than this (m) makes the ground the sea's (S9): its bodies swim, keep to water at least
 * `shallow` deep, and stay `top` under the waves and `bed` over the bottom, `under` below the feet of a hero who
 * swims (its `prey`; else `cruise` under the surface), rising or sinking at most `rise` (m per step). Kept level
 * with the swimmer, the two never pass through each other (bodies farther apart in height do, sim/creatures.ts).
 */
const SEA = { home: 3, shallow: 1.8, top: 1.3, bed: 0.6, cruise: 2.5, under: 0.2, rise: 0.08 } as const;

/** Open land as a den's ground: the territories are its homes; walking is straight, around water and walls. Or the sea, swum. */
export class OpenGround implements DenGround {
  /** Where each group is gathered now: it drifts about its territory as they move on, together. */
  private readonly at: { x: number; z: number }[];
  /** Its home lies out in deep water: it is swum, not walked (S9). */
  readonly sea: boolean;

  /** `prey`: the height (y) of the hero's feet while the hero swims, else null (a sea ground's bodies come to it). */
  constructor(private readonly land: Land, private readonly homes: readonly { x: number; z: number; r: number }[], private readonly prey: () => number | null = () => null) {
    this.at = homes.map((h) => ({ x: h.x, z: h.z }));
    this.sea = homes.length > 0 && land.waterDepth(homes[0].x, homes[0].z) >= SEA.home;
  }

  /** Where a swimmer at (x, z) keeps (y): the hero's depth, else cruising, between the surface and the bed; near `y` if given. */
  private swimAt(x: number, z: number, y?: number): number {
    const bed = this.land.height(x, z), surface = this.land.surface?.(x, z) ?? bed + this.land.waterDepth(x, z), top = surface - SEA.top;
    const prey = this.prey();
    const want = Math.max(bed + SEA.bed, Math.min(top, prey === null ? surface - SEA.cruise : prey - SEA.under));
    return y === undefined ? want : Math.max(y - SEA.rise, Math.min(y + SEA.rise, want));
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
      if (this.open(x, z, 0.5)) return { x, y: this.floorAt(x, z), z };
    }
    return { x: c.x, y: this.floorAt(c.x, c.z), z: c.z };
  }

  /** The ground under (x, z); at sea, where a swimmer keeps (`y`: from about there, as the den asks it 0.6 m over its body). */
  floorAt(x: number, z: number, y?: number): number { return this.sea ? this.swimAt(x, z, y === undefined ? undefined : y - 0.6) : this.land.height(x, z); }

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

  /**
   * Along what is in the way: straight on, else turned off the heading a little, then more (round a trunk, along
   * a bank). It wades shallow water, takes a small step or a bank's lip in its stride, and one standing where it
   * should not (in deep water, against a wall) may always move to better ground.
   */
  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null {
    if (this.passes(x, y, z, dx, dz, r)) return { x: x + dx, z: z + dz };
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return null;
    for (const a of TURNS) {
      const c = Math.cos(a), s = Math.sin(a), k = Math.max(0.5, c);
      const tx = (dx * c - dz * s) * k, tz = (dx * s + dz * c) * k;
      if (this.passes(x, y, z, tx, tz, r)) return { x: x + tx, z: z + tz };
    }
    return null;
  }

  /** Can a body at (x, z) move by (dx, dz)? */
  private passes(x: number, y: number, z: number, dx: number, dz: number, r: number): boolean {
    const nx = x + dx, nz = z + dz, len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    const wet = this.land.waterDepth(nx, nz), here = this.land.waterDepth(x, z);
    // At sea: the water deep enough to swim in, or any way deeper; nothing else in the way.
    if (this.sea) return wet >= SEA.shallow || wet > here;
    // Out of deep water: any way to shallower goes.
    if (wet >= WADE && !(here >= WADE && wet < here)) return false;
    if (this.land.blocked?.(nx, nz, r) && !this.land.blocked!(x, z, r)) return false;
    // The rise over a stride ahead (a frame's step is too short to judge a slope by).
    const ux = dx / len, uz = dz / len, s = Math.max(len, STRIDE);
    const rise = this.land.height(x + ux * s, z + uz * s) - Math.min(y, this.land.height(x, z));
    return rise <= STEEP * s + STEP_UP && -rise <= STEEP * s * 2 + STEP_DOWN;
  }

  /**
   * Where a body stuck at `from` hops to (Den.unstick): a dry, free spot a short hop off, from which it can walk
   * on, nearer `toward` than it is now (over a brook, up a bank, round a snag). Stuck where it should not
   * stand, any such spot. Null: nowhere worth it.
   */
  hop(from: P3, toward: P3 | null, r: number): P3 | null {
    if (this.sea) return null;
    const bad = !this.open(from.x, from.z, r) || !this.free(from.x, from.y, from.z, r);
    const goal = toward ? Math.hypot(toward.x - from.x, toward.z - from.z) : 0;
    const base = toward ? Math.atan2(toward.z - from.z, toward.x - from.x) : 0;
    let best: P3 | null = null, score = Infinity;
    for (let d = HOP.near; d <= HOP.far + 1e-6; d += 0.8) {
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d, y = this.land.height(x, z);
        const left = toward ? Math.hypot(toward.x - x, toward.z - z) : 0;
        if (!bad && (!toward || left > goal - 0.75)) continue;
        if (y - from.y > HOP.up || from.y - y > HOP.down || !this.open(x, z, r) || !this.free(x, y, z, r)) continue;
        // Over water and low things, never through a house or a trunk.
        let through = false;
        for (const t of [0.25, 0.5, 0.75]) if (this.land.blocked?.(from.x + (x - from.x) * t, from.z + (z - from.z) * t, r)) through = true;
        if (through) continue;
        const sc = left + d * 0.5;
        if (sc < score) { score = sc; best = { x, y, z }; }
      }
      if (best) break;
    }
    return best;
  }

  /** Room to walk on from a point: most ways round it go. */
  private free(x: number, y: number, z: number, r: number): boolean {
    let ok = 0;
    for (let k = 0; k < 8; k++) if (this.passes(x, y, z, Math.cos((k * Math.PI) / 4) * 0.8, Math.sin((k * Math.PI) / 4) * 0.8, r)) ok++;
    return ok >= 4;
  }

  /** Thirty metres or so straight away from `q`, or off to a side when water or a wall is in the way. */
  away(from: P3, q: P3): P3[] {
    const base = Math.atan2(from.z - q.z, from.x - q.x);
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = base + turn, x = from.x + Math.cos(a) * 30, z = from.z + Math.sin(a) * 30;
      if (this.open(x, z, 0.5) && this.open((from.x + x) / 2, (from.z + z) / 2, 0.5)) return [{ x, y: this.floorAt(x, z), z }];
    }
    return [];
  }

  private open(x: number, z: number, r: number): boolean {
    if (this.sea) return this.land.waterDepth(x, z) >= SEA.shallow;
    return this.land.waterDepth(x, z) < 0.25 && !this.land.blocked?.(x, z, r);
  }
}

/** How a group's danger compares with the place's (D29): within reach of the start about 18, more farther out. */
export function groupDanger(members: readonly string[], defs: readonly CreatureDef[]): number {
  const ds = members.map((m) => defs.find((d) => d.id === m)?.danger ?? 0).sort((a, b) => b - a);
  return ds.length ? ds[0] + ds.slice(1).reduce((a, d) => a + d * 0.25, 0) : 0;
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

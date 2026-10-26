/**
 * Small life (plan 9.3): birds and squirrels about the land, in the world simulation beside the townsfolk
 * and the wild, never fought and never steered by the VGM. They live in the squares around the hero
 * (which ones, and who, is seeded by the square, so a wood has its squirrels again when one comes back):
 *
 * - Squirrels forage round the foot of their tree (hop, eat, sit up and flick the tail). One that sees
 *   someone coming sits up and watches; nearer, it runs for its tree and up the trunk, round to the far
 *   side, and clings there until all is quiet, then comes down head first.
 * - Woodland and meadow birds peck about in small groups. Someone near, and they take wing together, up
 *   into the crowns of nearby trees (out of sight) or off over the grass, and come back down later.
 * - Flocks (starlings, rooks) wheel over open land, settle to feed now and then and rise together when
 *   someone comes near.
 *
 * By night they roost; in hard rain the birds shelter. Positions are world metres. Pure.
 */
import { Rng, angleDiff, deriveSeed, hash2f, smoothstep, srgbToLinear } from '@futuremagic/core';
import type { BirdKindDef, SmallLifeDef } from '../setting/contract';

/** The land as small life sees it. */
export interface LifeLand {
  height(x: number, z: number): number;
  /** Open water deeper than paddling (m; 0 where dry). */
  waterDepth(x: number, z: number): number;
  /** How wooded, 0 (open) .. 1 (closed wood). */
  woods(x: number, z: number): number;
  /** The trees of square (i, j) of side LIFE_CELL: x, z, trunk radius, scale (TREE_STRIDE floats each), or null while not known. */
  trees(i: number, j: number): Float32Array | null;
  /** Buildings and walls (nothing forages inside them). */
  blocked?(x: number, z: number, r: number): boolean;
}

/** Who might disturb them: the hero, how fast they go (m/s). */
export interface LifeHero {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speed: number;
}

/** Side of a square of small life (the trunks' cells, world/trunks.ts), metres; flocks keep squares of FLOCK_CELL. */
export const LIFE_CELL = 32;
const FLOCK_CELL = 128;
/** Floats per tree in LifeLand.trees. */
const TREE = 4;
/** A tree's height at scale 1 (world/trunks.ts TREE_TALL). */
const TALL = 14;
/** Squares nearer than this (m, their centre) live; farther than DROP they are let go. */
const LIVE = 110, DROP = 140;
const FLOCK_LIVE = 260, FLOCK_DROP = 320;

export type SquirrelDoing = 'idle' | 'alert' | 'eat' | 'hop' | 'run' | 'flick' | 'climb' | 'cling';

export interface Squirrel {
  readonly id: string;
  /** Actors' squirrel preset. */
  readonly look: string;
  readonly seed: number;
  x: number;
  y: number;
  z: number;
  /** Facing in the ground plane: (cos, sin) on (x, z). On a trunk: towards the trunk climbing up, away from it coming down. */
  heading: number;
  /** 0 on the ground, π/2 climbing (nose up), −π/2 coming down (nose down). */
  pitch: number;
  doing: SquirrelDoing;
  /** Ground speed or climbing speed now (m/s). */
  speed: number;
  /** Not out now (night). */
  hidden: boolean;
  // How it lives.
  readonly tree: { readonly x: number; readonly z: number; readonly r: number; readonly tall: number };
  readonly rng: Rng;
  /** On its trunk: the angle round it, the height up it, how high it means to go. */
  trunk: { a: number; h: number; to: number } | null;
  tx: number;
  tz: number;
  until: number;
  /** Quiet for this long (s): no one near. */
  calm: number;
  /** When it last sat up to watch (it does not keep doing it). */
  watched: number;
}

/** What a bird does: on the ground, in flight, or out of sight in a crown. */
export type BirdDoing = 'peck' | 'hop' | 'look' | 'fly' | 'perch';

export interface Bird {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  bank: number;
  /** Length, metres. */
  size: number;
  /** The wings' beat now (radians up from level). */
  wing: number;
  /** 0 spread .. 1 folded. */
  fold: number;
  /** Back colour, linear. */
  r: number;
  g: number;
  b: number;
  doing: BirdDoing;
  /** Drawn (not hidden in a crown, not roosting). */
  shown: boolean;
  // How it moves.
  readonly beat: number;
  phase: number;
  until: number;
  /** A flight: from, to, how far along (0..1), how long it takes, how high it arcs, whether it ends in a crown. */
  flight: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number; dur: number; arc: number; delay: number; perch: boolean } | null;
  /** A hop on the ground: from, to, how far along. */
  hop: { fx: number; fz: number; tx: number; tz: number; t: number } | null;
}

/** A few birds of a kind that keep together on the ground. */
interface Party {
  readonly kind: BirdKindDef;
  readonly birds: Bird[];
  readonly rng: Rng;
  /** Where they feed now. */
  hx: number;
  hz: number;
  state: 'ground' | 'up' | 'flying';
  /** Up in the crowns until (s), at least. */
  until: number;
}

/** A flock wheeling over open land. */
interface Flock {
  readonly kind: BirdKindDef;
  readonly birds: Bird[];
  readonly rng: Rng;
  /** Where it ranges (its square's centre). */
  readonly ox: number;
  readonly oz: number;
  /** The flock's centre and heading in the air. */
  cx: number;
  cy: number;
  cz: number;
  dir: number;
  /** Where it heads. */
  tx: number;
  tz: number;
  state: 'wheel' | 'land' | 'ground' | 'rise';
  /** How far through landing or rising (0..1). */
  t: number;
  until: number;
  /** Each bird's place in the flock: phases and radii of its weave, and its feeding spot. */
  readonly weave: { p1: number; p2: number; p3: number; r: number; gx: number; gz: number }[];
}

/** What happened this step (for sound). */
export interface LifeEvent {
  readonly kind: 'wings';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How many took wing. */
  readonly count: number;
}

interface Square { squirrels: Squirrel[]; parties: Party[] }

const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

/** How near someone comes (m) before a squirrel watches, flees; before ground birds and flocks take wing (walking; running adds). */
const WATCH = 16, BOLT = 8, FLUSH = 9, FLOCK_FLUSH = 22, RUN_EXTRA = 1.7;
/** No one about (far beyond every sense). */
const NOBODY: LifeHero = { x: 1e9, y: 0, z: 1e9, speed: 0 };
/** Running pace (m/s) from which the hero counts as running. */
const RUNNING = 3.5;

export class SmallLife {
  readonly squirrels: Squirrel[] = [];
  private readonly squares = new Map<number, Square>();
  private readonly flocks = new Map<number, Flock | null>();
  private readonly parties: Party[] = [];
  private time = 0;
  /** 0 night .. 1 day; how hard it rains. */
  private day = 1;
  private rain = 0;

  constructor(private readonly seed: number, private readonly land: LifeLand, private readonly def: SmallLifeDef) {}

  /** Every bird that is out and drawn. */
  *birds(): Generator<Bird> {
    if (this.day < 0.25) return;
    if (this.rain < 0.55) for (const p of this.parties) for (const b of p.birds) if (b.shown) yield b;
    for (const f of this.flocks.values()) if (f && this.rain < 0.35) for (const b of f.birds) if (b.shown) yield b;
  }

  /** The first squirrel on the ground, bird pecking on it, or bird of a flock in the air (live, for `small=`: look at them). */
  firstSeen(kind: 'squirrel' | 'birds' | 'flock'): { x: number; y: number; z: number } | null {
    if (kind === 'squirrel') return this.squirrels.find((s) => !s.trunk) ?? null;
    if (kind === 'flock') {
      for (const f of this.flocks.values()) if (f?.state === 'wheel') return f.birds[0];
      return null;
    }
    return this.parties.find((p) => p.state === 'ground')?.birds[0] ?? null;
  }

  /** How many birds are about (live, drawn or not) and squirrels; for the HUD. */
  get headcount(): string {
    let birds = 0, shown = 0;
    for (const p of this.parties) birds += p.birds.length;
    for (const f of this.flocks.values()) if (f) birds += f.birds.length;
    for (const _ of this.birds()) shown++;
    return `small life ${this.squirrels.length} squirrels, ${shown}/${birds} birds`;
  }

  /**
   * Advance `dt` seconds with the hero where they are (null: nobody about to disturb them, a free camera);
   * `day`: daylight 0..1; `rain` 0..1; `around`: where they live (the hero, or the free camera).
   */
  step(dt: number, hero: LifeHero | null, day: number, rain: number, around: { x: number; z: number } = hero ?? NOBODY): LifeEvent[] {
    this.time += dt;
    this.day = day;
    this.rain = rain;
    this.liveAround(around);
    hero ??= NOBODY;
    const events: LifeEvent[] = [];
    const dark = day < 0.25;
    for (const s of this.squirrels) {
      s.hidden = dark;
      if (!dark) this.stepSquirrel(s, dt, hero);
    }
    if (!dark) {
      for (const p of this.parties) this.stepParty(p, dt, hero, events);
      for (const f of this.flocks.values()) if (f) this.stepFlock(f, dt, hero, events);
    }
    return events;
  }

  // --- The squares around the hero ---

  private liveAround(hero: { x: number; z: number }): void {
    const C = LIFE_CELL;
    const ci = Math.floor(hero.x / C), cj = Math.floor(hero.z / C), n = Math.ceil(LIVE / C);
    for (const [k, sq] of this.squares) {
      const i = Math.floor(k / 65536) - 32768, j = (k % 65536) - 32768;
      if (Math.hypot((i + 0.5) * C - hero.x, (j + 0.5) * C - hero.z) > DROP) {
        this.squares.delete(k);
        for (const s of sq.squirrels) this.squirrels.splice(this.squirrels.indexOf(s), 1);
        for (const p of sq.parties) this.parties.splice(this.parties.indexOf(p), 1);
      }
    }
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      const k = key(i, j);
      if (this.squares.has(k) || Math.hypot((i + 0.5) * C - hero.x, (j + 0.5) * C - hero.z) > LIVE) continue;
      const trees = this.land.trees(i, j);
      if (!trees) continue; // asked for; next time
      const sq = this.settleSquare(i, j, trees);
      this.squares.set(k, sq);
      this.squirrels.push(...sq.squirrels);
      this.parties.push(...sq.parties);
    }
    const F = FLOCK_CELL, fi = Math.floor(hero.x / F), fj = Math.floor(hero.z / F), fn = Math.ceil(FLOCK_LIVE / F);
    for (const k of this.flocks.keys()) {
      const i = Math.floor(k / 65536) - 32768, j = (k % 65536) - 32768;
      if (Math.hypot((i + 0.5) * F - hero.x, (j + 0.5) * F - hero.z) > FLOCK_DROP) this.flocks.delete(k);
    }
    for (let j = fj - fn; j <= fj + fn; j++) for (let i = fi - fn; i <= fi + fn; i++) {
      const k = key(i, j);
      if (this.flocks.has(k) || Math.hypot((i + 0.5) * F - hero.x, (j + 0.5) * F - hero.z) > FLOCK_LIVE) continue;
      this.flocks.set(k, this.flockOf(i, j));
    }
  }

  /** Who lives in square (i, j), from its seed. */
  private settleSquare(i: number, j: number, trees: Float32Array): Square {
    const C = LIFE_CELL, s = deriveSeed(this.seed, 'small life', i, j);
    const x0 = i * C, z0 = j * C, mx = x0 + C / 2, mz = z0 + C / 2;
    const w = this.land.woods(mx, mz);
    const out: Square = { squirrels: [], parties: [] };
    if (!this.dry(mx, mz)) return out;
    const nTrees = trees.length / TREE;
    // A squirrel to one of the bigger trees in a wood.
    if (this.def.squirrels.length && nTrees > 0 && hash2f(s, 1, 1) < this.def.squirrelChance * w) {
      const rng = new Rng(deriveSeed(s, 'squirrel'));
      let best = 0;
      for (let t = 1; t < nTrees; t++) if (trees[t * TREE + 2] > trees[best * TREE + 2]) best = t;
      const tree = { x: trees[best * TREE], z: trees[best * TREE + 1], r: trees[best * TREE + 2], tall: TALL * trees[best * TREE + 3] };
      const { x, z } = aboutPoint(rng, tree.x, tree.z, tree.r + 1, tree.r + 4);
      out.squirrels.push({
        id: `sq-${i}-${j}`, look: rng.pick(this.def.squirrels), seed: deriveSeed(s, 'look'),
        x, y: this.land.height(x, z), z, heading: rng.range(-Math.PI, Math.PI), pitch: 0, doing: 'eat', speed: 0, hidden: false,
        tree, rng, trunk: null, tx: x, tz: z, until: rng.range(1, 6), calm: 99, watched: -99,
      });
    }
    // Ground birds: woodland kinds in woods, open kinds on meadows and at wood edges.
    this.def.birds.forEach((kind, k) => {
      if (kind.habitat === 'flock') return;
      const fit = kind.habitat === 'wood' ? w : (1 - w) * (nTrees > 0 || w > 0.05 ? 1 : 0.6);
      if (hash2f(s, 2, k) >= kind.chance * fit * 2) return;
      const rng = new Rng(deriveSeed(s, 'birds', kind.id));
      const hx = x0 + rng.range(4, C - 4), hz = z0 + rng.range(4, C - 4);
      if (!this.open(hx, hz)) return;
      const birds = Array.from({ length: rng.int(kind.count[0], kind.count[1]) }, () => this.bird(kind, rng, hx + rng.range(-2, 2), hz + rng.range(-2, 2)));
      out.parties.push({ kind, birds, rng, hx, hz, state: 'ground', until: 0 });
    });
    return out;
  }

  private flockOf(i: number, j: number): Flock | null {
    const F = FLOCK_CELL, s = deriveSeed(this.seed, 'flock', i, j);
    const ox = (i + 0.5) * F, oz = (j + 0.5) * F;
    const kinds = this.def.birds.filter((b) => b.habitat === 'flock');
    if (!kinds.length || !this.dry(ox, oz) || this.land.woods(ox, oz) > 0.2) return null;
    const kind = kinds[Math.floor(hash2f(s, 1, 2) * kinds.length) % kinds.length];
    if (hash2f(s, 3, 4) >= kind.chance) return null;
    const rng = new Rng(deriveSeed(s, 'birds'));
    const n = rng.int(kind.count[0], kind.count[1]);
    const cy = this.land.height(ox, oz) + rng.range(16, 26);
    const birds: Bird[] = [], weave: Flock['weave'] = [];
    for (let k = 0; k < n; k++) {
      weave.push({ p1: rng.range(0, 6.3), p2: rng.range(0, 6.3), p3: rng.range(0, 6.3), r: rng.range(1.5, 3) + kind.size * 8, gx: rng.range(-1, 1), gz: rng.range(-1, 1) });
      const b = this.bird(kind, rng, ox, oz);
      b.y = cy;
      b.doing = 'fly';
      b.fold = 0;
      birds.push(b);
    }
    return { kind, birds, rng, ox, oz, cx: ox, cy, cz: oz, dir: rng.range(-Math.PI, Math.PI), tx: ox, tz: oz, state: 'wheel', t: 0, until: this.time + rng.range(30, 80), weave };
  }

  private bird(kind: BirdKindDef, rng: Rng, x: number, z: number): Bird {
    const c = rng.pick(kind.colours);
    return {
      x, y: this.land.height(x, z), z, heading: rng.range(-Math.PI, Math.PI), pitch: 0, bank: 0, size: kind.size * rng.range(0.92, 1.08), wing: 0, fold: 1,
      r: srgbToLinear(((c >> 16) & 255) / 255), g: srgbToLinear(((c >> 8) & 255) / 255), b: srgbToLinear((c & 255) / 255),
      doing: 'peck', shown: true, beat: kind.beat * rng.range(0.9, 1.1), phase: rng.range(0, 6.3), until: rng.range(0, 2), flight: null, hop: null,
    };
  }

  private dry(x: number, z: number): boolean { return this.land.waterDepth(x, z) <= 0; }

  /** Open ground to stand on: dry, no building. */
  private open(x: number, z: number): boolean { return this.dry(x, z) && !this.land.blocked?.(x, z, 0.3); }

  // --- Squirrels ---

  private stepSquirrel(s: Squirrel, dt: number, hero: LifeHero): void {
    const d = Math.hypot(hero.x - s.x, hero.z - s.z), running = hero.speed > RUNNING;
    const bolt = d < BOLT * (running ? RUN_EXTRA : 1), near = d < WATCH * (running ? RUN_EXTRA : 1);
    s.calm = d > WATCH + 4 ? s.calm + dt : 0;
    const T = s.tree, R = T.r * 0.7 + 0.05;
    if (s.trunk) {
      const tr = s.trunk;
      // Round to the far side of the trunk from whoever is near.
      if (d < WATCH * 1.5) tr.a = turnTo(tr.a, Math.atan2(T.z - hero.z, T.x - hero.x), 1.4 * dt);
      const down = tr.to <= 0;
      const climb = down ? 1.6 : 2.4;
      if (Math.abs(tr.h - tr.to) > 0.02) {
        tr.h += Math.sign(tr.to - tr.h) * Math.min(Math.abs(tr.to - tr.h), climb * dt);
        s.doing = 'climb';
        s.speed = climb;
      } else {
        s.doing = 'cling';
        s.speed = 0;
        if (down) {
          // At the foot: back on the ground.
          s.trunk = null;
          s.pitch = 0;
          s.until = this.time + s.rng.range(1, 3);
          s.doing = 'idle';
          s.x = T.x + Math.cos(tr.a) * (R + 0.15);
          s.z = T.z + Math.sin(tr.a) * (R + 0.15);
          s.y = this.land.height(s.x, s.z);
          s.heading = tr.a;
          return;
        }
        // Quiet for a while: down again, head first.
        if (s.calm > 6 && this.time > s.until) tr.to = 0;
      }
      if (bolt && down && tr.h > 0.3) tr.to = Math.max(tr.h, s.rng.range(2.5, 4.5));
      s.pitch = tr.to <= 0 ? -Math.PI / 2 : Math.PI / 2;
      s.heading = tr.to <= 0 ? tr.a : tr.a + Math.PI;
      s.x = T.x + Math.cos(tr.a) * R;
      s.z = T.z + Math.sin(tr.a) * R;
      s.y = this.land.height(T.x, T.z) + tr.h;
      return;
    }
    if (bolt && s.doing !== 'run') {
      // For the tree.
      s.doing = 'run';
      const a = Math.atan2(s.z - T.z, s.x - T.x);
      s.tx = T.x + Math.cos(a) * (R + 0.1);
      s.tz = T.z + Math.sin(a) * (R + 0.1);
    }
    if (s.doing === 'run' || s.doing === 'hop') {
      const pace = s.doing === 'run' ? 4.5 : 1.3;
      const dx = s.tx - s.x, dz = s.tz - s.z, dd = Math.hypot(dx, dz);
      if (dd < 0.08) {
        if (s.doing === 'run') {
          // Up the trunk.
          const a = Math.atan2(s.z - T.z, s.x - T.x);
          s.trunk = { a, h: 0.05, to: Math.min(T.tall * 0.35, s.rng.range(2.5, 5)) };
          s.until = this.time + s.rng.range(4, 12);
          s.speed = 0;
          return;
        }
        this.nextForage(s);
        return;
      }
      const step = Math.min(dd, pace * dt);
      s.heading = Math.atan2(dz, dx);
      s.x += (dx / dd) * step;
      s.z += (dz / dd) * step;
      s.y = this.land.height(s.x, s.z);
      s.speed = pace;
      return;
    }
    s.speed = 0;
    if (near && this.time - s.watched > 12) {
      // Sits up and watches.
      s.watched = this.time;
      s.doing = 'alert';
      s.heading = Math.atan2(hero.z - s.z, hero.x - s.x);
      s.until = this.time + s.rng.range(2, 4);
      return;
    }
    if (this.time >= s.until) this.nextForage(s);
  }

  /** The next thing a foraging squirrel does: eat, sit, flick its tail, hop somewhere near its tree, or go up it. */
  private nextForage(s: Squirrel): void {
    const r = s.rng.float(), T = s.tree;
    s.speed = 0;
    if (r < 0.4) {
      for (let k = 0; k < 6; k++) {
        const { x, z } = aboutPoint(s.rng, T.x, T.z, T.r + 0.6, T.r + 6);
        if (Math.hypot(x - s.x, z - s.z) < 0.5 || !this.open(x, z)) continue;
        s.doing = 'hop';
        s.tx = x;
        s.tz = z;
        return;
      }
    }
    if (r > 0.94) {
      // Up the tree for a while, for no reason anyone can see.
      s.doing = 'run';
      const a = Math.atan2(s.z - T.z, s.x - T.x), R = T.r * 0.7 + 0.15;
      s.tx = T.x + Math.cos(a) * R;
      s.tz = T.z + Math.sin(a) * R;
      return;
    }
    s.doing = r < 0.75 ? 'eat' : r < 0.87 ? 'idle' : 'flick';
    s.until = this.time + (s.doing === 'eat' ? s.rng.range(3, 8) : s.rng.range(1, 3));
  }

  // --- Ground birds ---

  private stepParty(p: Party, dt: number, hero: LifeHero, events: LifeEvent[]): void {
    const running = hero.speed > RUNNING;
    if (p.state === 'ground') {
      const near = p.birds.some((b) => Math.hypot(hero.x - b.x, hero.z - b.z) < FLUSH * (running ? RUN_EXTRA : 1));
      if (near) this.flush(p, hero, events);
      else for (const b of p.birds) this.forage(b, dt, p.hx, p.hz, p.rng);
    } else if (p.state === 'up') {
      // In the crowns; down again when all is quiet.
      if (this.time > p.until && Math.hypot(hero.x - p.hx, hero.z - p.hz) > 22) {
        const spot = this.groundNear(p.hx, p.hz, 8, p.rng);
        if (spot) {
          p.state = 'flying';
          for (const b of p.birds) this.flyTo(b, spot.x + p.rng.range(-2, 2), spot.z + p.rng.range(-2, 2), false, p.rng);
          p.hx = spot.x;
          p.hz = spot.z;
        } else p.until = this.time + 10;
      }
    }
    if (p.state === 'flying') {
      let all = true;
      for (const b of p.birds) if (b.flight) { this.wingOn(b, dt); all &&= !b.flight; }
      if (all) {
        const up = p.birds.every((b) => b.doing === 'perch');
        p.state = up ? 'up' : 'ground';
        p.until = this.time + p.rng.range(12, 35);
      }
    }
  }

  /** Someone near: the party takes wing, into the crowns near by if there are trees, else off over the grass. */
  private flush(p: Party, hero: LifeHero, events: LifeEvent[]): void {
    // Crowns farther from the hero than the birds are (never towards them).
    const crowns = this.crownsNear(p.hx, p.hz, 30).filter((c) => Math.hypot(c.x - hero.x, c.z - hero.z) > Math.hypot(p.hx - hero.x, p.hz - hero.z) + 3);
    // Away from the hero.
    const away = Math.atan2(p.hz - hero.z, p.hx - hero.x);
    let gx = p.hx + Math.cos(away) * 35, gz = p.hz + Math.sin(away) * 35;
    const g = crowns.length ? null : this.groundNear(gx, gz, 12, p.rng);
    if (g) { gx = g.x; gz = g.z; }
    let cx = 0, cy = 0, cz = 0;
    p.birds.forEach((b, k) => {
      cx += b.x; cy += b.y; cz += b.z;
      if (crowns.length) {
        // The crowns away from the hero first.
        const c = crowns[(k + Math.floor(p.rng.float() * 2)) % crowns.length];
        this.flyTo(b, c.x, c.z, true, p.rng, c.y);
      } else this.flyTo(b, gx + p.rng.range(-2.5, 2.5), gz + p.rng.range(-2.5, 2.5), false, p.rng);
    });
    if (crowns.length) { p.hx = crowns[0].x; p.hz = crowns[0].z; } else { p.hx = gx; p.hz = gz; }
    p.state = 'flying';
    const n = p.birds.length;
    events.push({ kind: 'wings', x: cx / n, y: cy / n, z: cz / n, count: n });
  }

  /** Points inside the crowns of the nearest trees round (x, z), within `r`. */
  private crownsNear(x: number, z: number, r: number): { x: number; y: number; z: number }[] {
    const C = LIFE_CELL, out: { x: number; y: number; z: number; d: number }[] = [];
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) {
      const t = this.land.trees(i, j);
      if (!t) continue;
      for (let k = 0; k < t.length; k += TREE) {
        const d = Math.hypot(t[k] - x, t[k + 1] - z);
        if (d < r && d > 3) out.push({ x: t[k], y: this.land.height(t[k], t[k + 1]) + TALL * t[k + 3] * 0.62, z: t[k + 1], d });
      }
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 4);
  }

  /** Open dry ground near (x, z) within `r`, or null. */
  private groundNear(x: number, z: number, r: number, rng: Rng): { x: number; z: number } | null {
    for (let k = 0; k < 8; k++) {
      const p = aboutPoint(rng, x, z, 0, r);
      if (this.open(p.x, p.z)) return p;
    }
    return null;
  }

  /** Sets a bird off towards (x, z): into a crown at height `cy` (`perch`) or onto the ground. */
  private flyTo(b: Bird, x: number, z: number, perch: boolean, rng: Rng, cy = 0): void {
    const ty = perch ? cy : this.land.height(x, z);
    const dist = Math.hypot(x - b.x, z - b.z);
    const speed = 6 + b.size * 10;
    b.shown = true;
    b.doing = 'fly';
    b.hop = null;
    b.flight = {
      fx: b.x, fy: b.y, fz: b.z, tx: x + (perch ? rng.range(-1.2, 1.2) : 0), ty, tz: z + (perch ? rng.range(-1.2, 1.2) : 0),
      t: 0, dur: Math.max(1.2, Math.hypot(dist, ty - b.y) / speed), arc: perch ? 1.5 : Math.min(7, 1.5 + dist * 0.18), delay: rng.range(0, 0.45), perch,
    };
  }

  /** One step of a bird's flight; it lands (or vanishes into its crown) at the end. */
  private wingOn(b: Bird, dt: number): void {
    const f = b.flight!;
    if (f.delay > 0) { f.delay -= dt; return; }
    f.t = Math.min(1, f.t + dt / f.dur);
    const s = f.t, e = s * s * (3 - 2 * s);
    const x = f.fx + (f.tx - f.fx) * e, z = f.fz + (f.tz - f.fz) * e;
    const y = f.fy + (f.ty - f.fy) * e + Math.sin(Math.PI * s) * f.arc;
    const vx = x - b.x, vy = y - b.y, vz = z - b.z, h = Math.hypot(vx, vz);
    if (h > 1e-4) {
      const heading = Math.atan2(vz, vx);
      b.bank = Math.max(-0.6, Math.min(0.6, angleDiff(b.heading, heading) * 8));
      b.heading = heading;
    }
    b.pitch = Math.max(-0.7, Math.min(0.9, Math.atan2(vy, Math.max(h, 1e-4))));
    b.x = x;
    b.y = y;
    b.z = z;
    // Beating hard to climb away, then in bursts with the wings shut between (as small birds fly).
    b.phase += dt * b.beat * Math.PI * 2;
    const burst = b.size < 0.3 && s > 0.3 && s < 0.85 ? Math.sin(this.time * 3 + b.beat) > 0.35 : true;
    b.wing = burst ? Math.sin(b.phase) * 0.9 : 0.05;
    b.fold = burst ? 0 : 0.6;
    if (s >= 1) {
      b.flight = null;
      b.bank = 0;
      b.pitch = 0;
      b.wing = 0;
      b.fold = 1;
      if (f.perch) { b.doing = 'perch'; b.shown = false; } else { b.doing = 'look'; b.until = this.time + 0.5; }
    }
  }

  /** A bird on the ground: pecks, looks about, hops a little, keeping near (hx, hz). */
  private forage(b: Bird, dt: number, hx: number, hz: number, rng: Rng): void {
    b.wing = 0;
    b.fold = 1;
    b.bank = 0;
    if (b.hop) {
      const h = b.hop;
      h.t = Math.min(1, h.t + dt / 0.22);
      b.x = h.fx + (h.tx - h.fx) * h.t;
      b.z = h.fz + (h.tz - h.fz) * h.t;
      b.y = this.land.height(b.x, b.z) + Math.sin(Math.PI * h.t) * b.size * 0.4;
      b.pitch = 0.1;
      if (h.t >= 1) b.hop = null;
      return;
    }
    b.y = this.land.height(b.x, b.z);
    if (b.doing === 'peck') b.pitch = -0.55 * Math.max(0, Math.sin((this.time + b.phase) * 9));
    if (this.time < b.until) return;
    const r = rng.float();
    if (r < 0.45) {
      // A hop or two, back towards the others when strayed.
      const back = Math.hypot(hx - b.x, hz - b.z) > 3;
      const a = back ? Math.atan2(hz - b.z, hx - b.x) + rng.range(-0.6, 0.6) : rng.range(-Math.PI, Math.PI);
      const len = rng.range(0.15, 0.45);
      const tx = b.x + Math.cos(a) * len, tz = b.z + Math.sin(a) * len;
      if (this.open(tx, tz)) {
        b.heading = a;
        b.hop = { fx: b.x, fz: b.z, tx, tz, t: 0 };
        b.doing = 'hop';
      }
      b.until = this.time + rng.range(0.15, 0.6);
    } else if (r < 0.8) {
      b.doing = 'peck';
      b.until = this.time + rng.range(0.6, 2.2);
    } else {
      b.doing = 'look';
      b.pitch = 0.15;
      b.heading += rng.range(-1.2, 1.2);
      b.until = this.time + rng.range(0.4, 1.5);
    }
  }

  // --- Flocks ---

  private stepFlock(f: Flock, dt: number, hero: LifeHero, events: LifeEvent[]): void {
    const running = hero.speed > RUNNING;
    const ground = this.land.height(f.cx, f.cz);
    if (f.state === 'wheel') {
      // The centre sweeps about its square in long curves, now higher, now lower.
      if (Math.hypot(f.tx - f.cx, f.tz - f.cz) < 12) {
        const p = aboutPoint(f.rng, f.ox, f.oz, 0, FLOCK_CELL * 0.6);
        f.tx = p.x;
        f.tz = p.z;
      }
      f.dir = turnTo(f.dir, Math.atan2(f.tz - f.cz, f.tx - f.cx), 0.55 * dt);
      const speed = 9 + f.kind.size * 6;
      f.cx += Math.cos(f.dir) * speed * dt;
      f.cz += Math.sin(f.dir) * speed * dt;
      f.cy += (ground + 14 + Math.sin(this.time * 0.13 + f.ox) * 7 - f.cy) * Math.min(1, dt * 0.5);
      if (this.time > f.until) {
        // Down to feed on open ground away from the hero.
        for (let k = 0; k < 8; k++) {
          const { x, z } = aboutPoint(f.rng, f.ox, f.oz, 0, FLOCK_CELL * 0.45);
          if (!this.open(x, z) || this.land.woods(x, z) > 0.15 || Math.hypot(x - hero.x, z - hero.z) < FLOCK_FLUSH * 2) continue;
          f.tx = x;
          f.tz = z;
          f.state = 'land';
          f.t = 0;
          break;
        }
        if (f.state === 'wheel') f.until = this.time + 20;
      }
    } else if (f.state === 'land' || f.state === 'rise') {
      f.t = Math.min(1, f.t + dt / (f.state === 'land' ? 6 : 3.5));
      if (f.t >= 1) {
        if (f.state === 'land') { f.state = 'ground'; f.until = this.time + f.rng.range(20, 60); } else { f.state = 'wheel'; f.until = this.time + f.rng.range(40, 100); }
      }
    } else if (this.time > f.until || f.birds.some((b) => Math.hypot(hero.x - b.x, hero.z - b.z) < FLOCK_FLUSH * (running ? RUN_EXTRA : 1))) {
      f.state = 'rise';
      f.t = 0;
      f.cx = f.tx;
      f.cz = f.tz;
      f.cy = this.land.height(f.tx, f.tz) + 12;
      f.dir = Math.atan2(f.tz - hero.z, f.tx - hero.x);
      events.push({ kind: 'wings', x: f.tx, y: this.land.height(f.tx, f.tz) + 1, z: f.tz, count: f.birds.length });
    }
    const t = this.time, spread = 5 + f.birds.length * 0.25;
    f.birds.forEach((b, k) => {
      const w = f.weave[k];
      // Its place in the weaving flock.
      const ax = f.cx + Math.sin(t * 0.7 + w.p1) * w.r + Math.sin(t * 0.23 + w.p3) * w.r * 0.8;
      const ay = f.cy + Math.sin(t * 0.9 + w.p2) * w.r * 0.35;
      const az = f.cz + Math.cos(t * 0.6 + w.p2) * w.r + Math.cos(t * 0.31 + w.p1) * w.r * 0.8;
      const gx = f.tx + w.gx * spread, gz = f.tz + w.gz * spread, gy = this.land.height(gx, gz);
      let x = ax, y = ay, z = az;
      if (f.state !== 'wheel') {
        // Landing: each bird glides down onto its own spot; rising, the other way; on the ground it feeds.
        const s = f.state === 'land' ? smoothstep(0, 1, f.t) : f.state === 'rise' ? 1 - smoothstep(0, 1, f.t) : 1;
        x = ax + (gx - ax) * s;
        y = ay + (gy - ay) * s;
        z = az + (gz - az) * s;
        if (f.state === 'ground') {
          if (b.doing === 'fly') { b.x = gx; b.z = gz; b.doing = 'peck'; }
          this.forage(b, dt, gx, gz, f.rng);
          return;
        }
      }
      const vx = x - b.x, vy = y - b.y, vz = z - b.z, h = Math.hypot(vx, vz);
      b.doing = 'fly';
      b.hop = null;
      b.shown = true;
      if (h > 1e-4) {
        const heading = Math.atan2(vz, vx);
        b.bank = Math.max(-0.7, Math.min(0.7, angleDiff(b.heading, heading) / Math.max(dt, 1e-3) * 0.12));
        b.heading = heading;
      }
      b.pitch = Math.max(-0.6, Math.min(0.8, Math.atan2(vy, Math.max(h, 1e-4))));
      b.x = x;
      b.y = y;
      b.z = z;
      // Beat and glide in turns (rooks more slowly); landing, the wings held out to brake.
      b.phase += dt * b.beat * Math.PI * 2;
      const gliding = f.state === 'land' ? f.t > 0.4 : Math.sin(t * 0.8 + w.p3) > 0.3;
      b.wing = gliding ? 0.12 : Math.sin(b.phase) * 0.85;
      b.fold = f.state === 'land' && f.t > 0.95 ? 1 : 0;
    });
  }
}

/** A point in the ring r0..r1 round (x, z), in a seeded direction. */
function aboutPoint(rng: Rng, x: number, z: number, r0: number, r1: number): { x: number; z: number } {
  const a = rng.range(0, Math.PI * 2), d = rng.range(r0, r1);
  return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
}

/** `a` turned towards `b` by at most `step` radians. */
function turnTo(a: number, b: number, step: number): number {
  const d = angleDiff(a, b);
  return a + Math.max(-step, Math.min(step, d));
}

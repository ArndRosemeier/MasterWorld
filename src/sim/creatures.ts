/**
 * Creatures in a dungeon (plan 9.3, 8.1, D27, D29): the world simulation's behaviours for things that
 * live in a place, on the same ideas as the townsfolk: every creature is always doing something (it
 * roams its room, gnaws, sniffs, keeps watch), notices the hero by sight and sound, calls its pack, fights
 * in a group, runs when it has had enough and goes home when it loses the trail. Its power is what it is
 * (D29): weak ones attack a champion all the same. Now and then one breaks expectations (a goblin begs for
 * mercy in broken Common). Coordinates are the dungeon's own frame. Deterministic for a seed and a
 * sequence of steps. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CreatureDef } from '../setting/contract';
import type { Spawn } from '../world/dungeon/cellar';
import type { DungeonSpace } from '../world/dungeon/space';
import { strike, type Guard, type Strike } from './combat';
import { DungeonGround, type DenGround, type DungeonNav } from './dungeonNav';

export type CreatureState = 'idle' | 'alert' | 'fight' | 'flee' | 'beg' | 'meek' | 'dead';

/** What the body shows (the renderer picks a clip or a pose for it). */
export type CreatureAct = 'stand' | 'walk' | 'run' | 'sniff' | 'gnaw' | 'graze' | 'watch' | 'rummage' | 'spin' | 'swing' | 'hurt' | 'beg' | 'die' | 'dead';

export interface Creature {
  /** Index in the den (stable: saves name the dead by it). */
  readonly id: number;
  readonly def: CreatureDef;
  readonly home: number;
  x: number;
  y: number;
  z: number;
  /** Facing, radians (xz atan2, as the townsfolk). */
  dir: number;
  state: CreatureState;
  act: CreatureAct;
  health: number;
  /** 0..1: how sure it is that someone is there. */
  aware: number;
  /** Leads the den's fight (the lair's first). */
  leader: boolean;
  /** The one who breaks expectations. */
  surprise?: string;
  /** Seconds left of a staggered moment. */
  stagger: number;
  /** Share of its speed lost (a spell's chill, 0..1). */
  slow: number;
  /** Seconds until its next blow may start. */
  ready: number;
  /** A blow on its way: lands after its wind-up. */
  windup: number;
  /** Seconds the current idle turn has left. */
  until: number;
  /** The walk, and the index of the next point. */
  path: { x: number; y: number; z: number }[];
  pi: number;
  /** Seconds since it last saw or heard the hero. */
  lost: number;
  /** Where it last knew the hero to be. */
  seen: { x: number; y: number; z: number } | null;
  /** Seconds until it may look for a new way. */
  repath: number;
  /** Plea lines said so far. */
  pleas: number;
  /** Blows that hurt it and staggered it (bleeding does not), counted: each one shows as a jolt. */
  blows: number;
  /** Seconds since it was last hurt (it heals only once the fight has left it alone a while). */
  calm: number;
  rng: Rng;
}

/** The hero as the den sees them. */
export interface Quarry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 0 still .. 0.4 walking .. 1 running or fighting (stealth makes it less). */
  readonly noise: number;
  /** The hero's light: how far off they are seen in the dark (m). */
  readonly light: number;
  readonly alive: boolean;
  readonly guard: Guard;
}

export type DenEvent =
  | { readonly kind: 'notice'; readonly who: Creature }
  | { readonly kind: 'alarm'; readonly who: Creature }
  | { readonly kind: 'swing'; readonly who: Creature }
  | { readonly kind: 'blow'; readonly who: Creature; readonly strike: Strike }
  | { readonly kind: 'flee'; readonly who: Creature }
  | { readonly kind: 'died'; readonly who: Creature }
  | { readonly kind: 'plea'; readonly who: Creature; readonly text: string }
  | { readonly kind: 'spared'; readonly who: Creature }
  | { readonly kind: 'home'; readonly who: Creature };

/** Body radius by kind and size, metres. */
export function radiusOf(def: CreatureDef): number {
  return def.body.kind === 'humanoid' ? 0.32 : def.body.kind === 'spider' ? def.body.length * 0.4 : def.body.length * 0.3;
}

/** Hero's body radius, metres. */
const HERO_R = 0.35;
/** A blow lands this long after it starts (the tell a quick hero steps away from). */
const WINDUP = 0.4;
/** Lost this long, it gives up the hunt. */
const GIVE_UP = 9;

/**
 * A wound slows it (Arnd 2026-10-28: a badly hurt one that runs can be caught): at full pace down to this
 * share of its health, then slower and slower, to the floor at none left.
 */
const LAME = { knee: 0.75, floor: 0.35 } as const;
/** Healing, share of its health a second, once left alone this long (the hero's own pace, about). */
const HEAL = { calm: 6, moving: 0.01, still: 0.03 } as const;

/** How wounded it is, 0 (whole) .. 1 (at death's door). */
export function woundOf(c: Creature): number {
  return 1 - Math.max(0, Math.min(1, c.health / c.def.health));
}

/** The share of its speed a wound leaves it (1 whole .. LAME.floor). */
export function paceOf(c: Creature): number {
  const h = 1 - woundOf(c);
  return LAME.floor + (1 - LAME.floor) * Math.min(1, h / LAME.knee);
}

export class Den {
  readonly ground: DenGround;
  readonly creatures: Creature[] = [];
  /** Sim seconds. */
  time = 0;
  /**
   * At peace (a hold's wardens, plan 11.6): they watch the hero and turn to follow them, but only fight
   * once struck or once the peace is ended (game/hold.ts).
   */
  peace = false;

  /** A dungeon's space (its rooms are the homes), or any other ground (open land: sim/wild.ts). */
  constructor(ground: DungeonSpace | DenGround, spawns: readonly Spawn[], defs: readonly CreatureDef[], seed: number, dead: readonly number[] = []) {
    this.ground = 'layout' in ground ? new DungeonGround(ground) : ground;
    spawns.forEach((s, id) => {
      const def = defs.find((d) => d.id === s.creature);
      if (!def) throw new Error(`no creature "${s.creature}"`);
      const rng = new Rng(deriveSeed(seed, 'den', id));
      const p = this.ground.spot(s.room, rng);
      const c: Creature = {
        id, def, home: s.room, x: p.x, y: p.y, z: p.z, dir: rng.range(-Math.PI, Math.PI), state: 'idle', act: 'stand', health: def.health,
        aware: 0, leader: id === 0 && def.pack, stagger: 0, slow: 0, ready: 0, windup: 0, until: rng.range(0, 4), path: [], pi: 0, lost: 0, seen: null,
        repath: 0, pleas: 0, blows: 0, calm: 0, rng, ...(s.surprise ? { surprise: s.surprise } : {}),
      };
      if (dead.includes(id)) { c.state = 'dead'; c.act = 'dead'; c.health = 0; }
      this.creatures.push(c);
    });
  }

  get alive(): Creature[] { return this.creatures.filter((c) => c.state !== 'dead'); }

  /** Those hunting the hero now. */
  get fighting(): Creature[] { return this.creatures.filter((c) => c.state === 'fight'); }

  /** Is the den beaten: nobody left who would fight (the dead, the fled-and-meek, the spared)? */
  get beaten(): boolean { return this.creatures.every((c) => c.state === 'dead' || c.state === 'meek'); }

  /** Ids of the dead (for the save). */
  get dead(): number[] { return this.creatures.filter((c) => c.state === 'dead').map((c) => c.id); }

  /** A dungeon den's walking graph (the fight bot walks it too). */
  get nav(): DungeonNav { return (this.ground as DungeonGround).nav; }

  /** A dungeon den's space. */
  get space(): DungeonSpace { return (this.ground as DungeonGround).space; }

  step(dt: number, q: Quarry): DenEvent[] {
    this.time += dt;
    const out: DenEvent[] = [];
    for (const c of this.creatures) {
      if (c.state === 'dead') continue;
      c.stagger = Math.max(0, c.stagger - dt);
      c.ready = Math.max(0, c.ready - dt);
      c.repath = Math.max(0, c.repath - dt);
      this.heal(c, dt);
      this.sense(c, q, dt, out);
      switch (c.state) {
        case 'idle': if (this.peace && c.aware > 0.35) this.watch(c, q, dt); else this.idle(c, dt); break;
        case 'alert': this.alert(c, q, dt); break;
        case 'fight': this.fight(c, q, dt, out); break;
        case 'flee': this.flee(c, q, dt, out); break;
        case 'beg': this.beg(c, q, dt, out); break;
        case 'meek': this.meek(c, q, dt); break;
      }
    }
    this.spread();
    return out;
  }

  /** Wounds close as the hero's do: never in a fight, slowly on the move, faster when it stays still. */
  private heal(c: Creature, dt: number): void {
    c.calm += dt;
    if (c.state === 'fight' || c.calm < HEAL.calm || c.health >= c.def.health) return;
    const still = c.pi >= c.path.length && c.state !== 'flee';
    c.health = Math.min(c.def.health, c.health + c.def.health * (still ? HEAL.still : HEAL.moving) * dt);
  }

  /** What it sees and hears of the hero this step. */
  private sense(c: Creature, q: Quarry, dt: number, out: DenEvent[]): void {
    if (!q.alive) { c.aware = Math.max(0, c.aware - dt * 0.3); c.lost += dt; return; }
    const dx = q.x - c.x, dz = q.z - c.z, d = Math.hypot(dx, dz, q.y - c.y);
    const s = c.def.senses;
    let gain = 0;
    const facing = Math.cos(Math.atan2(dz, dx) - c.dir) > -0.2 ? 1 : 0.45;
    const sightRange = (s.sight + q.light * 1.4) * facing;
    const clear = d < Math.max(sightRange, s.hearing) && this.ground.sees(c.x, c.y, c.z, q.x, q.y, q.z, 0.8);
    if (clear && d < sightRange) gain += 2.2 * (1 - (d / sightRange) * 0.6);
    const hearRange = s.hearing * q.noise * (clear ? 1 : 0.45);
    if (d < hearRange) gain += 1.2 * (1 - d / hearRange);
    if (d < 1.2) gain += 3;
    if (gain > 0) {
      c.aware = Math.min(1, c.aware + gain * dt);
      if (c.aware > 0.6) { c.seen = { x: q.x, y: q.y, z: q.z }; c.lost = 0; }
    } else {
      c.aware = Math.max(0, c.aware - dt * 0.08);
      c.lost += dt;
    }
    if (this.peace) { if (c.state === 'alert') c.state = 'idle'; return; }
    if ((c.state === 'idle' || c.state === 'alert') && c.aware >= 1) this.notice(c, q, out);
    else if (c.state === 'idle' && c.aware > 0.35) { c.state = 'alert'; c.path = []; }
  }

  private notice(c: Creature, q: Quarry, out: DenEvent[]): void {
    out.push({ kind: 'notice', who: c });
    if (c.surprise && c.pleas === 0) { c.state = 'beg'; c.act = 'beg'; c.until = 0; return; }
    if (c.def.temper === 'skittish' && !this.brave(c, q)) { this.toFlee(c, out); return; }
    c.state = 'fight';
    c.path = [];
    if (c.def.pack) this.call(c, out);
  }

  /** A skittish one stands its ground with friends around, or when cornered. */
  private brave(c: Creature, q: Quarry): boolean {
    const friends = this.creatures.filter((o) => o !== c && o.state === 'fight' && Math.hypot(o.x - c.x, o.z - c.z) < 8).length;
    return friends >= 2 || Math.hypot(q.x - c.x, q.z - c.z) < 1.5;
  }

  /** Calls the den: others of a pack in earshot join the hunt. */
  private call(c: Creature, out: DenEvent[]): void {
    let called = false;
    for (const o of this.creatures) {
      if (o === c || !o.def.pack || o.state === 'dead' || o.state === 'fight' || o.state === 'flee' || o.state === 'meek' || o.state === 'beg') continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z, o.y - c.y);
      // A shout carries as far as one can see (a room, an open door), and only a little through walls.
      const range = this.ground.sees(c.x, c.y, c.z, o.x, o.y, o.z, 0.6) ? o.def.senses.hearing : 2.5;
      if (d > range) continue;
      o.aware = 1;
      o.seen = c.seen;
      o.lost = 0;
      if (o.surprise && o.pleas === 0) { o.state = 'beg'; o.act = 'beg'; continue; }
      o.state = 'fight';
      o.path = [];
      called = true;
    }
    if (called) out.push({ kind: 'alarm', who: c });
  }

  /** Always doing something: roam the home room, stop and sniff or gnaw or keep watch, roam again. */
  private idle(c: Creature, dt: number): void {
    if (this.move(c, dt, 0.32)) return;
    c.until -= dt;
    if (c.until > 0) return;
    const r = c.rng;
    if (r.chance(0.55)) {
      const p = this.ground.spot(c.home, r);
      c.path = [p];
      c.pi = 0;
      c.act = 'walk';
      c.until = 0;
    } else {
      const b = c.def.body;
      c.act = b.kind === 'rat' ? (r.chance(0.5) ? 'gnaw' : 'sniff')
        : b.kind === 'spider' ? (r.chance(0.6) ? 'watch' : 'spin')
        // Deer and boar graze and root, a wolf noses about and keeps watch.
        : b.kind === 'beast' ? (b.species === 'wolf' ? (r.chance(0.5) ? 'sniff' : 'watch') : r.chance(0.7) ? 'graze' : 'watch')
        // A warden keeps watch at its post; others rummage about now and then.
        : (b.kind === 'humanoid' && b.outfit === 'guard') || r.chance(0.5) ? 'watch' : 'rummage';
      c.until = r.range(2, 6);
    }
  }

  /** At peace and someone there: back to its post, and it turns to keep them in sight. */
  private watch(c: Creature, q: Quarry, dt: number): void {
    if (this.move(c, dt, 0.32)) return;
    c.act = 'watch';
    c.dir = Math.atan2(q.z - c.z, q.x - c.x);
  }

  /** Something is there: it turns towards it and creeps closer. */
  private alert(c: Creature, q: Quarry, dt: number): void {
    if (c.aware < 0.2) { c.state = 'idle'; c.until = 0; return; }
    if (c.seen && c.repath === 0) { this.headTo(c, c.seen); c.repath = 1.5; }
    if (!this.move(c, dt, 0.35)) { c.act = 'watch'; c.dir = Math.atan2(q.z - c.z, q.x - c.x); }
  }

  private fight(c: Creature, q: Quarry, dt: number, out: DenEvent[]): void {
    if (!q.alive || c.lost > GIVE_UP) { this.goHome(c, out); return; }
    if (c.stagger > 0) { c.act = 'hurt'; c.windup = 0; return; }
    const dx = q.x - c.x, dz = q.z - c.z, d = Math.hypot(dx, dz), dy = Math.abs(q.y - c.y);
    const atk = c.def.attacks[0];
    const reach = atk.reach + radiusOf(c.def) + HERO_R;
    if (c.windup > 0) {
      c.windup -= dt;
      c.dir = Math.atan2(dz, dx);
      if (c.windup <= 0) {
        c.ready = atk.time;
        // Stepped back out of reach: the blow goes wide.
        if (d < reach + 0.3 && dy < 1.2) out.push({ kind: 'blow', who: c, strike: strike({ damage: atk.damage, kind: atk.kind, skill: atk.skill }, q.guard, c.rng) });
      }
      return;
    }
    if (d < reach && dy < 1.2) {
      c.path = [];
      c.dir = Math.atan2(dz, dx);
      if (c.ready === 0) { c.windup = WINDUP; c.act = 'swing'; out.push({ kind: 'swing', who: c }); }
      else c.act = 'stand';
      return;
    }
    // Close in: straight when it sees the hero near, else along the way.
    const target = c.lost < 0.5 ? { x: q.x, y: q.y, z: q.z } : c.seen;
    if (!target) return;
    if (c.lost < 0.5 && d < 4 && dy < 0.8) {
      c.path = [{ x: q.x - (dx / d) * reach * 0.8, y: q.y, z: q.z - (dz / d) * reach * 0.8 }];
      c.pi = 0;
    } else if (c.repath === 0 || c.pi >= c.path.length) { this.headTo(c, target); c.repath = 0.6; }
    if (!this.move(c, dt, 1)) c.act = 'stand';
  }

  /** Off to the room farthest from the hero; cornered there, it fights. */
  private flee(c: Creature, q: Quarry, dt: number, out: DenEvent[]): void {
    if (this.move(c, dt, 1)) return;
    const d = Math.hypot(q.x - c.x, q.z - c.z);
    if (d > 10 || !q.alive) { c.state = c.surprise ? 'meek' : 'idle'; c.aware = 0.3; c.until = 0; out.push({ kind: 'home', who: c }); return; }
    if (c.repath === 0) {
      this.runFrom(c, q);
      c.repath = 2;
      // Nowhere left to run and the hero upon it: cornered, it fights.
      if (c.pi >= c.path.length && d < 2) { c.state = 'fight'; return; }
    }
    c.act = 'watch';
  }

  /** The begging one kneels and pleads; left alone, it is spared and wanders off meek. */
  private beg(c: Creature, q: Quarry, dt: number, out: DenEvent[]): void {
    c.act = 'beg';
    c.dir = Math.atan2(q.z - c.z, q.x - c.x);
    c.until -= dt;
    const lines = c.def.pleas ?? [];
    const d = Math.hypot(q.x - c.x, q.z - c.z);
    // It pleads to the hero's face; from afar it only cowers.
    if (d < 7 && c.until <= 0 && c.pleas < lines.length) {
      out.push({ kind: 'plea', who: c, text: lines[c.pleas++] });
      c.until = 6;
    }
    // Heard out and left alone: spared.
    if (c.pleas > 0 && (d > 12 || (c.pleas >= lines.length && c.until <= 0))) {
      c.state = 'meek';
      c.aware = 0;
      out.push({ kind: 'spared', who: c });
    }
  }

  /** Spared: it keeps out of the hero's way and never fights again (unless struck). */
  private meek(c: Creature, q: Quarry, dt: number): void {
    const d = Math.hypot(q.x - c.x, q.z - c.z);
    if (d < 3 && c.repath === 0) { this.runFrom(c, q); c.repath = 3; }
    if (!this.move(c, dt, 0.6)) this.idle(c, dt);
  }

  /**
   * The hero struck it: health, a stagger, and it knows who did it. Begging or spared, it runs; hurt
   * enough, it runs; the den hears the fight. `flinch`: false for what wears on it (bleeding), which does not stagger.
   */
  wound(c: Creature, s: Strike, from: { x: number; y: number; z: number }, stagger = 0, flinch = true): DenEvent[] {
    const out: DenEvent[] = [];
    if (c.state === 'dead') return out;
    c.health -= s.damage;
    if (s.damage > 0) c.calm = 0;
    c.aware = 1;
    c.seen = { ...from };
    c.lost = 0;
    if (s.damage > 0 && flinch) { c.stagger = Math.max(c.stagger, stagger, s.outcome === 'crit' ? 0.5 : 0.18); c.windup = 0; c.blows++; }
    if (c.health <= 0) {
      c.health = 0;
      c.state = 'dead';
      c.act = 'die';
      c.path = [];
      out.push({ kind: 'died', who: c });
      // The leader falls: the rest may lose heart.
      if (c.leader) for (const o of this.creatures) if (o.state === 'fight' && o.def.morale < 1 && o.rng.chance(0.5)) this.toFlee(o, out);
      return out;
    }
    if (c.state === 'beg' || c.state === 'meek') { this.toFlee(c, out); return out; }
    if (c.health < c.def.health * (1 - c.def.morale) && c.state !== 'flee') { this.toFlee(c, out); return out; }
    if (c.state !== 'fight') {
      c.state = 'fight';
      c.path = [];
      out.push({ kind: 'notice', who: c });
      if (c.def.pack) this.call(c, out);
    }
    return out;
  }

  /** How it stands against the hero's blow: caught unaware or staggered, it neither dodges nor parries. */
  guardOf(c: Creature): Guard {
    return { defence: c.def.defence, armour: c.def.armour, open: c.stagger > 0 || (c.state === 'idle' && c.aware < 0.35) || c.state === 'beg' };
  }

  /** The next plea of a begging (or spared) one, when the hero talks to it. */
  plead(c: Creature): string | null {
    const lines = c.def.pleas ?? [];
    if (!c.surprise || !lines.length || c.state === 'dead') return null;
    const text = lines[c.pleas % lines.length];
    c.pleas++;
    c.until = 6;
    return text;
  }

  /** Terror (a spell): it runs from the hero, unless it already runs or is dead. */
  frighten(c: Creature): DenEvent[] {
    const out: DenEvent[] = [];
    if (c.state === 'fight' || c.state === 'alert' || c.state === 'idle') this.toFlee(c, out);
    return out;
  }

  private toFlee(c: Creature, out: DenEvent[]): void {
    c.state = 'flee';
    c.path = [];
    c.repath = 0;
    out.push({ kind: 'flee', who: c });
  }

  private goHome(c: Creature, out: DenEvent[]): void {
    c.state = 'idle';
    c.aware = 0.2;
    c.seen = null;
    this.headTo(c, this.ground.spot(c.home, c.rng));
    out.push({ kind: 'home', who: c });
  }

  private headTo(c: Creature, p: { x: number; y: number; z: number }): void {
    c.pi = 0;
    c.path = this.ground.way(c, p);
  }

  /** Off as far from the hero as it can get. */
  private runFrom(c: Creature, q: Quarry): void {
    const way = this.ground.away(c, q);
    if (way.length) { c.path = way; c.pi = 0; }
  }

  /** Walk the path at a share of its speed; false when there is nowhere to go. */
  private move(c: Creature, dt: number, pace: number): boolean {
    if (c.pi >= c.path.length) return false;
    let left = c.def.speed * pace * paceOf(c) * (1 - c.slow) * dt;
    const r = radiusOf(c.def);
    for (let n = 0; left > 1e-4 && c.pi < c.path.length && n < 8; n++) {
      const p = c.path[c.pi], dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < 1e-3) { c.pi++; continue; }
      const k = Math.min(1, left / d);
      left -= d * k;
      // Along the walls, never through them; stuck, it looks for another way.
      const to = this.ground.slide(c.x, c.y, c.z, dx * k, dz * k, r);
      if (!to) { c.pi = c.path.length; c.repath = 0; return false; }
      c.dir = Math.atan2(dz, dx);
      const reached = k === 1 && to.x === c.x + dx && to.z === c.z + dz;
      c.x = to.x; c.z = to.z;
      // The feet follow the floor (stairs), never jump to a point's storey.
      c.y = this.ground.floorAt(c.x, c.z, c.y + 0.6) ?? c.y;
      if (reached) c.pi++; else if (k === 1) break;
    }
    const floor = this.ground.floorAt(c.x, c.z, c.y + 0.6);
    if (floor !== null) c.y = floor;
    c.act = pace > 0.5 ? 'run' : 'walk';
    return true;
  }

  /** Bodies keep apart (a few at most share a room, so all pairs are cheap). */
  private spread(): void {
    const live = this.creatures.filter((c) => c.state !== 'dead');
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), min = radiusOf(A.def) + radiusOf(B.def);
      if (d >= min || d < 1e-4 || Math.abs(A.y - B.y) > 1) continue;
      const push = (min - d) / 2, ux = dx / d, uz = dz / d;
      this.nudge(A, -ux * push, -uz * push);
      this.nudge(B, ux * push, uz * push);
    }
  }

  private nudge(c: Creature, dx: number, dz: number): void {
    const x = c.x + dx, z = c.z + dz;
    if (this.ground.clearance(x, c.y, z) > radiusOf(c.def) * 0.5) { c.x = x; c.z = z; }
  }
}

/**
 * Creatures in a dungeon (plan 9.3, 8.1, D27, D29): the world simulation's behaviours for things that
 * live in a place, on the same ideas as the townsfolk: every creature is always doing something (it
 * roams its room, gnaws, sniffs, keeps watch), notices the hero by sight and sound, calls its pack, fights
 * in a group, runs when it has had enough and goes home when it loses the trail. Its power is what it is
 * (D29): weak ones attack a champion all the same. Now and then one breaks expectations (a goblin begs for
 * mercy in broken Common). Coordinates are the dungeon's own frame. Deterministic for a seed and a
 * sequence of steps. Pure.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import { WARNING_STANCES, type BreakCause, type CreatureDef, type TalkTurn, type Tier, type WarnTurn } from '../setting/contract';
import type { Spawn } from '../world/dungeon/cellar';
import type { DungeonSpace } from '../world/dungeon/space';
import { strike, type Guard, type Strike } from './combat';
import { DungeonGround, type DenGround, type DungeonNav, type P3 } from './dungeonNav';

export type CreatureState = 'idle' | 'alert' | 'warn' | 'fight' | 'brawl' | 'flee' | 'beg' | 'meek' | 'down' | 'dead';

/** What the body shows (the renderer picks a clip or a pose for it). */
export type CreatureAct = 'stand' | 'walk' | 'run' | 'sniff' | 'gnaw' | 'graze' | 'watch' | 'rummage' | 'spin' | 'swing' | 'hurt' | 'beg' | 'die' | 'dead' | 'leap' | 'warn';

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
  /** What it is saying with its body now (a raised hand, a jibe, a nod), seconds left of it; the speaker of a band shows each turn. */
  signal: WarnTurn | null;
  signalLeft: number;
  /** Weapon drawn while the band talks (its last warning, a robber's demand), though the fight has not begun. */
  armed: boolean;
  /** It has spoke the hero already (a friend's faction: D65). */
  spoke: boolean;
  /** The band it warns the hero with (D64): the id of the one who noticed first; -1 while it is in none. */
  band: number;
  /** Who it fights while it brawls (D65): another body, maybe of another den on the same ground. */
  prey: Prey | null;
  /** Seconds it is still loud with fighting (others in earshot come to it, D65). */
  din: number;
  /** Seconds until it looks about for a quarrel again. */
  eye: number;
  /** Seconds it lies knocked down still (D65: those a den spares from death, `Den.mercy`). */
  downFor: number;
  /** The hero has hurt it (D65: only such a foe gives experience, and only such a kill counts against its faction). */
  struck: boolean;
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
  /** In reach of the hero and standing to fight (it steps in again only once the hero is clearly out of reach). */
  close: boolean;
  /** Metres made good towards where it walks since it last got PROGRESS on, and seconds it has wanted to move since. */
  made: number;
  pushing: number;
  /** This step it tried to walk; seconds left of a balked walk still counting as wanting to. */
  wants: boolean;
  balked: number;
  /** Seconds until it may hop free again (once a minute, Arnd 2026-10-28), and the hop under way. */
  hopIn: number;
  hop: Hop | null;
  /** Seconds left that it leaves a hero it could not reach alone (it went home). */
  spurn: number;
  /** Its hunt of a shy beast (creep, then burst), while it brawls with one. */
  stalk: Stalk | null;
  /** Seconds it rests after a hunt that failed, before it looks for another quarrel. */
  winded: number;
  rng: Rng;
}

/**
 * A hunt of a shy beast (`CreatureDef.stalks`): unseen it creeps (`hidden`), the prey's notice rolled once (`rolled`) as it comes
 * within the prey's flight distance; seen or close enough it bursts, `left` seconds of burst (-1 before it begins).
 */
export interface Stalk { hidden: boolean; rolled: boolean; left: number }

/** A hop free of where it was stuck: from, to, how long it takes and how far it has got (seconds). */
export interface Hop {
  readonly from: { x: number; y: number; z: number };
  readonly to: { x: number; y: number; z: number };
  readonly dur: number;
  readonly high: number;
  t: number;
}

/** The body a brawler fights, and the den that body is in. */
export interface Prey {
  readonly c: Creature;
  readonly den: Den;
}

/** A band that warns the hero (D64): where it is in its words, and since when. */
interface Band {
  turn: WarnTurn | null;
  /** Sim time of its last words, and of the one that began its patience (the demand, the first jibe). */
  at: number;
  began: number;
  /** The hero has talked to it and heard its terms (R7), and the price named (copper; 0 for a pact). */
  heard?: boolean;
  toll?: number;
}

/** What the speaker of a warning band says when the hero talks to it (R7): `coins` the price the hero was named or pays. */
export interface Parley {
  readonly turn: TalkTurn;
  readonly who: Creature;
  readonly coins: number;
}

/** The hero can talk to a warning band from this far (m), nearer if its warning distance is. */
const TALK_FROM = 14;

/** A band gives up its warning when the hero is this much farther than its warning distance. */
const SETTLE_AT = 1.25;
/** A warning band repeats itself this often (s) while the hero stays within it. */
const REPEAT = 10;
/** How long (s) the speaker shows what it says. */
const SIGNAL = 2.2;
/** A robbers' band walks up at this share of its pace. */
const CLOSE_IN = 0.55;
/** A creature looks about for a quarrel this often (s), and a brawl is loud this long after each blow (s). */
const LOOK = 0.6, DIN = 4;
/** A brawler's blow at a prey that runs reaches this much further (m): it springs after it. */
const LUNGE = 2.5;
/** A hunter creeping up on shy prey goes at this share of its pace, and a failed hunt leaves it winded, and a kill leaves it fed, this long (s). */
const STALK_CREEP = 0.4, WINDED = 30, FED = 90;
/** A hunter in its burst springs this much further (m) at prey that runs. */
const BOUND = 2.5;
/** A body knocked down lies this long (s) before it gets up, and gets up with this share of its health. */
export const DOWN_FOR = 45;
const UP_WITH = 0.3;

/** Does it warn before it fights (D64)? */
const warns = (c: Creature): boolean => !!c.def.stance && WARNING_STANCES.includes(c.def.stance.kind);

/** Too frightened of the hero to start a fight (Quarry.daunts). */
const cowed = (c: Creature, q: Quarry): boolean => c.def.danger < (q.daunts ?? 0);

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
  /** The hero looks weak (hurt past half their health): a jeering band does not wait (D64). */
  readonly frail?: boolean;
  /** What the foe's faction makes of the hero (D65, game/standing.ts); none: a stranger. */
  readonly regard?: (faction: string) => Tier;
  /**
   * Foes of less danger than this are too frightened of the hero to start a fight (D58: those the hero has
   * outgrown so far they give no experience): they watch from where they are and fight back only when struck,
   * or when their own are fought. None: every foe may start one.
   */
  readonly daunts?: number;
}

export type DenEvent =
  | { readonly kind: 'notice'; readonly who: Creature }
  | { readonly kind: 'alarm'; readonly who: Creature }
  | { readonly kind: 'swing'; readonly who: Creature }
  | { readonly kind: 'blow'; readonly who: Creature; readonly strike: Strike }
  | { readonly kind: 'flee'; readonly who: Creature }
  /** `by`: the creature that dealt the blow, none when the hero did (or a spell, or bleeding). */
  | { readonly kind: 'died'; readonly who: Creature; readonly by?: Creature }
  /** A body mercy spared knocked down by `by`, and got up again some time after. */
  | { readonly kind: 'down'; readonly who: Creature; readonly by: Creature }
  | { readonly kind: 'up'; readonly who: Creature }
  | { readonly kind: 'plea'; readonly who: Creature; readonly text: string }
  | { readonly kind: 'spared'; readonly who: Creature }
  | { readonly kind: 'home'; readonly who: Creature }
  /** A band of foes speaks to the hero (D64): `who` is the one who speaks for it, `turn` what it says. */
  | { readonly kind: 'warn'; readonly who: Creature; readonly turn: WarnTurn }
  /** The band's warning is over and it fights; `who` is the one who speaks for it, `cause` why. */
  | { readonly kind: 'break'; readonly who: Creature; readonly cause: BreakCause }
  /** It lifted the bar of a barred door from its bar's side (link): the door is seen opening away from it. */
  | { readonly kind: 'unbarred'; readonly who: Creature; readonly link: number };

export type { BreakCause, WarnTurn };

/** Body radius by kind and size, metres. */
export function radiusOf(def: CreatureDef): number {
  const b = def.body;
  return b.kind === 'humanoid' ? 0.32 : b.kind === 'spider' ? b.length * 0.4 : b.kind === 'beast' && b.radius ? b.radius : b.length * 0.3;
}

/** The widest a body is for walking the land (m): a giant steps between the trunks and over the fences it shoulders by, as a wolf would, its bulk kept for the bodies about it. */
export const WALK_R = 1.3;
/** The radius a body takes to the ground (the walls, the trunks, the water's edge): its own, to WALK_R. */
export function walkRadius(def: CreatureDef): number { return Math.min(radiusOf(def), WALK_R); }

/** Hero's body radius, metres. */
export const HERO_R = 0.35;
/** Bodies smaller than this (m) let the hero step through, and step through the hero (Arnd 2026-10-30: a rat). */
const SMALL = 0.2;
/** Does it block the hero, and the hero it (everything alive but small critters)? */
export function blocksHero(def: CreatureDef): boolean { return radiusOf(def) >= SMALL; }
/** Bodies farther apart in height than this (m) pass over and under each other (a stair, a ledge). */
const ABOVE = 1;
/** Does it have hands to lift a door's bar (a rat or a spider goes round)? */
const hands = (c: Creature): boolean => c.def.body.kind === 'humanoid';
/** It stands this long at a door it unbars (s): the bar lifted off and the door swung most of the way (CellarView). */
const UNBAR_FOR = 1.8;
/** A blow lands this long after it starts (the tell a quick hero steps away from). */
const WINDUP = 0.4;
/** Lost this long, it gives up the hunt. */
const GIVE_UP = 9;
/** In reach, it keeps standing until the hero is this much farther (m): no stepping in and out at the edge. */
const HOLD = 0.25;
/** How far (m) it must get towards where it walks for a walk to count as getting somewhere. */
const PROGRESS = 1;
/**
 * Stuck (Arnd 2026-10-28): wanting to move this long (s) without getting anywhere, it hops free if it may, else
 * a hunter gives up on a hero it cannot reach after `giveUp` and leaves them alone for `spurn`. A balked walk
 * counts as wanting to for `balk` seconds.
 */
const STUCK = { time: 2.5, giveUp: 6, spurn: 20, balk: 1.5 } as const;
/** It hops free once a minute at most (Arnd 2026-10-28); with nowhere to hop, it looks again after `retry` s. */
const HOP_EVERY = { gap: 60, retry: 3 } as const;

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
  /** Those busy lifting a door's bar: seconds left. */
  private readonly unbarring = new Map<Creature, number>();
  /** What happened while they walked (a door unbarred), out with the step's other events. */
  private readonly walked: DenEvent[] = [];
  /**
   * Other dens on the same ground and frame (bands out on the land): their bodies block this den's as its own
   * do. Set by whoever steps them together (app/encounter.ts).
   */
  neighbours: readonly Den[] = [];
  /** The hero this step (a body in the way like any other). */
  private quarry: Quarry | null = null;
  /** Those held up this step by another body (not stuck: it is not counted towards a hop). */
  private readonly waiting = new Set<Creature>();
  /**
   * What the VGM knows that makes this den attack the hero on sight (D64, `vgm/stance.ts`): they were hired against it, or killed its kin.
   * Set by the game when the den is woken or placed.
   */
  knows: 'hired' | 'kin' | null = null;
  /**
   * What the hero settled with this den's warning band (R7): `paid` its toll, or gave their `pact` to keep away. The den keeps its word
   * (a greeting, never a fight) until the hero strikes one of it; saved with the place.
   */
  word: 'paid' | 'pact' | null = null;
  /** The bands that warn the hero now (D64), by the id of the one who noticed first. */
  private readonly bands = new Map<number, Band>();
  /**
   * Are two factions at feud (D65: `opposed` of the setting's matrix)? Set by whoever plays the den (game/fight.ts); none: its
   * creatures know no quarrel but the hero's.
   */
  feud: ((a: string, b: string) => boolean) | null = null;
  /**
   * Whose fall is a knock-down, not a death (D65: a town's folk who fight raiders never die of it): a creature at 0 health from a
   * creature's blow (not the hero's) lies `DOWN_FOR` seconds and gets up again with a share of its health.
   */
  mercy: ((c: Creature) => boolean) | null = null;
  /** What the creatures of other dens did to this den's (a blow, a fall), out with the next step's events. */
  private readonly outbox: DenEvent[] = [];

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
        aware: 0, leader: id === 0 && def.pack, band: -1, prey: null, din: 0, eye: id * 0.13 % LOOK, downFor: 0, struck: false, signal: null, signalLeft: 0, armed: false, spoke: false, stagger: 0, slow: 0, ready: 0, windup: 0, until: rng.range(0, 4), path: [], pi: 0, lost: 0, seen: null,
        repath: 0, pleas: 0, blows: 0, calm: 0, close: false, made: 0, pushing: 0, wants: false, balked: 0, hopIn: 0, hop: null, spurn: 0, stalk: null, winded: 0, rng, ...(s.surprise ? { surprise: s.surprise } : {}),
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
    this.quarry = q;
    this.waiting.clear();
    const out: DenEvent[] = [];
    this.warnings(q, out);
    for (const c of this.creatures) {
      if (c.state === 'dead') { c.y = this.ground.floatAt?.(c.x, c.z, c.y) ?? c.y; continue; }
      c.stagger = Math.max(0, c.stagger - dt);
      if ((c.signalLeft -= dt) <= 0) { c.signalLeft = 0; c.signal = null; }
      c.din = Math.max(0, c.din - dt);
      c.eye = Math.max(0, c.eye - dt);
      if (c.state !== 'brawl') { c.prey = null; c.stalk = null; }
      c.winded = Math.max(0, c.winded - dt);
      c.ready = Math.max(0, c.ready - dt);
      c.repath = Math.max(0, c.repath - dt);
      c.hopIn = Math.max(0, c.hopIn - dt);
      c.spurn = Math.max(0, c.spurn - dt);
      c.wants = false;
      this.heal(c, dt);
      this.sense(c, q, dt, out);
      this.quarrel(c);
      if (c.hop) { this.hopping(c, dt); continue; }
      // A swimmer rides the water standing still too (the waves rise and fall under it).
      if (this.ground.afloat) c.y = this.ground.floorAt(c.x, c.z, c.y + 0.6) ?? c.y;
      const busy = this.unbarring.get(c);
      if (busy !== undefined) {
        if (busy > dt) this.unbarring.set(c, busy - dt); else this.unbarring.delete(c);
        c.act = 'stand';
        continue;
      }
      switch (c.state) {
        case 'idle': if (this.peace && c.aware > 0.35) this.watch(c, q, dt); else this.idle(c, q, dt); break;
        case 'alert': this.alert(c, q, dt); break;
        case 'warn': this.warning(c, q, dt); break;
        case 'fight': this.fight(c, q, dt, out); break;
        case 'brawl': this.brawl(c, dt, out); break;
        case 'down': this.lying(c, dt, out); break;
        case 'flee': this.flee(c, q, dt, out); break;
        case 'beg': this.beg(c, q, dt, out); break;
        case 'meek': this.meek(c, q, dt); break;
      }
      this.progress(c, dt);
    }
    this.spread();
    out.push(...this.walked, ...this.outbox);
    this.walked.length = 0;
    this.outbox.length = 0;
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
    if (this.peace) { if (c.state === 'alert' || c.state === 'warn') { c.state = 'idle'; c.band = -1; } return; }
    // A placid one (a peaceful giant) takes no notice of a hero so small: it neither looks up nor shies; only a blow makes it fight (struck).
    if (c.def.temper === 'placid' && c.state !== 'fight') return;
    // Left a hero it could not reach: it keeps to itself a while.
    if (c.spurn > 0 && c.state === 'idle') return;
    const noticed = (c.state === 'idle' || c.state === 'alert' || c.state === 'brawl') && c.aware >= 1 && !this.keepsOff(c, q);
    if (noticed && !cowed(c, q)) this.notice(c, q, out);
    else {
      // Too weak against this hero (D58): one that would warn says so once, and keeps back.
      if (noticed && warns(c)) this.yielding(c, q, out);
      if (c.state === 'idle' && c.aware > 0.35) { c.state = 'alert'; c.path = []; }
    }
  }

  private notice(c: Creature, q: Quarry, out: DenEvent[]): void {
    // One that warns first (D64) speaks before it fights; the hero beyond its warning distance is only watched.
    if (warns(c) && !c.surprise) { this.meet(c, q, out); return; }
    // A murderous one (R8) falls on the hero at once, and its war cry says why.
    if (c.def.stance?.kind === 'murderous') out.push({ kind: 'break', who: c, cause: 'murder' });
    out.push({ kind: 'notice', who: c });
    if (c.surprise && c.pleas === 0) { c.state = 'beg'; c.act = 'beg'; c.until = 0; return; }
    if (c.def.temper === 'skittish' && !this.brave(c, q)) { this.toFlee(c, out); return; }
    c.state = 'fight';
    c.path = [];
    if (c.def.pack) this.call(c, out);
  }

  /** A band that would warn but dares not (the hero far above it, D58): one of it says so once within its warning distance. */
  private yielding(c: Creature, q: Quarry, out: DenEvent[]): void {
    if (Math.hypot(q.x - c.x, q.z - c.z) > c.def.stance!.warn!) { c.spoke = false; return; }
    const tier = q.regard?.(c.def.faction);
    if (c.spoke || tier === 'friend' || tier === 'honoured') return;
    for (const o of this.creatures) if (o === c || (o.def.faction === c.def.faction && this.hears(c, o))) o.spoke = true;
    this.signalling(c, 'yield', []);
    out.push({ kind: 'warn', who: c, turn: 'yield' });
  }

  /**
   * Its faction's view of the hero picks what it does (D65): a hated hero is attacked at once, with the reason spoken; a friend is let pass
   * and spoke once; anyone else gets the kind's own stance (stranger) or a warning (unwelcome: every stance that warns).
   */
  private meet(c: Creature, q: Quarry, out: DenEvent[]): void {
    const tier = q.regard?.(c.def.faction) ?? 'stranger', st = c.def.stance!;
    if (Math.hypot(q.x - c.x, q.z - c.z) > st.warn!) { c.spoke = false; if (c.state === 'idle') { c.state = 'alert'; c.path = []; } return; }
    if (tier === 'hated' || this.knows) {
      out.push({ kind: 'break', who: c, cause: this.knows ?? 'hated' }, { kind: 'notice', who: c });
      c.state = 'fight';
      c.path = [];
      this.call(c, out);
    } else if (tier === 'friend' || tier === 'honoured' || this.word) {
      if (!c.spoke) { for (const o of this.creatures) if (o === c || (o.def.faction === c.def.faction && this.hears(c, o))) o.spoke = true; this.signalling(c, 'greet', []); out.push({ kind: 'warn', who: c, turn: 'greet' }); }
      c.state = 'idle';
      c.aware = 0.3;
    } else this.warnUp(c, q, out);
  }

  /** Is the creature close enough to the hero to be heard by those of its band (the shout carries as far as one can see)? */
  private hears(c: Creature, o: Creature): boolean {
    const d = Math.hypot(o.x - c.x, o.z - c.z, o.y - c.y);
    return d <= (this.ground.sees(c.x, c.y, c.z, o.x, o.y, o.z, 0.6) ? o.def.senses.hearing : 2.5);
  }

  /**
   * It has noticed the hero (D64) and warns instead of attacking: it and those of its kind in earshot stop and face them (one band, which
   * speaks through its leader). The hero beyond its warning distance is only watched, and nothing is said.
   */
  private warnUp(c: Creature, q: Quarry, out: DenEvent[]): void {
    out.push({ kind: 'notice', who: c });
    this.bands.set(c.id, { turn: null, at: this.time, began: this.time });
    for (const o of this.creatures) {
      const joins = o === c || (o.def.pack && warns(o) && (o.state === 'idle' || o.state === 'alert') && !cowed(o, q) && this.hears(c, o));
      if (!joins) continue;
      o.state = 'warn';
      o.band = c.id;
      o.aware = Math.max(o.aware, 0.7);
      o.seen = c.seen ?? { x: q.x, y: q.y, z: q.z };
      o.lost = 0;
      o.path = [];
    }
  }

  /** Those of a band now (still warning). */
  private members(id: number): Creature[] { return this.creatures.filter((c) => c.state === 'warn' && c.band === id); }

  /** The one who speaks for a band: its leader, else the one nearest the hero. */
  private speaker(m: readonly Creature[], q: { readonly x: number; readonly z: number }): Creature {
    const byGap = (c: Creature) => Math.hypot(q.x - c.x, q.z - c.z);
    return m.find((c) => c.leader) ?? m.reduce((a, b) => (byGap(b) < byGap(a) ? b : a));
  }

  /**
   * Each band's words, once a step (D64). A guard warns, warns again nearer, and repeats while the hero stays; a robber's band says
   * halt, walks up and demands; a goblin band jibes. The hero crossing the line, a blow, a spent patience or a hero who looks weak
   * ends it in a fight; the hero going back lets them settle at their posts.
   */
  private warnings(q: Quarry, out: DenEvent[]): void {
    for (const [id, b] of this.bands) {
      const m = this.members(id);
      if (!m.length) { this.bands.delete(id); continue; }
      const who = this.speaker(m, q), st = who.def.stance!;
      const d = Math.min(...m.map((c) => Math.hypot(q.x - c.x, q.z - c.z)));
      if (!q.alive || d > st.warn! * SETTLE_AT || m.every((c) => c.aware < 0.25)) { this.standDown(id, m, who, q.alive, out); continue; }
      if (d <= st.line!) { this.breakBand(id, m, who, 'line', out); continue; }
      const utter = (turn: WarnTurn) => { b.turn = turn; b.at = this.time; this.signalling(who, turn, m); out.push({ kind: 'warn', who, turn }); };
      switch (st.kind) {
        case 'guard':
          if (b.turn === null) utter('warn');
          else if (b.turn === 'warn' && d <= (st.warn! + st.line!) / 2) utter('last');
          else if (this.time - b.at > REPEAT) utter(b.turn);
          break;
        case 'rob':
          if (b.turn === null) utter('warn');
          else if (b.turn === 'warn' && d <= st.close! + 0.6) { utter('demand'); b.began = this.time; }
          else if (b.turn === 'demand' && this.time - b.began > st.patience!) this.breakBand(id, m, who, 'patience', out);
          else if (b.turn === 'demand' && this.time - b.at > REPEAT) utter('demand');
          break;
        case 'jeer':
          if (b.turn === null) { utter('jeer'); b.began = this.time; }
          else if (q.frail) this.breakBand(id, m, who, 'frail', out);
          else if (this.time - b.began > st.patience! && m.length >= st.many!) this.breakBand(id, m, who, 'many', out);
          else if (this.time - b.at > REPEAT / 2) utter('jeer');
          break;
      }
    }
  }

  /**
   * A living one of this den shows what its people say (a gesture), facing the hero at (x, z): the nearest to them speaks. A last warning
   * has the whole den draw; a settle puts the weapons away again. For a hold's wardens, who are not a warning band (game/hold.ts).
   */
  gesture(turn: WarnTurn, at: { readonly x: number; readonly z: number }): void {
    const alive = this.creatures.filter((c) => c.state !== 'dead' && c.state !== 'down');
    if (!alive.length) return;
    let who = alive[0];
    for (const c of alive) if (Math.hypot(at.x - c.x, at.z - c.z) < Math.hypot(at.x - who.x, at.z - who.z)) who = c;
    who.dir = Math.atan2(at.z - who.z, at.x - who.x);
    this.signalling(who, turn, alive);
    if (turn === 'settle') for (const c of alive) c.armed = false;
  }

  /** The speaker shows what it says (a gesture for a moment); a last warning or a demand has the whole band draw. */
  private signalling(who: Creature, turn: WarnTurn, band: readonly Creature[]): void {
    who.signal = turn;
    who.signalLeft = SIGNAL;
    if (turn === 'last' || turn === 'demand') for (const c of band) c.armed = true;
  }

  /** The band's warning is over and it fights, one of its words saying why; the rest of its pack in earshot joins. */
  private breakBand(id: number, m: readonly Creature[], who: Creature, cause: BreakCause, out: DenEvent[]): void {
    this.bands.delete(id);
    out.push({ kind: 'break', who, cause });
    for (const c of m) { c.state = 'fight'; c.band = -1; c.path = []; c.close = false; c.armed = false; }
    this.call(who, out);
  }

  /** The warning band the hero can talk to now (R7): one whose stance talks, near enough, nearest first. */
  private talker(): { id: number; band: Band; who: Creature; stance: NonNullable<CreatureDef['stance']>; members: Creature[] } | null {
    const q = this.quarry;
    if (!q?.alive || this.peace) return null;
    let best: ReturnType<Den['talker']> = null, bd = Infinity;
    for (const [id, band] of this.bands) {
      const members = this.members(id);
      if (!members.length) continue;
      const who = this.speaker(members, q), stance = who.def.stance!, d = Math.hypot(q.x - who.x, q.z - who.z);
      if (stance.talk && band.turn !== null && d <= Math.min(stance.warn!, TALK_FROM) && d < bd) { bd = d; best = { id, band, who, stance, members }; }
    }
    return best;
  }

  /** Who speaks for the band the hero can talk to now, if any (R7). */
  hail(): Creature | null { return this.talker()?.who ?? null; }

  /**
   * The hero talks to the band that warns them (R7): the first word hears its terms (a share of the purse, seeded by the speaker and the
   * purse; or a pact), the next agrees to them. A price the purse cannot meet gets the short answer. A deal ends the warning: the band
   * stands down and greets the hero from then on (`word`). Null: there is none to talk to. The caller takes `coins` from the purse.
   */
  parley(purse: number): Parley | null {
    const t = this.talker();
    if (!t) return null;
    const { band: b, who, stance: st } = t;
    if (!b.heard) {
      const share = st.toll ? st.toll[0] + (st.toll[1] - st.toll[0]) * hash2f(who.id, Math.floor(purse), 91) : 0;
      b.heard = true;
      b.toll = st.talk === 'price' ? Math.max(1, Math.round(purse * share)) : 0;
      b.began = this.time;
      this.signalling(who, 'warn', []);
      return { turn: 'terms', who, coins: b.toll };
    }
    if (purse < b.toll!) return { turn: 'short', who, coins: b.toll! };
    this.word = b.toll ? 'paid' : 'pact';
    this.bands.delete(t.id);
    this.signalling(who, 'greet', []);
    for (const c of t.members) { c.state = 'idle'; c.band = -1; c.armed = false; c.aware = 0.3; c.spoke = true; c.path = []; }
    return { turn: 'deal', who, coins: b.toll! };
  }

  /** The hero has gone back (or is gone): the band lets it be and goes back to its post. */
  private standDown(id: number, m: readonly Creature[], who: Creature, said: boolean, out: DenEvent[]): void {
    const b = this.bands.get(id);
    this.bands.delete(id);
    if (said && b?.turn) { this.signalling(who, 'settle', m); out.push({ kind: 'warn', who, turn: 'settle' }); }
    for (const c of m) { c.band = -1; c.armed = false; this.goHome(c, out); }
  }

  /** It stands with its band, facing the hero; a robber walks up to the distance it demands from. */
  private warning(c: Creature, q: Quarry, dt: number): void {
    const st = c.def.stance!, b = this.bands.get(c.band);
    const dx = q.x - c.x, dz = q.z - c.z;
    if (st.kind === 'rob' && b && b.turn !== 'demand' && Math.hypot(dx, dz) > st.close!) {
      if (c.repath === 0 || c.pi >= c.path.length) { c.path = [this.slot(c, q, st.close!)]; c.pi = 0; c.repath = 0.5; }
      if (this.move(c, dt, CLOSE_IN)) return;
    }
    c.path = [];
    c.dir = Math.atan2(dz, dx);
    c.act = 'warn';
  }

  /** A shy one (def.wary) farther off than its flight distance only watches (a loud hero is fled sooner). */
  private keepsOff(c: Creature, q: Quarry): boolean {
    const w = c.def.wary;
    return !!w && c.def.temper === 'skittish' && Math.hypot(q.x - c.x, q.z - c.z) > w * (0.75 + 0.5 * Math.min(1, q.noise));
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

  /** Every living body on this ground that it can tell is there: those of this den and of the dens beside it. */
  private bodies(): { readonly c: Creature; readonly den: Den }[] {
    return [this, ...this.neighbours].flatMap((den) => den.creatures.filter((o) => o.state !== 'dead' && !o.hop).map((o) => ({ c: o, den })));
  }

  /** The nearest body at feud with it that it sees, or hears fighting (D65); none if it knows no quarrel. */
  private foeFor(c: Creature): Prey | null {
    let best: Prey | null = null, near = Infinity;
    for (const p of this.bodies()) {
      const o = p.c;
      if (o === c || o.state === 'down' || !this.feud!(c.def.faction, o.def.faction) || Math.abs(o.y - c.y) > 3) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      const known = d <= c.def.senses.sight && this.ground.sees(c.x, c.y, c.z, o.x, o.y, o.z, 0.8);
      const heard = o.din > 0 && d <= c.def.senses.hearing;
      if ((known || heard) && d < near) { near = d; best = p; }
    }
    return best;
  }

  /**
   * It looks about for a quarrel (D65): another body of a faction at feud with its own that it sees, or hears fighting, is
   * attacked; its pack comes too. A shy one runs from whoever hunts. The hero has the first claim: one that has noticed them
   * (fight) does not look.
   */
  private quarrel(c: Creature): void {
    if (!this.feud || c.eye > 0 || c.spurn > 0 || c.winded > 0 || (c.state !== 'idle' && c.state !== 'alert')) return;
    c.eye = LOOK;
    if (c.def.temper === 'placid') return;
    if (c.def.temper === 'skittish') {
      if (this.dread(c, null)) this.toFlee(c, this.walked);
      return;
    }
    const foe = this.foeFor(c);
    if (!foe) return;
    for (const o of this.creatures) {
      if (o !== c && !(c.def.pack && o.def.pack && (o.state === 'idle' || o.state === 'alert') && o.def.temper !== 'skittish' && this.hears(c, o))) continue;
      o.state = 'brawl';
      o.prey = foe;
      o.path = [];
      o.stalk = o.def.stalks && foe.c.def.temper === 'skittish' ? { hidden: true, rolled: false, left: -1 } : null;
    }
  }

  /** Whom it fights: it closes in on its prey and strikes, until one of them falls or runs, or it loses sight of it. */
  private brawl(c: Creature, dt: number, out: DenEvent[]): void {
    const p = c.prey;
    if (!p || p.c.state === 'dead' || p.c.state === 'down' || (p.c.state === 'flee' && Math.hypot(p.c.x - c.x, p.c.z - c.z) > c.def.senses.sight)) {
      // A hunter that brought its prey down is fed, and hunts no more for a long while (the herd is not wiped out).
      if (p && c.def.stalks && (p.c.state === 'dead' || p.c.state === 'down')) c.winded = FED;
      this.settleDown(c);
      return;
    }
    const t = p.c, dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz), dy = Math.abs(t.y - c.y);
    const atk = c.def.attacks[0], reach = atk.reach + radiusOf(c.def) + radiusOf(t.def);
    const sees = d < c.def.senses.sight && this.ground.sees(c.x, c.y, c.z, t.x, t.y, t.z, 0.9);
    if (sees) { c.lost = 0; c.seen = { x: t.x, y: t.y, z: t.z }; }
    else if (c.lost > GIVE_UP) { this.settleDown(c); return; }
    if (c.stagger > 0) { c.act = 'hurt'; c.windup = 0; return; }
    if (c.windup > 0) {
      c.windup -= dt;
      c.dir = Math.atan2(dz, dx);
      if (c.windup <= 0) {
        c.ready = atk.time;
        // Stepped back out of reach: the blow goes wide; a lunge at one that runs reaches the further for it.
        if (d < reach + 0.3 + (t.state === 'flee' ? LUNGE + (this.bursting(c) ? BOUND : 0) : 0) && dy < 1.2 && sees) p.den.bitten(t, strike({ damage: atk.damage, kind: atk.kind, prowess: atk.prowess }, this.onTheRun(c, p.den.guardOf(t)), c.rng), c, this);
      }
      return;
    }
    if (d < (c.close ? reach + HOLD : reach) && dy < 1.2 && sees) {
      c.close = true;
      c.path = [];
      c.dir = Math.atan2(dz, dx);
      if (c.ready === 0) { c.windup = WINDUP; c.act = 'swing'; c.din = DIN; out.push({ kind: 'swing', who: c }); }
      else c.act = 'stand';
      return;
    }
    c.close = false;
    const goal = sees ? t : c.seen;
    if (!goal) { this.settleDown(c); return; }
    if (c.repath === 0 || c.pi >= c.path.length) { this.headTo(c, goal); c.repath = 0.6; }
    const pace = c.stalk ? this.stalking(c, c.stalk, p, d, dt) : 1;
    if (pace > 0 && !this.move(c, dt, pace)) c.act = 'stand';
  }

  /** Prey running from a hunter's burst has no guard to put up: the bite lands on it open. */
  private onTheRun(c: Creature, g: Guard): Guard {
    return this.bursting(c) ? { ...g, open: true } : g;
  }

  /** In the burst of a hunt (it springs the further for it, BOUND). */
  private bursting(c: Creature): boolean {
    return !!c.stalk && c.stalk.left > 0;
  }

  /**
   * A hunt of a shy beast (Arnd 2026-11-02): the pace this step. It creeps up unseen; the prey may notice it as it comes within
   * its flight distance (a seeded roll, once), or it bursts from `from` metres; the burst is fast and short, and a hunt it does not end
   * is given up (pace 0), the hunter winded a while. One of a pack seen, all burst.
   */
  private stalking(c: Creature, s: Stalk, p: Prey, d: number, dt: number): number {
    const st = c.def.stalks!;
    if (s.left < 0) {
      if (!s.rolled && d < (p.c.def.wary ?? 20)) { s.rolled = true; if (c.rng.chance(st.seen)) s.hidden = false; }
      if (s.hidden && this.creatures.some((o) => o.stalk && !o.stalk.hidden && o.prey?.c === p.c)) s.hidden = false;
      if (s.hidden && d > st.from) return STALK_CREEP;
      s.hidden = false;
      s.left = st.secs;
    }
    if ((s.left -= dt) > 0) return st.burst;
    c.winded = WINDED;
    this.settleDown(c);
    return 0;
  }

  /** Knocked down: it lies, then gets up with a share of its health. */
  private lying(c: Creature, dt: number, out: DenEvent[]): void {
    c.act = 'hurt';
    if ((c.downFor -= dt) > 0) return;
    this.getUp(c, out);
  }

  private getUp(c: Creature, out: DenEvent[]): void {
    c.state = 'idle';
    c.act = 'stand';
    c.downFor = 0;
    c.health = Math.max(c.health, c.def.health * UP_WITH);
    c.calm = 0;
    c.aware = 0.2;
    c.until = 0;
    out.push({ kind: 'up', who: c });
  }

  /** Someone tends the fallen: it lies shorter (the rest of its time cut to `left` seconds). */
  tend(c: Creature, left: number): void {
    if (c.state === 'down') c.downFor = Math.min(c.downFor, left);
  }

  /** A body at ease walks to (x, y, z) and stands there (an errand: a tender to the fallen). */
  sendTo(c: Creature, p: P3): void {
    if (c.state !== 'idle') return;
    c.path = [p];
    c.pi = 0;
    c.until = 0;
  }

  /** It goes for `prey` at once, seen or not (a call to arms: the town's watch for the raiders). */
  engage(c: Creature, prey: Prey): void {
    if (c.state !== 'dead' && c.state !== 'down' && c.state !== 'flee') Object.assign(c, { state: 'brawl', prey, path: [], seen: { x: prey.c.x, y: prey.c.y, z: prey.c.z }, lost: 0 });
  }

  /** The quarrel is over (its prey is down, away or lost): back to its ways. */
  private settleDown(c: Creature): void {
    c.state = 'idle';
    c.prey = null;
    c.stalk = null;
    c.path = [];
    c.until = 0;
    c.eye = 0;
  }

  /** What it runs from: the nearest body at feud with it that fights now (within sight); else the hero, `q` (none: nothing). */
  private dread(c: Creature, q: Quarry | null): P3 | null {
    let best: P3 | null = null, near = c.def.senses.sight;
    for (const { c: o } of this.bodies()) {
      if ((o.state !== 'brawl' && o.state !== 'fight') || o.stalk?.hidden || !this.feud?.(o.def.faction, c.def.faction)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < near) { near = d; best = o; }
    }
    return best ?? (q && q.alive ? q : null);
  }

  /** Always doing something: roam the home room, stop and sniff or gnaw or keep watch, roam again. */
  private idle(c: Creature, q: Quarry, dt: number): void {
    if (this.move(c, dt, 0.32)) return;
    c.until -= dt;
    if (c.until > 0) return;
    const r = c.rng;
    const p = r.chance(0.55) ? this.ground.spot(c.home, r) : null;
    if (p && !this.towards(c, q, p)) {
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

  /** Would this walk take a shy one back near the hero it keeps away from? */
  private towards(c: Creature, q: Quarry, p: { x: number; z: number }): boolean {
    const w = c.def.wary;
    if (!w || !q.alive) return false;
    const there = Math.hypot(q.x - p.x, q.z - p.z);
    return there < w * 2 && there < Math.hypot(q.x - c.x, q.z - c.z);
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
    // A shy beast never creeps closer: head up, it keeps the hero in sight; nor does one too frightened of them.
    if (c.def.wary || cowed(c, q) || warns(c)) { if (!this.move(c, dt, 0.32)) { c.act = 'watch'; c.dir = Math.atan2(q.z - c.z, q.x - c.x); } return; }
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
        if (d < reach + 0.3 && dy < 1.2 && this.clear(c, q)) out.push({ kind: 'blow', who: c, strike: strike({ damage: atk.damage, kind: atk.kind, prowess: atk.prowess }, q.guard, c.rng) });
      }
      return;
    }
    // In reach with nothing between (a wall, a shut door): it stands and fights; else it finds its way round.
    if (d < (c.close ? reach + HOLD : reach) && dy < 1.2 && this.clear(c, q)) {
      c.close = true;
      c.path = [];
      c.dir = Math.atan2(dz, dx);
      if (c.ready === 0) { c.windup = WINDUP; c.act = 'swing'; c.din = DIN; out.push({ kind: 'swing', who: c }); }
      else c.act = 'stand';
      return;
    }
    c.close = false;
    // Close in: straight when it sees the hero near, else along the way.
    const target = c.lost < 0.5 ? { x: q.x, y: q.y, z: q.z } : c.seen;
    if (!target) return;
    if (c.lost < 0.5 && d < 4 && dy < 0.8 && this.clear(c, q)) {
      const at = this.slot(c, q, reach * 0.8);
      // Already there (waiting behind a full ring): it stands and watches, not stuck.
      if (Math.hypot(at.x - c.x, at.z - c.z) < 0.05) { c.path = []; c.dir = Math.atan2(dz, dx); c.act = 'stand'; return; }
      c.path = [at];
      c.pi = 0;
    } else if (c.repath === 0 || c.pi >= c.path.length) { this.headTo(c, target); c.repath = 0.6; }
    if (!this.move(c, dt, 1)) c.act = 'stand';
    // It cannot get to the hero (across a river, up a cliff) and has no hop left: it gives up and goes home.
    if (this.ground.hop && c.pushing > STUCK.giveUp && !c.hop) { this.goHome(c, out); c.spurn = STUCK.spurn; c.pushing = 0; }
  }

  /** Is the way between it and the hero clear at the height of a blow (no wall or shut door between)? */
  private clear(c: Creature, q: Quarry): boolean {
    return this.ground.sees(c.x, c.y, c.z, q.x, q.y, q.z, 0.9);
  }

  /**
   * Where it stands to fight the hero: on its own side of them, at `ring`, turned round them to a place no other
   * of the den takes already (two never fight from the same spot).
   */
  private slot(c: Creature, q: Quarry, ring: number): { x: number; y: number; z: number } {
    const base = Math.atan2(c.z - q.z, c.x - q.x), r = radiusOf(c.def);
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const x = q.x + Math.cos(base + turn) * ring, z = q.z + Math.sin(base + turn) * ring;
      const taken = this.creatures.some((o) => o !== c && o.state !== 'dead' && Math.hypot(o.x - x, o.z - z) < r + radiusOf(o.def) + 0.1);
      if (!taken) return { x, y: q.y, z };
    }
    // The ring round the hero is full: it waits behind it, on its own side, for a place to come free.
    const back = ring + r * 2 + 0.3;
    return { x: q.x + Math.cos(base) * back, y: q.y, z: q.z + Math.sin(base) * back };
  }

  /** Off to the room farthest from the hero; cornered there, it fights. */
  private flee(c: Creature, q: Quarry, dt: number, out: DenEvent[]): void {
    if (this.move(c, dt, 1)) return;
    // From whoever hunts it: a body at feud with it, else the hero.
    const from = this.dread(c, q);
    const d = from ? Math.hypot(from.x - c.x, from.z - c.z) : Infinity;
    if (!from || d > (c.def.wary ? c.def.wary * 2 : 10)) { c.state = c.surprise ? 'meek' : 'idle'; c.aware = 0.3; c.until = 0; out.push({ kind: 'home', who: c }); return; }
    if (c.repath === 0) {
      this.runFrom(c, from);
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
    if (!this.move(c, dt, 0.6)) this.idle(c, q, dt);
  }

  /**
   * The hero struck it: health, a stagger, and it knows who did it. Begging or spared, it runs; hurt
   * enough, it runs; the den hears the fight. `flinch`: false for what wears on it (bleeding), which does not stagger.
   */
  wound(c: Creature, s: Strike, from: { x: number; y: number; z: number }, stagger = 0, flinch = true): DenEvent[] {
    const out: DenEvent[] = [];
    if (c.state === 'dead') return out;
    c.health -= s.damage;
    if (s.damage > 0) { c.calm = 0; c.struck = true; }
    // The hero breaks the word given (R7): the den fights, and says who started it.
    if (this.word && s.damage > 0) { this.word = null; out.push({ kind: 'break', who: c, cause: 'struck' }); }
    // Struck while the band was still talking: it fights now (D64), and says who started it.
    if (c.state === 'warn') {
      const m = this.members(c.band), live = m.filter((o) => o.health > 0);
      this.breakBand(c.band, m, this.speaker(live.length ? live : m, from), 'struck', out);
    }
    c.aware = 1;
    c.seen = { ...from };
    c.lost = 0;
    c.din = DIN;
    if (this.afterBlow(c, s, stagger, flinch, out)) return out;
    if (c.state !== 'fight') {
      c.state = 'fight';
      c.path = [];
      out.push({ kind: 'notice', who: c });
      if (c.def.pack) this.call(c, out);
    }
    return out;
  }

  /**
   * What a blow did to it past its health: a stagger, a fall (the leader's lets the rest lose heart), a flight. True when that settled
   * what it does now (down, or running).
   */
  private afterBlow(c: Creature, s: Strike, stagger: number, flinch: boolean, out: DenEvent[], by?: Creature): boolean {
    if (s.damage > 0 && flinch) { c.stagger = Math.max(c.stagger, stagger, s.outcome === 'crit' ? 0.5 : 0.18); c.windup = 0; c.blows++; }
    if (c.health <= 0 && by && this.mercy?.(c)) {
      c.health = 0;
      c.state = 'down';
      c.act = 'hurt';
      c.path = [];
      c.windup = 0;
      c.downFor = DOWN_FOR;
      c.prey = null;
      out.push({ kind: 'down', who: c, by });
      return true;
    }
    if (c.health <= 0) {
      c.health = 0;
      c.state = 'dead';
      c.act = 'die';
      c.path = [];
      out.push({ kind: 'died', who: c, ...(by ? { by } : {}) });
      // The leader falls: the rest may lose heart.
      if (c.leader) for (const o of this.creatures) if ((o.state === 'fight' || o.state === 'brawl') && o.def.morale < 1 && o.rng.chance(0.5)) this.toFlee(o, out);
      return true;
    }
    if (c.state === 'beg' || c.state === 'meek') { this.toFlee(c, out); return true; }
    if (c.health < c.def.health * (1 - c.def.morale) && c.state !== 'flee') { this.toFlee(c, out); return true; }
    return false;
  }

  /**
   * A blow from a creature of `from` (D65): the same wound as the hero's, without the hero's part in it. One at ease turns on whoever
   * struck it, a shy one runs; the fall is told with the den's next events.
   */
  bitten(c: Creature, s: Strike, by: Creature, from: Den): void {
    if (c.state === 'dead' || c.state === 'down') return;
    c.health -= s.damage;
    if (s.damage > 0) c.calm = 0;
    c.din = DIN;
    if (this.afterBlow(c, s, 0, true, this.outbox, by)) return;
    if (c.state !== 'idle' && c.state !== 'alert') return;
    if (c.def.temper === 'skittish') this.toFlee(c, this.outbox);
    else { c.state = 'brawl'; c.prey = { c: by, den: from }; c.path = []; }
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
    if (c.state === 'fight' || c.state === 'alert' || c.state === 'warn' || c.state === 'idle') { c.band = -1; this.toFlee(c, out); }
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
    c.path = this.ground.way(c, p, hands(c));
  }

  /** Off as far from the hero as it can get. */
  private runFrom(c: Creature, q: P3): void {
    const way = this.ground.away(c, q, hands(c));
    if (way.length) { c.path = way; c.pi = 0; }
  }

  /** Walk the path at a share of its speed; false when there is nowhere to go. */
  private move(c: Creature, dt: number, pace: number): boolean {
    if (c.pi >= c.path.length) return false;
    c.wants = true;
    // A barred door on its way, on the bar's side: it stops and lifts the bar (seen), then walks on through.
    const doors = hands(c) ? this.ground.unbar?.(c, c.path[c.pi]) ?? [] : [];
    if (doors.length) {
      const p = c.path[c.pi];
      c.dir = Math.atan2(p.z - c.z, p.x - c.x);
      c.act = 'stand';
      this.unbarring.set(c, UNBAR_FOR);
      for (const link of doors) this.walked.push({ kind: 'unbarred', who: c, link });
      return true;
    }
    let left = c.def.speed * pace * paceOf(c) * (1 - c.slow) * dt;
    const r = walkRadius(c.def);
    for (let n = 0; left > 1e-4 && c.pi < c.path.length && n < 8; n++) {
      const p = c.path[c.pi], dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < 1e-3) { c.pi++; continue; }
      const k = Math.min(1, left / d);
      left -= d * k;
      // Along the walls, never through them; stuck, it looks for another way.
      let to = this.ground.slide(c.x, c.y, c.z, dx * k, dz * k, r);
      if (!to) { c.pi = c.path.length; c.repath = 0; c.balked = STUCK.balk; return false; }
      // Another body in the way (the hero, one of its own, one of another band): round it, else it waits.
      if (this.pressesOn(c, to.x, to.z)) {
        // Jostled in a crowd it is not stuck (no leap over the others).
        this.waiting.add(c);
        to = this.round(c, dx * k, dz * k, r);
        if (!to) { c.dir = Math.atan2(dz, dx); c.act = 'stand'; return true; }
      }
      c.dir = Math.atan2(dz, dx);
      // Made good towards the point (sliding along a river bank, away from it, is not getting anywhere).
      c.made += ((to.x - c.x) * dx + (to.z - c.z) * dz) / d;
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

  /**
   * Is it getting anywhere? Wanting to move (walking, or balked a moment ago) and not a metre on in STUCK.time, it
   * hops free: a short, seen leap to ground it can walk on (never a jump cut, CLAUDE.md rule 11).
   */
  private progress(c: Creature, dt: number): void {
    if (c.state === 'dead') return;
    if (c.made >= PROGRESS) { c.made = 0; c.pushing = 0; return; }
    c.balked = Math.max(0, c.balked - dt);
    if ((c.wants && !this.waiting.has(c)) || c.balked > 0) c.pushing += dt;
    else c.pushing = Math.max(0, c.pushing - dt * 0.25);
    if (c.pushing < STUCK.time || c.hopIn > 0 || c.stagger > 0 || c.windup > 0 || !this.ground.hop) return;
    const goal = c.path.length ? c.path[c.path.length - 1] : c.state === 'fight' ? c.seen : null;
    const to = this.ground.hop(c, goal, walkRadius(c.def));
    if (!to) { c.hopIn = HOP_EVERY.retry; return; }
    const len = Math.hypot(to.x - c.x, to.z - c.z);
    c.hop = { from: { x: c.x, y: c.y, z: c.z }, to, dur: 0.35 + len * 0.08, high: 0.3 + len * 0.12 + Math.max(0, to.y - c.y), t: 0 };
    c.hopIn = HOP_EVERY.gap;
    c.dir = Math.atan2(to.z - c.z, to.x - c.x);
    c.act = 'leap';
  }

  /** In the air: an arc from where it was to where it lands; there it walks on (a new way, from the new spot). */
  private hopping(c: Creature, dt: number): void {
    const h = c.hop!;
    h.t = Math.min(h.dur, h.t + dt);
    const k = h.t / h.dur;
    c.x = h.from.x + (h.to.x - h.from.x) * k;
    c.z = h.from.z + (h.to.z - h.from.z) * k;
    c.y = h.from.y + (h.to.y - h.from.y) * k + 4 * h.high * k * (1 - k);
    c.act = 'leap';
    if (k < 1) return;
    c.hop = null;
    c.y = this.ground.floorAt(c.x, c.z, h.to.y + 0.6) ?? h.to.y;
    c.made = 0;
    c.pushing = 0;
    c.balked = 0;
    c.path = [];
    c.pi = 0;
    c.repath = 0;
    c.until = 0;
    c.act = 'stand';
  }

  /**
   * Would it press into another living body at (x, z): come nearer one it overlaps there? (Moving apart, or
   * past, is always let.) The hero counts unless one of them is a small critter.
   */
  private pressesOn(c: Creature, x: number, z: number): boolean {
    const r = radiusOf(c.def);
    const into = (ox: number, oy: number, oz: number, or: number) => {
      if (Math.abs(oy - c.y) > ABOVE) return false;
      const d = Math.hypot(ox - x, oz - z);
      return d < r + or && d < Math.hypot(ox - c.x, oz - c.z) - 1e-4;
    };
    const q = this.quarry;
    if (q?.alive && blocksHero(c.def) && into(q.x, q.y, q.z, HERO_R)) return true;
    for (const den of [this, ...this.neighbours]) {
      for (const o of den.creatures) if (o !== c && o.state !== 'dead' && !o.hop && into(o.x, o.y, o.z, radiusOf(o.def))) return true;
    }
    return false;
  }

  /** A step round a body in its way: turned a little, then more, up to along it (past square: never into it), its own side first (seeded by who it is). */
  private round(c: Creature, sx: number, sz: number, r: number): { x: number; z: number } | null {
    const side = c.id % 2 ? 1 : -1;
    for (const t of [0.7, -0.7, 1.4, -1.4, 1.65, -1.65]) {
      const a = t * side, cs = Math.cos(a), sn = Math.sin(a);
      const to = this.ground.slide(c.x, c.y, c.z, sx * cs - sz * sn, sx * sn + sz * cs, r);
      if (to && !this.pressesOn(c, to.x, to.z)) return to;
    }
    return null;
  }

  /**
   * Does a body of radius `r` at (x, z), feet at `y`, press into one of the den that blocks the hero? One it
   * already touches where it stands now, (ax, az), lets it go (never stuck in another).
   */
  pressedBy(x: number, y: number, z: number, r: number, ax: number, az: number, bigger = 0): boolean {
    for (const c of this.creatures) {
      if (c.state === 'dead' || c.hop || !blocksHero(c.def) || Math.abs(c.y - y) > ABOVE || radiusOf(c.def) < bigger) continue;
      const min = r + radiusOf(c.def);
      if (Math.hypot(c.x - x, c.z - z) < min && Math.hypot(c.x - ax, c.z - az) >= min) return true;
    }
    return false;
  }

  /** Bodies keep apart (a few at most share a room, so all pairs are cheap). */
  private spread(): void {
    const live = this.creatures.filter((c) => c.state !== 'dead' && !c.hop);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) apart(this, live[a], this, live[b]);
  }

  /** Pushed by (dx, dz), if there is room there (bodies apart: never into a wall). */
  nudge(c: Creature, dx: number, dz: number): void {
    const x = c.x + dx, z = c.z + dz;
    if (this.ground.clearance(x, c.y, z) > walkRadius(c.def) * 0.5) { c.x = x; c.z = z; }
  }
}

/** Two bodies that overlap are pushed apart, each half the way (one that cannot move leaves the other the rest). */
function apart(da: Den, A: Creature, db: Den, B: Creature): void {
  let dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
  const min = radiusOf(A.def) + radiusOf(B.def);
  if (d >= min || Math.abs(A.y - B.y) > 1) return;
  // On the very same spot: apart along a way of their own (seeded by who they are, never random).
  if (d < 1e-4) { const a = (A.id * 2.399 + B.id * 1.13) % (Math.PI * 2); dx = Math.cos(a); dz = Math.sin(a); d = 1; }
  const ux = dx / d, uz = dz / d, push = (min - Math.min(d, min)) / 2;
  const ax = A.x, az = A.z;
  da.nudge(A, -ux * push, -uz * push);
  const stuck = A.x === ax && A.z === az;
  db.nudge(B, ux * push * (stuck ? 2 : 1), uz * push * (stuck ? 2 : 1));
}

/**
 * Bodies of different dens on the same ground (the wild's groups, a hold's wardens: all in the world's frame)
 * keep apart too, as those of one den do.
 */
export function keepApart(dens: readonly Den[]): void {
  for (let i = 0; i < dens.length; i++) for (let j = i + 1; j < dens.length; j++) {
    for (const A of dens[i].creatures) {
      if (A.state === 'dead' || A.hop) continue;
      for (const B of dens[j].creatures) if (B.state !== 'dead' && !B.hop) apart(dens[i], A, dens[j], B);
    }
  }
}

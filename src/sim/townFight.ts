/**
 * Townsfolk take part (D65, R6): when raiders come into a town its watch comes first, able grown-ups join against weak foes with what they
 * hold, and everyone else awake runs for their door and stays in. The fighters are the town's own people: their bodies are shadow
 * creatures of a den of their own (the watch and the folk in `watchman` and `townsman` stats), stepped with the raiders' dens so the
 * brawl rules of sim/creatures.ts decide the fight, and the people (agents) are placed where their bodies stand, showing a blow, a
 * walk or a fall. Nobody of the town dies of a raid: a body that falls to a raider's blow is knocked down (the den's mercy), lies,
 * and gets up; once the raiders are gone the standing tend the fallen (walk over, kneel a while) and everyone goes back to their day.
 * The hero is no part of it (the den is at peace). Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { Den, type Creature, type DenEvent, type Prey, type Quarry } from './creatures';
import { opposed } from './factions';
import type { Agent, TownLife } from './townLife';
import { OpenGround, type Land } from './wild';

/** Where the town is: its middle and the radius it spans, metres. */
export interface TownSite {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Raiders count as in town this far outside its radius, metres. */
const REACH = 40;
/** Folk this near a raider run for their doors, metres. */
const HIDE = 90;
/** Able folk join only against raiders of no more than this much danger together (a pack of wolves, a band of goblins). */
const WEAK = 26;
/** Grown-ups of these ages (years) take up arms when the foes are weak. */
const ABLE = { from: 18, to: 55 } as const;
/** A tender kneels this long (s) at the fallen one, once within this near (m). */
const TEND = { for: 5, near: 1.6 } as const;
/** The watch's faction: the people's allies, hostile to every lawless kind (classic/factions.ts). */
const SIDE = 'watch';

export type TownFightEvent =
  | DenEvent
  /** The watch and the able folk are called out; `foes` the raiders. */
  | { readonly kind: 'muster'; readonly watch: readonly Agent[]; readonly able: readonly Agent[]; readonly foes: readonly Creature[] }
  /** The raiders are gone or beaten and the town goes back to its day. */
  | { readonly kind: 'clear' };

type Phase = 'calm' | 'fray' | 'tend';

export class TownFight {
  phase: Phase = 'calm';
  /** The bodies of the town's fighters while there are any. */
  den: Den | null = null;
  /** Each fighter's person. */
  private readonly sides = new Map<Creature, Agent>();
  /** Tenders at their fallen: the fallen, and seconds spent. */
  private readonly tenders = new Map<Creature, { fallen: Creature; spent: number }>();
  private musters = 0;

  constructor(
    private readonly life: TownLife,
    private readonly site: TownSite,
    private readonly setting: Pick<SettingModule, 'creatures' | 'factions'>,
    private readonly land: Land,
    private readonly seed: number,
  ) {}

  /** The fighters' bodies (none when calm). */
  get fighters(): Creature[] { return [...this.sides.keys()]; }

  /** Those of the raiders' `dens` that are at feud with the town and within its reach, with their dens. */
  foes(dens: readonly Den[]): Prey[] {
    const out: Prey[] = [], r = this.site.radius + REACH;
    for (const den of dens) for (const c of den.creatures) {
      if (c.state === 'dead' || c.state === 'meek' || c.state === 'down' || Math.hypot(c.x - this.site.x, c.z - this.site.z) > r) continue;
      if (opposed(this.setting, c.def.faction, SIDE)) out.push({ c, den });
    }
    return out;
  }

  /** One step. `dens`: every den on the town's ground that may hold raiders; `hero`: where the hero is (the town's fight does not mind them). */
  raidStep(dt: number, dens: readonly Den[], hero: Quarry): TownFightEvent[] {
    const foes = this.foes(dens), out: TownFightEvent[] = [];
    if (this.phase === 'calm') {
      if (foes.length) out.push(...this.muster(foes));
      return out;
    }
    const den = this.den!;
    // Beside every den that holds raiders, so each sees the other's bodies.
    den.neighbours = dens.filter((d) => d !== den);
    this.sendIndoors(foes);
    if (foes.length && this.phase === 'tend') this.phase = 'fray';
    if (this.phase === 'fray') {
      if (!foes.length) this.phase = 'tend';
      else this.sendAtFoes(foes);
    }
    out.push(...den.step(dt, hero));
    if (this.phase === 'tend') out.push(...this.lookAfter(dt));
    this.placeFolk();
    return out;
  }

  /** The watch comes first; able folk join against weak foes, the nearest to the raiders first, as many as the raiders are twice over. */
  private muster(foes: readonly Prey[]): TownFightEvent[] {
    const danger = foes.reduce((a, f) => a + f.c.def.danger, 0), near = (a: Agent) => Math.min(...foes.map((f) => Math.hypot(f.c.x - a.x, f.c.z - a.z)));
    const free = this.life.agents.filter((a) => !a.post && !a.held && a.act !== 'away' && !this.life.isKept(a.person.id) && !this.life.missing.has(a.person.id));
    const watch = free.filter((a) => a.person.watch).sort((a, b) => near(a) - near(b));
    const able = danger > WEAK ? [] : free.filter((a) => !a.person.watch && a.person.role !== 'child' && a.person.role !== 'traveller' && a.person.age >= ABLE.from && a.person.age <= ABLE.to)
      .sort((a, b) => near(a) - near(b)).slice(0, Math.max(0, foes.length * 2 - watch.length));
    const who = [...watch, ...able];
    if (!who.length) return [];
    const spawns = who.map((a) => ({ creature: a.person.watch ? 'watchman' : 'townsman', room: 0 }));
    const den = new Den(new OpenGround(this.land, [{ x: this.site.x, z: this.site.z, r: this.site.radius }]), spawns, this.setting.creatures, deriveSeed(this.seed, 'fray', this.musters++));
    den.peace = true;
    den.mercy = () => true;
    den.feud = (a, b) => opposed(this.setting, a, b);
    who.forEach((a, i) => {
      const c = den.creatures[i];
      Object.assign(c, { x: a.x, z: a.z, y: this.land.height(a.x, a.z), dir: a.dir });
      this.sides.set(c, a);
      this.life.muster(a);
    });
    this.den = den;
    this.phase = 'fray';
    return [{ kind: 'muster', watch, able, foes: foes.map((f) => f.c) }];
  }

  /** Everyone else awake and near a raider runs for their door (and stays in till it is over). */
  private sendIndoors(foes: readonly Prey[]): void {
    for (const a of this.life.agents) {
      if (a.post || a.held || a.act === 'away' || this.life.alarmed.has(a.person.id)) continue;
      if (foes.some((f) => Math.hypot(f.c.x - a.x, f.c.z - a.z) < HIDE)) this.life.alarmed.add(a.person.id);
    }
  }

  /** Every fighter who stands goes for the nearest raider, seen or not. */
  private sendAtFoes(foes: readonly Prey[]): void {
    for (const c of this.sides.keys()) {
      if (c.state === 'brawl' && c.prey && c.prey.c.state !== 'dead' && c.prey.c.state !== 'down') continue;
      if (c.state !== 'idle' && c.state !== 'alert' && c.state !== 'brawl') continue;
      const nearest = foes.reduce((a, b) => (Math.hypot(b.c.x - c.x, b.c.z - c.z) < Math.hypot(a.c.x - c.x, a.c.z - c.z) ? b : a));
      this.den!.engage(c, nearest);
    }
  }

  /** The raiders are gone: a standing fighter tends each who lies, the rest wait; when all are up everyone goes back to their day. */
  private lookAfter(dt: number): TownFightEvent[] {
    const den = this.den!, fallen: Creature[] = [], standing: Creature[] = [];
    for (const c of this.sides.keys()) { if (c.state === 'down') fallen.push(c); else if (c.state === 'idle') standing.push(c); }
    for (const c of standing) c.until = 9; // they stand and wait (no wandering the town)
    for (const [t, job] of this.tenders) {
      if (job.fallen.state !== 'down' || t.state !== 'idle') { this.tenders.delete(t); continue; }
      if (Math.hypot(job.fallen.x - t.x, job.fallen.z - t.z) < TEND.near) {
        t.act = 'stand';
        t.path = [];
        job.spent += dt;
        if (job.spent >= TEND.for) { den.tend(job.fallen, 0); this.tenders.delete(t); }
      }
    }
    const taken = new Set([...this.tenders.values()].map((j) => j.fallen));
    for (const f of fallen) {
      if (taken.has(f)) continue;
      const t = standing.filter((s) => !this.tenders.has(s)).sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))[0];
      if (!t) continue;
      this.tenders.set(t, { fallen: f, spent: 0 });
      den.sendTo(t, { x: f.x + 0.9, y: f.y, z: f.z });
    }
    if (fallen.length) return [];
    this.disband();
    return [{ kind: 'clear' }];
  }

  private disband(): void {
    for (const a of this.sides.values()) this.life.disband(a);
    this.sides.clear();
    this.tenders.clear();
    this.life.alarmed.clear();
    this.den = null;
    this.phase = 'calm';
  }

  /** Each person stands where their body does, doing what it does. */
  private placeFolk(): void {
    for (const [c, a] of this.sides) {
      a.x = c.x;
      a.z = c.z;
      a.hidden = false;
      if (c.state === 'brawl' || c.state === 'fight') a.dir = c.dir;
      else if (c.act === 'walk' || c.act === 'run') a.dir = c.dir;
      a.act = c.state === 'down' ? 'hurt'
        : c.act === 'walk' || c.act === 'run' ? 'walk'
        : c.state === 'brawl' && (c.act === 'swing' || c.act === 'stand' || c.windup > 0) ? 'fight'
        : this.tenders.has(c) && this.tenders.get(c)!.spent > 0 ? 'tend'
        : 'wait';
      a.next = a.act;
    }
  }
}

/**
 * The hero's side of a fight (plan 11.2, D13): a target picked with Tab (hostile ones in front, nearest
 * and most threatening first) or by clicking, a blow again and again while attacking, abilities on the
 * belt with their stamina and cooldowns, the den's blows taken, skills used (D30), the fallen searched.
 * The den (sim/creatures.ts) moves and decides for the creatures; this decides for the hero. Positions
 * are the dungeon's own frame. Pure: the game turns the events into notes, sounds and the HUD.
 */
import { Rng, angleDiff, deriveSeed } from '@futuremagic/core';
import type { AbilityDef, SettingModule } from '../setting/contract';
import { strike, threatOf, type Strike, type Threat } from '../sim/combat';
import { radiusOf, type Creature, type Den, type DenEvent, type Quarry } from '../sim/creatures';
import type { Character, SkillUp } from './character';
import { defOf, rollLoot, type Item, type Loot } from './items';
import { WEAR, type WearState } from './upkeep';

export interface HeroPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Walker yaw (0 faces −z, π/2 faces −x). */
  readonly yaw: number;
  /** m/s over the ground. */
  readonly speed: number;
}

export type FightEvent =
  | { readonly kind: 'struck'; readonly who: Creature; readonly strike: Strike; readonly ability: string }
  | { readonly kind: 'hurt'; readonly by: Creature; readonly strike: Strike }
  | { readonly kind: 'swing'; readonly who: Creature }
  | { readonly kind: 'notice'; readonly who: Creature }
  | { readonly kind: 'killed'; readonly who: Creature; readonly loot: Loot }
  | { readonly kind: 'flee'; readonly who: Creature }
  | { readonly kind: 'plea'; readonly who: Creature; readonly text: string }
  | { readonly kind: 'spared'; readonly who: Creature }
  | { readonly kind: 'skill'; readonly up: SkillUp }
  | { readonly kind: 'heal'; readonly amount: number }
  | { readonly kind: 'fallen' }
  /** Something worn looks different now (worn, battered, broken): the smith can mend it. */
  | { readonly kind: 'worn'; readonly item: Item; readonly state: WearState }
  | { readonly kind: 'refused'; readonly text: string };

/** Hero body radius, metres. */
const HERO_R = 0.35;
/** The hero must face the target within this to strike (radians). */
const FACING = 1.25;
/** Tab looks this far, metres. */
const TAB_RANGE = 22;

/** The hero's facing as an xz direction angle (atan2(dz, dx)) from the walker's yaw. */
export const yawToDir = (yaw: number): number => Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

export class Fight {
  target: Creature | null = null;
  /** Swinging again and again at the target (Strike toggles it). */
  attacking = false;
  private swing = 0;
  private readonly cooldown = new Map<string, number>();
  /** An ability waiting for the next swing. */
  private queued: AbilityDef | null = null;
  private readonly rng: Rng;
  /** Loot of the fallen not yet taken, by creature id. */
  readonly bodies = new Map<number, Loot>();
  /** Seconds since the last blow either way. */
  quiet = 99;
  /** Seconds the hero has stood still. */
  private still = 0;

  /** `light`: how far off the hero is seen, metres (the lantern below; daylight out on the land). */
  constructor(readonly hero: Character, readonly den: Den, private readonly setting: SettingModule, seed: number, public light = 9) {
    this.rng = new Rng(deriveSeed(seed, 'fight'));
  }

  /** The den's view of the hero now. */
  quarry(p: HeroPose): Quarry {
    const stealth = this.hero.skill('stealth');
    const moving = p.speed > 3.5 ? 1 : p.speed > 0.5 ? 0.4 : 0.08;
    const noise = Math.max(this.quiet < 3 ? 1 : 0, moving * (1 - stealth / 160));
    return { x: p.x, y: p.y, z: p.z, noise, light: this.light, alive: this.hero.alive, guard: this.hero.guard(this.hero.stamina <= 0) };
  }

  /** Threat of a creature against the hero (the target frame's ward). */
  threat(c: Creature): Threat { return threatOf(c.def.danger, this.hero.power); }

  /** Seconds before an ability can be used again (0: ready). */
  cooling(id: string): number { return this.cooldown.get(id) ?? 0; }

  /** Seconds left of the current swing (0: the next blow can start). */
  get swingLeft(): number { return this.swing; }

  /**
   * Tab: the next hostile creature in front, nearest and most threatening first; again goes on to the
   * next. Null if there is none in sight.
   */
  tab(p: HeroPose): Creature | null {
    const face = yawToDir(p.yaw);
    const live = this.den.alive.filter((c) => {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      return d < TAB_RANGE && Math.abs(c.y - p.y) < 3 && Math.abs(angleDiff(Math.atan2(c.z - p.z, c.x - p.x), face)) < 1.4 && this.den.ground.sees(p.x, p.y, p.z, c.x, c.y, c.z, 1.1);
    });
    const score = (c: Creature) => Math.hypot(c.x - p.x, c.z - p.z) - (c.state === 'fight' ? 6 : 0) - c.def.danger * 0.1 + (c.state === 'meek' || c.state === 'beg' ? 30 : 0);
    live.sort((a, b) => score(a) - score(b));
    if (!live.length) { this.target = null; return null; }
    const i = this.target ? live.indexOf(this.target) : -1;
    this.target = live[(i + 1) % live.length];
    return this.target;
  }

  /** Click on a creature. */
  pick(c: Creature | null): void {
    if (c !== this.target) this.attacking = false;
    this.target = c && c.state !== 'dead' ? c : null;
  }

  /** Use an ability from the belt; a line why not if it cannot be used now. */
  use(id: string): string | null {
    const a = this.setting.abilities.find((x) => x.id === id);
    if (!a) return 'No such ability.';
    if (this.cooling(id) > 0) return `${a.name} is not ready yet.`;
    if (this.hero.stamina < a.stamina) return 'You are out of breath.';
    if (a.effect === 'heal') {
      this.hero.stamina -= a.stamina;
      this.cooldown.set(id, a.cooldown);
      const before = this.hero.health;
      this.hero.health = Math.min(this.hero.maxHealth, this.hero.health + this.hero.maxHealth * 0.2);
      this.pending.push({ kind: 'heal', amount: Math.round(this.hero.health - before) });
      return null;
    }
    if (!this.target || this.target.state === 'dead') return 'You have no target.';
    if (a.id === 'strike') { this.attacking = !this.attacking; return null; }
    this.queued = a;
    this.attacking = true;
    return null;
  }

  /** Drink the best potion in the pack. */
  drink(): string | null {
    const r = this.hero.remedy;
    if (!r) return 'You have nothing to drink.';
    const got = this.hero.consume(r);
    this.pending.push({ kind: 'heal', amount: got });
    return null;
  }

  private readonly pending: FightEvent[] = [];

  /** What a fallen creature carries (rolled from its own seed, so a loaded game finds the same), left on its body. */
  restoreBody(c: Creature): Loot {
    const loot = c.def.loot ? rollLoot(this.setting.items, c.def.loot, c.def.danger, new Rng(deriveSeed(this.rng.seed, 'body', c.id))) : { items: [], coins: 0 };
    if (loot.items.length || loot.coins) this.bodies.set(c.id, loot);
    return loot;
  }

  /** Take what a fallen creature carried (null if nothing is left on it). */
  search(c: Creature): Loot | null {
    const l = this.bodies.get(c.id);
    if (!l) return null;
    this.bodies.delete(c.id);
    return l;
  }

  /** `breathe`: the hero recovers here (false for a second fight at once: one recovery a frame). */
  advance(dt: number, p: HeroPose, breathe = true): FightEvent[] {
    const out: FightEvent[] = this.pending.splice(0);
    const hero = this.hero;
    this.quiet += dt;
    this.swing = Math.max(0, this.swing - dt);
    for (const [k, v] of this.cooldown) this.cooldown.set(k, Math.max(0, v - dt));
    for (const e of this.den.step(dt, this.quarry(p))) this.denEvent(e, out);
    const t = this.target;
    if (t && t.state === 'dead') { this.target = null; this.attacking = false; }
    if (hero.alive && this.attacking && this.target && this.swing === 0) this.blow(this.target, p, out);
    this.still = p.speed < 0.3 ? this.still + dt : 0;
    if (breathe) hero.recover(dt, this.den.fighting.length > 0 || this.quiet < 6, this.still);
    return out;
  }

  private blow(t: Creature, p: HeroPose, out: FightEvent[]): void {
    const w = this.hero.weapon;
    const d = Math.hypot(t.x - p.x, t.z - p.z), reach = w.reach + radiusOf(t.def) + HERO_R + 0.15;
    if (d > reach || Math.abs(t.y - p.y) > 1.3) return;
    if (Math.abs(angleDiff(Math.atan2(t.z - p.z, t.x - p.x), yawToDir(p.yaw))) > FACING) return;
    const a = this.queued ?? this.setting.abilities.find((x) => x.id === 'strike')!;
    this.queued = null;
    if (a.stamina) { this.hero.stamina -= a.stamina; this.cooldown.set(a.id, a.cooldown); }
    this.swing = w.time * (a.power > 1.5 ? 1.25 : 1);
    this.quiet = 0;
    const s = strike(this.hero.blow(a), this.den.guardOf(t), this.rng);
    out.push({ kind: 'struck', who: t, strike: s, ability: a.id });
    this.wearOut('main', WEAR.blow * (s.outcome === 'miss' ? 1 / 3 : 1), out);
    this.train(w.skill, t.def.danger, s.outcome === 'miss' ? 0.5 : 1, out);
    for (const e of this.den.wound(t, s, p, a.effect === 'stagger' ? 1.6 : 0)) this.denEvent(e, out);
  }

  private denEvent(e: DenEvent, out: FightEvent[]): void {
    const hero = this.hero;
    switch (e.kind) {
      case 'blow': {
        this.quiet = 0;
        const s = e.strike;
        hero.health = Math.max(0, hero.health - s.damage);
        out.push({ kind: 'hurt', by: e.who, strike: s });
        // Blows taken wear the armour; a blow stopped, the shield.
        if (s.outcome === 'block') this.wearOut('off', WEAR.block, out);
        else if (s.outcome !== 'miss') {
          for (const [slot, it] of Object.entries(hero.worn)) if (it && defOf(this.setting.items, it.def).kind === 'armour') this.wearOut(slot as keyof typeof hero.worn, WEAR.hit, out);
        }
        // Dodging a blow trains dodging; a block, the shield; taking one, the armour.
        if (s.outcome === 'miss') this.train('dodge', e.who.def.danger, 1, out);
        else if (s.outcome === 'block') this.train('shields', e.who.def.danger, 1, out);
        else if (hero.armour > 0) this.train('armour', e.who.def.danger, 0.7, out);
        if (!hero.alive) { this.attacking = false; out.push({ kind: 'fallen' }); }
        break;
      }
      case 'swing': out.push({ kind: 'swing', who: e.who }); break;
      case 'notice': out.push({ kind: 'notice', who: e.who }); break;
      case 'flee': out.push({ kind: 'flee', who: e.who }); break;
      case 'plea': out.push({ kind: 'plea', who: e.who, text: e.text }); break;
      case 'spared': out.push({ kind: 'spared', who: e.who }); break;
      case 'died': out.push({ kind: 'killed', who: e.who, loot: this.restoreBody(e.who) }); break;
      default: break;
    }
  }

  private wearOut(slot: keyof Character['worn'], amount: number, out: FightEvent[]): void {
    const w = this.hero.wear(slot, amount);
    if (w) out.push({ kind: 'worn', item: w.item, state: w.state });
  }

  private train(skill: string, challenge: number, amount: number, out: FightEvent[]): void {
    const up = this.hero.practise(skill, challenge, amount);
    if (up) out.push({ kind: 'skill', up });
  }
}

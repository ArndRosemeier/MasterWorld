/**
 * The hero's side of a fight (plan 11.2, D13): a target picked with Tab (hostile ones in front, nearest
 * and most threatening first) or by clicking, a blow again and again while attacking, abilities on the
 * belt with their stamina and cooldowns, the den's blows taken, skills used (D30), the fallen searched.
 * The den (sim/creatures.ts) moves and decides for the creatures; this decides for the hero. Positions
 * are the dungeon's own frame. Pure: the game turns the events into notes, sounds and the HUD.
 */
import { Rng, angleDiff, deriveSeed } from '@futuremagic/core';
import { abilityOf, type AbilityDef, type DamageKind, type SettingModule } from '../setting/contract';
import { strike, threatOf, type Blow, type Strike, type Threat } from '../sim/combat';
import { radiusOf, type Creature, type Den, type DenEvent, type Quarry } from '../sim/creatures';
import type { Character } from './character';
import { defOf, rollLoot, type Item, type Loot } from './items';
import { blowOf, mendCaster, Recipes, SELF, type Mark, type RecipeEvent, type RecipeWorld, type TerrainEdit } from './recipe';
import { WEAR, type WearState } from './upkeep';
import { dauntsFrom, fightXp } from './growth';

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
  /** The hero's blow (or spell: `spell`) landed on a creature. */
  | { readonly kind: 'struck'; readonly who: Creature; readonly strike: Strike; readonly ability: string; readonly spell?: boolean }
  | { readonly kind: 'hurt'; readonly by: Creature; readonly strike: Strike }
  | { readonly kind: 'swing'; readonly who: Creature }
  | { readonly kind: 'notice'; readonly who: Creature }
  | { readonly kind: 'killed'; readonly who: Creature; readonly loot: Loot; readonly xp: number }
  | { readonly kind: 'flee'; readonly who: Creature }
  | { readonly kind: 'plea'; readonly who: Creature; readonly text: string }
  | { readonly kind: 'spared'; readonly who: Creature }
  | { readonly kind: 'heal'; readonly amount: number }
  | { readonly kind: 'fallen' }
  /** Something worn looks different now (worn, battered, broken): the smith can mend it. */
  | { readonly kind: 'worn'; readonly item: Item; readonly state: WearState }
  | { readonly kind: 'refused'; readonly text: string }
  /** What the hero's abilities did (casts, things loosed, areas, effects): for the eye and the ear. */
  | { readonly kind: 'recipe'; readonly event: RecipeEvent };

/** Hero body radius, metres. */
const HERO_R = 0.35;
/** The hero must face the target within this to strike (radians). */
const FACING = 1.25;
/** Tab looks this far, metres. */
const TAB_RANGE = 22;

/** The hero's facing as an xz direction angle (atan2(dz, dx)) from the walker's yaw. */
export const yawToDir = (yaw: number): number => Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

export class Fight implements RecipeWorld {
  target: Creature | null = null;
  /** Swinging again and again at the target (Strike toggles it). */
  attacking = false;
  private swing = 0;
  /** The hero's abilities: costs, cooldowns, casts and what they set going (game/recipe.ts). */
  readonly recipes: Recipes;
  /** Where the hero stood at the last step. */
  private at: HeroPose = { x: 0, y: 0, z: 0, yaw: 0, speed: 0 };
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
    this.recipes = new Recipes(hero, this, setting.effects ?? [], deriveSeed(seed, 'recipes'));
  }

  /** The den's view of the hero now. */
  quarry(p: HeroPose): Quarry {
    const stealth = this.hero.skill('stealth');
    const moving = p.speed > 3.5 ? 1 : p.speed > 0.5 ? 0.4 : 0.08;
    // Veiled in shadow, the hero is heard and seen less.
    const veil = 1 - this.recipes.veilOf(SELF);
    const noise = Math.max(this.quiet < 3 ? 1 : 0, moving * (1 - stealth / 160)) * veil;
    const g = this.hero.guard(this.hero.stamina <= 0 || this.recipes.isHeld(SELF));
    // Foes the hero has outgrown so far they give no experience dare not start a fight (D58).
    return { x: p.x, y: p.y, z: p.z, noise, light: this.light * veil, alive: this.hero.alive, guard: { ...g, armour: g.armour + this.recipes.wardOf(SELF) }, daunts: dauntsFrom(this.setting.growth, this.hero.level) };
  }

  /**
   * Threat of a creature against the hero (the target frame's ward): with all who fight the hero beside it,
   * so one wolf of a pack that surrounds the hero is read as the pack. `together` when others count.
   */
  threat(c: Creature): { readonly threat: Threat; readonly together: boolean } {
    const others = this.den.fighting.filter((o) => o !== c);
    const danger = c.def.danger + others.reduce((a, o) => a + o.def.danger, 0);
    return { threat: threatOf(danger, this.hero.power), together: others.length > 0 };
  }

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

  /** Use an ability from the action bar; a line why not if it cannot be used now. */
  use(id: string): string | null {
    const a = abilityOf(this.setting, id);
    if (!a) return 'No such ability.';
    const target = this.target && this.target.state !== 'dead' ? this.target.id : null;
    const b = blowOf(a);
    // Spells and the like: the recipe runner casts them.
    if (!b) return this.recipes.begin(a, target, this.at);
    const why = this.recipes.check(a, target, this.at);
    if (why) return why;
    if (b.again) { this.attacking = !this.attacking; return null; }
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

  /** The experience a fallen foe gives the hero (D58), given now. */
  private earnFrom(c: Creature): number {
    const xp = fightXp(this.setting.growth, c.def.danger, this.hero.level);
    this.hero.gain(xp);
    return xp;
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
    const hero = this.hero, out = this.pending;
    this.at = p;
    this.quiet += dt;
    this.swing = Math.max(0, this.swing - dt);
    // Spells on the den: slowed, held fast.
    for (const c of this.den.alive) {
      c.slow = this.recipes.slowOf(c.id);
      c.stagger = Math.max(c.stagger, this.recipes.heldFor(c.id));
      if (this.recipes.afraid(c.id)) for (const e of this.den.frighten(c)) this.denEvent(e, out);
    }
    for (const e of this.den.step(dt, this.quarry(p))) this.denEvent(e, out);
    for (const e of this.recipes.elapse(dt, p, p.speed, breathe)) this.recipeEvent(e, out);
    const t = this.target;
    if (t && t.state === 'dead') { this.target = null; this.attacking = false; }
    if (hero.alive && this.attacking && this.target && this.swing === 0 && !this.recipes.isHeld(SELF) && !this.recipes.casting) this.blow(this.target, p, out);
    this.still = p.speed < 0.3 ? this.still + dt : 0;
    if (breathe) hero.recover(dt, this.den.fighting.length > 0 || this.quiet < 6, this.still);
    return out.splice(0);
  }

  // The recipe runner's world (game/recipe.ts): the hero and the den.

  marks(): readonly Mark[] {
    const p = this.at, out: Mark[] = this.hero.alive ? [{ id: SELF, x: p.x, y: p.y, z: p.z, radius: HERO_R, foe: false }] : [];
    for (const c of this.den.alive) out.push({ id: c.id, x: c.x, y: c.y, z: c.z, radius: radiusOf(c.def), foe: true });
    return out;
  }

  hit(id: number, blow: Blow, ability: AbilityDef): void {
    this.quiet = 0;
    if (id === SELF) { this.hurtHero(strike(blow, this.hero.guard(), this.rng).damage); return; }
    const c = this.creature(id);
    if (!c) return;
    const s = strike(blow, this.den.guardOf(c), this.rng);
    this.pending.push({ kind: 'struck', who: c, strike: s, ability: ability.id, spell: true });
    for (const e of this.den.wound(c, s, this.at)) this.denEvent(e, this.pending);
  }

  harm(id: number, amount: number, _kind: DamageKind): void {
    if (id === SELF) { this.hurtHero(amount); return; }
    const c = this.creature(id);
    if (c) for (const e of this.den.wound(c, { outcome: 'hit', damage: amount }, this.at, 0, false)) this.denEvent(e, this.pending);
  }

  heal(id: number, amount: number): number { return id === SELF ? mendCaster(this.hero, amount) : 0; }

  /** The land below does not change yet (geomancy builds on volumes, C2). */
  terrain(_edit: TerrainEdit): boolean { return false; }

  shape(): string | null { return 'Not while you fight.'; }

  clear(at: { x: number; y: number; z: number }): boolean {
    return this.den.ground.clearance(at.x, at.y - 0.5, at.z) > 0;
  }

  private creature(id: number): Creature | undefined { return this.den.alive.find((c) => c.id === id); }

  private hurtHero(amount: number): void {
    if (amount <= 0 || !this.hero.alive) return;
    this.hero.health = Math.max(0, this.hero.health - amount);
    if (!this.hero.alive) { this.attacking = false; this.pending.push({ kind: 'fallen' }); }
  }

  private recipeEvent(e: RecipeEvent, out: FightEvent[]): void {
    if (e.kind === 'healed' && e.on === SELF && !e.over) out.push({ kind: 'heal', amount: Math.round(e.amount) });
    else if (e.kind === 'refused' || e.kind === 'broken') out.push({ kind: 'refused', text: e.kind === 'broken' ? e.why : e.text });
    if (e.kind === 'went' || e.kind === 'cast') this.quiet = Math.min(this.quiet, 2);
    out.push({ kind: 'recipe', event: e });
  }

  /** How far from a creature's middle the hero's weapon still lands, metres. */
  reach(t: Creature): number {
    return this.hero.weapon.reach + radiusOf(t.def) + HERO_R + 0.15;
  }

  private blow(t: Creature, p: HeroPose, out: FightEvent[]): void {
    const w = this.hero.weapon;
    const d = Math.hypot(t.x - p.x, t.z - p.z), reach = this.reach(t);
    if (d > reach || Math.abs(t.y - p.y) > 1.3) return;
    if (Math.abs(angleDiff(Math.atan2(t.z - p.z, t.x - p.x), yawToDir(p.yaw))) > FACING) return;
    const a = this.queued ?? this.setting.abilities.find((x) => blowOf(x)?.again)!;
    const b = blowOf(a)!;
    this.queued = null;
    this.recipes.spend(a);
    this.swing = w.time * (b.power > 1.5 ? 1.25 : 1);
    this.quiet = 0;
    const s = strike(this.hero.blow(b), this.den.guardOf(t), this.rng);
    out.push({ kind: 'struck', who: t, strike: s, ability: a.id });
    this.wearOut('main', WEAR.blow * (s.outcome === 'miss' ? 1 / 3 : 1), out);
    for (const e of this.den.wound(t, s, p, b.stagger ?? 0)) this.denEvent(e, out);
    // The rest of its recipe (a bleeding cut…) follows a blow that landed.
    if (s.outcome !== 'miss' && a.ops.length > 1) this.recipes.playRest(a, t.id, p);
  }

  private denEvent(e: DenEvent, out: FightEvent[]): void {
    const hero = this.hero;
    switch (e.kind) {
      case 'blow': {
        this.quiet = 0;
        const s = e.strike;
        hero.health = Math.max(0, hero.health - s.damage);
        out.push({ kind: 'hurt', by: e.who, strike: s });
        // Struck with nothing picked: whoever struck is the target now (one picked stays).
        if (!this.target && hero.alive && e.who.state !== 'dead') this.target = e.who;
        // Blows taken wear the armour; a blow stopped, the shield.
        if (s.outcome === 'block') this.wearOut('off', WEAR.block, out);
        else if (s.outcome !== 'miss') {
          for (const [slot, it] of Object.entries(hero.worn)) if (it && defOf(this.setting.items, it.def).kind === 'armour') this.wearOut(slot as keyof typeof hero.worn, WEAR.hit, out);
        }
        if (!hero.alive) { this.attacking = false; out.push({ kind: 'fallen' }); }
        break;
      }
      case 'swing': out.push({ kind: 'swing', who: e.who }); break;
      case 'notice': out.push({ kind: 'notice', who: e.who }); break;
      case 'flee': out.push({ kind: 'flee', who: e.who }); break;
      case 'plea': out.push({ kind: 'plea', who: e.who, text: e.text }); break;
      case 'spared': out.push({ kind: 'spared', who: e.who }); break;
      // Experience for the foe (D58), weighed by its danger against the hero's level.
      case 'died': out.push({ kind: 'killed', who: e.who, loot: this.restoreBody(e.who), xp: this.earnFrom(e.who) }); break;
      default: break;
    }
  }

  private wearOut(slot: keyof Character['worn'], amount: number, out: FightEvent[]): void {
    const w = this.hero.wear(slot, amount);
    if (w) out.push({ kind: 'worn', item: w.item, state: w.state });
  }
}

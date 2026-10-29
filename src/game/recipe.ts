/**
 * The ability recipe runner (plan 10, C1), ported from Norgo's format: an ability is data (costs, cooldown,
 * cast time) and a recipe of steps (`AbilityOp`: projectile, area, zone, effect, heal, terrain, shape, delay,
 * look). This plays them: it checks and pays the costs, holds the cast while the caster stands, flies what was
 * loosed, keeps the lasting zones and delayed steps, and wears the status effects on everyone. The world it
 * plays in is a small interface (`RecipeWorld`), so the same recipes run in a fight below, out on the land and
 * in tests. Weapon blows are the fight's (game/fight.ts): it lands them on its swing and plays the rest of the
 * recipe here. Pure and seeded.
 */
import { Rng } from '@futuremagic/core';
import type { AbilityDef, AbilityOp, DamageKind, EffectApply, EffectDef, OpAnchor, OpWho, ShapeDef, TerrainShape } from '../setting/contract';
import type { Blow } from '../sim/combat';

/** The caster's own id among the marks. */
export const SELF = -1;
/** How far a foe-aimed ability reaches when it does not say (metres). */
export const SPELL_RANGE = 24;
/** Moving faster than this (m/s) breaks a cast. */
const STILL = 0.6;
/** Spells are harder to dodge than a blade; an area hardly at all. */
const SPELL_AIM = 0.25;
const AREA_AIM = 0.4;
/** Where a projectile leaves the caster, over the feet (metres). */
const CHEST = 1.3;

export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Someone a recipe can touch: the caster (SELF) or a creature. Positions are at the feet. */
export interface Mark extends Spot {
  readonly id: number;
  readonly radius: number;
  /** Hostile to the caster. */
  readonly foe: boolean;
}

/** Who pays for an ability and powers it (the hero's Character fits). */
export interface Caster {
  stamina: number;
  mana: number;
  health: number;
  readonly maxHealth: number;
  /** The caster's level (D58): an ability asks one before it can be used. */
  readonly level: number;
  /** How strongly an ability works for this caster (0..100: the hero's prowess, D59). */
  powerOf(def: AbilityDef): number;
  /** Cooldowns kept by the caster, shared by every runner it casts with (absent: the runner's own). */
  readonly cooldowns?: Map<string, number>;
  /** The caster's own status effects, kept by the caster the same way (absent: the runner's own). */
  readonly effectsOn?: Worn[];
}

/** Health back to the caster, up to its most; how much it took. */
export function mendCaster(c: Caster, amount: number): number {
  const before = c.health;
  c.health = Math.min(c.maxHealth, c.health + amount);
  return c.health - before;
}

/** The land reshaped by a terrain step, for the world to build where it can. */
export interface TerrainEdit extends Spot {
  readonly shape: TerrainShape;
  /** Facing across the land, radians (xz atan2): from the caster to the point. */
  readonly dir: number;
  readonly radius: number;
  readonly height?: number;
  readonly length?: number;
}

/** The world a recipe plays in. */
export interface RecipeWorld {
  /** Everyone a recipe may touch now, the caster (SELF) among them; the dead left out. */
  marks(): readonly Mark[];
  /** A rolled blow (a spell's damage) lands on someone; `ability` says what threw it (for training). */
  hit(id: number, blow: Blow, ability: AbilityDef): void;
  /** Sure damage (an effect wearing on someone). */
  harm(id: number, amount: number, kind: DamageKind): void;
  /** Health back; returns how much was healed. */
  heal(id: number, amount: number): number;
  /** Build the land's change; false when the ground does not take it here. */
  terrain(edit: TerrainEdit): boolean;
  /** A change of the caster's shape; a line why not, or null. */
  shape(op: ShapeDef, ability: AbilityDef): string | null;
  /** Open air at a point, nothing solid (absent: always). */
  clear?(at: Spot): boolean;
}

/** One cast as it plays: what, at whom, where, and the strength behind it (the caster's prowess). */
interface Play {
  readonly def: AbilityDef;
  readonly target: number | null;
  readonly point: Spot;
  readonly me: Spot;
  readonly power: number;
}

/** Something loosed and flying. */
export interface Shot {
  readonly n: number;
  readonly ability: AbilityDef;
  readonly look?: string;
  x: number;
  y: number;
  z: number;
  /** Where it flies when its target is gone. */
  aim: Spot;
  readonly target: number | null;
  /** Seconds left before it falls. */
  life: number;
  readonly op: Extract<AbilityOp, { op: 'projectile' }>;
  readonly play: Play;
}

/** A lasting place (a zone step). */
export interface Zone extends Spot {
  readonly n: number;
  readonly ability: AbilityDef;
  readonly radius: number;
  readonly look?: string;
  left: number;
  next: number;
  readonly op: Extract<AbilityOp, { op: 'zone' }>;
  readonly play: Play;
}

/** A status effect being worn. */
export interface Worn {
  readonly def: EffectDef;
  magnitude: number;
  left: number;
  /** Seconds to the next tick of damage or healing. */
  tick: number;
}

export type RecipeEvent =
  | { readonly kind: 'cast'; readonly ability: AbilityDef; readonly time: number }
  | { readonly kind: 'broken'; readonly ability: AbilityDef; readonly why: string }
  | { readonly kind: 'went'; readonly ability: AbilityDef }
  | { readonly kind: 'loosed'; readonly shot: Shot }
  | { readonly kind: 'landed'; readonly shot: Shot; readonly on: number | null }
  | { readonly kind: 'area'; readonly ability: AbilityDef; readonly at: Spot; readonly radius: number; readonly look?: string; readonly touched: readonly number[] }
  | { readonly kind: 'zone'; readonly zone: Zone; readonly ended: boolean }
  | { readonly kind: 'effect'; readonly on: number; readonly effect: EffectDef; readonly started: boolean }
  | { readonly kind: 'healed'; readonly on: number; readonly amount: number; readonly over: boolean }
  | { readonly kind: 'terrain'; readonly edit: TerrainEdit; readonly ok: boolean }
  | { readonly kind: 'look'; readonly ability: AbilityDef; readonly look: string; readonly at: Spot }
  | { readonly kind: 'refused'; readonly text: string };

/** The step that changes the caster's shape, if the ability is one (bird form). */
export function shapeOf(def: AbilityDef): ShapeDef | null {
  return (def.ops.find((o) => o.op === 'shape') as ShapeDef | undefined) ?? null;
}

/** The weapon blow an ability throws, if it is a weapon ability. */
export function blowOf(def: AbilityDef): Extract<AbilityOp, { op: 'blow' }> | null {
  return (def.ops.find((o) => o.op === 'blow') as Extract<AbilityOp, { op: 'blow' }> | undefined) ?? null;
}

/** Whether an ability is aimed at a foe (it says so, or a step needs a target). */
export function aimsAtFoe(def: AbilityDef): boolean {
  if (def.aim) return def.aim === 'foe';
  const needs = (ops: readonly AbilityOp[]): boolean =>
    ops.some((o) => o.op === 'blow' || o.op === 'projectile' || ('to' in o && o.to === 'target') || ('at' in o && o.at === 'target') || ('ops' in o && needs(o.ops)));
  return needs(def.ops);
}

/** A cost as the book shows it: "12 mana · 5 stamina". */
export function costText(def: AbilityDef): string {
  const c = def.cost ?? {};
  return [c.mana ? `${c.mana} mana` : '', c.stamina ? `${c.stamina} stamina` : '', c.health ? `${c.health} health` : ''].filter(Boolean).join(' · ');
}

const flat = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z);

export class Recipes {
  private readonly rng: Rng;
  private readonly cooldown: Map<string, number>;
  private readonly effectDefs: ReadonlyMap<string, EffectDef>;
  /** The cast under way (null: none). */
  casting: { readonly def: AbilityDef; readonly target: number | null; left: number } | null = null;
  readonly shots: Shot[] = [];
  readonly zones: Zone[] = [];
  private readonly later: { left: number; ops: readonly AbilityOp[]; play: Play }[] = [];
  /** Status effects the caster wears (shared with the caster's other runners). */
  private readonly mine: Worn[];
  /** Status effects on everyone else, by mark id (this runner's world only). */
  private readonly others = new Map<number, Worn[]>();
  private readonly pending: RecipeEvent[] = [];
  private serial = 0;

  constructor(readonly caster: Caster, readonly world: RecipeWorld, effects: readonly EffectDef[], seed: number) {
    this.rng = new Rng(seed);
    this.cooldown = caster.cooldowns ?? new Map();
    this.mine = caster.effectsOn ?? [];
    this.effectDefs = new Map(effects.map((e) => [e.id, e]));
  }

  /** Seconds before an ability can be used again (0: ready). */
  cooling(id: string): number { return this.cooldown.get(id) ?? 0; }

  /** Cast progress 0..1 (null: not casting). */
  get castShare(): number | null {
    const c = this.casting, t = c?.def.cast ?? 0;
    return c && t > 0 ? 1 - c.left / t : null;
  }

  /** Why the ability cannot be used now at this target, or null. `me`: where the caster stands. */
  check(def: AbilityDef, target: number | null, me: Spot): string | null {
    if (this.cooling(def.id) > 0) return `${def.name} is not ready yet.`;
    if (this.isHeld(SELF)) return 'You are held fast.';
    if ((def.level ?? 1) > this.caster.level) return `You are not yet ready for ${def.name}.`;
    if (this.casting) return `You are casting ${this.casting.def.name}.`;
    const why = this.afford(def);
    if (why) return why;
    if (!aimsAtFoe(def)) return null;
    const t = target === null ? undefined : this.mark(target);
    if (!t) return 'You have no target.';
    const range = def.range ?? SPELL_RANGE;
    if (!blowOf(def) && flat(t, me) - t.radius > range) return 'Your target is too far away.';
    return null;
  }

  private afford(def: AbilityDef): string | null {
    const c = def.cost ?? {}, h = this.caster;
    if ((c.stamina ?? 0) > h.stamina) return 'You are out of breath.';
    if ((c.mana ?? 0) > h.mana) return 'You have not the mana for it.';
    if ((c.health ?? 0) > 0 && (c.health ?? 0) >= h.health) return 'That would cost you your life.';
    return null;
  }

  /**
   * Use an ability (not a weapon blow: the fight lands those). Begins its cast, or plays it at once when it
   * has none. A line why not, or null.
   */
  begin(def: AbilityDef, target: number | null, me: Spot): string | null {
    const why = this.check(def, target, me);
    if (why) return why;
    if ((def.cast ?? 0) > 0) {
      this.casting = { def, target, left: def.cast! };
      this.pending.push({ kind: 'cast', ability: def, time: def.cast! });
      return null;
    }
    this.go(def, target, me);
    return null;
  }

  /** Call off the cast under way (the caster moved, was held, or asked). */
  interrupt(why = 'Your cast is broken.'): void {
    if (!this.casting) return;
    this.pending.push({ kind: 'broken', ability: this.casting.def, why });
    this.casting = null;
  }

  /** Pay an ability's costs and start its cooldown (the fight calls it when a blow lands). */
  spend(def: AbilityDef): void {
    const c = def.cost ?? {}, h = this.caster;
    h.stamina -= c.stamina ?? 0;
    h.mana -= c.mana ?? 0;
    h.health -= c.health ?? 0;
    if (def.cooldown > 0) this.cooldown.set(def.id, def.cooldown);
  }

  /** Play an ability's steps (all but its blow) at a target. */
  playRest(def: AbilityDef, target: number | null, me: Spot): void {
    const t = target === null ? undefined : this.mark(target);
    const play: Play = { def, target: t ? target : null, point: t ? { x: t.x, y: t.y, z: t.z } : { ...me }, me: { ...me }, power: this.caster.powerOf(def) };
    this.playSteps(play.def.ops, play);
  }

  private go(def: AbilityDef, target: number | null, me: Spot): void {
    this.spend(def);
    this.pending.push({ kind: 'went', ability: def });
    this.playRest(def, target, me);
  }

  /**
   * Time passes: the cast, what flies, the zones, delayed steps and effects. `speed`: how fast the caster moves.
   * `own`: this runner leads (the caster's cooldowns and own effects wear here); false for a second runner in
   * the same frame (another fight the hero stands in), which keeps only its own world going.
   */
  elapse(dt: number, me: Spot, speed = 0, own = true): RecipeEvent[] {
    if (own) for (const [k, v] of this.cooldown) this.cooldown.set(k, Math.max(0, v - dt));
    const c = this.casting;
    if (c) {
      if (speed > STILL) this.interrupt('You moved, and the cast is lost.');
      else if (this.isHeld(SELF)) this.interrupt('You are held fast, and the cast is lost.');
      else if ((c.left -= dt) <= 0) {
        this.casting = null;
        // The world may have moved on while the words were said.
        const why = (aimsAtFoe(c.def) && (c.target === null || !this.mark(c.target)) ? 'Your target is gone.' : null) ?? this.afford(c.def);
        if (why) this.pending.push({ kind: 'broken', ability: c.def, why });
        else this.go(c.def, c.target, me);
      }
    }
    this.moveShots(dt);
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.left -= dt;
      z.next -= dt;
      if (z.next <= 0 && z.left > -1e-6) {
        z.next += z.op.tick;
        this.playSteps(z.op.ops, { ...z.play, point: { x: z.x, y: z.y, z: z.z } });
      }
      if (z.left <= 1e-6) { this.zones.splice(i, 1); this.pending.push({ kind: 'zone', zone: z, ended: true }); }
    }
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if ((l.left -= dt) > 0) continue;
      this.later.splice(i, 1);
      this.playSteps(l.ops, l.play);
    }
    this.wearAll(dt, own);
    return this.pending.splice(0);
  }

  // ------------------------------------------------------------------ effects

  /** Put an effect on someone (scaled by the strength behind it); the same effect again refreshes it. */
  putOn(id: number, apply: EffectApply, power = 0): void {
    const def = this.effectDefs.get(apply.id);
    if (!def || (apply.chance !== undefined && !this.rng.chance(apply.chance))) return;
    const magnitude = apply.magnitude * (def.dot || def.hot ? 1 + power / 150 : 1);
    const list = this.listOf(id, true);
    const was = list.find((w) => w.def.id === def.id);
    if (was) {
      was.magnitude = Math.max(was.magnitude, magnitude);
      was.left = Math.max(was.left, apply.duration);
      return;
    }
    list.push({ def, magnitude, left: apply.duration, tick: 1 });
    this.pending.push({ kind: 'effect', on: id, effect: def, started: true });
  }

  /** The effects someone wears (`make`: an empty list kept for them when there is none). */
  listOf(id: number, make = false): Worn[] {
    if (id === SELF) return this.mine;
    let l = this.others.get(id);
    if (!l && make) this.others.set(id, (l = []));
    return l ?? [];
  }

  /** The most of something among the effects someone wears (0 when none has it). */
  private most(id: number, has: (d: EffectDef) => boolean | undefined, of: (w: Worn) => number): number {
    let m = 0;
    for (const w of this.listOf(id)) if (has(w.def)) m = Math.max(m, of(w));
    return m;
  }

  /** How much slower someone is (0..1). */
  slowOf(id: number): number { return Math.min(0.9, this.most(id, (d) => d.slow, (w) => w.magnitude)); }

  /** Someone cannot act (held, frozen). */
  isHeld(id: number): boolean { return (this.listOf(id)).some((w) => w.def.hold); }

  /** Seconds someone is still held. */
  heldFor(id: number): number { return this.most(id, (d) => d.hold, (w) => w.left); }

  /** How hidden someone is (0..1). */
  veilOf(id: number): number { return Math.min(0.9, this.most(id, (d) => d.veil, (w) => w.magnitude)); }

  /** Someone is afraid (runs). */
  afraid(id: number): boolean { return this.most(id, (d) => d.fear, () => 1) > 0; }

  /** Armour added by wards. */
  wardOf(id: number): number { return (this.listOf(id)).filter((w) => w.def.ward).reduce((a, w) => a + w.magnitude, 0); }

  /** Effects wear on and off; the caster's own only in the runner that leads (`own`), so they wear once a frame. */
  private wearAll(dt: number, own: boolean): void {
    const alive = new Set(this.world.marks().map((m) => m.id));
    for (const [id, list] of this.others) {
      if (!alive.has(id)) { this.others.delete(id); continue; }
      this.wearList(id, list, dt);
      if (!list.length) this.others.delete(id);
    }
    if (own && alive.has(SELF)) this.wearList(SELF, this.mine, dt);
  }

  private wearList(id: number, list: Worn[], dt: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      w.left -= dt;
      w.tick -= dt;
      // Damage and healing come once a second, the last second's share when it ends.
      while (w.tick <= 0 || (w.left <= 0 && w.tick < 1)) {
        const share = w.tick <= 0 ? 1 : 1 - w.tick;
        w.tick += 1;
        if (w.def.dot) this.world.harm(id, w.magnitude * share, w.def.dot);
        if (w.def.hot) this.healOn(id, w.magnitude * share, true);
        if (w.left <= 0) break;
      }
      if (w.left <= 0) { list.splice(i, 1); this.pending.push({ kind: 'effect', on: id, effect: w.def, started: false }); }
    }
  }

  // ------------------------------------------------------------------ steps

  private mark(id: number): Mark | undefined { return this.world.marks().find((m) => m.id === id); }

  private anchor(p: Play, at: OpAnchor | undefined, fallback: OpAnchor): Spot {
    switch (at ?? fallback) {
      case 'self': return this.mark(SELF) ?? p.me;
      case 'target': { const t = p.target === null ? undefined : this.mark(p.target); return t ? { x: t.x, y: t.y, z: t.z } : p.point; }
      default: return p.point;
    }
  }

  /** A spell's damage as a blow: a spread around its number, the strength behind it, hard to dodge. */
  private spellBlow(p: Play, damage: number, kind: DamageKind | undefined, aim: number): Blow {
    return { damage: [damage * 0.85, damage * 1.15], kind: kind ?? 'blunt', prowess: p.power, aim };
  }

  /** `over`: a tick of healing over time, not one healing at once. */
  private healOn(id: number, amount: number, over = false): void {
    const got = this.world.heal(id, amount);
    if (got > 0) this.pending.push({ kind: 'healed', on: id, amount: got, over });
  }

  private playSteps(ops: readonly AbilityOp[], p: Play): void {
    for (const o of ops) this.playStep(o, p);
  }

  private playStep(o: AbilityOp, p: Play): void {
    switch (o.op) {
      case 'blow': return; // the fight lands it on its swing
      case 'projectile': {
        const from = this.mark(SELF) ?? p.me;
        const shot: Shot = {
          n: ++this.serial, ability: p.def, look: o.look, x: from.x, y: from.y + CHEST, z: from.z, aim: { ...p.point }, target: p.target,
          life: (flat(from, p.point) + 8) / o.speed + 1, op: o, play: p,
        };
        this.shots.push(shot);
        this.pending.push({ kind: 'loosed', shot });
        return;
      }
      case 'area': return this.area(o, this.anchor(p, o.at, 'point'), p);
      case 'zone': {
        const at = this.anchor(p, o.at, 'point');
        const zone: Zone = { n: ++this.serial, ability: p.def, x: at.x, y: at.y, z: at.z, radius: o.radius, look: o.look, left: o.duration, next: 0, op: o, play: p };
        this.zones.push(zone);
        this.pending.push({ kind: 'zone', zone, ended: false });
        return;
      }
      case 'effect': {
        const id = o.to === 'self' ? SELF : p.target;
        if (id !== null) this.putOn(id, o.effect, p.power);
        return;
      }
      case 'heal': {
        const id = o.to === 'self' ? SELF : p.target ?? SELF;
        const base = o.share ? o.amount * this.caster.maxHealth : o.amount;
        this.healOn(id, base * (p.def.school ? 1 + p.power / 150 : 1));
        return;
      }
      case 'terrain': {
        const at = this.anchor(p, o.at, 'point'), me = this.mark(SELF) ?? p.me;
        const dir = flat(at, me) > 0.1 ? Math.atan2(at.z - me.z, at.x - me.x) : 0;
        const edit: TerrainEdit = { shape: o.shape, x: at.x, y: at.y, z: at.z, dir, radius: o.radius, height: o.height, length: o.length };
        const ok = this.world.terrain(edit);
        this.pending.push({ kind: 'terrain', edit, ok });
        if (!ok) this.pending.push({ kind: 'refused', text: 'The ground does not answer here.' });
        return;
      }
      case 'shape': {
        const why = this.world.shape(o, p.def);
        if (why) this.pending.push({ kind: 'refused', text: why });
        return;
      }
      case 'delay':
        this.later.push({ left: o.t, ops: o.ops, play: p });
        return;
      case 'look':
        this.pending.push({ kind: 'look', ability: p.def, look: o.look, at: this.anchor(p, o.at, 'point') });
        return;
    }
  }

  private touches(m: Mark, who: OpWho): boolean {
    return who === 'all' || (who === 'foes') === m.foe;
  }

  private area(o: Extract<AbilityOp, { op: 'area' }>, at: Spot, p: Play): void {
    const who: OpWho = o.who ?? (o.heal && !o.damage ? 'friends' : 'foes');
    const touched: number[] = [];
    for (const m of this.world.marks()) {
      const d = Math.max(0, flat(m, at) - m.radius);
      if (d > o.radius || Math.abs(m.y - at.y) > 3 || !this.touches(m, who)) continue;
      touched.push(m.id);
      // Weaker at the rim.
      if (o.damage) this.world.hit(m.id, this.spellBlow(p, o.damage * (1 - 0.4 * (d / o.radius)), o.kind, AREA_AIM), p.def);
      if (o.heal) this.healOn(m.id, o.heal * (p.def.school ? 1 + p.power / 150 : 1));
      if (o.effect) this.putOn(m.id, o.effect, p.power);
    }
    this.pending.push({ kind: 'area', ability: p.def, at, radius: o.radius, look: o.look, touched });
  }

  private moveShots(dt: number): void {
    const marks = this.world.marks();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const t = s.target === null ? undefined : marks.find((m) => m.id === s.target);
      // It follows its target (tab targeting, D13); a target gone, it flies on to where it was.
      if (t) s.aim = { x: t.x, y: t.y + Math.min(1.2, t.radius * 2), z: t.z };
      const dx = s.aim.x - s.x, dy = s.aim.y - s.y, dz = s.aim.z - s.z, d = Math.hypot(dx, dy, dz);
      const step = Math.min(d, s.op.speed * dt), k = d > 1e-6 ? step / d : 0;
      const to: Spot = { x: s.x + dx * k, y: s.y + dy * k, z: s.z + dz * k };
      s.life -= dt;
      if (this.world.clear && !this.world.clear(to)) { this.land(i, null); continue; }
      s.x = to.x; s.y = to.y; s.z = to.z;
      const r = s.op.radius ?? 0.3;
      const met = marks.find((m) => m.foe && flat(m, to) <= r + m.radius && to.y >= m.y - 0.5 && to.y <= m.y + 2.5);
      if (met) this.land(i, met.id);
      else if (d - step < 0.05 || s.life <= 0) this.land(i, null);
    }
  }

  private land(i: number, on: number | null): void {
    const s = this.shots[i];
    this.shots.splice(i, 1);
    const p = s.play, o = s.op;
    if (on !== null) {
      if (o.damage) this.world.hit(on, this.spellBlow(p, o.damage, o.kind, SPELL_AIM), p.def);
      if (o.effect) this.putOn(on, o.effect, p.power);
    }
    this.pending.push({ kind: 'landed', shot: s, on });
    const m = on === null ? undefined : this.mark(on);
    if (o.onHit) this.playSteps(o.onHit, { ...p, target: on, point: m ? { x: m.x, y: m.y, z: m.z } : { x: s.x, y: s.y, z: s.z } });
  }
}

/**
 * The world with nobody to fight (out of an encounter): only the caster, whose own spells (healing, wards) still
 * work; a foe-aimed spell finds no target.
 */
export class Alone implements RecipeWorld {
  constructor(private readonly caster: Caster, private readonly at: () => Spot) {}

  marks(): readonly Mark[] {
    const p = this.at();
    return this.caster.health > 0 ? [{ id: SELF, x: p.x, y: p.y, z: p.z, radius: 0.35, foe: false }] : [];
  }

  hit(): void {}

  harm(id: number, amount: number): void {
    if (id === SELF) this.caster.health = Math.max(1, this.caster.health - amount);
  }

  heal(id: number, amount: number): number { return id === SELF ? mendCaster(this.caster, amount) : 0; }

  terrain(): boolean { return false; }

  shape(): string | null { return null; }
}

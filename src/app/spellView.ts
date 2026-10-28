/**
 * Spells drawn (plan 10, C2, C4): what the recipe runner (game/recipe.ts) has going, as fire, ice, rock, leaves,
 * light and shadow (spellFx/looks.ts) made of sprites and solids (spellFx/particles.ts) drawn with two shaders
 * built behind the loading screen (spellFx/fxView.ts), so a spell never builds a shader when it is first cast.
 *
 * While a spell gathers the caster stands on a magic circle of the school's colour and the spell takes shape at
 * their hand (flames, ice crystals, circling stones, seeds of light, rays drawn in, shadow); it leaves the hand
 * with a flash; what flies is the thing itself (a dart of flame, a spinning ice shard, a lance of light, a ball of
 * shadow) trailing smoke, mist or sparks; whatever it hits bursts, shatters or flares; an area breaks out of the
 * ground; a zone burns, roots or glows while it lasts; a spell on the caster wraps round them. It also tells its
 * listener (main.ts) when to raise and throw the hands (the hero's cast clips) and which sound to play.
 */
import { Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { deriveSeed } from '@futuremagic/core';
import type { AbilityDef, SettingModule, SpellMotif } from '../setting/contract';
import { blowOf, shapeOf, type RecipeEvent, type Recipes, type Spot } from '../game/recipe';
import { SpellBits, type Vec3 } from './spellFx/particles';
import { lookOf, type Caster, type FxLook } from './spellFx/looks';
import { FxView } from './spellFx/fxView';

/** Where the hand holds a spell when the body's hand is not known: in front of the caster (m) and over the feet (m). */
const HANDS_AHEAD = 0.45, HANDS_UP = 1.35;
/**
 * The least time a bolt is seen flying (s). A dart at a foe two steps away lands within a frame or two of leaving
 * the hand, too quick to see; then it is drawn flying from where it was to where it struck over this long, and its
 * burst and sound wait for it. Only the drawing waits: the hit itself was dealt when it landed.
 */
const MIN_FLIGHT = 0.22;

/** One fight's (or the calm land's) spells, and where its frame sits in the world. */
export interface SpellFrame {
  readonly recipes: Recipes;
  /** The frame's offset into the world (a den's frame; zero out on the land). */
  readonly offset: Spot;
  /** Where the caster stands, in the frame. */
  readonly me: Spot;
  /** Which way the caster faces (the walker's yaw: 0 faces −z). */
  readonly yaw: number;
  /** What happened since the last frame. */
  readonly cues: readonly RecipeEvent[];
}

/** What a spell's sound is: gathering in the hands, let go, or striking. */
export type SpellSound = 'gather' | 'loose' | 'hit';

/** Who hears the spells: the hero's hands (cast clips) and the sound. */
export interface SpellListener {
  /** The hero raises the hands for `dur` s (a spell gathering), throws them (released), or lowers them (broken off). */
  hands(what: 'charge' | 'release' | 'stop', dur: number): void;
  /** A spell's sound, from a point in the world. */
  sound(what: SpellSound, motif: SpellMotif, at: readonly [number, number, number]): void;
}

/** A bolt drawn on after it landed (MIN_FLIGHT), from where it was to where it struck; `land` bursts it there. */
interface Tracer { readonly from: Vec3; readonly to: Vec3; readonly launched: Vec3; readonly look: FxLook; readonly life: number; age: number; readonly land: (() => void)[] }

/** A spell's look: how it is drawn and its motif (sounds). */
interface Showing { readonly fx: FxLook; readonly motif: SpellMotif }

export class SpellView {
  private readonly view = new FxView();
  private readonly bits = new SpellBits(deriveSeed(0x5be11, 'spell bits'));
  private readonly showings = new Map<string, Showing>();
  private readonly tracers: Tracer[] = [];
  /** Where and when each bolt left the hands, and where it was last frame (by its number). */
  private readonly born = new Map<number, { t: number; from: Vec3 }>();
  private was = new Map<number, Vec3>();
  /** Zones already begun (by number). */
  private zonesSeen = new Set<number>();
  private t = 0;
  private readonly hand = new Vector3();
  /** Held as last drawn (shots of a spell in flight); the spells go on underneath. */
  frozen = false;
  /** What the last frame drew: things flying (bolts and those drawn on after landing), bits moving, held this frame (shots wait for them). */
  shown = { shots: 0, flashes: 0, motes: 0 };
  /** Hears casts, releases and hits (main.ts: the hero's clips and the sounds). */
  listener: SpellListener | null = null;
  /** Where the hero's hand is in the world (main.ts: the body's bone), null while not known. */
  handOf: ((out: Vector3) => Vector3 | null) | null = null;

  constructor(private readonly setting: SettingModule) {}

  get group() { return this.view.group; }

  /** Compiled and in the scene (hidden until a spell shows). */
  async enter(stage: Stage): Promise<void> {
    await this.view.enter(stage);
    this.inScene = true;
  }

  /** In the scene, its shader built (until then a spell is reckoned but not drawn: warmed after the start, F4). */
  private inScene = false;
  get entered(): boolean { return this.inScene; }

  /** How an ability shows: its own glow (an item's), else its skill's (a school's) motif, else radiance. */
  private showingOf(def: AbilityDef): Showing {
    const id = def.glow ? `ability:${def.id}` : def.skill ?? '';
    let s = this.showings.get(id);
    if (!s) {
      const k = this.setting.skills.find((x) => x.id === def.skill);
      const motif = def.glow?.motif ?? k?.motif ?? 'radiance';
      s = { fx: lookOf(motif), motif };
      this.showings.set(id, s);
    }
    return s;
  }

  /** Every frame: draw the frame's spells (null: none). */
  show(dt: number, f: SpellFrame | null): void {
    if (this.frozen) return;
    this.t += dt;
    const b = this.bits;
    // A bolt's landing first: an area it bursts into (a fireball's) waits for the bolt drawn on to it.
    if (f) for (const e of f.cues) if (e.kind === 'landed') this.took(e, f);
    if (f) for (const e of f.cues) if (e.kind !== 'landed') this.took(e, f);
    if (f) {
      const O = f.offset, r = f.recipes;
      const cast = r.casting, share = r.castShare;
      if (cast && share !== null && this.isSpell(cast.def)) this.showingOf(cast.def).fx.gather(b, this.caster(f), share, dt, this.t);
      const was = new Map<number, Vec3>();
      for (const s of r.shots) {
        const at: Vec3 = [O.x + s.x, O.y + s.y, O.z + s.z], before = this.was.get(s.n) ?? this.born.get(s.n)?.from;
        let dir: Vec3 = [0, 0, -1], speed = s.op.speed;
        if (before) {
          const dx = at[0] - before[0], dy = at[1] - before[1], dz = at[2] - before[2], len = Math.hypot(dx, dy, dz);
          if (len > 1e-4) { dir = [dx / len, dy / len, dz / len]; if (dt > 0) speed = len / dt; }
        }
        this.showingOf(s.ability).fx.bolt(b, at, dir, speed, this.born.get(s.n)?.from ?? at, dt, this.t);
        was.set(s.n, at);
      }
      this.was = was;
      const live = new Set<number>();
      for (const z of r.zones) {
        live.add(z.n);
        const g: Vec3 = [O.x + z.x, O.y + z.y, O.z + z.z], fx = this.showingOf(z.ability).fx;
        if (!this.zonesSeen.has(z.n)) fx.zoneStart?.(b, g, z.radius, z.left);
        fx.zone(b, g, z.radius, dt, z.left, this.t);
      }
      this.zonesSeen = live;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!;
      tr.age += dt;
      if (tr.age >= tr.life) { this.tracers.splice(i, 1); for (const land of tr.land) land(); continue; }
      const a = tr.age / tr.life, A = tr.from, B = tr.to;
      const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dx, dy, dz) || 1;
      tr.look.bolt(b, [A[0] + dx * a, A[1] + dy * a, A[2] + dz * a], [dx / len, dy / len, dz / len], len / tr.life, tr.launched, dt, this.t);
    }
    b.step(dt);
    this.shown = { shots: (f?.recipes.shots.length ?? 0) + this.tracers.length, flashes: b.parts.length + b.solids.length, motes: b.held.length + b.heldSolids.length };
    if (this.inScene) this.view.draw(b);
  }

  /** Where the caster's feet and spell hand are, and which way they face. */
  private caster(f: SpellFrame): Caster {
    const O = f.offset, fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    const feet: Vec3 = [O.x + f.me.x, O.y + f.me.y, O.z + f.me.z];
    const h = this.handOf?.(this.hand);
    // The body's hand when it is near where the hero stands (a bone far off is a body not yet placed).
    const hand: Vec3 = h && Math.hypot(h.x - feet[0], h.z - feet[2]) < 1.5
      ? [h.x + fx * 0.12, h.y + 0.05, h.z + fz * 0.12]
      : [feet[0] + fx * HANDS_AHEAD, feet[1] + HANDS_UP, feet[2] + fz * HANDS_AHEAD];
    return { feet, hand, facing: [fx, 0, fz] };
  }

  /** A spell (a school's, or an item's glow): cast with the hands. Not a weapon's blow, a change of shape or a breath. */
  private isSpell(def: AbilityDef): boolean {
    if (blowOf(def) || shapeOf(def)) return false;
    return !!def.glow || this.setting.skills.find((s) => s.id === def.skill)?.group === 'magic';
  }

  private took(e: RecipeEvent, f: SpellFrame): void {
    const O = f.offset, b = this.bits;
    const say = (what: SpellSound, def: AbilityDef, at: Vec3) => this.listener?.sound(what, this.showingOf(def).motif, at);
    switch (e.kind) {
      case 'cast': {
        if (!this.isSpell(e.ability)) break;
        this.listener?.hands('charge', e.time);
        say('gather', e.ability, this.caster(f).hand);
        break;
      }
      case 'went': {
        if (!this.isSpell(e.ability)) break;
        this.listener?.hands('release', 0.8);
        const c = this.caster(f);
        this.showingOf(e.ability).fx.release(b, c.hand, c.facing);
        say('loose', e.ability, c.hand);
        break;
      }
      case 'broken': this.listener?.hands('stop', 0); break;
      case 'loosed': this.born.set(e.shot.n, { t: this.t, from: this.caster(f).hand }); break;
      case 'area': {
        // A zone's ticks are its own drawing (they have no look).
        if (!e.look) break;
        const g: Vec3 = [O.x + e.at.x, O.y + e.at.y, O.z + e.at.z], fx = this.showingOf(e.ability).fx;
        const burst = () => { fx.area(b, g, e.radius); say('hit', e.ability, [g[0], g[1] + 0.5, g[2]]); };
        // A bolt that bursts into an area (a fireball) bursts when its drawn bolt gets there.
        const flying = this.tracers.find((t) => t.age === 0 && t.look === fx);
        if (flying) flying.land.push(burst); else burst();
        break;
      }
      case 'landed': {
        const s = e.shot, at: Vec3 = [O.x + s.x, O.y + s.y, O.z + s.z], fx = this.showingOf(s.ability).fx;
        const born = this.born.get(s.n), from = born?.from ?? at;
        this.born.delete(s.n);
        const last = this.was.get(s.n) ?? from;
        const dl = Math.hypot(at[0] - last[0], at[1] - last[1], at[2] - last[2]) || 1;
        const dir: Vec3 = [(at[0] - last[0]) / dl, (at[1] - last[1]) / dl, (at[2] - last[2]) / dl];
        const burst = () => {
          // A bolt that bursts into an area shows that area (its own event); one that does not strikes here.
          if (!s.op.onHit) { fx.hit(b, at, dir, from); say('hit', s.ability, at); }
        };
        const flown = this.t - (born?.t ?? this.t);
        if (flown >= MIN_FLIGHT) { burst(); break; }
        // On from where it was last drawn (the hands if it never was), for the rest of its least flight.
        this.tracers.push({ from: last, to: at, launched: from, look: fx, life: Math.max(0.08, MIN_FLIGHT - flown), age: 0, land: [burst] });
        break;
      }
      case 'look': {
        const at: Vec3 = [O.x + e.at.x, O.y + e.at.y, O.z + e.at.z];
        this.showingOf(e.ability).fx.flare(b, at);
        // A look on a foe strikes there; one on the caster was heard as they let it go.
        if (Math.hypot(e.at.x - f.me.x, e.at.z - f.me.z) > 1.5) say('hit', e.ability, [at[0], at[1] + 1, at[2]]);
        break;
      }
      default: break;
    }
  }
}

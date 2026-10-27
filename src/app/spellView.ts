/**
 * Spells drawn (plan 10, C2, C4): what the recipe runner (game/recipe.ts) has going, as glowing shapes in the
 * school's colour and motif, all in one instanced mesh with one shader (materials/spells.ts) built behind the
 * loading screen, so a spell never builds a shader when it is first cast. A spell being cast gathers as an orb
 * at the caster's hand; what flies is an orb with a trail; an area bursts out to its radius and fades; a zone
 * lies as a pulsing disc; a spell on the caster flares round them. Each school's spells shed their own motes
 * (spellMotes.ts): sparks, flakes, grit, seeds of light, glints or wisps.
 *
 * Made to be seen in daylight from behind the hero: while a spell gathers, a ring of its colour turns at the
 * caster's feet and the orb swells before their raised hands; on release the hands flash; what flies is a big orb
 * with a tail of fading ghosts; whatever it hits bursts. It also tells its listener (main.ts) when to raise and
 * throw the hands (the hero's cast clips) and which sound to play (soundDirector.ts `spell`).
 */
import { Color, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Object3D, Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { deriveSeed } from '@futuremagic/core';
import type { AbilityDef, SettingModule, SpellMotif } from '../setting/contract';
import { blowOf, shapeOf, type RecipeEvent, type Recipes, type Spot } from '../game/recipe';
import { SPELL_GLOW } from '../render/materials/spells';
import { Motes, motifIndex } from './spellMotes';

/** Shapes drawn at once, at most (bodies and motes). */
const MAX = 320;
/** Motes alive at once, at most. */
const MOTES = 220;
/** How long an area's burst and a flare last (s). */
const BURST = 0.5;
const FLARE = 0.9;
/** Motes shed per second: by a spell being cast, behind what flies, per metre of a zone's radius. */
const GATHER = 14, TRAIL = 45, LINGER = 3;
/** A bolt is drawn stretched along its flight over this many seconds of it (a fast lance is a streak). */
const STREAK = 0.035;
/** The ghosts behind what flies: how many, and how far apart along its flight (s of it). */
const GHOSTS = 5, GHOST_GAP = 0.018;
/** Where the gathering orb hangs: in front of the caster (m) and over the feet (m). */
const HANDS_AHEAD = 0.5, HANDS_UP = 1.45;
/** Smallest orb drawn for what flies (m): a dart must show from behind the hero across a clearing. */
const BOLT_MIN = 0.26;
/**
 * The least time a bolt is seen flying (s). A dart at a foe two steps away lands within a frame or two of leaving
 * the hand, too quick to see; then it is drawn flying from the hands to where it struck over this long, and its
 * burst and sound wait for it. Only the drawing waits: the hit itself was dealt when it landed.
 */
const MIN_FLIGHT = 0.22;
const AHEAD = new Vector3(0, 0, 1);

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

interface Flash { x: number; y: number; z: number; radius: number; look: Look; age: number; life: number; grow: boolean }

/** A bolt drawn on after it landed (MIN_FLIGHT), from the hands to where it struck; `land` bursts it there. */
interface Tracer { readonly from: Spot; readonly to: Spot; readonly look: Look; readonly rad: number; readonly n: number; readonly life: number; age: number; readonly land: (() => void)[] }

/** What a spell's sound is: gathering in the hands, let go, or striking. */
export type SpellSound = 'gather' | 'loose' | 'hit';

/** Who hears the spells: the hero's hands (cast clips) and the sound. */
export interface SpellListener {
  /** The hero raises the hands for `dur` s (a spell gathering), throws them (released), or lowers them (broken off). */
  hands(what: 'charge' | 'release' | 'stop', dur: number): void;
  /** A spell's sound, from a point in the world. */
  sound(what: SpellSound, motif: SpellMotif, at: readonly [number, number, number]): void;
}

/** How an ability shows: its school's colour and motif. */
interface Look { readonly color: Color; readonly motif: SpellMotif; readonly n: number }

export class SpellView {
  readonly group = Object.assign(new Group(), { name: 'spells' });
  private readonly mesh: InstancedMesh;
  private readonly flashes: Flash[] = [];
  private readonly tracers: Tracer[] = [];
  /** When each bolt left the hands (by its number), for MIN_FLIGHT. */
  private readonly born = new Map<number, number>();
  private readonly looks = new Map<string, Look>();
  private readonly o = new Object3D();
  private readonly tint: InstancedBufferAttribute;
  private readonly spell: InstancedBufferAttribute;
  private readonly motes = new Motes(deriveSeed(0x5be11, 'motes'), MOTES);
  private t = 0;
  private n = 0;
  /** Where each bolt was last frame (by its number), for its streak. */
  private was = new Map<number, Vector3>();
  private readonly dir = new Vector3();
  /** Held as last drawn (shots of a spell in flight); the spells go on underneath. */
  frozen = false;
  /** What the last frame drew: things flying (bolts and those drawn on after landing), bursts or flares, and motes (shots wait for them). */
  shown = { shots: 0, flashes: 0, motes: 0 };
  /** Hears casts, releases and hits (main.ts: the hero's clips and the sounds). */
  listener: SpellListener | null = null;

  constructor(private readonly setting: SettingModule) {
    const g = new IcosahedronGeometry(1, 2);
    // The per-shape attributes (materials/spells.ts) from the start: they are part of the shader's key.
    this.tint = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.spell = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    g.setAttribute('tint', this.tint);
    g.setAttribute('spell', this.spell);
    const m = new InstancedMesh(g, SPELL_GLOW.make(), MAX);
    Object.assign(m, { name: 'spell glow', frustumCulled: false, castShadow: false, receiveShadow: false, count: 0 });
    this.mesh = m;
    this.group.add(m);
  }

  /** Compiled and in the scene (hidden until a spell shows). */
  async enter(stage: Stage): Promise<void> {
    this.mesh.count = 1;
    await stage.add(this.group);
    this.mesh.count = 0;
  }

  /** How an ability shows: its own glow (an item's), else its skill's (a school's) colour and motif, else a pale gold radiance. */
  showingOf(def: AbilityDef): Look {
    const id = def.glow ? `ability:${def.id}` : def.skill ?? '';
    let l = this.looks.get(id);
    if (!l) {
      const k = this.setting.skills.find((s) => s.id === def.skill);
      const c = def.glow?.color ?? k?.color ?? [1, 0.92, 0.7], motif = def.glow?.motif ?? k?.motif ?? 'radiance';
      l = { color: new Color().setRGB(c[0], c[1], c[2]), motif, n: motifIndex(motif) };
      this.looks.set(id, l);
    }
    return l;
  }

  /** Every frame: draw the frame's spells (null: none). */
  show(dt: number, f: SpellFrame | null): void {
    if (this.frozen) return;
    this.t += dt;
    if (f) for (const e of f.cues) this.took(e, f);
    this.n = 0;
    if (f) {
      const O = f.offset, r = f.recipes;
      const cast = r.casting, share = r.castShare;
      if (cast && share !== null) {
        const l = this.showingOf(cast.def), h = this.handsAt(f), size = 0.1 + 0.22 * share;
        this.put(h.x, h.y, h.z, size, size, l, 0, 0.9 + 0.8 * share, 0);
        this.motes.shed(l.motif, l, GATHER * dt, h.x, h.y, h.z, 0.3);
        // A ring of the school's colour turning at the caster's feet, widening as the spell gathers.
        const ring = 0.55 + 0.45 * share, fx = O.x + f.me.x, fy = O.y + f.me.y + 0.05, fz = O.z + f.me.z;
        this.put(fx, fy, fz, ring, 0.03, l, 0, 0.5 + 0.4 * share + 0.1 * Math.sin(this.t * 9), 7);
        this.motes.shed(l.motif, l, GATHER * 0.6 * dt, fx, fy + 0.1, fz, ring);
      }
      const was = new Map<number, Vector3>();
      for (const s of r.shots) {
        const rad = Math.max(BOLT_MIN, (s.op.radius ?? 0.18) * 1.4), l = this.showingOf(s.ability), x = O.x + s.x, y = O.y + s.y, z = O.z + s.z;
        const before = this.was.get(s.n), along = before ? this.dir.set(x, y, z).sub(before) : null;
        const len = along && dt > 0 ? along.length() : 0;
        this.streak(x, y, z, len > 1e-4 ? along!.divideScalar(len) : null, len > 1e-4 ? len / dt : 0, rad, l, s.n, dt);
        was.set(s.n, (before ?? new Vector3()).set(x, y, z));
      }
      this.was = was;
      for (const z of r.zones) {
        const fade = Math.min(1, z.left / 0.5), l = this.showingOf(z.ability);
        this.put(O.x + z.x, O.y + z.y + 0.08, O.z + z.z, z.radius, 0.06, l, 0, (0.35 + 0.12 * Math.sin(this.t * 5 + z.n)) * fade, z.n);
        this.motes.shed(l.motif, l, LINGER * z.radius * dt * fade, O.x + z.x, O.y + z.y + 0.1, O.z + z.z, z.radius * 0.9);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.age += dt;
      if (tr.age >= tr.life) { this.tracers.splice(i, 1); for (const land of tr.land) land(); continue; }
      const a = tr.age / tr.life, A = tr.from, B = tr.to;
      this.dir.set(B.x - A.x, B.y - A.y, B.z - A.z);
      const len = this.dir.length();
      this.streak(A.x + (B.x - A.x) * a, A.y + (B.y - A.y) * a, A.z + (B.z - A.z) * a, len > 1e-4 ? this.dir.divideScalar(len) : null, len / tr.life, tr.rad, tr.look, tr.n, dt);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.age += dt;
      if (fl.age >= fl.life) { this.flashes.splice(i, 1); continue; }
      const a = fl.age / fl.life, rad = fl.grow ? fl.radius * (0.3 + 0.7 * a) : fl.radius;
      this.put(fl.x, fl.y, fl.z, rad, fl.grow ? rad * 0.6 : rad, fl.look, 0, (1 - a) * (fl.grow ? 0.9 : 0.6), i);
    }
    this.motes.drift(dt);
    for (const m of this.motes.list) {
      const a = m.age / m.way.life, size = m.way.size * (1 - 0.5 * a);
      this.put(m.x, m.y, m.z, size, size, m.tint as Look, 1, m.way.bright * (1 - a), m.seed * 97);
    }
    this.shown = { shots: (f?.recipes.shots.length ?? 0) + this.tracers.length, flashes: this.flashes.length, motes: this.motes.list.length };
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.spell.needsUpdate = true;
  }

  /**
   * One shape: an orb (sx = sy), a disc or burst (sy < sx), or a mote (role 1); k dims it. `sz`: a streak's
   * length along the turn set on `o` beforehand (unturned and round without it).
   */
  private put(x: number, y: number, z: number, sx: number, sy: number, l: Look, role: number, k: number, seed: number, sz?: number): void {
    const n = this.n;
    if (n >= MAX) return;
    if (sz === undefined) this.o.quaternion.identity();
    this.o.position.set(x, y, z);
    this.o.scale.set(sx, sy, sz ?? sx);
    this.o.updateMatrix();
    this.mesh.setMatrixAt(n, this.o.matrix);
    this.tint.setXYZ(n, l.color.r, l.color.g, l.color.b);
    this.spell.setXYZW(n, l.n, (seed * 0.618034) % 1, role, Math.max(0, k));
    this.n = n + 1;
  }

  /** A spell (a school's, or an item's glow): cast with the hands. Not a weapon's blow, a change of shape or a breath. */
  private isSpell(def: AbilityDef): boolean {
    if (blowOf(def) || shapeOf(def)) return false;
    return !!def.glow || this.setting.skills.find((s) => s.id === def.skill)?.group === 'magic';
  }

  /**
   * A bolt at (x, y, z) flying along unit `dir` (null: not moving yet) at `speed` m/s: stretched into a streak with a
   * tail of ghosts behind it, smaller and dimmer, shedding its motes.
   */
  private streak(x: number, y: number, z: number, dir: Vector3 | null, speed: number, rad: number, l: Look, n: number, dt: number): void {
    if (dir) {
      this.o.quaternion.setFromUnitVectors(AHEAD, dir);
      for (let g = 1; g <= GHOSTS; g++) {
        const back = speed * GHOST_GAP * g, k = 1 - g / (GHOSTS + 1), r = rad * (0.35 + 0.55 * k);
        this.put(x - dir.x * back, y - dir.y * back, z - dir.z * back, r, r, l, 0, 1.1 * k, n + g, Math.max(r, speed * STREAK * 0.6));
      }
    }
    this.put(x, y, z, rad, rad, l, 0, 1.8, n, dir ? Math.max(rad, speed * STREAK) : undefined);
    this.motes.shed(l.motif, l, TRAIL * dt, x, y, z, rad * 0.6);
  }

  /** Where the caster's hands hold a spell, in the world. */
  private handsAt(f: SpellFrame): Spot {
    const O = f.offset;
    return { x: O.x + f.me.x - Math.sin(f.yaw) * HANDS_AHEAD, y: O.y + f.me.y + HANDS_UP, z: O.z + f.me.z - Math.cos(f.yaw) * HANDS_AHEAD };
  }

  private took(e: RecipeEvent, f: SpellFrame): void {
    const O = f.offset;
    const flash = (at: Spot, radius: number, def: AbilityDef, life: number, grow: boolean, motes: number) => {
      const look = this.showingOf(def), x = O.x + at.x, y = O.y + at.y + (grow ? 0.3 : 1), z = O.z + at.z;
      this.flashes.push({ x, y, z, radius, look, age: 0, life, grow });
      // A burst throws its motes out across its radius; a flare sheds them round the body.
      this.motes.shed(look.motif, look, motes, x, y, z, grow ? radius * 0.3 : radius * 0.7, grow ? radius * 1.5 : 0);
    };
    const say = (what: SpellSound, def: AbilityDef, x: number, y: number, z: number) => this.listener?.sound(what, this.showingOf(def).motif, [x, y, z]);
    switch (e.kind) {
      case 'cast': {
        if (!this.isSpell(e.ability)) break;
        this.listener?.hands('charge', e.time);
        say('gather', e.ability, O.x + f.me.x, O.y + f.me.y + HANDS_UP, O.z + f.me.z);
        break;
      }
      case 'went': {
        if (!this.isSpell(e.ability)) break;
        // Released: the hands throw and flash (a spell on the caster flares by its own look).
        this.listener?.hands('release', 0.8);
        const h = this.handsAt(f), look = this.showingOf(e.ability);
        this.flashes.push({ x: h.x, y: h.y, z: h.z, radius: 0.45, look, age: 0, life: 0.25, grow: true });
        this.motes.shed(look.motif, look, 12, h.x, h.y, h.z, 0.15, 1.2);
        say('loose', e.ability, h.x, h.y, h.z);
        break;
      }
      case 'broken': this.listener?.hands('stop', 0); break;
      case 'loosed': this.born.set(e.shot.n, this.t); break;
      case 'area': {
        const burst = () => { flash(e.at, e.radius, e.ability, BURST, true, 10 + 6 * e.radius); if (e.look) say('hit', e.ability, O.x + e.at.x, O.y + e.at.y + 0.5, O.z + e.at.z); };
        // A bolt that bursts into an area (a fireball) still drawn flying: the area bursts when it gets there.
        const flying = this.tracers.find((t) => t.age === 0 && t.look === this.showingOf(e.ability));
        if (flying) flying.land.push(burst); else burst();
        break;
      }
      case 'landed': {
        // Whatever it strikes bursts (a bolt that bursts into an area shows that area too, smaller here).
        const s = e.shot, at = { x: s.x, y: s.y - 0.3, z: s.z }, big = s.op.onHit ? 0.6 : 1;
        const burst = () => {
          flash(at, 0.9 * big, s.ability, 0.45, true, 22 * big);
          if (!s.op.onHit) say('hit', s.ability, O.x + s.x, O.y + s.y, O.z + s.z);
        };
        const flown = this.t - (this.born.get(s.n) ?? this.t);
        this.born.delete(s.n);
        if (flown >= MIN_FLIGHT) { burst(); break; }
        // On from where it was last drawn (the hands if it never was), for the rest of its least flight.
        const seen = this.was.get(s.n), from = seen ? { x: seen.x, y: seen.y, z: seen.z } : this.handsAt(f), rad = Math.max(BOLT_MIN, (s.op.radius ?? 0.18) * 1.4);
        this.tracers.push({ from, to: { x: O.x + s.x, y: O.y + s.y, z: O.z + s.z }, look: this.showingOf(s.ability), rad, n: s.n, life: Math.max(0.08, MIN_FLIGHT - flown), age: 0, land: [burst] });
        break;
      }
      case 'look': {
        flash(e.at, 0.9, e.ability, FLARE, false, 18);
        // A look on a foe strikes there; one on the caster was heard as they let it go.
        if (Math.hypot(e.at.x - f.me.x, e.at.z - f.me.z) > 1.5) say('hit', e.ability, O.x + e.at.x, O.y + e.at.y + 1, O.z + e.at.z);
        break;
      }
      default: break;
    }
  }
}

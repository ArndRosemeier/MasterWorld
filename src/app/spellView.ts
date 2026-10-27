/**
 * Spells drawn (plan 10, C2, C4): what the recipe runner (game/recipe.ts) has going, as glowing shapes in the
 * school's colour and motif, all in one instanced mesh with one shader (materials/spells.ts) built behind the
 * loading screen, so a spell never builds a shader when it is first cast. A spell being cast gathers as an orb
 * at the caster's hand; what flies is an orb with a trail; an area bursts out to its radius and fades; a zone
 * lies as a pulsing disc; a spell on the caster flares round them. Each school's spells shed their own motes
 * (spellMotes.ts): sparks, flakes, grit, seeds of light, glints or wisps.
 */
import { Color, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Object3D, Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { deriveSeed } from '@futuremagic/core';
import type { AbilityDef, SettingModule, SpellMotif } from '../setting/contract';
import type { RecipeEvent, Recipes, Spot } from '../game/recipe';
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
const AHEAD = new Vector3(0, 0, 1);

/** One fight's (or the calm land's) spells, and where its frame sits in the world. */
export interface SpellFrame {
  readonly recipes: Recipes;
  /** The frame's offset into the world (a den's frame; zero out on the land). */
  readonly offset: Spot;
  /** Where the caster stands, in the frame. */
  readonly me: Spot;
  /** What happened since the last frame. */
  readonly cues: readonly RecipeEvent[];
}

interface Flash { x: number; y: number; z: number; radius: number; look: Look; age: number; life: number; grow: boolean }

/** How an ability shows: its school's colour and motif. */
interface Look { readonly color: Color; readonly motif: SpellMotif; readonly n: number }

export class SpellView {
  readonly group = Object.assign(new Group(), { name: 'spells' });
  private readonly mesh: InstancedMesh;
  private readonly flashes: Flash[] = [];
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
  /** What the last frame drew: things flying, bursts or flares, and motes (shots wait for them). */
  shown = { shots: 0, flashes: 0, motes: 0 };

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

  /** How an ability shows: its skill's (a school's) colour and motif, else a pale gold radiance. */
  showingOf(def: AbilityDef): Look {
    const id = def.skill ?? '';
    let l = this.looks.get(id);
    if (!l) {
      const k = this.setting.skills.find((s) => s.id === id);
      const c = k?.color ?? [1, 0.92, 0.7], motif = k?.motif ?? 'radiance';
      l = { color: new Color().setRGB(c[0], c[1], c[2]), motif, n: motifIndex(motif) };
      this.looks.set(id, l);
    }
    return l;
  }

  /** Every frame: draw the frame's spells (null: none). */
  show(dt: number, f: SpellFrame | null): void {
    if (this.frozen) return;
    this.t += dt;
    if (f) for (const e of f.cues) this.hear(e, f);
    this.n = 0;
    if (f) {
      const O = f.offset, r = f.recipes;
      const cast = r.casting, share = r.castShare;
      if (cast && share !== null) {
        const l = this.showingOf(cast.def), x = O.x + f.me.x, y = O.y + f.me.y + 1.35, z = O.z + f.me.z, size = 0.06 + 0.16 * share;
        this.put(x, y, z, size, size, l, 0, 0.6 + 0.6 * share, 0);
        this.motes.shed(l.motif, l, GATHER * dt, x, y, z, 0.25);
      }
      const was = new Map<number, Vector3>();
      for (const s of r.shots) {
        const rad = Math.max(0.14, s.op.radius ?? 0.18), l = this.showingOf(s.ability), x = O.x + s.x, y = O.y + s.y, z = O.z + s.z;
        const before = this.was.get(s.n), along = before ? this.dir.set(x, y, z).sub(before) : null;
        const len = along && dt > 0 ? along.length() : 0;
        if (along && len > 1e-4) this.o.quaternion.setFromUnitVectors(AHEAD, along.divideScalar(len));
        this.put(x, y, z, rad, rad, l, 0, 1.2, s.n, Math.max(rad, (len / dt) * STREAK));
        was.set(s.n, (before ?? new Vector3()).set(x, y, z));
        this.motes.shed(l.motif, l, TRAIL * dt, x, y, z, rad * 0.6);
      }
      this.was = was;
      for (const z of r.zones) {
        const fade = Math.min(1, z.left / 0.5), l = this.showingOf(z.ability);
        this.put(O.x + z.x, O.y + z.y + 0.08, O.z + z.z, z.radius, 0.06, l, 0, (0.35 + 0.12 * Math.sin(this.t * 5 + z.n)) * fade, z.n);
        this.motes.shed(l.motif, l, LINGER * z.radius * dt * fade, O.x + z.x, O.y + z.y + 0.1, O.z + z.z, z.radius * 0.9);
      }
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
    this.shown = { shots: f?.recipes.shots.length ?? 0, flashes: this.flashes.length, motes: this.motes.list.length };
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

  private hear(e: RecipeEvent, f: SpellFrame): void {
    const O = f.offset;
    const flash = (at: Spot, radius: number, def: AbilityDef, life: number, grow: boolean, motes: number) => {
      const look = this.showingOf(def), x = O.x + at.x, y = O.y + at.y + (grow ? 0.3 : 1), z = O.z + at.z;
      this.flashes.push({ x, y, z, radius, look, age: 0, life, grow });
      // A burst throws its motes out across its radius; a flare sheds them round the body.
      this.motes.shed(look.motif, look, motes, x, y, z, grow ? radius * 0.3 : radius * 0.7, grow ? radius * 1.5 : 0);
    };
    switch (e.kind) {
      case 'area': flash(e.at, e.radius, e.ability, BURST, true, 10 + 6 * e.radius); break;
      case 'landed': if (!e.shot.op.onHit) flash({ x: e.shot.x, y: e.shot.y - 1, z: e.shot.z }, 0.5, e.shot.ability, 0.3, true, 10); break;
      case 'look': flash(e.at, 0.9, e.ability, FLARE, false, 18); break;
      default: break;
    }
  }
}

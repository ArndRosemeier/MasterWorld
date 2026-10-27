/**
 * Spells drawn (plan 10, C2): what the recipe runner (game/recipe.ts) has going, as glowing shapes in the
 * school's colour, all in one instanced mesh with one shader (materials/spells.ts) built behind the loading
 * screen. A spell being cast gathers as an orb at the caster's hand; what flies is an orb; an area bursts
 * out to its radius and fades; a zone lies as a pulsing disc; a spell on the caster flares round them.
 * C4 gives each school its own look within the shader budget.
 */
import { Color, Group, IcosahedronGeometry, InstancedMesh, Object3D } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { AbilityDef, SettingModule } from '../setting/contract';
import type { RecipeEvent, Recipes, Spot } from '../game/recipe';
import { SPELL_GLOW } from '../render/materials/spells';

/** Shapes drawn at once, at most. */
const MAX = 96;
/** How long an area's burst and a flare last (s). */
const BURST = 0.5;
const FLARE = 0.9;

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

interface Flash { x: number; y: number; z: number; radius: number; color: Color; age: number; life: number; grow: boolean }

export class SpellView {
  readonly group = Object.assign(new Group(), { name: 'spells' });
  private readonly mesh: InstancedMesh;
  private readonly flashes: Flash[] = [];
  private readonly colors = new Map<string, Color>();
  private readonly o = new Object3D();
  private readonly c = new Color();
  private t = 0;
  /** Held as last drawn (shots of a spell in flight); the spells go on underneath. */
  frozen = false;
  /** What the last frame drew: things flying and bursts or flares (shots wait for them). */
  shown = { shots: 0, flashes: 0 };

  constructor(private readonly setting: SettingModule) {
    const m = new InstancedMesh(new IcosahedronGeometry(1, 2), SPELL_GLOW.make(), MAX);
    Object.assign(m, { name: 'spell glow', frustumCulled: false, castShadow: false, receiveShadow: false, count: 0 });
    // The colour attribute from the start: it is part of the shader's key.
    m.setColorAt(0, new Color(1, 1, 1));
    this.mesh = m;
    this.group.add(m);
  }

  /** Compiled and in the scene (hidden until a spell shows). */
  async enter(stage: Stage): Promise<void> {
    this.mesh.count = 1;
    await stage.add(this.group);
    this.mesh.count = 0;
  }

  /** The colour an ability glows in: its skill's (a school's), else a pale gold. */
  tintOf(def: AbilityDef): Color {
    const id = def.skill ?? '';
    let c = this.colors.get(id);
    if (!c) {
      const k = this.setting.skills.find((s) => s.id === id)?.color ?? [1, 0.92, 0.7];
      c = new Color().setRGB(k[0], k[1], k[2]);
      this.colors.set(id, c);
    }
    return c;
  }

  /** Every frame: draw the frame's spells (null: none). */
  show(dt: number, f: SpellFrame | null): void {
    if (this.frozen) return;
    this.t += dt;
    if (f) for (const e of f.cues) this.hear(e, f);
    let n = 0;
    const put = (x: number, y: number, z: number, sx: number, sy: number, col: Color, k: number) => {
      if (n >= MAX) return;
      this.o.position.set(x, y, z);
      this.o.scale.set(sx, sy, sx);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(n, this.o.matrix);
      this.mesh.setColorAt(n, this.c.copy(col).multiplyScalar(Math.max(0, k)));
      n++;
    };
    if (f) {
      const O = f.offset, r = f.recipes;
      const cast = r.casting, share = r.castShare;
      if (cast && share !== null) put(O.x + f.me.x, O.y + f.me.y + 1.35, O.z + f.me.z, 0.06 + 0.16 * share, 0.06 + 0.16 * share, this.tintOf(cast.def), 0.6 + 0.6 * share);
      for (const s of r.shots) {
        const rad = Math.max(0.14, s.op.radius ?? 0.18);
        put(O.x + s.x, O.y + s.y, O.z + s.z, rad, rad, this.tintOf(s.ability), 1.2);
      }
      for (const z of r.zones) {
        const fade = Math.min(1, z.left / 0.5);
        put(O.x + z.x, O.y + z.y + 0.08, O.z + z.z, z.radius, 0.06, this.tintOf(z.ability), (0.35 + 0.12 * Math.sin(this.t * 5 + z.n)) * fade);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.age += dt;
      if (fl.age >= fl.life) { this.flashes.splice(i, 1); continue; }
      const a = fl.age / fl.life, rad = fl.grow ? fl.radius * (0.3 + 0.7 * a) : fl.radius;
      put(fl.x, fl.y, fl.z, rad, fl.grow ? rad * 0.6 : rad, fl.color, (1 - a) * (fl.grow ? 0.9 : 0.6));
    }
    this.shown = { shots: f?.recipes.shots.length ?? 0, flashes: this.flashes.length };
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private hear(e: RecipeEvent, f: SpellFrame): void {
    const O = f.offset;
    const flash = (at: Spot, radius: number, color: Color, life: number, grow: boolean) =>
      this.flashes.push({ x: O.x + at.x, y: O.y + at.y + (grow ? 0.3 : 1), z: O.z + at.z, radius, color, age: 0, life, grow });
    switch (e.kind) {
      case 'area': flash(e.at, e.radius, this.tintOf(e.ability), BURST, true); break;
      case 'landed': if (!e.shot.op.onHit) flash({ x: e.shot.x, y: e.shot.y - 1, z: e.shot.z }, 0.5, this.tintOf(e.shot.ability), 0.3, true); break;
      case 'look': flash(e.at, 0.9, this.tintOf(e.ability), FLARE, false); break;
      default: break;
    }
  }
}

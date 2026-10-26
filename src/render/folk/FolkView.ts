/**
 * The townsfolk as drawn (plan 9.3): the nearest people the simulation has out of doors, each shown by
 * an Actors character from a small pool. A character taken over by another person is dressed anew (in
 * the shape worker) and shown once ready; until then, and everyone farther off, is a plain figure
 * (FarFolk). Characters far off draw their "Crowd" level (one draw call plus the hair).
 */
import { Group, type Camera, type Material, type Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '../../workers/human.worker?worker';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife } from '../../sim/townLife';
import type { ActivityKind } from '../../sim/spots';
import { FAR, FarFolk } from './FarFolk';
import { castShadows } from '../hero/play';
import { clipOf, coveringLooks, lookOf, PACK_CLIPS, PACK_GARMENTS, PACK_HAIR } from './looks';

/** Where the build serves the pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** People farther than this get no character (m). */
const RANGE = 70;
/**
 * Detail drops sooner than Actors suggests (its levels switch at 8 and 25 m): Medium from about 5.6 m, the one-draw
 * Crowd level from about 17 m. Thirty people in full detail, each a dozen draws and as many in the shadow, took
 * about 10 ms of a town frame on the reference machine.
 */
const LOD_BIAS = 0.7;
/**
 * Only this many of the nearest people get more than the Crowd level; the rest draw as Crowd (one mesh and their
 * hair) wherever they stand. A crowded square no longer costs a dozen draws a head.
 */
const DETAILED = 6;
/** People farther than this (m) cast no shadow (in the Crowd level only the body casts one). */
const SHADOW_RANGE = 35;
/** Characters dressed at once (each takes the worker some tens of milliseconds). */
const DRESSING = 2;

/** Someone indoors, where the room has them (the app places them: render knows no rooms). */
export interface Placed {
  agent: Agent;
  x: number;
  y: number;
  z: number;
  /** Facing (radians, xz atan2, as the agents'). */
  dir: number;
  act: ActivityKind;
}

interface Slot {
  ch: Character;
  /** Where the character stands: its own object keeps the height Actors gives it (feet on y = 0). */
  place: Group;
  /** The agent shown (-1: free). */
  agent: number;
  /** Dressed for that agent and compiled. */
  ready: boolean;
  clip: string;
  /**
   * A dressing still runs. A slot freed meanwhile is not dressed again until it ends: the old run would
   * set the detail level and hide the character under the new run's compiles (hidden objects are not
   * compiled), and that level then built its shaders on the render path.
   */
  busy: boolean;
  /** The detail and shadows set last (`detail`), so they change only when they must. */
  look: string;
}

export class FolkView {
  private readonly slots: Slot[] = [];
  private dressing = 0;
  private readonly shown = new Map<number, Slot>();
  /** Everyone out of doors without a character, as plain figures. */
  private readonly far = new FarFolk();

  private constructor(private readonly stage: Stage, private readonly life: TownLife, private readonly height: (x: number, z: number) => number, lead: Character, others: Character[]) {
    for (const ch of [lead, ...others]) {
      ch.lodBias = LOD_BIAS;
      const place = new Group();
      place.add(ch.object);
      place.name = 'townsfolk';
      place.visible = false;
      const slot: Slot = { ch, place, agent: -1, ready: false, clip: '', busy: false, look: '' };
      this.slots.push(slot);
      ch.object.addEventListener('childadded', ({ child }) => this.late(slot, child));
    }
  }

  /** Materials compiled for the characters (a mesh made later with one of these needs nothing). */
  private readonly compiled = new WeakSet<Material>();

  /**
   * Actors makes some meshes only once a detail level or a fitted shape first needs them, sometimes after
   * the character is drawn: such a mesh with a material of its own would build its shader on the render
   * path. Taken out of the scene at once (the mesh is added before it is drawn), compiled, and back.
   */
  private late(s: Slot, child: Object3D): void {
    if (!s.ready) return;
    let fresh = false;
    child.traverse((m) => { for (const x of materialsOf(m)) if (!this.compiled.has(x)) fresh = true; });
    if (!fresh) return;
    s.ready = false;
    s.place.removeFromParent();
    this.dressing++;
    s.busy = true;
    void this.prepareSlot(s, s.agent).finally(() => { this.dressing--; s.busy = false; });
  }

  /**
   * Loads the pack and `count` characters behind the loading screen, the first dressed like a
   * townsman so its shaders (skin, cloth, hair, each detail level) are compiled by `warm`.
   */
  static async create(stage: Stage, renderer: WebGPURenderer, life: TownLife, height: (x: number, z: number) => number, count: number): Promise<FolkView> {
    const worker = new HumanWorker();
    // Only what the town's pack has (tools/packs/actors.mjs).
    const catalog = (c: CharacterCatalog): CharacterCatalog => ({
      ...c,
      garments: c.garments.filter((g) => PACK_GARMENTS.includes(g.id)),
      hair: c.hair.filter((h) => PACK_HAIR.includes(h.id)),
      animations: c.animations.filter((a) => PACK_CLIPS.includes(a.id)),
    });
    // The first loads the pack; the others share it (and the garments any of them loads).
    const first = await Character.load({ pack: PACK, renderer, materials: nodeMaterials, worker, catalog });
    const share = () => Character.load({ pack: PACK, renderer, materials: nodeMaterials, shareWith: first, catalog });
    const lead = first;
    const others: Character[] = [];
    for (let i = 1; i < count; i++) others.push(await share());
    const view = new FolkView(stage, life, height, lead, others);
    return view;
  }

  /** Dresses the first character as somebody from town and returns what to compile in the warm-up. */
  async warmObjects(): Promise<Object3D[]> {
    const s = this.slots[0], look = coveringLooks(this.life.agents.map((a) => a.person))[0];
    // Undressed if the look's files would not load: the warm-up still compiles the body.
    if (look) await s.ch.set({ ...look, animation: 'walk' }).catch((e: unknown) => console.error('[folk] dressing the first failed', e));
    s.ch.setLod(0);
    this.adapt(s.place);
    s.place.visible = true; // the warm-up compiles what is shown; hidden again in warmLods
    return [s.place, this.far.mesh];
  }

  /**
   * After the warm-up, while the loop runs (the Stage compiles in its frame slots): every detail level
   * of the first character, dressed in turn as a few townsfolk who between them wear everything in town
   * (each garment, hairstyle and beard draws, and casts its shadow, with shaders of its own). Nobody is
   * drawn before.
   */
  async warmLods(): Promise<void> {
    const ch = this.slots[0].ch;
    const place = this.slots[0].place;
    place.removeFromParent();
    const looks = coveringLooks(this.life.agents.map((a) => a.person));
    for (let i = 0; i < looks.length; i++) {
      // A look whose files would not load is skipped: its garments then compile when first worn.
      try {
        if (i > 0) await ch.set({ ...looks[i], animation: 'walk' });
        for (let k = i > 0 ? 0 : 1; k < ch.lods.length; k++) {
          ch.setLod(k);
          this.adapt(place);
          await this.stage.prepare(place, { everyCaster: true });
        }
      } catch (e) {
        console.error('[folk] warming a look failed', e);
      }
    }
    ch.setLod(0);
    this.slots[0].place.visible = false;
    this.stage.scene.add(this.far.mesh);
    this.warm = true;
  }
  private warm = false;

  /** While the player is in a room: the people in it (and nobody out of doors is drawn). */
  indoors: readonly Placed[] | null = null;

  /** Where nobody out of doors is drawn just now (the creator's view of the hero), or null. */
  clear: ((x: number, z: number) => boolean) | null = null;

  /** Each frame: who is drawn, where and doing what. */
  follow(dt: number, cam: Camera): void {
    if (!this.warm) return;
    const cx = cam.position.x, cz = cam.position.z;
    // The nearest people out of doors (or those in the room).
    const near: [number, Agent][] = [];
    const placed = new Map<number, Placed>();
    if (this.indoors) {
      for (const p of this.indoors) { near.push([Math.hypot(p.x - cx, p.z - cz), p.agent]); placed.set(p.agent.person.id, p); }
    } else {
      for (const a of this.life.agents) {
        if (a.hidden || this.clear?.(a.x, a.z)) continue;
        const d = Math.hypot(a.x - cx, a.z - cz);
        if (d < FAR) near.push([d, a]);
      }
    }
    near.sort((x, y) => x[0] - y[0]);
    const want = new Set(near.slice(0, this.slots.length).filter(([d]) => d < RANGE).map(([, a]) => a.person.id));
    // Free the characters of people no longer wanted.
    for (const [id, s] of this.shown) {
      if (want.has(id)) continue;
      this.shown.delete(id);
      s.agent = -1;
      s.ready = false;
      s.place.visible = false;
    }
    // Dress free characters for the nearest people without one.
    for (const [, a] of near) {
      if (this.dressing >= DRESSING || !want.size) break;
      if (!want.has(a.person.id) || this.shown.has(a.person.id)) continue;
      const s = this.slots.find((x) => x.agent < 0 && !x.busy);
      if (!s) break;
      this.dress(s, a);
    }
    const ranked: [number, Slot][] = [];
    for (const s of this.shown.values()) if (s.ready) ranked.push([Math.hypot(s.place.position.x - cx, s.place.position.z - cz), s]);
    ranked.sort((x, y) => x[0] - y[0]);
    ranked.forEach(([d, s], i) => this.detail(s, i < DETAILED, d < SHADOW_RANGE));
    for (const s of this.shown.values()) {
      if (!s.ready) continue;
      const a = this.life.agents[s.agent], p = placed.get(a.person.id);
      const o = s.place;
      if (p) o.position.set(p.x, p.y, p.z);
      else o.position.set(a.x, this.height(a.x, a.z), a.z);
      // Agents face `dir` (atan2 in x, z); a character faces +z.
      o.rotation.y = Math.PI / 2 - (p ? p.dir : a.dir);
      const clip = clipOf(p ? p.act : a.act, a.person.id);
      if (clip !== s.clip) {
        s.clip = clip;
        void s.ch.play(clip);
      }
      s.ch.update(dt);
    }
    // The rest (and those whose character is still being dressed) as plain figures.
    if (this.indoors) this.far.place([], this.height);
    else this.far.place(near.filter(([, a]) => !this.shown.get(a.person.id)?.ready).map(([, a]) => a), this.height);
  }

  /**
   * How much of `s` is drawn: its own detail by distance (Actors' "auto") or the Crowd level, and shadows from every
   * part (but NO_SHADOW's), from the Crowd body alone, or none. Every caster's shadow shader was built when it was
   * dressed (prepareSlot), so switching builds nothing.
   */
  private detail(s: Slot, detailed: boolean, shadow: boolean): void {
    const look = `${detailed}${shadow}`;
    if (look === s.look) return;
    s.look = look;
    const crowd = s.ch.lods.length - 1;
    s.ch.setLod(detailed ? 'auto' : crowd);
    castShadows(s.place);
    s.place.traverse((m) => {
      if (!(m as Mesh).isMesh) return;
      if (!shadow || (!detailed && m.name !== 'crowd')) m.castShadow = false;
    });
  }

  private dress(s: Slot, a: Agent): void {
    s.agent = a.person.id;
    s.ready = false;
    s.clip = clipOf(a.act, a.person.id);
    this.shown.set(a.person.id, s);
    this.dressing++;
    s.busy = true;
    const id = a.person.id;
    s.ch.set({ ...lookOf(a.person), animation: s.clip })
      .then(() => this.prepareSlot(s, id))
      .catch((e: unknown) => console.error('[folk] dressing failed', e))
      .finally(() => { this.dressing--; s.busy = false; });
  }

  /** Compiles a dressed character (a cache hit for kinds already seen) and puts it in the scene. */
  private async prepareSlot(s: Slot, id: number): Promise<void> {
    // Out of the scene and shown while compiling (compileAsync skips hidden objects, and the shadow
    // pass is warmed only for objects not yet in the scene).
    s.place.removeFromParent();
    s.place.visible = true;
    // Every detail level in turn (each is its own meshes, shown only once chosen: left to 'auto' they
    // built their shaders on the render path), and every caster: a character's shadow shaders are its
    // own (its shape, its garments' fitting).
    for (let k = 0; k < s.ch.lods.length && s.agent === id; k++) {
      s.ch.setLod(k);
      this.adapt(s.place);
      // Hidden meshes too: Actors keeps some it may show later at this level (the body's own crowd
      // mesh beside the merged one), and compileAsync skips hidden objects.
      const hidden: Object3D[] = [];
      s.place.traverse((m) => { if (!m.visible && (m as Mesh).isMesh) { hidden.push(m); m.visible = true; } });
      await this.stage.prepare(s.place, { everyCaster: true });
      for (const m of hidden) m.visible = false;
      s.place.traverse((m) => { for (const x of materialsOf(m)) this.compiled.add(x); });
    }
    s.ch.setLod('auto');
    s.look = ''; // `detail` sets it again on the next frame
    if (s.agent !== id) { s.place.visible = false; return; } // taken over meanwhile
    this.stage.scene.add(s.place);
    s.ready = true;
  }

  /** What never shows casts no shadow (Actors flips its garments' polygon offsets for reversed depth itself). */
  private adapt(o: Object3D): void {
    castShadows(o);
  }

  /** The camera that picks each character's detail level. */
  set camera(cam: Camera) { for (const s of this.slots) s.ch.lodCamera = cam; }

  get hudText(): string {
    let ready = 0;
    for (const s of this.shown.values()) if (s.ready) ready++;
    return `folk ${ready}/${this.slots.length}`;
  }
}

/** A mesh's materials (none for other objects). */
function materialsOf(o: Object3D): Material[] {
  const m = (o as Mesh).material;
  return !(o as Mesh).isMesh || !m ? [] : Array.isArray(m) ? m : [m];
}

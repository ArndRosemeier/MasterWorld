/**
 * The townsfolk as drawn (plan 9.3): the nearest people the simulation has out of doors, each shown by
 * an Actors character from a small pool. A character taken over by another person is dressed anew (in
 * the shape worker) and shown once ready; until then, and everyone farther off, is a plain figure
 * (FarFolk). Characters far off draw their "Crowd" level (one draw call plus the hair).
 */
import { Group, type Camera, type Material, type Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife } from '../../sim/townLife';
import type { ActivityKind } from '../../sim/spots';
import { FAR, FarFolk } from './FarFolk';
import { clipOf, coveringLooks, drawn, lookOf, PACK_CLIPS, PACK_GARMENTS, PACK_HAIR } from './looks';

/** Where the build serves the pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** People farther than this get no character (m). */
const RANGE = 70;
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
}

export class FolkView {
  private readonly slots: Slot[] = [];
  private dressing = 0;
  private readonly shown = new Map<number, Slot>();
  /** Everyone out of doors without a character, as plain figures. */
  private readonly far = new FarFolk();

  private constructor(private readonly reversed: boolean, private readonly stage: Stage, private readonly life: TownLife, private readonly height: (x: number, z: number) => number, lead: Character, others: Character[]) {
    for (const ch of [lead, ...others]) {
      const place = new Group();
      place.add(ch.object);
      place.name = 'townsfolk';
      place.visible = false;
      this.slots.push({ ch, place, agent: -1, ready: false, clip: '' });
    }
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
    // A character knows only the garments and hairstyles the shared pack had loaded when it was made, and
    // wearing one another character loaded first shows nothing (Actors 0.10). So a holder (never drawn)
    // loads the whole wardrobe first, and every drawn character is made after.
    const holder = await Character.load({ pack: PACK, renderer, materials: nodeMaterials, worker, clipLibraries: false, catalog });
    await holder.human.loadMeshes([...PACK_GARMENTS, ...PACK_HAIR]);
    const share = () => Character.load({ pack: PACK, renderer, materials: nodeMaterials, shareWith: holder, catalog });
    const lead = await share();
    const others: Character[] = [];
    for (let i = 1; i < count; i++) others.push(await share());
    const view = new FolkView(renderer.reversedDepthBuffer === true, stage, life, height, lead, others);
    return view;
  }

  /** Dresses the first character as somebody from town and returns what to compile in the warm-up. */
  async warmObjects(): Promise<Object3D[]> {
    const s = this.slots[0], look = coveringLooks(this.life.agents.map((a) => a.person))[0];
    if (look) await s.ch.set({ ...look, animation: 'walk' });
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
      if (i > 0) await ch.set({ ...looks[i], animation: 'walk' });
      for (let k = i > 0 ? 0 : 1; k < ch.lods.length; k++) {
        ch.setLod(k);
        this.adapt(place);
        await this.stage.prepare(place, { everyCaster: true });
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

  /** Each frame: who is drawn, where and doing what. */
  follow(dt: number, cam: Camera): void {
    if (!this.warm) return;
    const cx = cam.position.x, cz = cam.position.z;
    // The nearest people out of doors (or those in the room).
    const near: [number, Agent][] = [];
    const placed = new Map<number, Placed>();
    if (this.indoors) {
      for (const p of this.indoors) if (drawn(p.agent.person)) { near.push([Math.hypot(p.x - cx, p.z - cz), p.agent]); placed.set(p.agent.person.id, p); }
    } else {
      for (const a of this.life.agents) {
        if (a.hidden || !drawn(a.person)) continue;
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
      const s = this.slots.find((x) => x.agent < 0);
      if (!s) break;
      this.dress(s, a);
    }
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

  private dress(s: Slot, a: Agent): void {
    s.agent = a.person.id;
    s.ready = false;
    s.clip = clipOf(a.act, a.person.id);
    this.shown.set(a.person.id, s);
    this.dressing++;
    const id = a.person.id;
    s.ch.set({ ...lookOf(a.person), animation: s.clip })
      .then(async () => {
        s.ch.setLod('auto');
        this.adapt(s.place);
        // Its meshes are new: compile (a cache hit for kinds already seen) before it is drawn.
        // Out of the scene and shown while compiling (compileAsync skips hidden objects, and the shadow
        // pass is warmed only for objects not yet in the scene).
        s.place.removeFromParent();
        s.place.visible = true;
        // Every caster: a character's shadow shaders are its own (its shape, its garments' fitting).
        await this.stage.prepare(s.place, { everyCaster: true });
        if (s.agent !== id) { s.place.visible = false; return; } // taken over meanwhile
        this.stage.scene.add(s.place);
        s.ready = true;
      })
      .catch((e: unknown) => console.error('[folk] dressing failed', e))
      .finally(() => { this.dressing--; });
  }

  /**
   * Actors draws clothes over the skin, and each garment layer over the one below, by polygon offsets
   * toward the camera (negative). With reversed depth (view.ts) a negative offset pushes away: the skin
   * and underclothes showed through in patches. Flipped once per material (garments are made lazily).
   * Also what never shows casts no shadow.
   */
  private adapt(o: Object3D): void {
    o.traverse((m) => {
      const mesh = m as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name.startsWith('genitals')) mesh.castShadow = false; // always clothed: a shadow shader for nothing
      if (!this.reversed) return;
      for (const x of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
        if (!x.polygonOffset || x.userData.offsetReversed) continue;
        x.polygonOffsetFactor = -x.polygonOffsetFactor;
        x.polygonOffsetUnits = -x.polygonOffsetUnits;
        x.userData.offsetReversed = true;
      }
    });
  }

  /** The camera that picks each character's detail level. */
  set camera(cam: Camera) { for (const s of this.slots) s.ch.lodCamera = cam; }

  get hudText(): string {
    let ready = 0;
    for (const s of this.shown.values()) if (s.ready) ready++;
    return `folk ${ready}/${this.slots.length}`;
  }
}

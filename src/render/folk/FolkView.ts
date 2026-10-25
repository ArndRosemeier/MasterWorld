/**
 * The townsfolk as drawn (plan 9.3): the nearest people the simulation has out of doors, each shown by
 * an Actors character from a small pool. A character taken over by another person is dressed anew (in
 * the shape worker) and shown once ready; until then the person is simply not drawn. Characters far off
 * draw their "Crowd" level (one draw call plus the hair).
 */
import { Group, type Camera, type Material, type Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife } from '../../sim/townLife';
import { clipOf, coveringLooks, drawn, lookOf, PACK_CLIPS, PACK_GARMENTS, PACK_HAIR } from './looks';

/** Where the build serves the pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** People farther than this are not drawn (m). */
const RANGE = 70;
/** Characters dressed at once (each takes the worker some tens of milliseconds). */
const DRESSING = 2;

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
    this.reverseOffsets(s.place);
    s.place.visible = true; // the warm-up compiles what is shown; hidden again in warmLods
    return [s.place];
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
        this.reverseOffsets(place);
        await this.stage.prepare(place);
      }
    }
    ch.setLod(0);
    this.slots[0].place.visible = false;
    this.warm = true;
  }
  private warm = false;

  /** Each frame: who is drawn, where and doing what. */
  follow(dt: number, cam: Camera): void {
    if (!this.warm) return;
    const cx = cam.position.x, cz = cam.position.z;
    // The nearest people out of doors.
    const near: [number, Agent][] = [];
    for (const a of this.life.agents) {
      if (a.hidden || !drawn(a.person)) continue;
      const d = Math.hypot(a.x - cx, a.z - cz);
      if (d < RANGE) near.push([d, a]);
    }
    near.sort((x, y) => x[0] - y[0]);
    const want = new Set(near.slice(0, this.slots.length).map(([, a]) => a.person.id));
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
      if (this.dressing >= DRESSING) break;
      if (!want.has(a.person.id) || this.shown.has(a.person.id)) continue;
      const s = this.slots.find((x) => x.agent < 0);
      if (!s) break;
      this.dress(s, a);
    }
    for (const s of this.shown.values()) {
      if (!s.ready) continue;
      const a = this.life.agents[s.agent];
      const o = s.place;
      o.position.set(a.x, this.height(a.x, a.z), a.z);
      // Agents face `dir` (atan2 in x, z); a character faces +z.
      o.rotation.y = Math.PI / 2 - a.dir;
      const clip = clipOf(a.act, a.person.id);
      if (clip !== s.clip) {
        s.clip = clip;
        void s.ch.play(clip);
      }
      s.ch.update(dt);
    }
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
        this.reverseOffsets(s.place);
        // Its meshes are new: compile (a cache hit for kinds already seen) before it is drawn.
        // Out of the scene and shown while compiling (compileAsync skips hidden objects, and the shadow
        // pass is warmed only for objects not yet in the scene).
        s.place.removeFromParent();
        s.place.visible = true;
        await this.stage.prepare(s.place);
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
   */
  private reverseOffsets(o: Object3D): void {
    if (!this.reversed) return;
    o.traverse((m) => {
      const mat = (m as Mesh).material;
      if (!mat) return;
      for (const x of (Array.isArray(mat) ? mat : [mat]) as Material[]) {
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

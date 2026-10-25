/**
 * The townsfolk as drawn (plan 9.3): the nearest people the simulation has out of doors, each shown by
 * an Actors character from a small pool. A character taken over by another person is dressed anew (in
 * the shape worker) and shown once ready; until then the person is simply not drawn. Characters far off
 * draw their "Crowd" level (one draw call plus the hair).
 */
import type { Camera, Object3D, WebGPURenderer } from 'three/webgpu';
import { Character } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife } from '../../sim/townLife';
import { clipOf, drawn, lookOf, PACK_CLIPS, PACK_GARMENTS, PACK_HAIR } from './looks';

/** Where the build serves the pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** People farther than this are not drawn (m). */
const RANGE = 70;
/** Characters dressed at once (each takes the worker some tens of milliseconds). */
const DRESSING = 2;

interface Slot {
  ch: Character;
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

  private constructor(private readonly stage: Stage, private readonly life: TownLife, private readonly height: (x: number, z: number) => number, lead: Character, others: Character[]) {
    for (const ch of [lead, ...others]) this.slots.push({ ch, agent: -1, ready: false, clip: '' });
  }

  /**
   * Loads the pack and `count` characters behind the loading screen, the first dressed like a
   * townsman so its shaders (skin, cloth, hair, each detail level) are compiled by `warm`.
   */
  static async create(stage: Stage, renderer: WebGPURenderer, life: TownLife, height: (x: number, z: number) => number, count: number): Promise<FolkView> {
    const worker = new HumanWorker();
    const lead = await Character.load({
      pack: PACK, renderer, materials: nodeMaterials, worker, clipLibraries: false,
      // Only what the town's pack has (tools/packs/actors.mjs).
      catalog: (c) => ({
        ...c,
        garments: c.garments.filter((g) => PACK_GARMENTS.includes(g.id)),
        hair: c.hair.filter((h) => PACK_HAIR.includes(h.id)),
        animations: c.animations.filter((a) => PACK_CLIPS.includes(a.id)),
      }),
    });
    const others: Character[] = [];
    for (let i = 1; i < count; i++) others.push(await Character.load({ pack: PACK, renderer, materials: nodeMaterials, shareWith: lead }));
    const view = new FolkView(stage, life, height, lead, others);
    for (const s of view.slots) {
      s.ch.object.visible = false;
      s.ch.object.name = 'townsfolk';
    }
    return view;
  }

  /** Dresses the first character as somebody from town and returns what to compile in the warm-up. */
  async warmObjects(): Promise<Object3D[]> {
    const s = this.slots[0], p = this.life.agents.find((a) => drawn(a.person))?.person;
    if (p) await s.ch.set({ ...lookOf(p), animation: 'walk' });
    s.ch.setLod(0);
    return [s.ch.object];
  }

  /**
   * After the warm-up, while the loop runs (the Stage compiles in its frame slots): the other detail
   * levels of the first character, whose meshes (and the crowd level's merged one) draw with
   * materials of their own. Nobody is drawn before.
   */
  async warmLods(): Promise<void> {
    const ch = this.slots[0].ch;
    for (let k = 1; k < ch.lods.length; k++) {
      ch.setLod(k);
      await this.stage.prepare(ch.object);
    }
    ch.setLod(0);
    this.warm = true;
  }
  private warm = false;

  /** Each frame: who is drawn, where and doing what. */
  update(dt: number, cam: Camera): void {
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
      s.ch.object.visible = false;
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
      const o = s.ch.object;
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
        // Its meshes are new: compile (a cache hit for kinds already seen) before it is drawn.
        await this.stage.prepare(s.ch.object);
        if (s.agent !== id) return; // taken over meanwhile
        if (!s.ch.object.parent) this.stage.scene.add(s.ch.object);
        s.ch.object.visible = true;
        s.ready = true;
      })
      .catch((e: unknown) => console.error('[folk] dressing failed', e))
      .finally(() => { this.dressing--; });
  }

  /** The camera that picks each character's detail level. */
  set camera(cam: Camera) { for (const s of this.slots) s.ch.lodCamera = cam; }

  get stats(): string {
    let ready = 0;
    for (const s of this.shown.values()) if (s.ready) ready++;
    return `folk ${ready}/${this.slots.length}`;
  }
}

/**
 * The townsfolk as drawn (plan 9.3): the nearest people the simulation has out of doors, each shown by
 * an Actors character from a small pool. A character taken over by another person is dressed anew (in
 * the shape worker) and shown once ready; until then, and everyone farther off, is a plain figure
 * (FarFolk). Characters far off draw their "Crowd" level (one draw call plus the hair).
 */
import { Frustum, Group, Matrix4, Sphere, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '../../workers/human.worker?worker';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife } from '../../sim/townLife';
import type { Person } from '../../sim/people';
import type { ActivityKind } from '../../sim/spots';
import { FAR, FarFolk } from './FarFolk';
import { castShadows, eachMesh } from '../hero/play';
import { SHADOW_ONLY } from '../sky';
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
/**
 * Someone among them keeps the detail until this much farther (m) than the nearest without, and shadows go off past
 * SHADOW_RANGE + this: every switch of level costs Actors a rebuild of what the clothes hide, so two people at about
 * the same distance must not trade places every frame.
 */
const STICK = 4;
/** People farther than this (m) cast no shadow (in the Crowd level only the body casts one). */
const SHADOW_RANGE = 35;
/** Nearer than this a plain figure in view stands out in a picture (`undressed` counts these), m. */
const CLOSE = 40;
const VIEW = new Frustum(), SCRATCH = new Matrix4(), AT = new Vector3(), BALL = new Sphere();
/** Round a person's middle, the sphere that tells whether they are in view (m: arms, a carried load, a clip's reach). */
const REACH = 1.6;
/** Seconds between two checks of every character's layers, for meshes Actors made since (a merged crowd mesh). */
const RELAYER = 0.5;
/** Seconds a sitter takes to settle onto the bench (about the clip's fade from walking). */
const SETTLE = 0.5;
/** How far the seat bones are under the hip joints for a body with hips 0.92 m up (Actors' Mount), m. */
const SEAT_BONES = 0.085;
/**
 * Seconds between two dressings begun. In rain the square empties and fills as people run for shelter, and each
 * dressing runs through every detail level, each of which costs Actors a rebuild of what the clothes hide: begun as
 * fast as slots came free, that took half of the main thread. Until dressed, people are plain figures.
 */
const DRESS_GAP = 0.3;
/** Resolves at the next frame. */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
/** Characters dressed at once (each takes the worker some tens of milliseconds). */
const DRESSING = 2;
/**
 * Before the game begins (`focus` set: the title covers the town): more at once. Each dressing steps a detail level
 * a frame, and the title's frames are long while the start loads, so two at a time held the start for seconds.
 */
const DRESSING_EARLY = 5;

/** Someone indoors, where the room has them (the app places them: render knows no rooms). */
export interface Placed {
  agent: Agent;
  x: number;
  y: number;
  z: number;
  /** Facing (radians, xz atan2, as the agents'). */
  dir: number;
  act: ActivityKind;
  /** Sitting on a bench: the height of its top (the sitter's seat goes there, whatever their size). */
  seat?: number;
}

interface Slot {
  ch: Character;
  /** Where the character stands: its own object keeps the height Actors gives it (feet on y = 0). */
  place: Group;
  /** The agent shown (null: free). */
  agent: Agent | null;
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
  detailed: boolean;
  shadow: boolean;
  /** Dressed for somebody before (a new dressing takes it over: DRESS_GAP). */
  used: boolean;
  /** In the camera's view as its layers were set last (null: set them on the next frame). */
  seen: boolean | null;
  /** Seconds since the clip began (a sitter settles onto the bench as the clip fades in). */
  since: number;
}

export class FolkView {
  private readonly slots: Slot[] = [];
  private dressing = 0;
  /** Seconds until the next dressing may begin (DRESS_GAP). */
  private dressWait = 0;
  private readonly shown = new Map<Agent, Slot>();
  /** The people of every town near the hero (plan B3a: the start town's and each settlement's alike). */
  lives: readonly TownLife[] = [];
  /** Everyone out of doors without a character, as plain figures. */
  private readonly far = new FarFolk();

  private constructor(private readonly stage: Stage, private readonly dressedAs: readonly Person[], private readonly height: (x: number, z: number) => number, lead: Character, others: Character[]) {
    for (const ch of [lead, ...others]) {
      ch.lodBias = LOD_BIAS;
      const place = new Group();
      place.add(ch.object);
      place.name = 'townsfolk';
      place.visible = false;
      const slot: Slot = { ch, place, agent: null, ready: false, clip: '', busy: false, look: '', detailed: false, shadow: false, used: false, seen: null, since: 0 };
      this.slots.push(slot);
    }
  }

  /**
   * Loads the pack and `count` characters behind the loading screen, the first dressed like a
   * townsman so its shaders (skin, cloth, hair, each detail level) are compiled by `warm`.
   */
  static async create(stage: Stage, renderer: WebGPURenderer, dressedAs: readonly Person[], height: (x: number, z: number) => number, count: number): Promise<FolkView> {
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
    const view = new FolkView(stage, dressedAs, height, lead, others);
    return view;
  }

  /** Dresses the first character as somebody from town and returns what to compile in the warm-up. */
  async warmObjects(): Promise<Object3D[]> {
    const s = this.slots[0], look = coveringLooks(this.dressedAs)[0];
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
   * drawn before the first look stands in every detail level: then `shown` resolves and the town fills (each
   * character still compiles what it wears before it shows, `prepareSlot`), while the other looks warm on,
   * behind play (plan A7: load what the first view needs, the rest after).
   */
  warmLods(): { shown: Promise<void>; done: Promise<void> } {
    let show = (): void => {};
    const shown = new Promise<void>((r) => { show = r; });
    const done = this.warmAll(() => {
      this.stage.scene.add(this.far.mesh);
      this.warm = true;
      show();
    }).finally(show);
    return { shown, done };
  }

  private async warmAll(first: () => void): Promise<void> {
    const slot = this.slots[0], ch = slot.ch;
    const place = slot.place;
    place.removeFromParent();
    slot.busy = true; // not dressed for anybody while it tries the looks on
    this.trying = true;
    const looks = coveringLooks(this.dressedAs);
    for (let i = 0; i < looks.length; i++) {
      if (i === 1) first();
      // Before the game begins the people round the hero come first: their dressing compiles what they wear, and
      // the looks nobody there wears wait (they are tried on behind play).
      while (i > 0 && this.focus && (this.dressing > 0 || this.waiting > 0)) await new Promise((r) => setTimeout(r, 50));
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
    if (!this.warm) first();
    ch.setLod(0);
    place.visible = false;
    slot.busy = false;
    this.trying = false;
  }
  private warm = false;
  /** The first character tries the looks on (warmAll). */
  private trying = false;
  private waiting = 0;

  /** How many people within CLOSE in the camera's view (or of `focus`) are plain figures while their character is dressed (before the warm-up ends at least 1). */
  get undressed(): number { return this.warm ? this.waiting : Math.max(1, this.waiting); }

  /** While a building is drawn open: the people in it, where it has them (drawn besides those out of doors). */
  indoors: readonly Placed[] | null = null;

  /** Where nobody out of doors is drawn just now (the creator's view of the hero), or null. */
  clear: ((x: number, z: number) => boolean) | null = null;

  /**
   * Whom to dress for, if not the camera: the hero's place while the title's fly-over (far up) covers the town, so
   * the people round the hero are dressed before the dive lands there (plan A7). `undressed` then counts everyone
   * near it, in view or not.
   */
  focus: { readonly x: number; readonly z: number } | null = null;

  /** Each frame: who is drawn, where and doing what. */
  follow(dt: number, cam: Camera): void {
    if (!this.warm) return;
    VIEW.setFromProjectionMatrix(SCRATCH.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    this.relayer -= dt;
    const relayer = this.relayer <= 0;
    if (relayer) this.relayer = RELAYER;
    const cx = this.focus?.x ?? cam.position.x, cz = this.focus?.z ?? cam.position.z;
    // The nearest people out of doors (or those in the room).
    const near: [number, Agent][] = [];
    const placed = new Map<Agent, Placed>();
    for (const p of this.indoors ?? []) { near.push([Math.hypot(p.x - cx, p.z - cz), p.agent]); placed.set(p.agent, p); }
    for (const life of this.lives) {
      for (const a of life.agents) {
        if (a.hidden || placed.has(a) || this.clear?.(a.x, a.z)) continue;
        const d = Math.hypot(a.x - cx, a.z - cz);
        if (d < FAR) near.push([d, a]);
      }
    }
    near.sort((x, y) => x[0] - y[0]);
    // (Not counting the first character while it tries the looks on: nobody waits for it.)
    const want = new Set(near.slice(0, this.slots.length - (this.trying ? 1 : 0)).filter(([d]) => d < RANGE).map(([, a]) => a));
    // Free the characters of people no longer wanted.
    for (const [a, s] of this.shown) {
      if (want.has(a)) continue;
      this.shown.delete(a);
      s.agent = null;
      s.ready = false;
      s.place.visible = false;
    }
    // Dress free characters for the nearest people without one.
    this.dressWait = Math.max(0, this.dressWait - dt);
    for (const [, a] of near) {
      if (this.dressing >= (this.focus ? DRESSING_EARLY : DRESSING) || !want.size || this.dressWait > 0) break;
      if (!want.has(a) || this.shown.has(a)) continue;
      const s = this.slots.find((x) => !x.agent && !x.busy);
      if (!s) break;
      // The first fill of the pool goes at full speed; taking over a character waits its turn.
      if (s.used) this.dressWait = DRESS_GAP;
      s.used = true;
      this.dress(s, a);
    }
    const ranked: [number, Slot][] = [];
    for (const s of this.shown.values()) if (s.ready) ranked.push([Math.hypot(s.place.position.x - cx, s.place.position.z - cz), s]);
    ranked.sort((x, y) => x[0] - y[0]);
    // Who keeps the detail: those who had it, until they are STICK farther than the DETAILED-th nearest; then the
    // nearest fill it up.
    const edge = (ranked[DETAILED - 1]?.[0] ?? Infinity) + STICK, keep = new Set<Slot>();
    for (const [d, s] of ranked) if (s.detailed && d <= edge && keep.size < DETAILED) keep.add(s);
    for (const [, s] of ranked) if (keep.size < DETAILED) keep.add(s);
    for (const [d, s] of ranked) this.detail(s, keep.has(s), s.shadow ? d < SHADOW_RANGE + STICK : d < SHADOW_RANGE);
    for (const s of this.shown.values()) {
      if (!s.ready) continue;
      const a = s.agent!, p = placed.get(a);
      const o = s.place;
      if (p) o.position.set(p.x, p.y, p.z);
      else o.position.set(a.x, this.height(a.x, a.z), a.z);
      // Agents face `dir` (atan2 in x, z); a character faces +z.
      o.rotation.y = Math.PI / 2 - (p ? p.dir : a.dir);
      this.inView(s, VIEW.intersectsSphere(BALL.set(AT.set(o.position.x, o.position.y + 0.9, o.position.z), REACH)), relayer);
      const clip = clipOf(p ? p.act : a.act, a.person.id);
      if (clip !== s.clip) {
        s.clip = clip;
        s.since = 0;
        void s.ch.play(clip);
      } else s.since += dt;
      s.ch.update(dt);
      if (p?.seat !== undefined && clip.startsWith('sit')) this.seatOn(s, p.x, p.seat, p.z);
    }
    // The rest (and those whose character is still being dressed) as plain figures.
    const pending = near.filter(([, a]) => !this.shown.get(a)?.ready);
    // (Those in the open building wait for a character: a plain figure stands on the ground, not on its floor.)
    this.far.place(pending.filter(([, a]) => !placed.has(a)).map(([, a]) => a), this.height);
    // How many of those (or of the room's people), close in view, wait for a character (beyond the characters' count they stay plain).
    let waiting = 0;
    // In a room too (nobody there is a plain figure: the undressed are not drawn at all).
    for (const [d, a] of pending) {
      const p = placed.get(a);
      if (d < CLOSE && want.has(a) && (this.focus || VIEW.containsPoint(p ? AT.set(p.x, p.y + 1, p.z) : AT.set(a.x, this.height(a.x, a.z) + 1, a.z)))) waiting++;
    }
    this.waiting = waiting;
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
    s.seen = null;
    s.detailed = detailed;
    s.shadow = shadow;
    const crowd = s.ch.lods.length - 1;
    s.ch.setLod(detailed ? 'auto' : crowd);
    castShadows(s.place);
    eachMesh(s.place, (m) => { if (!shadow || (!detailed && m.name !== 'crowd')) m.castShadow = false; });
  }

  private dress(s: Slot, a: Agent): void {
    s.agent = a;
    s.ready = false;
    s.clip = clipOf(a.act, a.person.id);
    s.since = SETTLE; // dressed already in the clip (no fade)
    this.shown.set(a, s);
    this.dressing++;
    s.busy = true;
    s.ch.set({ ...lookOf(a.person), animation: s.clip })
      .then(() => this.prepareSlot(s, a))
      .catch((e: unknown) => console.error('[folk] dressing failed', e))
      .finally(() => { this.dressing--; s.busy = false; });
  }

  /**
   * Compiles a dressed character (a cache hit for kinds already seen) and puts it in the scene. A mesh Actors makes
   * later (a detail level's merged crowd mesh) is left to the Stage: drawn once its shader is built in a cap slot.
   */
  private async prepareSlot(s: Slot, id: Agent): Promise<void> {
    // Out of the scene and shown while compiling (compileAsync skips hidden objects, and the shadow
    // pass is warmed only for objects not yet in the scene).
    s.place.removeFromParent();
    s.place.visible = true;
    // Every detail level in turn (each is its own meshes, shown only once chosen: left to 'auto' they
    // built their shaders on the render path), and every caster: a character's shadow shaders are its
    // own (its shape, its garments' fitting).
    // One level a frame: each switch has Actors work out what the clothes hide (a few ms each), and back to back
    // with the dressing they held one frame up to 70 ms.
    for (let k = 0; k < s.ch.lods.length && s.agent === id; k++) {
      await nextFrame();
      s.ch.setLod(k);
      this.adapt(s.place);
      // Hidden meshes too: Actors keeps some it may show later at this level (the body's own crowd
      // mesh beside the merged one), and compileAsync skips hidden objects.
      const hidden: Object3D[] = [];
      eachMesh(s.place, (m) => { if (!m.visible) { hidden.push(m); m.visible = true; } });
      await this.stage.prepare(s.place, { everyCaster: true });
      for (const m of hidden) m.visible = false;
    }
    await nextFrame();
    s.ch.setLod('auto');
    s.look = ''; // `detail` sets it again on the next frame
    s.seen = null;
    s.detailed = s.shadow = false;
    if (s.agent !== id) { s.place.visible = false; return; } // taken over meanwhile
    this.stage.scene.add(s.place);
    s.ready = true;
  }

  /**
   * Out of view, a character is drawn into the sun's shadow map only (its shadow may fall into the view): Actors'
   * meshes are never frustum culled (skinned, their bounds do not follow the pose), so everyone round the camera,
   * behind it too, cost the view a dozen draws a head.
   */
  private inView(s: Slot, seen: boolean, again: boolean): void {
    if (seen === s.seen && !again) return;
    s.seen = seen;
    const mask = seen ? 1 : 1 << SHADOW_ONLY;
    eachMesh(s.place, (m) => { m.layers.mask = mask; });
  }
  private relayer = 0;

  /**
   * Puts a sitter's seat on the bench top at (x, y, z): the sit clip lowers the hips by a share of their height (Actors
   * keeps root motion in hip heights), so a halfling sank into the bench and a tall man hovered over it. The seat is
   * under the pelvis by what it is in the bind pose (down to the seat bones, as Actors' Mount has it); eased in while
   * the clip fades in from walking.
   */
  private seatOn(s: Slot, x: number, y: number, z: number): void {
    const actor = s.ch.actor, f = actor.fittedSkeleton;
    if (!f) return;
    const ip = f.names.indexOf('pelvis'), il = f.names.indexOf('thigh_l'), ir = f.names.indexOf('thigh_r');
    if (ip < 0 || il < 0 || ir < 0 || !actor.bones[ip]) return;
    const hips = (f.heads[il][1] + f.heads[ir][1]) / 2;
    const drop = f.heads[ip][1] - (hips - SEAT_BONES * Math.max(0.3, hips / 0.92));
    const w = actor.bones[ip].getWorldPosition(AT);
    s.place.parent?.worldToLocal(w);
    const k = Math.min(1, s.since / SETTLE);
    s.place.position.x += (x - w.x) * k;
    s.place.position.y += (y + drop - w.y) * k;
    s.place.position.z += (z - w.z) * k;
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


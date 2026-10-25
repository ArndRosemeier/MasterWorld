/**
 * The hero as drawn: an Actors character in the look the player made (plan 11.4), posed each frame from where
 * the body is and what it does: a clip per gait (walk, jog, sprint, swim, jump), the fight's blows and
 * flinches, Actors' riding pose in the saddle. Held weapons ride on the hands in a fight and at the hip
 * otherwise.
 *
 * A new look never builds a shader on the render path: it is put on a second, hidden character, compiled
 * (each garment, hairstyle and shadow) and then swapped in, so the old look shows until the new one is ready.
 */
import { Group, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Rng, deriveSeed } from '@futuremagic/core';
import { Character, outfitGarments, randomConfig, type CharacterCatalog, type CharacterConfig, type CharacterPatch } from '@actors/generator';
import type { RaceId } from '@actors/human';
import { Mount } from '@actors/three';
import { nodeMaterials } from '@actors/three/webgpu';
import { RIDE } from '@actors/human';
import HumanWorker from '@actors/human/worker?worker';
import type { Stage } from '@futuremagic/stage';
import { buildArm } from './arms';
import { ACTION_CLIPS, HERO_CLIPS, PACE } from './clips';
import { gripHeld } from './grips';
import { FADE, playClip } from './play';

/** Where the build serves the people's pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;

/** What the body does (the walker's gait, or a state the game sets). */
export type HeroGait = 'idle' | 'walk' | 'run' | 'swim' | 'jump' | 'fall' | 'ride' | 'dead';

/** A one-shot action: its id ('swing_1h', 'punch', 'drink', 'flinch' …), start (on `clock`) and length (s). */
export interface HeroAction { id: string; t0: number; dur: number }

/** One frame of the hero: feet position, velocity, facing (the walker's yaw: −z turned about +y), gait. */
export interface HeroPose {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  gait: HeroGait;
  /** Weapons drawn (in a fight). */
  combat?: boolean;
  /** A blow, a drink, a flinch. */
  action?: HeroAction;
  /** Riding ('ride'): the saddle's height over `pos` (pos is the point under the saddle), on a horse. */
  seat?: number;
}

/** What the setting lets a hero look like (the setting's `hero`): Actors' themes and the peoples. */
export interface HeroLooks {
  readonly themes: readonly string[];
  readonly without: readonly string[];
  readonly races: readonly string[];
  /** Outfit presets a new hero starts in. */
  readonly outfits: readonly string[];
}

/** Outfit presets a hero is never offered (real-world religious orders). */
const LEFT_OUT_PRESETS = ['med-nun'];

/** Swimming or treading water, the body is this far (of the height) down in the water: head and shoulders above it. */
const SWIM_DROP = 0.15;

/** The hero's catalog: the setting's themes (filtered by Actors), its peoples, no robots or skeletons. */
export function heroCatalog(looks: HeroLooks): (c: CharacterCatalog) => CharacterCatalog {
  return (c) => ({
    ...c,
    races: c.races.filter((r) => looks.races.includes(r.id)),
    outfits: c.outfits.filter((o) => o.garments.length > 0 && !LEFT_OUT_PRESETS.includes(o.id) && o.id !== 'underwear'),
    animations: c.animations.filter((a) => HERO_CLIPS.includes(a.id)),
    robot: undefined,
    skeletal: undefined,
  });
}

/** A new hero of the setting drawn from `seed`: one of its peoples (or `race`), in one of its starting outfits. */
export function newHero(catalog: CharacterCatalog, looks: HeroLooks, base: CharacterConfig, seed: number, race?: string): CharacterConfig {
  const rng = new Rng(deriveSeed(seed, 'hero', 'look'));
  const races = catalog.races.map((r) => r.id);
  const born = (race && races.includes(race as RaceId) ? race : rng.pick(races)) as RaceId;
  const look = randomConfig(catalog, base, { random: () => rng.float(), race: born, outfit: false });
  const female = look.body.gender < 0.5;
  const presets = catalog.outfits.filter((o) => looks.outfits.includes(o.id) && (!o.gender || o.gender === (female ? 'female' : 'male')));
  const preset = presets.length ? rng.pick(presets) : null;
  return {
    ...look, anatomy: false, animation: 'idle',
    ...(preset ? { outfit: outfitGarments(preset, look.body), garmentColors: { ...preset.colors } } : {}),
  };
}

/** Options for Actors' Character.load that give the hero's catalog. */
const loadOptions = (looks: HeroLooks) => ({
  pack: PACK, materials: nodeMaterials, clipLibraries: false,
  themes: { themes: [...looks.themes], without: [...looks.without] },
  catalog: heroCatalog(looks),
});

export class HeroView {
  /** The hero in the scene (the character inside it is swapped when the look changes). */
  readonly object = new Group();
  private time = 0;
  private clip = '';
  /** The next clip cuts in (snap). */
  private cut = false;
  private actionShown: HeroAction | null = null;
  private held: { main: Object3D | null; off: Object3D | null; drawn: boolean | null } = { main: null, off: null, drawn: null };
  private wanted: CharacterPatch | null = null;
  private dressing: Promise<void> | null = null;
  private readonly seatAt = new Vector3();
  private readonly listeners = new Set<(c: CharacterConfig) => void>();

  private constructor(private front: Character, private back: Character, private readonly stage: Stage) {
    this.object.name = 'hero';
    this.object.add(front.object);
  }

  /**
   * Loads the hero behind the loading screen: in `look` (a save's), or a new hero of the setting drawn from
   * `seed` (one of its peoples, or `race`, in one of its starting outfits).
   */
  static async load(stage: Stage, renderer: WebGPURenderer, looks: HeroLooks, look: CharacterPatch | null, seed: number, race?: string): Promise<HeroView> {
    const opts = loadOptions(looks);
    const front = await Character.load({ ...opts, renderer, worker: new HumanWorker(), config: { ...look, anatomy: false, animation: 'idle' } });
    if (!look) await front.set(newHero(front.catalog, looks, front.config, seed, race));
    const back = await Character.load({ ...opts, renderer, shareWith: front });
    for (const c of [front, back]) c.setLod(0); // always close to the camera
    shadows(front.object);
    return new HeroView(front, back, stage);
  }

  /**
   * A character for the creator's editor, never drawn (load it, edit it; `follow` shows its look on the
   * hero). Dispose it when the creator closes.
   */
  async model(renderer: WebGPURenderer, looks: HeroLooks): Promise<Character> {
    return Character.load({ ...loadOptions(looks), renderer, shareWith: this.front, config: { ...this.front.config, animation: null } });
  }

  /** The look as worn now (for saves). */
  get look(): CharacterConfig { return this.front.config; }

  /** Called after the hero's look changed (swapped in). */
  onLook(listener: (c: CharacterConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What the creator offers (races, garments, hair …). */
  get catalog(): CharacterCatalog { return this.front.catalog; }

  /**
   * Shows a new look: put on the hidden character, compiled, then swapped in (the latest wins when several
   * come quickly, as with a slider's drag).
   */
  dress(look: CharacterPatch): Promise<void> {
    this.wanted = { ...look, anatomy: false, animation: null };
    if (!this.dressing) this.dressing = this.dressAll().finally(() => { this.dressing = null; });
    return this.dressing;
  }

  private async dressAll(): Promise<void> {
    while (this.wanted) {
      const want = this.wanted;
      this.wanted = null;
      const next = this.back;
      await next.set(want);
      // Compiled out of the scene and shown (compileAsync skips hidden meshes; Actors keeps meshes it may
      // show later hidden), with every shadow caster of its own.
      const hidden: Object3D[] = [];
      next.object.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      shadows(next.object);
      await this.stage.prepare(next.object, { everyCaster: true });
      for (const o of hidden) o.visible = false;
      // Swap: the new look takes over the old one's place, clip and held things.
      const old = this.front;
      this.front = next;
      this.back = old;
      this.object.remove(old.object);
      this.object.add(next.object);
      const clip = this.clip;
      this.clip = '';
      if (clip) this.startClip(clip);
      this.moveHeld();
      for (const l of this.listeners) l(next.config);
    }
  }

  /** Height of the body standing, metres. */
  get height(): number { return this.front.height || 1.75; }

  /** Hold these (item ids; null: empty-handed): drawn in a fight, at the hip otherwise. */
  arm(main: string | null, off: string | null = null): void {
    for (const o of [this.held.main, this.held.off]) o?.removeFromParent();
    this.held = { main: main ? buildArm(main) : null, off: off ? buildArm(off) : null, drawn: null };
    this.moveHeld();
  }

  /** The body's clock (actions are timed by it). */
  get clock(): number { return this.time; }

  /** Shown or not (first person hides it). */
  set visible(v: boolean) { this.object.visible = v; }

  /** The next pose at once, not blended (getting on or off a horse). */
  snap(): void { this.cut = true; }

  animateTo(p: HeroPose, dt: number): void {
    this.time += dt;
    const o = this.object;
    // The walker's yaw turns −z; Actors' people face +z.
    o.rotation.y = p.yaw + Math.PI;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const acting = p.action && this.time - p.action.t0 < p.action.dur ? p.action : null;
    const clip = p.gait === 'ride' ? 'ride' : acting ? ACTION_CLIPS[acting.id] ?? 'sword slash A' : this.gaitClip(p, speed);
    if (clip !== this.clip || (acting && acting !== this.actionShown)) {
      this.actionShown = acting;
      this.startClip(clip, acting?.dur);
    }
    const action = this.front.actor.currentAction;
    const pace = PACE[clip];
    if (action && pace) action.timeScale = Math.min(1.8, Math.max(0.5, speed / pace));
    this.front.update(dt);
    if (p.gait === 'ride') {
      // Seated: the rider's seat (below the middle of the hips) on the saddle.
      const seat = this.riderSeat();
      o.position.set(p.pos.x, p.pos.y + (p.seat ?? 0), p.pos.z);
      if (seat) o.position.sub(seat.applyQuaternion(o.quaternion));
    } else {
      o.position.set(p.pos.x, p.pos.y - (clip === 'swim' || clip === 'tread water' ? this.height * SWIM_DROP : 0), p.pos.z);
    }
    if (this.held.drawn !== !!p.combat) { this.held.drawn = !!p.combat; this.moveHeld(); }
  }

  private gaitClip(p: HeroPose, speed: number): string {
    switch (p.gait) {
      case 'walk': return 'walk';
      case 'run': return speed > 5 ? 'sprint' : 'jog';
      case 'swim': return speed > 0.4 ? 'swim' : 'tread water';
      case 'jump': case 'fall': return 'jump';
      case 'dead': return 'death';
      default: return p.combat ? (this.held.main ? 'sword idle' : 'fight stance') : 'idle';
    }
  }

  /** Plays `clip` on the hero now; a one-shot (an action, death) once from its start, held at its end. */
  private startClip(clip: string, dur?: number): void {
    this.clip = clip;
    const ch = this.front;
    if (clip === 'ride') {
      // Actors' riding pose (a made clip, not in the pack): the character's own clip off first.
      void ch.play(null).then(() => { if (this.clip === 'ride' && this.front === ch) ch.actor.play(RIDE); });
      return;
    }
    const once = dur !== undefined || clip === 'death';
    const fade = this.cut ? 0 : once ? FADE.once : FADE.loop;
    this.cut = false;
    playClip(ch, clip, once, () => this.clip === clip, dur, fade);
  }

  /** Where the rider's seat is in the hero's own space (Actors' Mount knows the hips). */
  private riderSeat(): Vector3 | null {
    const s = new Mount(this.front.actor, this.front.actor).riderSeat();
    // Actors' seat is in the character's own space, which stands lifted inside the hero.
    return s ? this.seatAt.copy(s).applyMatrix4(this.front.object.matrix) : null;
  }

  /** The held things onto the hands (in a fight) or the hip and back. */
  private moveHeld(): void {
    gripHeld(this.held.main, this.held.off, !!this.held.drawn, this.front.actor.bones, this.object);
  }
}

/** Every mesh of the hero casts a shadow. */
function shadows(o: Object3D): void {
  o.traverse((m) => { if ((m as { isMesh?: boolean }).isMesh && !m.name.startsWith('genitals')) m.castShadow = true; });
}

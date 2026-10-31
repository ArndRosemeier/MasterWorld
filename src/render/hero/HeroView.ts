/**
 * The hero as drawn: an Actors character in the look the player made (plan 11.4), posed each frame from where
 * the body is and what it does: a clip per gait (walk, jog, sprint, swim, jump), the fight's blows and
 * flinches, Actors' riding pose in the saddle. Held weapons ride on the hands in a fight and at the hip
 * otherwise.
 *
 * A new look never builds a shader on the render path: it is put on a second, hidden character, compiled
 * (each garment, hairstyle and shadow) and then swapped in, so the old look shows until the new one is ready.
 */
import { Group, Quaternion, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Rng, deriveSeed, smoothstep } from '@futuremagic/core';
import { Character, outfitGarments, randomConfig, type CharacterCatalog, type CharacterConfig, type CharacterPatch } from '@actors/generator';
import type { RaceId } from '@actors/human';
import { Mount } from '@actors/three';
import { nodeMaterials } from '@actors/three/webgpu';
import { RIDE } from '@actors/human';
import HumanWorker from '../../workers/human.worker?worker';
import type { Stage } from '@futuremagic/stage';
import { ORIGIN } from '../origin';
import { buildArm, torchFlame, TORCH_TIP } from './arms';
import { ACTION_CLIPS, HERO_CLIPS, PACE, SIT_DOWN, STAND_UP } from './clips';
import { gripHeld } from './grips';
import { FADE, castShadows, handOf, playClip, preparePeople, seatOf } from './play';
import { Jolt, joltRoot, joltSpine } from '../jolt';
import { inBuild } from './build';
import type { HeroBuildDef } from '../../setting/contract';
import type { FigureRig, LimbGoals } from '@futuremagic/figure';
import { BodyRig, applyPuppet, limbGoals, type HeroPuppet } from './puppet';

/** An empty goal for a hand or foot. */
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
  /** Sitting on the ground to rest (game/rest.ts); only while the gait is idle. */
  rest?: boolean;
  /** Played by a scene (a climb down a ladder): a pose over the clips, hands and feet put somewhere, its own clip. */
  puppet?: HeroPuppet;
}

export type { HeroPuppet } from './puppet';

/** What the setting lets a hero look like (the setting's `hero`): Actors' themes and the peoples. */
export interface HeroLooks {
  readonly themes: readonly string[];
  readonly without: readonly string[];
  readonly races: readonly string[];
  /** Outfit presets a new hero starts in. */
  readonly outfits: readonly string[];
  /** The build a random hero is drawn in. */
  readonly build?: HeroBuildDef;
}

/** Outfit presets a hero is never offered (real-world religious orders). */
const LEFT_OUT_PRESETS = ['med-nun'];

/** Swimming or treading water, the body is this far (of the height) down in the water: head and shoulders above it. */
const SWIM_DROP = 0.15;
/** Seconds a sitter takes to get back up to full height when walking off (about the walk's fade in). */
const RISE = 0.25;
/** The seat this far over the ground, m (the cloth under it). */
const SEAT_LIFT = 0.02;
const smooth = (t: number) => t * t * (3 - 2 * t);
const AT = new Vector3(), KNEE = new Vector3(), ANKLE = new Vector3(), SEAT = new Vector3();
const TURN = new Quaternion(), BENT = new Quaternion(), UP = new Quaternion(), NONE = new Quaternion();
/** Where a lit torch's hand is held, in the body's frame for a body 1.75 m tall (m: left, up, ahead). */
const TORCH_HAND = [0.34, 1.12, 0.26] as const;
/** How long raising or lowering the torch takes (s). */
const TORCH_RAISE = 0.4;
/** A held torch's head leans this far ahead of upright (about the body's +x). */
const TORCH_LEAN = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25);
const torchQ = new Quaternion(), handQ = new Quaternion();

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
  const random = () => rng.float();
  const look = inBuild(() => randomConfig(catalog, base, { random, race: born, outfit: false }), looks.build, random);
  const female = look.body.gender < 0.5;
  const presets = catalog.outfits.filter((o) => looks.outfits.includes(o.id) && (!o.gender || o.gender === (female ? 'female' : 'male')));
  const preset = presets.length ? rng.pick(presets) : null;
  return {
    ...look, anatomy: false, animation: 'idle',
    ...(preset ? { outfit: outfitGarments(preset, look.body), garmentColors: { ...preset.colors } } : {}),
  };
}

/** Options for Actors' Character.load that give the hero's catalog. */
export const loadOptions = (looks: HeroLooks) => ({
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
  /** The off hand's torch burns (`torchLit`), and how far the arm has raised it (0 down, 1 held up and out). */
  private readonly torch = { lit: false, up: 0 };
  private wanted: CharacterPatch | null = null;
  private dressing: Promise<void> | null = null;
  private readonly seatAt = new Vector3();
  /** Resting: sitting (or sitting down), seconds since it began or ended, standing up, how far down (0 standing, 1 sat). */
  private readonly rest = { on: false, t: 0, rising: false, k: 0 };
  private readonly listeners = new Set<(c: CharacterConfig) => void>();
  /** The last blow taken: the body knocked back from it, whatever it is doing. */
  private readonly jolt = new Jolt();

  /** Hands-on control of the drawn body's bones (made for it when a scene first plays it). */
  private readonly rigs = new BodyRig(this.object);
  /** The rig turned bones last frame (they go back before the clips play again). */
  private rigged = false;
  /** The limbs' goals in the scene's frame (the world's less the floating origin). */
  private readonly goals: LimbGoals = limbGoals();

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
    castShadows(front.object);
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
      // Compiled out of the scene, with every shadow caster of its own.
      castShadows(next.object);
      await preparePeople(this.stage, next.object);
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

  /** The hips' height over the feet, standing (m). */
  get hipHeight(): number { return this.rigOf()?.hipHeight ?? 0.52 * this.height; }

  /** The rig of the body drawn now, fitted to it (null before its skeleton is there). */
  private rigOf(): FigureRig | null {
    return this.rigs.of(this.front, this.height);
  }


  /** Hold these (item ids; null: empty-handed): drawn in a fight, at the hip otherwise. */
  arm(main: string | null, off: string | null = null): void {
    for (const o of [this.held.main, this.held.off]) o?.removeFromParent();
    this.held = { main: main ? buildArm(main) : null, off: off ? buildArm(off) : null, drawn: null };
    // A torch put back in hand burns on; anything else in the off hand puts the light out.
    const f = torchFlame(this.held.off);
    if (f) f.visible = this.torch.lit; else this.torch.lit = false;
    this.moveHeld();
  }

  /** Holds a torch in the off hand (lit or not). */
  get holdsTorch(): boolean { return !!torchFlame(this.held.off); }

  /**
   * Lights the off hand's torch, or puts it out (the game says when: in the dark, not indoors or swimming). Lit,
   * it is held up and out ahead in the left hand, upright, its flame burning; out, it goes back on the back.
   */
  set torchLit(lit: boolean) {
    const f = torchFlame(this.held.off), on = lit && !!f;
    if (on === this.torch.lit) return;
    this.torch.lit = on;
    if (f) f.visible = on;
    this.moveHeld();
  }
  get torchLit(): boolean { return this.torch.lit; }

  /** Where the torch's flame burns in the world (`out`), null when it is not lit. */
  flameAt(out: Vector3): Vector3 | null {
    const t = this.held.off;
    if (!this.torch.lit || !t) return null;
    t.updateWorldMatrix(true, false);
    // matrixWorld is relative to the floating origin (render/origin.ts): back into the world.
    return out.set(0, TORCH_TIP, 0).applyMatrix4(t.matrixWorld).add(ORIGIN.at);
  }

  /** The body's clock (actions are timed by it). */
  get clock(): number { return this.time; }

  /** Where a hand is in the world (`out`), null before the body has loaded. */
  handAt(side: 'l' | 'r', out: Vector3): Vector3 | null {
    return handOf(this.front.actor, side, out);
  }

  /** Shown or not (first person hides it). */
  set visible(v: boolean) { this.object.visible = v; }

  /** Struck: knocked back along (dx, dz) (away from the blow), `k` how hard (1 a plain blow). */
  struck(dx: number, dz: number, k = 1): void { this.jolt.hit(dx, dz, k); }

  /** The next pose at once, not blended (getting on or off a horse). */
  snap(): void { this.cut = true; }

  animateTo(p: HeroPose, dt: number): void {
    this.time += dt;
    const o = this.object;
    // The walker's yaw turns −z; Actors' people face +z.
    o.rotation.y = p.yaw + Math.PI;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const acting = p.action && this.time - p.action.t0 < p.action.dur ? p.action : null;
    const resting = this.stepRest(p, dt);
    const clip = p.puppet?.clip ?? (p.gait === 'ride' ? 'ride' : acting ? ACTION_CLIPS[acting.id] ?? 'sword slash A' : resting ?? this.gaitClip(p, speed));
    // Bones a scene turned last frame go back as bound first (a finger no clip moves would keep its curl).
    if (this.rigged) { this.rigs.current?.relax(); this.rigged = false; }
    if (clip !== this.clip || (acting && acting !== this.actionShown)) {
      this.actionShown = acting;
      this.startClip(clip, acting?.dur ?? (clip === 'sit down' ? SIT_DOWN : clip === 'stand up' ? STAND_UP : undefined));
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
      if (this.rest.k > 0) this.sitOnGround(p.pos.y, this.rest.k);
    }
    this.jolt.step(dt);
    if (p.gait !== 'dead' && p.gait !== 'ride') {
      joltRoot(o, this.jolt, 0.08);
      const f = this.front.actor.fittedSkeleton;
      if (f) joltSpine(this.front.actor.bones, f.names, this.jolt, 0.4);
    }
    if (p.puppet) this.puppetOn(p.puppet);
    else if (acting?.id === 'level_up') this.armsUp(this.time - acting.t0, acting.dur);
    // A spell is cast with empty hands: the weapon goes away while it gathers and is thrown.
    const drawn = !!p.combat && !acting?.id.startsWith('spell_');
    if (this.held.drawn !== drawn) { this.held.drawn = drawn; this.moveHeld(); }
    this.holdTorch(p, acting, dt);
  }

  /**
   * A lit torch held up: the left hand out to the side at the chest (eased in over a moment, so the
   * arm is seen lifting it), and the torch upright in the fist whatever the hand does, its head leaning ahead.
   */
  private holdTorch(p: HeroPose, acting: HeroAction | null, dt: number): void {
    const T = this.torch, t = this.held.off;
    const raise = T.lit && !p.puppet && p.gait !== 'dead' && p.gait !== 'swim' && acting?.id !== 'level_up';
    T.up = Math.max(0, Math.min(1, T.up + (raise ? dt : -dt) / TORCH_RAISE));
    const rig = T.up > 0 ? this.rigOf() : null;
    if (rig) {
      // The left hand out to the side and ahead at the chest (Actors' people face +z, +x their left), so the
      // torch stands beside the head, seen from behind as from the front.
      const o = this.object, g = this.goals, k = this.height / 1.75;
      o.updateMatrixWorld(true);
      g.L!.p.set(TORCH_HAND[0] * k, TORCH_HAND[1] * k, TORCH_HAND[2] * k);
      o.localToWorld(g.L!.p);
      g.L!.w = smooth(T.up); g.L!.pole = undefined; g.L!.flat = null;
      g.R!.w = 0; g.footL!.w = 0; g.footR!.w = 0;
      g.curl = { L: 1.2 }; g.curlW = smooth(T.up);
      rig.reachFor(g);
      this.rigged = true;
    }
    if (!T.lit || !t?.parent) return;
    // Upright in the world (the body's turn, leaning ahead), whatever the fist's own turn.
    this.object.getWorldQuaternion(torchQ).multiply(TORCH_LEAN);
    t.quaternion.copy(t.parent.getWorldQuaternion(handQ).invert().multiply(torchQ));
    t.updateMatrix();
  }

  /**
   * A level gained (G3): both arms raised high to the ring of light, seen from behind as from the front (no clip
   * lifts them that far). Up over the first quarter second, down over the last third of one.
   */
  private armsUp(t: number, dur: number): void {
    const rig = this.rigOf();
    if (!rig) return;
    const w = smoothstep(0, 0.25, t) * (1 - smoothstep(dur - 0.35, dur, t));
    if (w <= 0) return;
    const o = this.object, g = this.goals, h = this.height;
    o.updateMatrixWorld(true);
    // Actors' people face +z: the hands a little apart and forward, above the head.
    g.L!.p.set(0.2 * h / 1.75, 1.2 * h, 0.12 * h / 1.75);
    g.R!.p.set(-0.2 * h / 1.75, 1.2 * h, 0.12 * h / 1.75);
    for (const k of ['L', 'R'] as const) { const to = g[k]!; o.localToWorld(to.p); to.w = w; to.pole = undefined; to.flat = null; }
    g.footL!.w = 0;
    g.footR!.w = 0;
    g.curl = { L: 0.25, R: 0.25 };
    g.curlW = w;
    rig.reachFor(g);
    this.rigged = true;
  }

  /** A scene's pose over the clips, and hands and feet onto its goals (moved into the scene's frame). */
  private puppetOn(p: HeroPuppet): void {
    const rig = this.rigOf();
    if (rig && applyPuppet(rig, this.object, this.goals, p)) this.rigged = true;
  }

  /**
   * Sitting down to rest and up again: the clip it plays (sitting down, sitting, standing up; null: none of
   * them), and how far down the body is (rest.k), eased with the clips, and quickly back up when walking off.
   */
  private stepRest(p: HeroPose, dt: number): string | null {
    const r = this.rest, idle = p.gait === 'idle';
    const want = !!p.rest && idle;
    r.t += dt;
    if (want !== r.on) { r.rising = !want && idle && r.k > 0.5; r.on = want; r.t = 0; }
    if (r.rising && (!idle || r.t >= STAND_UP)) r.rising = false;
    const target = r.on ? smooth(Math.min(1, r.t / SIT_DOWN)) : r.rising ? 1 - smooth(r.t / STAND_UP) : 0;
    r.k = r.on || r.rising ? target : Math.max(0, r.k - dt / RISE);
    return r.on ? (r.t < SIT_DOWN ? 'sit down' : 'sit') : r.rising ? 'stand up' : null;
  }

  /**
   * Down on the ground (by `k`, 0 to 1): Actors' sit clips sit on a chair, so the knees straighten (the legs
   * out in front, along the thighs) and the body comes down until its seat is on the ground at `ground`.
   */
  private sitOnGround(ground: number, k: number): void {
    const actor = this.front.actor, f = actor.fittedSkeleton;
    if (!f) return;
    const bone = (n: string) => actor.bones[f.names.indexOf(n)];
    this.object.updateWorldMatrix(true, true);
    for (const side of ['l', 'r']) {
      const thigh = bone(`thigh_${side}`), calf = bone(`calf_${side}`), foot = bone(`foot_${side}`);
      if (!thigh || !calf?.parent || !foot) continue;
      thigh.getWorldPosition(AT);
      calf.getWorldPosition(KNEE);
      foot.getWorldPosition(ANKLE);
      const along = AT.subVectors(KNEE, AT).normalize(), shin = ANKLE.sub(KNEE).normalize();
      // The shin turned in line with the thigh (by k), in world space, then back into the calf's own.
      TURN.setFromUnitVectors(shin, along);
      NONE.identity().slerp(TURN, k);
      calf.getWorldQuaternion(BENT);
      calf.parent.getWorldQuaternion(UP);
      calf.quaternion.copy(UP.invert().multiply(NONE.multiply(BENT)));
    }
    this.object.updateWorldMatrix(true, true);
    const seat = seatOf(actor, SEAT);
    if (seat) this.object.position.y += Math.min(0, ground + SEAT_LIFT - seat.y) * k;
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
    gripHeld(this.held.main, this.held.off, !!this.held.drawn, this.front.actor, this.object, !!this.held.drawn || this.torch.lit);
  }
}

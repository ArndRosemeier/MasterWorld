/**
 * Animal forms in play (game/birdForm.ts, plan 10, S6): the action bar's Bird form or Otter form starts the change,
 * and while it goes on this takes the player's frame (Player.shape). The change: the hero kneels (bird) or treads
 * water (otter), a swirl gathers and wheels round them ever faster (glowing feathers, silver bubbles), the hero sinks
 * into it and is gone, the animal grows out of it, the swirl bursts outward and fades, and the animal calls. Changing
 * back is the same the other way round, shorter. A fight near by breaks the change. As the animal the hero camera's
 * keys move it (`FormKit`: a pheasant flies, an otter swims and dives); in any form no other ability works.
 */
import { Vector3 } from 'three/webgpu';
import { damp } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import type { AbilityDef } from '../setting/contract';
import { changeLook, Shapeshift, type ShiftAround, type ShiftEvent } from '../game/birdForm';
import { BirdFlight, type BirdDoing, type FlightIntent } from '../sim/birdFlight';
import { OtterSwim, type OtterDoing } from '../sim/otterSwim';
import type { WalkWorld } from '../game/walker';
import { BIRD_LOOK, FormView, OTTER_LOOK } from '../render/hero/FormView';
import type { HeroAction } from '../render/hero/HeroView';
import type { Notes } from './notes';
import type { Player } from './player';

export interface FormHost {
  readonly stage: Stage;
  readonly notes: Notes;
  /** What around the hero bears on the change (a fight, a horse, water, a roof). */
  around(): ShiftAround;
  /** Something worth saving happened (the change is over). */
  changed?(): void;
}

/** Where the hero stands while changing (the animal grows there). */
interface Spot { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

/** How an animal form moves (pure, sim/): a pheasant's flight, an otter's swimming. */
export interface FormSim {
  readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
  /** Where it can turn back (a bird on the ground, an otter at the surface or in the shallows). */
  readonly grounded: boolean;
  /** A frame from the hero camera's keys (`land`: asked to turn back, so glide down or come up). */
  steer(i: FlightIntent, dt: number): void;
}

/** One animal: how it moves and how it is drawn, as the change needs them. */
export interface FormKit {
  readonly sim: FormSim;
  /** The line when the build has no such animal. */
  readonly missing: string;
  /** The keys, said on becoming it (they cannot be shown). */
  readonly keys: string;
  /** Said as the change begins. */
  readonly again: string;
  /** The camera's distance (m) to it. */
  readonly zoom: number;
  /** Its head over its middle (m), for the camera. */
  readonly head: number;
  /** The hero kneels to change (on land); in the water they tread it. */
  readonly kneels: boolean;
  /** The swirl's foot under the hero (m: bubbles rise from below). */
  readonly sink: number;
  /** Becomes the animal where the hero is. */
  begin(x: number, z: number, yaw: number): void;
  /** Loaded and compiled; false: the build has none. */
  load(stage: Stage): Promise<boolean>;
  /** Drawn where it is (`at` null) or growing at the hero's spot while changing, `scale` 0..1. */
  drawForm(at: Spot | null, scale: number, returning: boolean, dt: number): void;
  wheel(x: number, y: number, z: number, k: ReturnType<typeof changeLook>, dt: number): void;
  hide(): void;
  cry(): void;
}

/** Moved by a FormSim, drawn by a FormView loaded once. */
abstract class ViewKit<D extends string, S extends FormSim> {
  protected view: FormView<D> | null = null;
  constructor(readonly sim: S) {}
  protected async loadView(make: () => Promise<FormView<D> | null>): Promise<boolean> {
    this.view ??= await make();
    return !!this.view;
  }
  wheel(x: number, y: number, z: number, k: ReturnType<typeof changeLook>, dt: number): void { this.view?.wheel(x, y, z, k.glow, k.radius, k.height, k.pace, dt); }
  hide(): void { this.view?.hide(); }
  cry(): void { this.view?.cry(); }
}

/** Bird form: a pheasant that walks, takes off, flaps, glides, dives and lands (sim/birdFlight.ts). */
export class BirdKit extends ViewKit<BirdDoing, BirdFlight> implements FormKit {
  readonly missing = 'This build has no bird to become (it was made without the animal library).';
  readonly keys = 'Space takes off and climbs, W flaps on, X dives; Bird form again to land.';
  readonly again = '(Bird form again to stop.)';
  readonly zoom = 3;
  readonly head = 0.35;
  readonly kneels = true;
  readonly sink = 0;
  constructor(world: WalkWorld) { super(new BirdFlight(world)); }
  begin(x: number, z: number, yaw: number): void { this.sim.perch(x, z, yaw); }
  load(stage: Stage): Promise<boolean> { return this.loadView(() => FormView.forHero(stage, BIRD_LOOK, 'idle')); }
  drawForm(at: Spot | null, scale: number, returning: boolean, dt: number): void {
    const f = this.sim;
    if (!at) { this.view?.pose({ ...f.pos, yaw: f.yaw, bank: f.bank, pitch: f.pitch, doing: f.doing, scale }, dt); return; }
    this.view?.pose({ ...at, bank: 0, pitch: 0, doing: returning && f.doing === 'land' ? 'land' : 'idle', scale }, dt);
  }
}

/** The otter's body drawn this far lower while it paddles (m), so its back is at the waterline. */
const PADDLE_LOW = 0.12;

/** Otter form: fast at the surface, diving deep, holding its breath long (sim/otterSwim.ts). */
export class OtterKit extends ViewKit<OtterDoing, OtterSwim> implements FormKit {
  readonly missing = 'This build has no otter to become (it was made without the animal library).';
  readonly keys = 'W swims on, X dives, Space rises; Otter form again at the surface to be yourself.';
  readonly again = '(Otter form again to stop.)';
  readonly zoom = 3.2;
  readonly head = 0.25;
  readonly kneels = false;
  readonly sink = 0.8;
  constructor(world: WalkWorld) { super(new OtterSwim(world)); }
  begin(x: number, z: number, yaw: number): void { this.sim.slipIn(x, z, yaw); }
  load(stage: Stage): Promise<boolean> { return this.loadView(() => FormView.forHero(stage, OTTER_LOOK, 'float')); }
  /** How far the paddling body is drawn under its line (m): the mink's fast-swim clip holds the body high, so it would skim. */
  private low = 0;
  drawForm(at: Spot | null, scale: number, _returning: boolean, dt: number): void {
    const s = this.sim;
    this.low += ((!at && s.doing === 'paddle' ? PADDLE_LOW : 0) - this.low) * damp(4, dt);
    this.view?.pose(at ? { ...at, bank: 0, pitch: 0, doing: 'float', scale } : { ...s.pos, y: s.pos.y - this.low, yaw: s.yaw, bank: 0, pitch: s.pitch, doing: s.doing, scale }, dt);
  }
}

export class ShapeForm<K extends FormKit = FormKit> {
  readonly shift: Shapeshift;
  private loading: Promise<boolean> | null = null;
  /** The build has no such animal (no PrivateAssets): the ability cannot be used. */
  private missing = false;
  private zoomWas = 5;
  /** The hero's kneel while changing (one action, so the clip plays once and holds). */
  private kneel: HeroAction | null = null;
  private readonly headAt = new Vector3();

  constructor(ability: AbilityDef, readonly kit: K, private readonly player: Player, private readonly host: FormHost) {
    this.shift = new Shapeshift(ability);
  }

  /** As the animal in the hero's place (the dwellers leave it alone, doors and hatches don't open). */
  get animal(): boolean { return this.shift.phase === 'animal'; }

  /** The animal loaded and compiled ahead (a hero who knows the ability): the change then shows it at once. */
  warm(): Promise<boolean> {
    this.loading ??= this.kit.load(this.host.stage).then((ok) => {
      this.missing = !ok;
      return ok;
    }, (err: unknown) => {
      console.warn(`${this.shift.ability.name}:`, err instanceof Error ? err.message : err);
      this.missing = true;
      return false;
    });
    return this.loading;
  }

  /** The ability used from the bar: a line why not, or null. */
  invoke(): string | null {
    if (this.missing) return this.kit.missing;
    void this.warm();
    const ev: ShiftEvent[] = [];
    const said = this.shift.callOn({ ...this.host.around(), grounded: this.kit.sim.grounded }, ev);
    for (const e of ev) this.shiftShown(e);
    return said;
  }

  /** For the bar: seconds before it can be used again, and whether the change is going on. */
  get state(): { left: number; on: boolean } { return { left: this.shift.cooling, on: this.shift.busy }; }

  private shiftShown(e: ShiftEvent): void {
    const p = this.player, w = p.walker, n = this.host.notes, kit = this.kit;
    switch (e) {
      case 'began':
        this.zoomWas = p.heroCam.zoom;
        p.dismount();
        // The change is seen; only the key is said.
        n.say(kit.again, 4);
        break;
      case 'stopped': this.selfAgain(); break;
      case 'broken': this.selfAgain(); break;
      case 'became':
        kit.begin(w.pos.x, w.pos.z, w.yaw);
        kit.cry();
        n.say(kit.keys, 8);
        break;
      case 'landing': break;
      case 'returning':
        w.place(kit.sim.pos.x, kit.sim.pos.z);
        w.yaw = kit.sim.yaw;
        break;
      case 'returned': this.selfAgain(); this.host.changed?.(); break;
    }
  }

  /** Back to the hero's own body: shown, full size, the camera as it was. */
  private selfAgain(): void {
    const p = this.player;
    p.hideHero = false;
    p.heroCam.zoom = this.zoomWas;
    p.stance = { combat: false };
    this.kneel = null;
    p.hero?.object.scale.setScalar(1);
    this.kit.hide();
  }

  /** The player's frame while the change is on (false: the hero plays as usual). */
  takeFrame(dt: number): boolean {
    const s = this.shift, p = this.player, w = p.walker, kit = this.kit;
    for (const e of s.tickChange(dt, { ...this.host.around(), grounded: kit.sim.grounded })) this.shiftShown(e);
    if (s.phase === 'self') return false;
    const cam = p.heroCam;
    if (s.phase === 'animal') {
      const { intent, facing } = cam.intent(dt, kit.sim.yaw), sim = kit.sim;
      sim.steer({ forward: intent.forward, heading: facing, up: intent.up, down: intent.down, walk: intent.walk, land: s.landing }, dt);
      // The walker goes where the animal goes (the minimap, the map, the regions ahead read it).
      Object.assign(w.pos, sim.pos);
      w.yaw = sim.yaw;
      p.hideHero = true;
      this.kneel = null;
      p.drawBodies(dt);
      const { x, y, z } = sim.pos;
      kit.drawForm(null, 1, false, dt);
      kit.wheel(x, y, z, changeLook(1), dt);
      cam.trail(this.headAt.set(x, y + kit.head, z), dt);
      return true;
    }
    // Changing either way: the hero kneels (or treads water) where they are and shrinks into the swirl, the animal grows out of it.
    const k = changeLook(s.progress), hero = p.hero;
    cam.intent(dt, w.yaw);
    p.hideHero = k.hero < 0.02;
    if (hero && kit.kneels) {
      this.kneel ??= { id: 'kneel', t0: hero.clock, dur: 3600 };
      p.stance = { combat: false, action: this.kneel };
    }
    p.standBy(dt);
    hero?.object.scale.setScalar(Math.max(0.02, k.hero));
    const at = w.pos;
    kit.drawForm({ x: at.x, y: at.y, z: at.z, yaw: w.yaw }, k.bird, s.phase === 'returning', dt);
    kit.wheel(at.x, at.y - kit.sink, at.z, k, dt);
    cam.zoom = this.zoomWas + (kit.zoom - this.zoomWas) * Math.min(1, s.progress * 1.3);
    const headY = at.y + Math.max(kit.head, w.height * 0.92 * Math.max(k.hero, 0.3));
    cam.trail(this.headAt.set(at.x, headY, at.z), dt);
    return true;
  }
}

/**
 * The player's frame for every animal form the hero has (Player.shape): each change goes on (its cooldown too), and
 * the one under way takes the frame. In an animal form the hero is not on their own feet (no doors, no talk).
 */
export function shapesFrame(forms: readonly ShapeForm[]): { take(dt: number): boolean; readonly aloft: boolean } {
  return {
    take: (dt) => { let took = false; for (const f of forms) took = f.takeFrame(dt) || took; return took; },
    get aloft() { return forms.some((f) => f.animal); },
  };
}

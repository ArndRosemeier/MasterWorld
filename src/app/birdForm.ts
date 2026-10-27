/**
 * Bird form in play (game/birdForm.ts, plan 10): the action bar's Bird form starts the change, and while it goes
 * on this takes the player's frame (Player.shape). The change, 15 s: the hero kneels, glowing feathers gather and
 * wheel round them ever faster, the hero sinks into the swirl and is gone, a pheasant grows out of it, the
 * feathers burst outward and fade, and the bird calls. Changing back is the same the other way round, shorter.
 * A fight near by breaks the change. As a bird the hero camera's keys fly it (Space takes off and climbs, W
 * flaps on, X dives, A/D or the right mouse button steer); the dwellers of the land leave a bird alone.
 */
import { Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { AbilityDef } from '../setting/contract';
import { changeLook, Shapeshift, type ShiftAround, type ShiftEvent } from '../game/birdForm';
import { BirdFlight } from '../sim/birdFlight';
import type { WalkWorld } from '../game/walker';
import { BirdView } from '../render/hero/BirdView';
import type { HeroAction } from '../render/hero/HeroView';
import type { Notes } from './notes';
import type { Player } from './player';

export interface BirdHost {
  readonly stage: Stage;
  readonly notes: Notes;
  /** What around the hero bears on the change (a fight, a horse, water, a roof). */
  around(): ShiftAround;
  /** Something worth saving happened (the change is over). */
  changed?(): void;
}

/** The camera's distance (m) to a bird (from the hero's, while changing). */
const BIRD_ZOOM = 3;

export class BirdForm {
  readonly shift: Shapeshift;
  readonly flight: BirdFlight;
  private view: BirdView | null = null;
  private loading: Promise<BirdView | null> | null = null;
  /** The build has no pheasant (no PrivateAssets): the ability cannot be used. */
  private missing = false;
  private zoomWas = 5;
  /** The hero's kneel while changing (one action, so the clip plays once and holds). */
  private kneel: HeroAction | null = null;
  private readonly head = new Vector3();

  constructor(ability: AbilityDef, private readonly player: Player, world: WalkWorld, private readonly host: BirdHost) {
    this.shift = new Shapeshift(ability);
    this.flight = new BirdFlight(world);
    const form = this;
    player.shape = { take: (dt) => form.take(dt), get aloft() { return form.flying; } };
  }

  /** As a bird in the hero's place (the dwellers leave it alone, doors and hatches don't open). */
  get flying(): boolean { return this.shift.phase === 'bird'; }

  /** The bird loaded and compiled ahead (a hero who knows the ability): the change then shows it at once. */
  warm(): Promise<BirdView | null> {
    this.loading ??= BirdView.forHero(this.host.stage).then((v) => {
      this.view = v;
      this.missing = !v;
      return v;
    }, (err: unknown) => {
      console.warn('bird form:', err instanceof Error ? err.message : err);
      this.missing = true;
      return null;
    });
    return this.loading;
  }

  /** The ability used from the bar: a line why not, or null. */
  invoke(): string | null {
    if (this.missing) return 'This build has no bird to become (it was made without the animal library).';
    void this.warm();
    const ev: ShiftEvent[] = [];
    const said = this.shift.callOn({ ...this.host.around(), grounded: this.flight.grounded }, ev);
    for (const e of ev) this.event(e);
    return said;
  }

  /** For the bar: seconds before it can be used again, and whether the change is going on. */
  get state(): { left: number; on: boolean } { return { left: this.shift.cooling, on: this.shift.busy }; }

  private event(e: ShiftEvent): void {
    const p = this.player, w = p.walker, n = this.host.notes;
    switch (e) {
      case 'began':
        this.zoomWas = p.heroCam.zoom;
        p.dismount();
        // The kneel and the change are seen; only the key is said.
        n.say('(Bird form again to stop.)', 4);
        break;
      case 'stopped': this.selfAgain(); break;
      case 'broken': this.selfAgain(); break;
      case 'became':
        this.flight.perch(w.pos.x, w.pos.z, w.yaw);
        this.view?.cry();
        // The keys, which cannot be shown.
        n.say('Space takes off and climbs, W flaps on, X dives; Bird form again to land.', 8);
        break;
      case 'landing': break;
      case 'returning': {
        const f = this.flight.pos;
        w.place(f.x, f.z);
        w.yaw = this.flight.yaw;
        break;
      }
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
    this.view?.hide();
  }

  /** The player's frame while the change is on (false: the hero plays as usual). */
  private take(dt: number): boolean {
    const s = this.shift, p = this.player, w = p.walker;
    for (const e of s.tickChange(dt, { ...this.host.around(), grounded: this.flight.grounded })) this.event(e);
    if (s.phase === 'self') return false;
    const cam = p.heroCam;
    if (s.phase === 'bird') {
      const { intent, facing } = cam.intent(dt, this.flight.yaw);
      this.flight.steer({ forward: intent.forward, heading: facing, up: intent.up, down: intent.down, walk: intent.walk, land: s.landing }, dt);
      const f = this.flight;
      // The walker goes where the bird goes (the compass, the map, the regions ahead read it).
      Object.assign(w.pos, f.pos);
      w.yaw = f.yaw;
      p.hideHero = true;
      this.kneel = null;
      p.drawBodies(dt);
      const { x, y, z } = f.pos;
      this.view?.pose({ x, y, z, yaw: f.yaw, bank: f.bank, pitch: f.pitch, doing: f.doing, scale: 1 }, dt);
      this.view?.feathers(x, y, z, 0, 1, 1, 0, dt);
      cam.trail(this.head.set(x, y + 0.35, z), dt);
      return true;
    }
    // Changing either way: the hero kneels where they are and shrinks into the feathers, the bird grows out of them.
    const k = changeLook(s.progress), hero = p.hero;
    cam.intent(dt, w.yaw);
    p.hideHero = k.hero < 0.02;
    if (hero) {
      this.kneel ??= { id: 'kneel', t0: hero.clock, dur: 3600 };
      p.stance = { combat: false, action: this.kneel };
    }
    p.standBy(dt);
    hero?.object.scale.setScalar(Math.max(0.02, k.hero));
    const at = w.pos;
    const doing = s.phase === 'returning' && this.flight.doing === 'land' ? 'land' : 'idle';
    this.view?.pose({ x: at.x, y: at.y, z: at.z, yaw: w.yaw, bank: 0, pitch: 0, doing, scale: k.bird }, dt);
    this.view?.feathers(at.x, at.y, at.z, k.glow, k.radius, k.height, k.pace, dt);
    cam.zoom = this.zoomWas + (BIRD_ZOOM - this.zoomWas) * Math.min(1, s.progress * 1.3);
    const headY = at.y + Math.max(0.35, w.height * 0.92 * Math.max(k.hero, 0.3));
    cam.trail(this.head.set(at.x, headY, at.z), dt);
    return true;
  }
}

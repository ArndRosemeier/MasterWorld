/**
 * Down through a cellar's hatch and up its ladder again, played out, not cut (render it, don't narrate it):
 * E by the hatch, and the hero walks to its edge, crouches and lifts the lid, turns round, gets onto the
 * ladder over the rim and climbs down into the dark under the floor. The cellar lies deep below (a space
 * of its own), so the screen goes black only while the head passes under the floor; the climb goes on down
 * the cellar's ladder and the hero steps off at its foot. E at the foot of that ladder: up it, through the
 * hatch, out over the rim, and the lid is let down again. The body is @futuremagic/figure's LadderClimb's
 * puppet meanwhile (hands and feet on the rungs), the keys move nothing.
 */
import { Vector3 } from 'three/webgpu';
import { smoothstep } from '@futuremagic/core';
import { LadderClimb, faceYaw, type ClimbStep, type Climber, type Hole, type Ladder } from '@futuremagic/figure';
import type { CellarVisit } from './cellarVisit';
import type { Fade } from './fade';
import type { Shot } from './heroCamera';
import type { Player, Puppet } from './player';

/** A house's way down through its hatch (app/interiorVisit.ts): the ladder under it, the floor, the hole, the lid. */
export interface HatchWay {
  readonly ladder: Ladder;
  readonly floor: number;
  /** The hole (centre x, z and half its width): walked round, not over. */
  readonly hole: Hole;
  /** The side of the hole the lid hinges on (unit, x and z): the lid stands there, open. */
  readonly hinge: readonly [number, number];
  /** Swing the lid up by `angle` (rad; 0 shut). */
  lid(angle: number): void;
}

export interface HatchHost {
  readonly player: Player;
  /** The black over the screen while the head passes through the floor. */
  readonly fade: Fade;
  /** The hatch the hero stands by, with a cellar under it (null: none). */
  hatchNear(): { readonly way: HatchWay; readonly below: () => Promise<CellarVisit> } | null;
  /** The cellar the hero is down in (null: none). */
  below(): CellarVisit | null;
  /** The house goes back to being drawn shut (the hero is below it). */
  shutHouse(): void;
  /** The house above a cellar drawn open and stepped into (the hero comes up through its hatch); its way down. */
  openAbove(v: CellarVisit): Promise<HatchWay | null>;
  /** After coming down or up (the game autosaves). */
  swapped(): void;
  /** Sink the ground round (x, z) out of sight under a house's hatch (null: back as it was). */
  sink(at: { x: number; z: number } | null): void;
}

/** How far the lid swings open (rad): past upright, so it leans back on its hinge. */
const LID_OPEN = 1.85;
/** The feet this far further down once the head has gone under the floor above, the screen going dark meanwhile (m). */
const DEEP = 0.6;
/** The feet this far up the cellar's ladder where the climb comes into sight below (m). */
const BELOW_TOP = 1.3;
/** The camera looks at least this far over the floor while the hero goes down through it (m): into the hole's mouth. */
const LOOK_OVER = 0.2;

type Phase = () => ClimbStep[] | null;

export class HatchClimb implements Puppet {
  private readonly climb = new LadderClimb();
  private readonly round = new Vector3();
  private readonly chest = new Vector3();
  /** The held shot's look: the hero's chest, kept over `over`; and the sides it is seen worse from. */
  private readonly view: Shot = { round: this.round, at: this.chest, cost: (dx, dz) => this.cost(dx, dz) };
  /** The ladder climbed (its facing) and the side the lid hinges on (null: no lid), for the shot's best side. */
  private facing: readonly [number, number] = [0, 1];
  private hinge: readonly [number, number] | null = null;
  /** The clip played meanwhile (crouched by the lid), else the climb's walk or stand. */
  clip: string | undefined = undefined;
  /** The next part of the climb (null: none), and whether it is ready to go on (its steps, else null: wait in the dark). */
  private next: Phase | null = null;
  /** The floor the camera looks no lower than (the house's, while going through it; null: follow the chest). */
  private over: number | null = null;
  /** Seen in a held shot (the house's room, the cellar). */
  private shown = false;
  private body: Climber = { height: 1.75, hipHeight: 0.9 };
  /** E was pressed by a hatch: the cellar below is being made ready. */
  private starting = false;

  constructor(private readonly host: HatchHost) {}

  get pos(): Vector3 { return this.climb.pos; }
  get yaw(): number { return this.climb.yaw; }
  get vel(): readonly [number, number, number] { return this.climb.vel; }
  get walking(): boolean { return this.climb.walking; }
  get pose(): Puppet['pose'] { return this.climb.pose; }
  get limbs(): Puppet['limbs'] { return this.climb.limbs; }
  get shot(): Shot | null {
    if (!this.shown) return null;
    const p = this.climb.pos, chest = p.y + this.body.height * 0.7;
    this.chest.set(p.x, this.over === null ? chest : Math.max(chest, this.over + LOOK_OVER), p.z);
    return this.view;
  }

  /** The shot round the ladder `l` (the hole above it, or its foot), the lid hinged on `hinge`'s side (null: none). */
  private film(l: Ladder, x: number, z: number, hinge: readonly [number, number] | null): void {
    this.round.set(x, l.floor, z);
    this.facing = [l.nx, l.nz];
    this.hinge = hinge;
    this.shown = true;
    // In the house the shaft under the hatch is seen to its bottom.
    this.host.sink(hinge ? { x, z } : null);
  }

  /**
   * How much worse the climb is seen from the side (dx, dz): from behind the ladder (the wall it leans on), across
   * the open lid, or square at the hero's back; best from beside it.
   */
  private cost(dx: number, dz: number): number {
    const [nx, nz] = this.facing, back = dx * nx + dz * nz, h = this.hinge;
    return (back > 0.3 ? 4 : 0) + (back < -0.85 ? 1 : 0) + (h && dx * h[0] + dz * h[1] > 0.5 ? 3 : 0);
  }

  /** Climbing now. */
  get busy(): boolean { return this.host.player.puppet === this; }

  /** What the use key (E) would do now: climb down the hatch the hero stands by, up the ladder they stand at, or nothing. */
  get climbOffered(): 'down' | 'up' | null {
    const P = this.host.player, w = P.walker;
    if (this.starting || this.busy || P.puppet || P.offFoot || P.riding || w.mode !== 'ground') return null;
    const v = this.host.below();
    if (v) return v.atLadder && v.above ? 'up' : null;
    return this.host.hatchNear() ? 'down' : null;
  }

  /** The use key (E): down the hatch the hero stands by, or up the ladder they stand at. Whether it was used. */
  use(): boolean {
    const was = this.climbOffered;
    if (!was) return false;
    const v = this.host.below();
    if (was === 'up' && v) { this.up(v); return true; }
    const h = this.host.hatchNear();
    if (!h) return false;
    this.starting = true;
    void this.down(h.way, h.below).finally(() => { this.starting = false; });
    return true;
  }

  /** Down: to the hatch, lift the lid, onto the ladder, down into the dark; then down the cellar's ladder. */
  private async down(way: HatchWay, below: () => Promise<CellarVisit>): Promise<void> {
    const P = this.host.player;
    const cellar = await below();
    this.begin();
    const H = way.ladder, C = cellar.ladder, body = this.body, under = H.floor - body.height;
    this.over = way.floor;
    this.film(H, way.hole[0], way.hole[1], way.hinge);
    const house: ClimbStep[] = [
      { kind: 'walk', ladder: H, around: way.hole, face: faceYaw(H) + Math.PI },
      { kind: 'hold', dur: 1.3, each: (u) => { this.clip = 'crouch'; way.lid(LID_OPEN * smoothstep(0.25, 0.95, u)); } },
      { kind: 'call', then: () => { this.clip = undefined; } },
      { kind: 'turn', to: faceYaw(H) },
      { kind: 'rim', ladder: H, dir: 'on' },
      // Down until the head is under the floor, seen all the way; then on into the dark.
      { kind: 'climb', ladder: H, from: this.climb.rimFeet(H, body), to: under },
      { kind: 'climb', ladder: H, from: under, to: under - DEEP, fade: 'out' },
    ];
    this.next = () => {
      // Dark: the house shuts behind and the cellar is there, the hero high on its ladder.
      cellar.arrive();
      this.host.shutHouse();
      this.over = null;
      this.film(C, C.x, C.z, null);
      return [
        { kind: 'climb', ladder: C, from: C.floor + BELOW_TOP, to: C.floor, fade: 'in' },
        { kind: 'foot', ladder: C, dir: 'off' },
      ];
    };
    const w = P.walker.pos;
    this.climb.play(house, w.x, w.y, w.z, P.walker.yaw, body);
  }

  /** Up: to the ladder, up into the dark; then up out of the hatch above, over the rim, and the lid let down. */
  private up(v: CellarVisit): void {
    const P = this.host.player, C = v.ladder, body = this.body;
    this.begin();
    let way: HatchWay | null | undefined;
    this.film(C, C.x, C.z, null);
    const cellar: ClimbStep[] = [
      { kind: 'walk', ladder: C },
      { kind: 'foot', ladder: C, dir: 'on' },
      { kind: 'climb', ladder: C, from: C.floor, to: C.floor + BELOW_TOP, fade: 'out' },
      { kind: 'call', then: () => { v.depart(); void this.host.openAbove(v).then((h) => { way = h; }, () => { way = null; }); } },
    ];
    this.next = () => {
      if (way === undefined) return null;
      if (way === null) return [];
      const H = way.ladder, lid = way.lid, under = H.floor - body.height;
      lid(LID_OPEN);
      this.over = way.floor;
      this.film(H, way.hole[0], way.hole[1], way.hinge);
      return [
        // Out of the dark under the floor; then up into the room, seen all the way.
        { kind: 'climb', ladder: H, from: under - DEEP, to: under, fade: 'in' },
        { kind: 'climb', ladder: H, from: under, to: this.climb.rimFeet(H, body) },
        { kind: 'rim', ladder: H, dir: 'off' },
        { kind: 'turn', to: faceYaw(H) + Math.PI },
        { kind: 'hold', dur: 1.1, each: (u) => { this.clip = 'crouch'; lid(LID_OPEN * (1 - smoothstep(0.2, 0.85, u))); } },
        { kind: 'call', then: () => { this.clip = undefined; } },
      ];
    };
    const w = P.walker.pos;
    this.climb.play(cellar, w.x, w.y, w.z, P.walker.yaw, body);
  }

  private begin(): void {
    const P = this.host.player, hero = P.hero;
    this.body = { height: hero?.height ?? P.walker.height, hipHeight: hero?.hipHeight ?? 0 };
    this.clip = undefined;
    this.over = null;
    this.shown = false;
    P.resting = false;
    P.puppet = this;
  }

  /** Once a frame (Player.update): the climb on, the screen's dark, the next part when this one is done. */
  step(dt: number): void {
    this.climb.advance(dt);
    if (!this.climb.active && this.next) {
      const steps = this.next();
      if (steps) {
        this.next = null;
        const p = this.climb.pos;
        this.climb.play(steps, p.x, p.y, p.z, this.climb.yaw, this.body);
        this.climb.advance(0);
      }
      this.host.fade.dim(1);
      if (!steps || this.climb.active) return;
    }
    this.host.fade.dim(this.climb.fade);
    if (!this.climb.active && !this.next) this.finish();
  }

  /** Off the ladder: the hero stands where the climb left them and walks on. */
  private finish(): void {
    const P = this.host.player, p = this.climb.pos;
    this.climb.stop();
    this.clip = undefined;
    this.over = null;
    this.shown = false;
    this.host.sink(null);
    P.puppet = null;
    this.host.fade.dim(0);
    P.walker.place(p.x, p.z, p.y);
    P.walker.yaw = this.climb.yaw;
    this.host.swapped();
  }
}

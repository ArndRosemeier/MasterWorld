/**
 * Up and down a ship's castle ladders, played out (show, don't tell): E at a ladder's foot on the main deck, and the
 * hero walks to it, gets on, climbs with hands and feet on the rungs and steps off over the top onto the castle's
 * deck; E on the castle by its top, and the hero goes over the edge onto the ladder and down. The ship rides the
 * swell meanwhile, so the climb is played in the ship's own frame (@futuremagic/figure's LadderClimb, its x along the
 * ship, z across it, y up from the waterline) and carried into the world every frame by the ship's pose: the hands
 * stay on the rungs as the ladder rises, pitches and rolls.
 */
import { Vector3 } from 'three/webgpu';
import { LadderClimb, faceYaw, type ClimbStep, type Climber, type Ladder, type LimbGoals } from '@futuremagic/figure';
import type { ShipLadder } from '@futuremagic/settlement';
import { toShip, toWorld, type Decks, type Pose } from '../world/deck';
import { limbGoals } from '../render/hero/puppet';
import type { Player, Puppet } from './player';

export interface ShipClimbHost {
  readonly player: Player;
  readonly decks: Decks;
}

/** A ship's ladder as the climb knows it, in the ship's frame: from its foot (got on at the main deck), and over its top (got off onto the castle). */
export function shipLadderWays(l: ShipLadder): { foot: Ladder; rim: Ladder } {
  const slope = l.lean / (l.y1 - l.y0), nx = -l.dir, rung = l.rung;
  const common = { z: l.b, nx, nz: 0, hi: l.y1 - rung, halfWidth: 0.25, rung, lean: slope };
  // The rim's climb is counted from two rungs up (one step of the hands and feet), so the two meet in step.
  const base = l.y0 + 2 * rung;
  return {
    foot: { ...common, x: l.a, lo: l.y0 + rung, floor: l.y0, rim: false },
    rim: { ...common, x: l.a - l.dir * slope * 2 * rung, lo: base, floor: l.y1, rim: true },
  };
}

export class ShipClimb implements Puppet {
  private readonly climb = new LadderClimb();
  private readonly world = new Vector3();
  private readonly v: [number, number, number] = [0, 0, 0];
  private readonly goals: LimbGoals = limbGoals();
  private ship: string | null = null;
  private yawNow = 0;
  private body: Climber = { height: 1.75, hipHeight: 0.9 };
  readonly shot = null;

  constructor(private readonly host: ShipClimbHost) {}

  get pos(): Vector3 { return this.world; }
  get yaw(): number { return this.yawNow; }
  get vel(): readonly [number, number, number] { return this.v; }
  get walking(): boolean { return this.climb.walking; }
  get pose(): Puppet['pose'] { return this.climb.pose; }
  get limbs(): Puppet['limbs'] { return this.climb.limbs ? this.goals : null; }

  /** Climbing now. */
  get busy(): boolean { return this.host.player.puppet === this; }

  /** What the use key (E) would do now: up the ladder the hero stands at, down the one they stand over, or nothing. */
  get climbOffered(): 'up' | 'down' | null {
    const P = this.host.player;
    if (P.puppet || P.offFoot || P.riding || P.walker.mode !== 'ground') return null;
    return this.host.decks.ladderNear()?.way ?? null;
  }

  /** The use key (E): onto the ladder the hero stands by. Whether it was used. */
  use(): boolean {
    const P = this.host.player, near = this.climbOffered ? this.host.decks.ladderNear() : null;
    const pose = near && this.host.decks.poseOf(near.id);
    if (!near || !pose) return false;
    const { foot, rim } = shipLadderWays(near.ladder);
    const hero = P.hero;
    this.body = { height: hero?.height ?? P.walker.height, hipHeight: hero?.hipHeight ?? 0 };
    const steps: ClimbStep[] = near.way === 'up'
      ? [
        { kind: 'walk', ladder: foot },
        { kind: 'foot', ladder: foot, dir: 'on' },
        { kind: 'climb', ladder: foot, from: foot.floor, to: this.climb.rimFeet(rim, this.body) },
        { kind: 'rim', ladder: rim, dir: 'off' },
      ]
      : [
        { kind: 'walk', ladder: rim, face: faceYaw(rim) },
        { kind: 'rim', ladder: rim, dir: 'on' },
        { kind: 'climb', ladder: foot, from: this.climb.rimFeet(rim, this.body), to: foot.floor },
        { kind: 'foot', ladder: foot, dir: 'off' },
      ];
    const w = P.walker.pos, l = toShip(pose, w.x, w.y, w.z);
    this.ship = near.id;
    P.resting = false;
    P.puppet = this;
    this.climb.play(steps, l.a, l.h, l.b, turnYaw(pose, P.walker.yaw, -1), this.body);
    this.carry(pose);
    return true;
  }

  /** Once a frame (Player.update): the climb on, carried into the world by the ship's pose now. */
  step(dt: number): void {
    const pose = this.ship ? this.host.decks.poseOf(this.ship) : null;
    if (!pose) { this.finish(); return; }
    this.climb.advance(dt);
    this.carry(pose);
    if (!this.climb.active) this.finish();
  }

  /** The climb's body, hands and feet from the ship's frame into the world. */
  private carry(pose: Pose): void {
    const c = this.climb, p = toWorld(pose, c.pos.x, c.pos.y, c.pos.z);
    this.world.set(p.x, p.y, p.z);
    this.yawNow = turnYaw(pose, c.yaw, 1);
    this.v[0] = c.vel[0] * pose.ux - c.vel[2] * pose.uz; this.v[1] = 0; this.v[2] = c.vel[0] * pose.uz + c.vel[2] * pose.ux;
    const from = c.limbs;
    if (!from) return;
    for (const k of ['L', 'R', 'footL', 'footR'] as const) {
      const a = from[k], b = this.goals[k]!;
      if (!a) { b.w = 0; continue; }
      const q = toWorld(pose, a.p.x, a.p.y, a.p.z);
      b.p.set(q.x, q.y, q.z);
      b.w = a.w;
      b.pole = a.pole;
      b.flat = a.flat ? (b.flat ?? new Vector3()).set(a.flat.x * pose.ux - a.flat.z * pose.uz, a.flat.y, a.flat.x * pose.uz + a.flat.z * pose.ux) : null;
    }
    this.goals.curl!.L = from.curl?.L; this.goals.curl!.R = from.curl?.R;
    this.goals.curlW = from.curlW;
  }

  /** Off the ladder: the hero stands where the climb left them, on the deck, and walks on. */
  private finish(): void {
    const P = this.host.player;
    this.climb.stop();
    this.ship = null;
    if (P.puppet === this) P.puppet = null;
    P.walker.place(this.world.x, this.world.z, this.world.y);
    P.walker.yaw = this.yawNow;
  }
}

/** A yaw (facing (-sin, -cos)) from the ship's frame at `p` into the world (`way` 1), or from the world into it (-1). */
function turnYaw(p: Pose, yaw: number, way: 1 | -1): number {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), s = way * p.uz;
  return Math.atan2(-(fx * p.ux - fz * s), -(fx * s + fz * p.ux));
}

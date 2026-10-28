/**
 * The map hand-over played in the world (D35; CLAUDE.md rule 11, shown not told): the hero takes the map from
 * the pack and holds it out, the teller takes it in both hands and marks it with a quill (their hands busy
 * over it), holds it out again, and the hero takes it back and puts it away. Driven by the hand-over's clock
 * (app/handOver.ts HandOverStage); the hero is a puppet meanwhile (their right hand reaching), the sheet goes
 * from hand to hand (render/hero/MapSheet.ts).
 */
import { Vector3 } from 'three/webgpu';
import type { LimbGoals } from '@futuremagic/figure';
import type { Agent } from '../sim/townLife';
import type { MapSheet } from '../render/hero/MapSheet';
import type { Puppet } from './player';
import { heroReach, MARK, MARKED, sheetHeldBy, type HandOverStage } from './handOver';

/** The hero's hand held out this far towards the teller (m, at most), this high over the feet, a little to the right. */
const REACH = 0.55, CHEST = 1.15, RIGHT = 0.12;
/** The sheet is tipped up towards whoever holds it (rad): held out flat-ish, read while marked. */
const TIP_OUT = -0.25, TIP_READ = -0.6;

/** What the scene reads of the world each frame. */
export interface HandOverWorld {
  /** The hero's feet and facing (the walker's yaw), when the hand-over begins. */
  hero(): { x: number; y: number; z: number; yaw: number };
  /** Who the hero is talking with (null: nobody: then it plays for the hero alone). */
  teller(): Agent | null;
  /** A hand of the hero's body / of the teller's character in the world, if drawn. */
  heroHand(out: Vector3): Vector3 | null;
  tellerHand(a: Agent, side: 'l' | 'r', out: Vector3): Vector3 | null;
  /** The hero played by the scene (null: back to the keys). */
  puppet(p: Puppet | null): void;
}

export class HandOverScene implements HandOverStage, Puppet {
  readonly pose = null;
  readonly shot = null;
  readonly walking = false;
  readonly vel: [number, number, number] = [0, 0, 0];
  readonly clip = undefined;
  readonly pos = { x: 0, y: 0, z: 0 };
  yaw = 0;
  readonly limbs: LimbGoals = { R: { p: new Vector3(), w: 0 } };
  private with: Agent | null = null;
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  constructor(private readonly w: HandOverWorld, private readonly sheet: MapSheet) {}

  handOut(): void {
    const h = this.w.hero();
    Object.assign(this.pos, { x: h.x, y: h.y, z: h.z });
    this.with = this.w.teller();
    // Facing the teller (a walker's yaw: forward is (-sin, -cos)).
    const t = this.with;
    this.yaw = t ? Math.atan2(-(t.x - h.x), -(t.z - h.z)) : h.yaw;
    this.w.puppet(this);
  }

  step(): void { /* the hand-over's clock moves it (`handing`) */ }

  handing(t: number): void {
    const a = this.with, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const d = a ? Math.hypot(a.x - this.pos.x, a.z - this.pos.z) : 1.2;
    // The right hand out towards them, at the chest.
    const R = this.limbs.R!, out = Math.min(REACH, d * 0.45);
    R.p.set(this.pos.x + fx * out - fz * RIGHT, this.pos.y + CHEST, this.pos.z + fz * out + fx * RIGHT);
    R.w = heroReach(t);
    // The teller marks it, the sheet in their hands (only while they still stand for the talk).
    if (a?.held) a.act = t >= MARKED && t < MARKED + MARK ? 'mark' : 'chat';
    const by = sheetHeldBy(t);
    if (!by) { this.sheet.stow(); return; }
    if (by === 'hero' || !a) {
      const hand = this.w.heroHand(this.a) ?? this.a.copy(R.p);
      this.sheet.holdAt(hand.x, hand.y, hand.z, Math.atan2(fx, fz), TIP_OUT);
      return;
    }
    // Between the teller's hands (or before their chest, if they are not drawn in full).
    const l = this.w.tellerHand(a, 'l', this.a), r = this.w.tellerHand(a, 'r', this.b);
    const ty = this.pos.y + CHEST - 0.1, toHero = Math.atan2(this.pos.x - a.x, this.pos.z - a.z);
    if (l && r) this.sheet.holdAt((l.x + r.x) / 2, (l.y + r.y) / 2, (l.z + r.z) / 2, toHero, TIP_READ);
    else this.sheet.holdAt(a.x + Math.sin(toHero) * 0.35, ty, a.z + Math.cos(toHero) * 0.35, toHero, TIP_READ);
  }

  handedBack(): void {
    this.sheet.stow();
    if (this.with?.held) this.with.act = 'chat';
    this.with = null;
    this.limbs.R!.w = 0;
    this.w.puppet(null);
  }
}

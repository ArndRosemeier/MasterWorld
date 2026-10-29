/**
 * A scene's pose put on an Actors person's body (@futuremagic/figure's FigureRig): a pose over the clips, and hands
 * and feet onto the scene's goals (a ladder's rungs). The hero's body and a townsman's alike (the one who comes down a
 * cellar's ladder to the hero).
 */
import { Vector3, type Object3D } from 'three/webgpu';
import { FigureRig, type LimbGoal, type LimbGoals, type Pose } from '@futuremagic/figure';
import type { Character } from '@actors/generator';
import { ORIGIN } from '../origin';

/** What a scene does with a body this frame (@futuremagic/figure LadderClimb's output); world coordinates. */
export interface HeroPuppet {
  readonly pose: { readonly fn: (p: Pose) => void; readonly w: number } | null;
  readonly limbs: LimbGoals | null;
  /** The clip under it (else the gait's). */
  readonly clip?: string;
}

const goal = (): LimbGoal => ({ p: new Vector3(), w: 0 });

/** Empty goals for the limbs, to hand to `applyPuppet` frame after frame. */
export function limbGoals(): LimbGoals {
  return { L: goal(), R: goal(), footL: goal(), footR: goal(), curl: {} };
}

/** `p` on `rig`'s bones (the goals moved into the scene's frame, less the floating origin). Whether it turned any. */
export function applyPuppet(rig: FigureRig, body: Object3D, g: LimbGoals, p: HeroPuppet): boolean {
  if (!p.pose && !p.limbs) return false;
  body.updateMatrixWorld(true);
  if (p.pose) rig.pose(p.pose.fn, p.pose.w);
  if (p.limbs) {
    for (const k of ['L', 'R', 'footL', 'footR'] as const) {
      const from = p.limbs[k], to = g[k]!;
      to.w = from?.w ?? 0;
      if (!from || to.w <= 0) continue;
      ORIGIN.toRender(to.p.copy(from.p));
      to.pole = from.pole;
      to.flat = from.flat ?? null;
    }
    g.curl = p.limbs.curl;
    g.curlW = p.limbs.curlW;
    rig.reachFor(g);
  }
  return true;
}

/** Hands-on control of the bones of whichever character a body (its own frame: feet at its origin, +Z forward) draws. */
export class BodyRig {
  private made: { readonly ch: Character; readonly rig: FigureRig } | null = null;

  constructor(private readonly body: Object3D) {}

  /** The rig of `ch`, fitted to it at `height` (null before its skeleton is there). */
  of(ch: Character, height: number): FigureRig | null {
    if (this.made?.ch === ch) return this.made.rig;
    if (!ch.actor.fittedSkeleton) return null;
    try {
      // Its frame is the body's own (feet at its origin): Actors lifts the character's group by its ground offset
      // (half a metre for a small people), which the rig would take for the feet, its hips then at the feet.
      const rig = new FigureRig(this.body, ch.actor.bones);
      rig.fit(height);
      this.made = { ch, rig };
      return rig;
    } catch {
      return null;
    }
  }

  /** The rig made last, if any (its bones go back as bound with `relax`). */
  get current(): FigureRig | null { return this.made?.rig ?? null; }

  /** A new body on the same character (dressed as someone else): fitted again when next asked. */
  reset(): void { this.made = null; }
}

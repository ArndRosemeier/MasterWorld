/**
 * Someone who comes to the hero through a place (a cellar's household down its ladder once it has gone quiet): they
 * walk the place's ground (sim/dungeonNav.ts) from where they came in to a step short of the hero, following them as
 * they move, stand there facing them a while (their thanks), and walk back to where they came in. Pure: the game
 * draws them (app/ownerComes.ts) and says what they say.
 */
import type { DenGround, P3 } from '../sim/dungeonNav';

/** Where they are in their errand: on the way, saying their thanks, waiting by the hero, on the way back, gone. */
export type VisitorPhase = 'come' | 'thank' | 'stay' | 'back' | 'gone';

/** How near they come (m), how fast they walk (m/s), how long they speak and then stay (s). */
export const VISIT = { near: 1.7, pace: 1.5, thank: 5, stay: 12, leave: 7, radius: 0.3 } as const;

export class Visitor {
  phase: VisitorPhase = 'come';
  x: number;
  y: number;
  z: number;
  /** Facing (radians, xz atan2, as the townsfolk's). */
  dir = 0;
  /** Moving this frame. */
  walking = false;
  private path: P3[] = [];
  private pi = 0;
  private repath = 0;
  private t = 0;
  /** Seconds they have not moved on the way. */
  private stalled = 0;
  /** Their thanks began this frame (once). */
  private said = false;

  constructor(private readonly ground: DenGround, readonly from: P3, dir = 0) {
    this.x = from.x;
    this.y = from.y;
    this.z = from.z;
    this.dir = dir;
  }

  /**
   * A frame (`hero`: the hero's feet in the place's frame). 'thanks' the frame they come up to the hero, 'gone' the
   * frame they are back where they came in; else null.
   */
  step(dt: number, hero: P3): 'thanks' | 'gone' | null {
    this.walking = false;
    this.t += dt;
    const d = Math.hypot(hero.x - this.x, hero.z - this.z), level = Math.abs(hero.y - this.y) < 1.2;
    if (this.phase === 'come') {
      if (d < VISIT.near && level) return this.arrive(hero);
      this.walkTo(dt, hero, 1.0);
      // Something stands between them and the hero, a few steps off (a table, a pillar): near enough.
      this.stalled = this.walking ? 0 : this.stalled + dt;
      if (this.stalled > 0.8 && d < VISIT.near * 2 && level) return this.arrive(hero);
      return null;
    }
    if (this.phase === 'thank' || this.phase === 'stay') {
      this.face(hero);
      if (this.phase === 'thank' && this.t > VISIT.thank) { this.phase = 'stay'; this.t = 0; }
      // Done once the hero walks off, or after a while by them; if the hero goes on, they follow a little.
      if (this.phase === 'stay' && (this.t > VISIT.stay || d > VISIT.leave)) this.goBack();
      else if (d > VISIT.near * 2 && level) this.walkTo(dt, hero, 1.5);
      return null;
    }
    if (this.phase === 'back') {
      if (Math.hypot(this.from.x - this.x, this.from.z - this.z) < 0.35) { this.phase = 'gone'; return 'gone'; }
      this.walkTo(dt, this.from, 0);
    }
    return null;
  }

  /** Back to where they came in now (the hero spoke with them, or left). */
  goBack(): void {
    if (this.phase === 'gone' || this.phase === 'back') return;
    this.phase = 'back';
    this.path = [];
    this.repath = 0;
  }

  /** They began their thanks (and have not yet been asked again). */
  get thanked(): boolean { return this.said; }

  private arrive(hero: P3): 'thanks' {
    this.phase = 'thank';
    this.t = 0;
    this.said = true;
    this.face(hero);
    return 'thanks';
  }

  private face(p: P3): void {
    const dx = p.x - this.x, dz = p.z - this.z;
    if (Math.hypot(dx, dz) > 0.05) this.dir = Math.atan2(dz, dx);
  }

  /** Along the way to `to` (asked again now and then, since the hero moves), stopping `short` of it. */
  private walkTo(dt: number, to: P3, short: number): void {
    this.repath -= dt;
    if (this.repath <= 0 || this.pi >= this.path.length) {
      this.path = this.ground.way({ x: this.x, y: this.y, z: this.z }, to);
      this.pi = 0;
      this.repath = 1;
    }
    let left = VISIT.pace * dt;
    for (let n = 0; left > 1e-4 && this.pi < this.path.length && n < 8; n++) {
      const p = this.path[this.pi], last = this.pi === this.path.length - 1;
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) - (last ? short : 0);
      if (d <= 0.05) { this.pi++; continue; }
      const k = Math.min(left, d) / Math.hypot(dx, dz);
      const to2 = this.ground.slide(this.x, this.y, this.z, dx * k, dz * k, VISIT.radius);
      if (!to2) { this.pi = this.path.length; break; }
      const moved = Math.hypot(to2.x - this.x, to2.z - this.z);
      if (moved > 1e-4) { this.dir = Math.atan2(to2.z - this.z, to2.x - this.x); this.walking = true; }
      this.x = to2.x;
      this.z = to2.z;
      this.y = this.ground.floorAt(this.x, this.z, this.y + 0.6) ?? this.y;
      left -= Math.min(left, d);
      if (moved < 1e-4) break;
    }
  }
}

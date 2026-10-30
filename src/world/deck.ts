/**
 * The decks of the ships afloat near the hero, as the walker meets them (S3): each ship's pose on the waves (set by
 * the view that draws it, every frame), its decks as floors, its rail, masts and hull as walls, the gangplank from
 * the quay up to its gangway; and a body standing on a deck goes with it as it rises, pitches, rolls and sails (it
 * neither slides off nor sinks through). Pure: the ship's own shape comes from @futuremagic/settlement.
 */
import { PLANK, hullHalf, shipFloor, shipWall, type Mooring, type ShipPlan } from '@futuremagic/settlement';

/** A ship's place on the water: its waterline's middle, its heading (unit, bow first), bow up and port side up (rad). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  ux: number;
  uz: number;
  pitch: number;
  roll: number;
}

/** A point, as the walker's position is. */
export interface At {
  x: number;
  y: number;
  z: number;
}

/** The ship frame's point (a along it, h up from the waterline, b across to port) in the world, at `p`. */
export function toWorld(p: Pose, a: number, h: number, b: number): At {
  // Rolled (about the keel), pitched (about the beam), then turned to the heading: the drawn mesh's rotation (render/ships.ts).
  const cr = Math.cos(p.roll), sr = Math.sin(p.roll), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const y1 = h * cr + b * sr, z1 = -h * sr + b * cr;
  const x2 = a * cp - y1 * sp, y2 = a * sp + y1 * cp;
  return { x: p.x + x2 * p.ux - z1 * p.uz, y: p.y + y2, z: p.z + x2 * p.uz + z1 * p.ux };
}

/** A world point in the ship's frame at `p` (a, h, b). */
export function toShip(p: Pose, x: number, y: number, z: number): { a: number; h: number; b: number } {
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  const x2 = dx * p.ux + dz * p.uz, z1 = -dx * p.uz + dz * p.ux;
  const cr = Math.cos(p.roll), sr = Math.sin(p.roll), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const a = x2 * cp + dy * sp, y1 = -x2 * sp + dy * cp;
  return { a, h: y1 * cr - z1 * sr, b: y1 * sr + z1 * cr };
}

/** A ship afloat: its plan, its pose now, and where its gangplank's foot rests on the land (none: no plank out). */
interface Afloat {
  readonly plan: ShipPlan;
  readonly pose: Pose;
  plank: { readonly foot: At; readonly side: 1 | -1 } | null;
}

/** How far onto the land a gangplank reaches past its edge (m); a walker's step up (game/walker.ts WALK.step). */
const ONTO = 0.9, STEP = 0.45;

export class Decks {
  private readonly ships = new Map<string, Afloat>();
  /** The ship the rider stands on (its id), and where on it, in its frame. */
  private aboard: { id: string; a: number; h: number; b: number; x: number; y: number; z: number } | null = null;

  /** `rider`: the body carried along by a deck it stands on (the hero's walker's position). */
  /** `radius`: the rider's body (game/walker.ts WALK.radius), kept out of the hulls. */
  constructor(private readonly riding: () => At | null = () => null, private readonly radius = 0.32) {}

  /**
   * A ship at its new pose this frame; a body standing on it goes with it. `moored`: lying at its mooring, its
   * gangplank laid to the pier or the quay (a ship only).
   */
  move(id: string, plan: ShipPlan, pose: Pose, moored: Mooring | null = null): void {
    let s = this.ships.get(id);
    if (!s) { s = { plan, pose: { ...pose }, plank: null }; this.ships.set(id, s); }
    const r = this.riding(), was = r && this.aboard?.id === id ? this.aboard : null;
    // Put somewhere else since it last stood here (a teleport, a cut scene): not carried back.
    const on = was && r && Math.abs(r.x - was.x) + Math.abs(r.y - was.y) + Math.abs(r.z - was.z) < 1e-6 ? was : null;
    Object.assign(s.pose, pose);
    s.plank = moored && plan.gangway ? s.plank ?? plankFoot(moored) : null;
    if (r && on) { const w = toWorld(s.pose, on.a, on.h, on.b); r.x = on.x = w.x; r.y = on.y = w.y; r.z = on.z = w.z; }
  }

  /** The ship is gone from near the hero. */
  drop(id: string): void {
    this.ships.delete(id);
    if (this.aboard?.id === id) this.aboard = null;
  }

  /**
   * After the walker's step: which deck the rider is on now (standing on it or in the air over it), so the next
   * moves carry it. Off every deck (on the quay, in the water, over the side): none.
   */
  boarded(): void {
    const r = this.riding();
    this.aboard = null;
    if (!r) return;
    this.outOfHulls(r);
    for (const [id, s] of this.ships) {
      const f = this.deckFloor(s, r.x, r.z, r.y);
      // Over the deck, on it or jumping (a jump goes with the ship's way), not fallen below it.
      if (f !== null && r.y > f - 0.3 && r.y < f + 2.5) { const l = toShip(s.pose, r.x, r.y, r.z); this.aboard = { id, ...l, x: r.x, y: r.y, z: r.z }; return; }
    }
  }

  /**
   * A body in the water inside a hull (fallen in between the hull and the pier, or a hull that rolled onto it) is put
   * out beside it, at its side: the walker only keeps a body from walking into a wall, not out of one it is already in.
   */
  private outOfHulls(r: At): void {
    for (const s of this.ships.values()) {
      const l = toShip(s.pose, r.x, r.y, r.z), p = s.plan;
      if (l.h > p.deckY - 0.5 || !shipWall(p, l.a, l.b, this.radius, l.h)) continue;
      const half = hullHalf(p, l.a, Math.min(p.deckY - 0.1, l.h + 1.7)), side = l.b < 0 ? -1 : 1;
      const w = toWorld(s.pose, l.a, l.h, side * (half + this.radius + 0.02));
      r.x = w.x; r.z = w.z;
    }
  }

  /** The id of the ship the rider stands on (null: none). */
  get ship(): string | null {
    return this.aboard?.id ?? null;
  }

  /**
   * The floor at (x, z) on a deck or a gangplank, world y (null: none there). With the feet's height `y`: under a
   * castle's deck from below it, the cabin's floor; a deck over a body in the water (or falling past it), none.
   */
  underfoot(x: number, z: number, y?: number): number | null {
    let top = -Infinity;
    for (const s of this.ships.values()) top = Math.max(top, this.deckFloor(s, x, z, y) ?? this.plankFloor(s, x, z) ?? -Infinity);
    return top > -Infinity ? top : null;
  }

  /** Whether a body of radius `r` at (x, z), its feet at `y`, touches a ship (its rail, masts, hull). */
  hull(x: number, z: number, r: number, y: number): boolean {
    for (const s of this.ships.values()) {
      const p = s.pose, d = Math.hypot(x - p.x, z - p.z);
      if (d > s.plan.length / 2 + r + 1) continue;
      // Where along and across it at the deck (so neither the feet's height, sinking a step, nor the deck's lean
      // shifts the rail under them), how high from the feet's own.
      const l = vertical(p, x, z, s.plan.deckY);
      if (shipWall(s.plan, l.a, l.b, r, toShip(p, x, y, z).h, !!s.plank)) return true;
    }
    return false;
  }

  private deckFloor(s: Afloat, x: number, z: number, y?: number): number | null {
    const p = s.pose;
    if (Math.hypot(x - p.x, z - p.z) > s.plan.length / 2 + 1) return null;
    // Where the vertical through (x, z) meets the main deck, the floor there; on a castle or the grating, its own.
    const m = vertical(p, x, z, s.plan.deckY), f = shipFloor(s.plan, m.a, m.b);
    if (f === null) return null;
    const reach = y === undefined ? Infinity : y + STEP;
    if (m.y > reach) return null;
    if (f === s.plan.deckY) return m.y;
    const c = vertical(p, x, z, f);
    if (shipFloor(s.plan, c.a, c.b) !== f) return m.y;
    // A castle's deck over the feet (in its cabin, or against its front): the main deck under it.
    return c.y > reach ? m.y : c.y;
  }

  /** A ship's gangplank's ends now (its foot on the land, its head at the gangway), for drawing it; null: none out. */
  plankOf(id: string): { foot: At; head: At } | null {
    const s = this.ships.get(id);
    return s?.plank ? { foot: s.plank.foot, head: plankHead(s, s.plank.side) } : null;
  }

  private plankFloor(s: Afloat, x: number, z: number): number | null {
    if (!s.plank) return null;
    const head = plankHead(s, s.plank.side), foot = s.plank.foot;
    const dx = head.x - foot.x, dz = head.z - foot.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return null;
    const t = ((x - foot.x) * dx + (z - foot.z) * dz) / L2;
    if (t < 0 || t > 1) return null;
    const across = Math.abs((x - foot.x) * dz - (z - foot.z) * dx) / Math.sqrt(L2);
    return across <= PLANK ? foot.y + (head.y - foot.y) * t : null;
  }
}

/** Where a moored ship's gangplank rests on its pier or quay: straight out from its gangway, past the land's edge. */
function plankFoot(m: Mooring): { foot: At; side: 1 | -1 } {
  const p = m.plan, g = p.gangway!, ga = (g.a0 + g.a1) / 2;
  // The ship lies 0.6 m off the pier at its widest; its side is a little further in at the gangway.
  const out = p.beam / 2 + 0.6 + ONTO;
  const rest: Pose = { x: m.x, y: 0, z: m.z, ux: m.ux, uz: m.uz, pitch: 0, roll: 0 };
  const w = toWorld(rest, ga, 0, m.side * out);
  return { foot: { x: w.x, y: m.landY, z: w.z }, side: m.side };
}

/** A gangplank's head: on the deck's edge in the gangway, on the ship's `side`. */
function plankHead(s: Afloat, side: 1 | -1): At {
  const g = s.plan.gangway!, ga = (g.a0 + g.a1) / 2;
  return toWorld(s.pose, ga, s.plan.deckY, side * (hullHalf(s.plan, ga, s.plan.deckY) - 0.1));
}

/** Where the vertical through (x, z) meets the ship's level `h` (in its frame) at `p`: its a and b there, and world y. */
function vertical(p: Pose, x: number, z: number, h: number): { a: number; b: number; y: number } {
  // The ship frame's point moves linearly with the height along the vertical: solve for the level.
  const l0 = toShip(p, x, p.y, z), l1 = toShip(p, x, p.y + 1, z), dh = l1.h - l0.h;
  const k = Math.abs(dh) > 1e-6 ? (h - l0.h) / dh : 0;
  return { a: l0.a + (l1.a - l0.a) * k, b: l0.b + (l1.b - l0.b) * k, y: p.y + k };
}

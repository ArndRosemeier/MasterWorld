/**
 * The portal stone (pure): a hand-sized stone with two glyphs. The first marks home: a beam from the stone
 * strikes the floor below it, and that spot is where its portals lead. The second opens a portal just beyond the
 * stone, joined to a twin standing at home (game/portal.ts: two-way, seen through). Only one pair is open at a
 * time: a new portal elsewhere closes the far one and the home one now leads to the new place; marking a new
 * home closes both.
 *
 * Where the stone floats, where the portals stand and whether a portal has room are reckoned here; drawing and
 * the click are app/portalStoneUse.ts's.
 */
import type { Portal, PortalFrame, PortalShape, PortalSide } from './portal';

/** The stone's pair of portals goes by this id. */
export const STONE_PORTAL = 'portal-stone';
/** The stone's portals: a tall rift (an upright ellipse, materials/portal.ts) a head over a person. */
export const STONE_SHAPE: PortalShape = { halfWidth: 1.2, height: 3.2 };

/**
 * Where the stone floats: this far ahead of the feet, this far to their right and this high over them (m): over
 * the hero's shoulder as the camera trails behind, not hidden by the head.
 */
export const STONE_AHEAD = 1.3;
export const STONE_SIDE = 0.3;
export const STONE_UP = 1.85;
/** A portal opens this far beyond the stone (m): the hero steps into it from where they stand. */
export const PORTAL_BEYOND = 1.35;
/** A far portal nearer home than this would stand in its twin: it fizzles (m). */
export const NEAR_HOME = 6;

/** A point. */
export interface Spot { readonly x: number; readonly y: number; readonly z: number }

/** What a portal's spot is checked against. */
export interface RoomProbe {
  /** The floor here (ground, a deck, a step), world y. */
  standFloor(x: number, z: number): number;
  /** Walls, trunks, rocks: does a body of radius `r` at (x, z), its feet at `y`, touch one? */
  blocksAt(x: number, z: number, r: number, y: number): boolean;
  /** Rock as a signed distance (positive in air); null away from it. */
  rockGapAt(x: number, y: number, z: number): number | null;
  /** Water's surface here, or null. */
  wetAt(x: number, z: number): number | null;
}

/** Forward on the ground for a walker's yaw (0 faces −z). */
export function ahead(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/** Where the stone floats for a hero standing at `feet`, facing `yaw`. */
export function stoneSpot(feet: Spot, yaw: number): Spot {
  const [fx, fz] = ahead(yaw);
  // Right is forward turned a quarter clockwise seen from above: (-fz, fx).
  return { x: feet.x + fx * STONE_AHEAD - fz * STONE_SIDE, y: feet.y + STONE_UP, z: feet.z + fz * STONE_AHEAD + fx * STONE_SIDE };
}

/** Home: the floor the beam strikes under the stone, facing the way the hero faced. */
export function homeFrame(stone: Spot, yaw: number, floor: (x: number, z: number) => number): PortalFrame {
  return { x: stone.x, y: floor(stone.x, stone.z), z: stone.z, yaw };
}

/** The far portal's frame: on the floor just beyond the stone, its way through the way the hero faces. */
export function beyondFrame(stone: Spot, yaw: number, floor: (x: number, z: number) => number): PortalFrame {
  const [fx, fz] = ahead(yaw), x = stone.x + fx * PORTAL_BEYOND, z = stone.z + fz * PORTAL_BEYOND;
  return { x, y: floor(x, z), z, yaw };
}

/** How far the floor may rise or fall under the arch before it does not stand there (m). */
const LEVEL = 0.55;

/**
 * Is there room for a portal of `shape` at `f`: the floor under it about level, no water over it, no wall, trunk
 * or rock in the arch or just before and behind it?
 */
export function hasRoom(f: PortalFrame, shape: PortalShape, probe: RoomProbe): boolean {
  const [fx, fz] = ahead(f.yaw), rx = -fz, rz = fx;
  const w = shape.halfWidth;
  for (const along of [-0.6, 0, 0.6]) for (const k of [-1, -0.5, 0, 0.5, 1]) {
    const x = f.x + rx * w * k + fx * along, z = f.z + rz * w * k + fz * along;
    const y = probe.standFloor(x, z);
    if (!Number.isFinite(y) || Math.abs(y - f.y) > LEVEL) return false;
    const water = probe.wetAt(x, z);
    if (water !== null && water > y + 0.25) return false;
    if (probe.blocksAt(x, z, 0.3, f.y)) return false;
    for (const up of [0.4, 1.2, 2.0, shape.height - 0.2]) {
      // The rounded top is narrower: its outer points are not asked high up.
      if (up > shape.height - w && Math.abs(k) > 0.6) continue;
      const r = probe.rockGapAt(x, f.y + up, z);
      if (r !== null && r < 0.15) return false;
    }
  }
  return true;
}

/** What is kept: the home and the far portal's frames (all on the land). */
export interface PortalStoneSave {
  readonly home: PortalFrame | null;
  readonly far: PortalFrame | null;
}

const isFrame = (f: unknown): f is PortalFrame => !!f && typeof f === 'object' && ['x', 'y', 'z', 'yaw'].every((k) => Number.isFinite((f as Record<string, number>)[k]));

/** A save's stone, checked (a broken one is a stone that marked nothing yet). */
export function cleanStoneSave(raw: unknown): PortalStoneSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { home?: unknown; far?: unknown };
  const home = isFrame(r.home) ? r.home : null;
  return { home, far: home && isFrame(r.far) ? r.far : null };
}

/** The realm the stone's portals stand in. */
const REALM = 'land';

export class PortalStone {
  home: PortalFrame | null;
  far: PortalFrame | null;

  constructor(saved?: PortalStoneSave) {
    const s = cleanStoneSave(saved);
    this.home = s.home;
    this.far = s.far;
  }

  /** The pair open now (a home side and a far side), or null. */
  get portal(): Portal | null {
    if (!this.home || !this.far) return null;
    const side = (frame: PortalFrame): PortalSide => ({ realm: REALM, frame });
    return { id: STONE_PORTAL, shape: STONE_SHAPE, a: side(this.home), b: side(this.far), rift: true };
  }

  /** Home is marked at `f`: the pair that was open (if any) is closed. Returns whether one was. */
  markHome(f: PortalFrame): boolean {
    const was = !!this.portal;
    this.home = f;
    this.far = null;
    return was;
  }

  /**
   * Can a portal open at `f`? Not without a home, not on top of it, and not without room.
   */
  canOpen(f: PortalFrame, probe: RoomProbe): boolean {
    if (!this.home) return false;
    if (Math.hypot(f.x - this.home.x, f.z - this.home.z) < NEAR_HOME) return false;
    return hasRoom(f, STONE_SHAPE, probe) && hasRoom(this.home, STONE_SHAPE, probe);
  }

  /** Open the far portal at `f` (the old far one, if any, closes): the pair now open, and where the old far one stood. */
  open(f: PortalFrame): { portal: Portal; closed: PortalFrame | null } | null {
    if (!this.home) return null;
    const closed = this.far;
    this.far = f;
    return { portal: this.portal!, closed };
  }

  save(): PortalStoneSave {
    return { home: this.home, far: this.far };
  }
}

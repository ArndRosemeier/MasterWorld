/**
 * A cave's mouth on the land (plan 5.6: "cave mouths that flow from the ground into a dungeon"; pure, runs
 * in a worker): a crag of weathered rock rising out of the hillside, blended into the ground around its
 * foot, with a low dark mouth going in under it. The rock is a signed distance field meshed with surface
 * nets into the building format (rockMesh.ts): rock on its flanks, grass where its ledges are level. The
 * mouth's floor is the land's own ground, so the walker walks in on it until the way goes down.
 *
 * Its own frame: the mouth at the origin, the way in towards −z (turn it by the site's yaw), heights from
 * the ground at the mouth.
 */
import { Noise, Rng, deriveSeed, smin, smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { WildMat, scaleTint, type Tint } from './meshKit';
import { cragMat, meshField, walkRaster, type Field, type WalkRaster } from './rockMesh';
import { groundIn, type Site } from './site';
import { THROAT_BEYOND, THROAT_DARK, THROAT_GROW, throatAir, throatNoise } from './caveThroat';

/** Where in the mouth the hero goes down (its frame): a hillside's, a cliff's (its way in is bigger). */
export const MOUTH_WAY_DOWN = { x: 0, z: -3.2 } as const;
const CLIFF_WAY_DOWN = { x: 0, z: -4.6 } as const;
/** The crag's extent in its frame (x half width, z from front to back), metres: on a hillside, in a cliff. */
const EXTENT = { half: 12, front: 4, back: -17, top: 14 } as const;
const CLIFF_EXTENT = { half: 18, front: 5, back: -24, top: 26 } as const;
type Extent = typeof EXTENT | typeof CLIFF_EXTENT;
/** A mouth is a cliff's when the land rises this much (m) over the 20 m behind it: a mesa's wall, a crag's face. */
export const CLIFF_RISE = 9;
/** How much bigger a cliff's way in is than a hillside's. */
const CLIFF_WAY = 1.55;
/**
 * Where a cliff's way in ends, rounded off (m from the mouth): the mouth stands far enough out from the wall
 * (`CLIFF_FACE`) that the land's own face never shows inside it; it is dark well before.
 */
const CLIFF_DEEP = 4;
/** How far behind the mouth a cliff's own face begins (m): its way in and the crag's foot stand before it. */
export const CLIFF_FACE = 8;
/** Sample spacing of the mouth's field, metres. */
const STEP = 0.5;
/** How far the walk raster reaches beyond a body (the walker's radius and a little). */
const BODY = 0.34;
/** Spacing of the walk raster, metres. */
const RASTER = 0.25;

/** The rock and its ground, sampled; and where on the ground a body cannot stand. */
export interface CaveMouth {
  readonly mesh: BuildingMesh;
  /** Over the frame's x −half..half, z back..front: where the rock is in the way of a body. */
  readonly walk: WalkRaster;
  /** Where in it the hero goes down (its frame). */
  readonly way: { readonly x: number; readonly z: number };
  /** In a cliff (a wall rises behind it), not a hillside. */
  readonly cliff: boolean;
  /**
   * Where the way in becomes the cave's throat (caveThroat.ts) and the portal into the cave stands: z of its frame,
   * and the throat's floor (heights from the ground at the mouth, as the frame's).
   */
  readonly portal: { readonly z: number; readonly floor: number };
}

/** How far in the portal stands (m from the mouth): on a hillside, in a cliff (short of the wall's own face, CLIFF_FACE). */
const PORTAL_IN = 7, CLIFF_PORTAL_IN = 4.5;
/**
 * The mouth's side of the throat goes darker than the cave's by its portal: the day's light still reaches it (the
 * cave's side has only its own dim fill and the lantern), so the same rock reads alike on both sides.
 */
const DAY_IN = 0.15;

/** Where the mouth's own way in turns into the throat (frame z): over these metres, from the face on in. */
const INTO_FROM = 0.5, INTO_TO = -2;
/** Over how many metres before the portal the throat's floor levels out onto the portal's. */
const LEVEL_OUT = 2.5;

/** The highest ground across the throat near z (frame heights), a little over it: its floor, so no ground shows through. */
function groundTop(ground: (x: number, z: number) => number, z0: number, z1: number): number {
  let top = -Infinity;
  for (let z = z0; z <= z1; z += 0.25) for (let x = -1.8; x <= 1.8; x += 0.3) top = Math.max(top, ground(x, z));
  return top + 0.03;
}

/** The throat's floor at the portal (frame heights): level over the highest ground round it. */
export function throatFloor(ground: (x: number, z: number) => number, portalZ: number): number {
  return groundTop(ground, portalZ - THROAT_BEYOND - 0.5, portalZ + LEVEL_OUT + 0.5);
}

/**
 * The throat's floor at z along the way in (frame heights): over the ground across it, rising with the hillside,
 * and level onto the portal's floor over its last metres (the cave's side of the throat is level).
 */
export function throatRamp(ground: (x: number, z: number) => number, portal: { readonly z: number; readonly floor: number }, z: number): number {
  if (z <= portal.z + 0.6) return portal.floor;
  const top = groundTop(ground, z - 0.5, z + 0.5), k = smoothstep(portal.z + LEVEL_OUT, portal.z + 0.6, z);
  return top + (Math.max(top, portal.floor) - top) * k;
}

/** Half the width of the throat's floor that is walked (m). */
const THROAT_WALK = 1.6;

/**
 * The floor of the way in where it turns into the throat (frame heights, `ground` in the frame): the land's
 * ground giving way to the throat's floor; null outside it (the land's own ground there).
 */
export function throatWalk(ground: (x: number, z: number) => number, portal: { readonly z: number; readonly floor: number }, x: number, z: number): number | null {
  if (Math.abs(x) > THROAT_WALK || z < portal.z - THROAT_BEYOND || z > INTO_FROM) return null;
  const k = throatShare(z);
  if (k <= 0) return null;
  const h = ground(x, z);
  return h + (throatRamp(ground, portal, z) - h) * k;
}

/** How much of the way in at z is the throat already (0 out at the face .. 1 a couple of metres in and on). */
export const throatShare = (z: number): number => smoothstep(INTO_FROM, INTO_TO, z);

/**
 * The crag's rock (positive in air), without the ground; and the tunnel's air (positive inside). The rock is
 * a knoll cut off at the front by a weathered face: high at the face, its top falling back into the hill
 * behind and its flanks sinking into the ground at the sides, so the face stands out of the hillside.
 */
class Crag {
  private readonly noise: Noise;
  private readonly lean: number;
  private readonly high: number;
  /** How much bigger than a hillside's (1: a hillside's). */
  private readonly k: number;
  /** How deep the way in goes before its rounded end (m): a cliff's ends short of the wall's own face behind it. */
  private readonly deep: number;

  constructor(seed: number, private readonly ground: (x: number, z: number) => number, private readonly E: Extent, cliff: boolean) {
    const rng = new Rng(deriveSeed(seed, 'cave', 'mouth'));
    this.noise = new Noise(deriveSeed(seed, 'cave', 'crag'));
    this.lean = rng.range(-0.05, 0.05);
    this.k = cliff ? CLIFF_WAY : 1;
    this.deep = cliff ? CLIFF_DEEP : 9;
    // In a cliff the crag is the wall's own foot: high, so the face goes on up into the wall behind.
    this.high = cliff ? rng.range(15, 20) : rng.range(4.6, 6.2);
  }

  /** The face's line: z of the face at x (it curves back at the sides). */
  private front(x: number, y: number): number {
    const k = this.k;
    return -1.1 * k - (0.03 / (k * k)) * x * x + this.lean * x - y * 0.12 / k + this.noise.fbm3(x / 3, y / 3, 0.5, 2) * 0.7 * k;
  }

  /** Height of the knoll's top over the land at (x, z). */
  top(x: number, z: number): number {
    const E = this.E, back = 1 - smoothstep(-4 * this.k, E.back + 1, z), sides = 1 - smoothstep(2.5 * this.k, E.half - 0.5, Math.abs(x));
    return (this.high * Math.pow(back, 0.8) + this.noise.fbm3(x / 5, 0.3, z / 5, 2) * 0.6 * this.k) * sides - 0.3;
  }

  rock(x: number, y: number, z: number): number {
    const h = this.ground(x, z);
    const d = Math.max((z - this.front(x, y - h)) * 0.8, y - h - this.top(x, z));
    if (d > 4) return d;
    // Weathered: big lumps and smaller knocks on the face, and the beds of the rock as faint steps.
    const n = this.noise, face = smoothstep(-1.5, 0.5, z - this.front(x, y - h));
    return d + (n.fbm3(x / 3.4, y / 3.4, z / 3.4, 3) * 0.9 + n.fbm3(x / 1.1 + 9.1, y / 1.1, z / 1.1, 2) * 0.22) * (0.12 + 0.88 * face) + Math.sin(y * 1.6 + n.fbm3(x / 12, y / 12, z / 12, 2) * 3) * 0.12 * face;
  }

  /** The way in: a low passage, wider at the mouth, sloping a little down as it goes in (a cliff's is bigger). */
  tunnel(x: number, y: number, z: number): number {
    const k = this.k, t = Math.max(0, Math.min(1, (2.5 * k - z) / (11.5 * k)));
    const cy = (1.15 - t * 0.5) * k, r = (1.55 - t * 0.25) * k;
    const dz = z < -this.deep ? z + this.deep : z > 2.5 * k ? z - 2.5 * k : 0;
    return r - Math.hypot(x, (y - cy) / 1.25, dz) + this.noise.fbm3(x / 1.4, y / 1.4, z / 1.4 + 4.4, 2) * 0.18 * k;
  }
}

/**
 * The mouth at a site: `ground(x, z)` is the land's height in the mouth's frame, relative to the ground at
 * the mouth (the caller turns the frame onto the land).
 */
export function caveMouth(seed: number, ground: (x: number, z: number) => number, cliff = false): CaveMouth {
  const EXTENT: Extent = cliff ? CLIFF_EXTENT : PLAIN;
  const nx = Math.ceil((2 * EXTENT.half) / STEP) + 1, nz = Math.ceil((EXTENT.front - EXTENT.back) / STEP) + 1;
  let low = 0;
  const g = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const h = ground(-EXTENT.half + i * STEP, EXTENT.back + k * STEP);
    g[k * nx + i] = h;
    low = Math.min(low, h);
  }
  const groundUnder = (x: number, z: number) => {
    const i = Math.max(0, Math.min(nx - 1, Math.round((x + EXTENT.half) / STEP))), k = Math.max(0, Math.min(nz - 1, Math.round((z - EXTENT.back) / STEP)));
    return g[k * nx + i];
  };
  const crag = new Crag(seed, groundUnder, EXTENT, cliff);
  // The portal into the cave, and the throat it stands in (the cave carves the same throat on its side).
  const pz = -(cliff ? CLIFF_PORTAL_IN : PORTAL_IN), pf = throatFloor(groundUnder, pz), gullet = throatNoise(seed);
  const portal = { z: pz, floor: pf };
  // The throat's floor along the way in, once per row of the field (it depends on z alone).
  const ramp = new Float32Array(nz);
  for (let k = 0; k < nz; k++) ramp[k] = throatRamp(groundUnder, portal, EXTENT.back + k * STEP);
  const rampAt = (z: number) => ramp[Math.max(0, Math.min(nz - 1, Math.round((z - EXTENT.back) / STEP)))];
  const throat = (x: number, y: number, z: number) => Math.min(throatAir(gullet, x, y - rampAt(z), z - pz, THROAT_GROW), z - pz + THROAT_BEYOND);
  const oy = low - 2, ny = Math.ceil((EXTENT.top - oy) / STEP) + 1;
  const air = (i: number, y: number, k: number) => {
    const x = -EXTENT.half + i * STEP, z = EXTENT.back + k * STEP, h = g[k * nx + i];
    const above = y - h;
    const rock = smin(crag.rock(x, y, z), above, 1.8);
    // The tunnel never digs below the ground (its floor is the land's), until it turns into the throat.
    const share = throatShare(z), way = Math.min(crag.tunnel(x, y, z), above + 0.02);
    return Math.max(rock, share <= 0 ? way : share >= 1 ? throat(x, y, z) : way + (throat(x, y, z) - way) * share);
  };
  const d = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[i + nx * (j + ny * k)] = air(i, oy + j * STEP, k);
  const field: Field = { ox: -EXTENT.half, oy, oz: EXTENT.back, step: STEP, nx, ny, nz, d };
  const look = new Noise(deriveSeed(seed, 'cave', 'mouth-look'));
  const craggy = cragMat(
    (x, _y, z) => Math.abs(x) < EXTENT.half - 0.6 && z > EXTENT.back + 0.6 && z < EXTENT.front - 0.6,
    (x, y, z) => crag.rock(x, y, z), groundUnder,
    (x, y, z, up) => up > 0.45 && (up > 0.75 || y > groundUnder(x, z) + crag.top(x, z) - 0.7),
  );
  // The throat's own faces are always drawn (bare rock), also where it runs under the land beyond the crag's own rock.
  const inThroatOrCrag = (x: number, y: number, z: number, up: number) => (Math.abs(x) < 3 && throatShare(z) > 0.3 && throat(x, y, z) > -0.6 ? WildMat.Rock : craggy(x, y, z, up));
  const mesh = meshField(field, {
    // Only the crag and its fillet (the plain ground around and the floor of the way in are the land's own), not
    // the field's own edges (where it is cut off); turf on the knoll's top and flanks, bare rock on its face.
    // The throat's own floor is the crag's (level, over the ground), so it meets the cave's floor at the portal.
    mat: inThroatOrCrag,
    tint: (x, y, z, m) => {
      // Deeper in the way, darker, until it is black where it goes on down.
      // Deeper in the way, darker: at the portal as dark as the cave's throat on its side (caveThroat.ts).
      const inside = Math.max(crag.tunnel(x, y, z), throat(x, y, z)) > -0.7 ? smoothstep(0.3, -pz * 0.8, -z) : 0;
      const tone = (0.85 + 0.3 * (look.fbm3(x / 4, y / 4, z / 4, 2) * 0.5 + 0.5)) * (1 - (1 - THROAT_DARK * DAY_IN) * inside);
      return scaleTint(m === WildMat.Grass ? GRASS : cliff ? WALL : ROCK, tone);
    },
  });
  // Where the fillet runs out onto the plain ground, sink it a hand's breadth so the land's mesh wins there.
  for (let v = 0; v < mesh.position.length / 3; v++) {
    const x = mesh.position[3 * v], y = mesh.position[3 * v + 1], z = mesh.position[3 * v + 2];
    mesh.position[3 * v + 1] -= 0.15 * smoothstep(1.2, 2.4, crag.rock(x, y, z));
  }
  // The walk raster: rock at knee or chest height over the ground.
  const airNear = (x: number, y: number, z: number) => {
    const u = (x + EXTENT.half) / STEP, w = (z - EXTENT.back) / STEP;
    const i = Math.max(0, Math.min(nx - 1, Math.round(u))), k = Math.max(0, Math.min(nz - 1, Math.round(w)));
    return air(i, y, k);
  };
  const walk = walkRaster(-EXTENT.half, EXTENT.half, EXTENT.back, EXTENT.front, RASTER, (x, z) => {
    const h = throatWalk(groundUnder, portal, x, z) ?? groundUnder(x, z);
    return airNear(x, h + 0.8, z) < BODY || airNear(x, h + 1.4, z) < BODY;
  });
  return { mesh, walk, way: cliff ? CLIFF_WAY_DOWN : MOUTH_WAY_DOWN, cliff, portal };
}

/** The land rises a cliff's height over the 20 m behind a mouth's site (`ground` in its frame, from the mouth). */
export const inCliff = (ground: (x: number, z: number) => number): boolean => Math.max(ground(0, -20), ground(0, -16)) > CLIFF_RISE;

/** The mouth at a site on the land (`height`: the land's height), heights from the ground at the mouth. */
export function mouthOnLand(height: (x: number, z: number) => number, site: Site, seed: number): CaveMouth {
  const ground = groundIn(site, height, height(site.x, site.z));
  return caveMouth(seed, ground, inCliff(ground));
}

/** How far the mouth's rock reaches from its site, metres (for quick tests). */
export const MOUTH_REACH = Math.hypot(CLIFF_EXTENT.half, CLIFF_EXTENT.back);

/** A cliff's crag is the wall's own rock: the warm tan of a mesa's beds, not a hillside's grey. */
const ROCK: Tint = [178, 172, 160], WALL: Tint = [196, 168, 134], GRASS: Tint = [196, 196, 168];
const PLAIN: Extent = EXTENT;

/** Whether a cave's mouth at this site on the land goes into a cliff (a rise of more than `CLIFF_RISE` behind it). */
export function siteInCliff(height: (x: number, z: number) => number, site: Site): boolean {
  return inCliff(groundIn(site, height, height(site.x, site.z)));
}

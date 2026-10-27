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
import { onLand, type Site } from './site';

/** Where in the mouth the hero goes down (its frame). */
export const MOUTH_WAY_DOWN = { x: 0, z: -3.2 } as const;
/** The crag's extent in its frame (x half width, z from front to back), metres. */
const EXTENT = { half: 12, front: 4, back: -17, top: 14 } as const;
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
}

/**
 * The crag's rock (positive in air), without the ground; and the tunnel's air (positive inside). The rock is
 * a knoll cut off at the front by a weathered face: high at the face, its top falling back into the hill
 * behind and its flanks sinking into the ground at the sides, so the face stands out of the hillside.
 */
class Crag {
  private readonly noise: Noise;
  private readonly lean: number;
  private readonly high: number;

  constructor(seed: number, private readonly ground: (x: number, z: number) => number) {
    const rng = new Rng(deriveSeed(seed, 'cave', 'mouth'));
    this.noise = new Noise(deriveSeed(seed, 'cave', 'crag'));
    this.lean = rng.range(-0.05, 0.05);
    this.high = rng.range(4.6, 6.2);
  }

  /** The face's line: z of the face at x (it curves back at the sides). */
  private front(x: number, y: number): number {
    return -1.1 - 0.03 * x * x + this.lean * x - y * 0.12 + this.noise.fbm3(x / 3, y / 3, 0.5, 2) * 0.7;
  }

  /** Height of the knoll's top over the land at (x, z). */
  top(x: number, z: number): number {
    const back = 1 - smoothstep(-4, EXTENT.back + 1, z), sides = 1 - smoothstep(2.5, EXTENT.half - 0.5, Math.abs(x));
    return (this.high * Math.pow(back, 0.8) + this.noise.fbm3(x / 5, 0.3, z / 5, 2) * 0.6) * sides - 0.3;
  }

  rock(x: number, y: number, z: number): number {
    const h = this.ground(x, z);
    const d = Math.max((z - this.front(x, y - h)) * 0.8, y - h - this.top(x, z));
    if (d > 4) return d;
    // Weathered: big lumps and smaller knocks on the face, and the beds of the rock as faint steps.
    const n = this.noise, face = smoothstep(-1.5, 0.5, z - this.front(x, y - h));
    return d + (n.fbm3(x / 3.4, y / 3.4, z / 3.4, 3) * 0.9 + n.fbm3(x / 1.1 + 9.1, y / 1.1, z / 1.1, 2) * 0.22) * (0.12 + 0.88 * face) + Math.sin(y * 1.6 + n.fbm3(x / 12, y / 12, z / 12, 2) * 3) * 0.12 * face;
  }

  /** The way in: a low passage, wider at the mouth, sloping a little down as it goes in. */
  tunnel(x: number, y: number, z: number): number {
    const t = Math.max(0, Math.min(1, (2.5 - z) / 11.5));
    const cy = 1.15 - t * 0.5, r = 1.55 - t * 0.25;
    const dz = z < -9 ? z + 9 : z > 2.5 ? z - 2.5 : 0;
    return r - Math.hypot(x, (y - cy) / 1.25, dz) + this.noise.fbm3(x / 1.4, y / 1.4, z / 1.4 + 4.4, 2) * 0.18;
  }
}

/**
 * The mouth at a site: `ground(x, z)` is the land's height in the mouth's frame, relative to the ground at
 * the mouth (the caller turns the frame onto the land).
 */
export function caveMouth(seed: number, ground: (x: number, z: number) => number): CaveMouth {
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
  const crag = new Crag(seed, groundUnder);
  const oy = low - 2, ny = Math.ceil((EXTENT.top - oy) / STEP) + 1;
  const air = (i: number, y: number, k: number) => {
    const x = -EXTENT.half + i * STEP, z = EXTENT.back + k * STEP, h = g[k * nx + i];
    const above = y - h;
    const rock = smin(crag.rock(x, y, z), above, 1.8);
    // The tunnel never digs below the ground: its floor is the land's.
    return Math.max(rock, Math.min(crag.tunnel(x, y, z), above + 0.02));
  };
  const d = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[i + nx * (j + ny * k)] = air(i, oy + j * STEP, k);
  const field: Field = { ox: -EXTENT.half, oy, oz: EXTENT.back, step: STEP, nx, ny, nz, d };
  const look = new Noise(deriveSeed(seed, 'cave', 'mouth-look'));
  const mesh = meshField(field, {
    // Only the crag and its fillet (the plain ground around and the floor of the way in are the land's own), not
    // the field's own edges (where it is cut off); turf on the knoll's top and flanks, bare rock on its face.
    mat: cragMat(
      (x, _y, z) => Math.abs(x) < EXTENT.half - 0.6 && z > EXTENT.back + 0.6 && z < EXTENT.front - 0.6,
      (x, y, z) => crag.rock(x, y, z), groundUnder,
      (x, y, z, up) => up > 0.45 && (up > 0.75 || y > groundUnder(x, z) + crag.top(x, z) - 0.7),
    ),
    tint: (x, y, z, m) => {
      // Deeper in the way, darker, until it is black where it goes on down.
      const inside = crag.tunnel(x, y, z) > -0.7 ? smoothstep(0.3, 7.5, -z) : 0;
      const tone = (0.85 + 0.3 * (look.fbm3(x / 4, y / 4, z / 4, 2) * 0.5 + 0.5)) * (1 - 0.94 * inside);
      return scaleTint(m === WildMat.Grass ? GRASS : ROCK, tone);
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
    const h = groundUnder(x, z);
    return airNear(x, h + 0.8, z) < BODY || airNear(x, h + 1.4, z) < BODY;
  });
  return { mesh, walk };
}

/** The mouth at a site on the land (`height`: the land's height), heights from the ground at the mouth. */
export function mouthOnLand(height: (x: number, z: number) => number, site: Site, seed: number): CaveMouth {
  const h0 = height(site.x, site.z);
  return caveMouth(seed, (x, z) => { const [wx, wz] = onLand(site, x, z); return height(wx, wz) - h0; });
}

/** How far the mouth's rock reaches from its site, metres (for quick tests). */
export const MOUTH_REACH = Math.hypot(EXTENT.half, EXTENT.back);

const ROCK: Tint = [178, 172, 160], GRASS: Tint = [196, 196, 168];

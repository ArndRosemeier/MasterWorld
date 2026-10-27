/**
 * A hold's rock (pure, runs in a worker): the crag the gate is cut into, and the two carved wardens before
 * it. Both are signed distance fields meshed with surface nets into the building format (dungeon/rockMesh.ts),
 * so they draw with the town's one building shader. The crag rises out of the hillside on either side of
 * the gate's front and over it, weathered and stepped, turf on its ledges, its flanks curving back into
 * the hill; the land's own ground is left to the land. The wardens are dwarves in stone, a little over
 * twice a dwarf's height: a robe to the feet, arms folded over a beard to the belt, a helm, a great axe
 * upright beside them.
 *
 * The gate's frame (world/hold.ts): the doorway's middle at the origin, out of the gate towards +z, heights
 * from the court. `ground(u, v)` is the land's height there, from the court.
 */
import { Noise, deriveSeed, smin, smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { MeshKit, WildMat, scaleTint, type Tint } from './dungeon/meshKit';
import { fieldAt, meshField, type Field } from './dungeon/rockMesh';
import { onLand, type Site } from './dungeon/site';
import { FACE, GATE, WARDENS } from './hold';

/** The crag's extent in the gate's frame (u half width, v from back to front, top above the court), metres. */
const EXTENT = { half: 40, back: -26, front: 3, top: FACE.h + 7 } as const;
/** Sample spacing of the crag's field, metres. */
const STEP = 0.6;
/** The wardens' field spacing (fine: a beard, a helm's crest, an axe's bit), metres. */
const FINE = 0.06;
/** How far the walk raster reaches beyond a body (the walker's radius and a little), and its spacing, metres. */
const BODY = 0.34, RASTER = 0.25;
/** The gate's front, kept clear of rock (a little inside its stone, so no seam shows). */
const FRONT = { half: GATE.half + 0.4, top: GATE.h - 0.1, back: -9.6 } as const;

/** A dressed granite the wardens are carved in; the crag's weathered rock; turf on its ledges. */
const CARVED: Tint = [190, 184, 172];
const ROCK: Tint = [168, 160, 148];
const GRASS: Tint = [196, 196, 168];

/** The rock and the wardens as one mesh in the gate's frame; and where on the ground the crag is in a body's way. */
export interface HoldRock {
  readonly mesh: BuildingMesh;
  /** Raster over u −half..half, v back..front: 1 where the crag is in the way of a body. */
  readonly blocked: Uint8Array;
  readonly cols: number;
  readonly rows: number;
}

/** A smooth function of two coordinates sampled once on a grid and read back bilinearly (clamped at its edges). */
class Table {
  private readonly d: Float32Array;
  private readonly nx: number;
  private readonly ny: number;
  constructor(f: (a: number, b: number) => number, private readonly a0: number, a1: number, private readonly b0: number, b1: number, private readonly step: number) {
    this.nx = Math.ceil((a1 - a0) / step) + 1; this.ny = Math.ceil((b1 - b0) / step) + 1;
    this.d = new Float32Array(this.nx * this.ny);
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) this.d[j * this.nx + i] = f(a0 + i * step, b0 + j * step);
  }
  /** The lowest sample. */
  get low(): number { return this.d.reduce((m, v) => Math.min(m, v), Infinity); }
  at(a: number, b: number): number {
    const u = Math.max(0, Math.min(this.nx - 1.001, (a - this.a0) / this.step)), v = Math.max(0, Math.min(this.ny - 1.001, (b - this.b0) / this.step));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, d = this.d, k = j * this.nx + i;
    return (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + this.nx] * (1 - fu) + d[k + this.nx + 1] * fu) * fv;
  }
}

/** The crag, without the ground (positive in air). */
class Crag {
  private readonly n: Noise;
  private readonly frontT: Table;
  private readonly topT: Table;
  constructor(seed: number) {
    const n = this.n = new Noise(deriveSeed(seed, 'hold', 'crag'));
    // The face's line: v of the face at u and height y (it leans back as it rises and curves back into the hill at the sides).
    this.frontT = new Table((u, y) => {
      const side = Math.max(0, Math.abs(u) - 13);
      return -0.9 - 0.025 * side * side - y * 0.06 + n.fbm3(u / 4, y / 4, 0.5, 2) * 1.1;
    }, -EXTENT.half - 1, EXTENT.half + 1, -40, EXTENT.top + 1, 0.5);
    // The crag's top above the court at (u, v): over the face's height where the gate is, sinking into the hill at the sides and back.
    this.topT = new Table((u, v) => {
      const sides = 1 - smoothstep(20, 38, Math.abs(u)), back = 1 - smoothstep(-15, -25, v);
      return (FACE.h + 2.4 + n.fbm3(u / 6, 0.3, v / 6, 2) * 2) * sides * (0.55 + 0.45 * back);
    }, -EXTENT.half - 1, EXTENT.half + 1, EXTENT.back - 1, EXTENT.front + 1, 0.5);
  }

  front(u: number, y: number): number { return this.frontT.at(u, y); }
  top(u: number, v: number): number { return this.topT.at(u, v); }

  rock(u: number, y: number, v: number): number {
    const d = Math.max((v - this.front(u, y)) * 0.8, y - this.top(u, v));
    // Clear of the gate's front, which stands in a cut of its own.
    const cut = Math.min(FRONT.half - Math.abs(u), FRONT.top - y, v - FRONT.back);
    // Far from the face no weathering can reach it (its lumps are under 3 m).
    if (Math.abs(d) > 3) return Math.max(d, cut);
    // Weathered: great blocks split by joints, lumps and knocks, and the beds of the rock as ledges.
    const n = this.n, face = smoothstep(-2, 0.5, d / 0.8);
    const blocks = n.fbm3(u / 7, y / 9, v / 7, 2) * 1.6;
    const lumps = n.fbm3(u / 3.2, y / 3.2, v / 3.2, 3) * 0.8 + n.fbm3(u / 1.1 + 9.1, y / 1.1, v / 1.1, 2) * 0.2;
    const b = (y + n.fbm3(u / 10, 0, v / 10, 2) * 2) / 2.6, beds = (Math.abs(b - Math.floor(b) - 0.5) - 0.25) * 0.7;
    return Math.max(d + (blocks + lumps) * (0.15 + 0.85 * face) + beds * face, cut);
  }
}

/** The crag and both wardens at a site; `ground(u, v)` the land's height there from the court. */
export function holdRock(seed: number, ground: (u: number, v: number) => number): HoldRock {
  const k = new MeshKit();
  const crag = cragMesh(seed, ground);
  k.append(crag.mesh.position, crag.mesh.normal, crag.mesh.uv, crag.mesh.mat, crag.mesh.tint, crag.mesh.index);
  const w = warden();
  for (const side of [-1, 1]) placeWarden(k, w, side);
  return { mesh: k.mesh(), blocked: crag.blocked, cols: crag.cols, rows: crag.rows };
}

/** The rock at a site on the land (`height`: the land's height; `level`: the court's). */
export function holdRockOnLand(height: (x: number, z: number) => number, site: Site & { readonly level: number }, seed: number): HoldRock {
  return holdRock(seed, (u, v) => { const [x, z] = onLand(site, u, v); return height(x, z) - site.level; });
}

function cragMesh(seed: number, ground: (u: number, v: number) => number): HoldRock {
  const nx = Math.ceil((2 * EXTENT.half) / STEP) + 1, nz = Math.ceil((EXTENT.front - EXTENT.back) / STEP) + 1;
  const land = new Table(ground, -EXTENT.half, EXTENT.half, EXTENT.back, EXTENT.front, STEP);
  const groundUnder = (u: number, v: number) => land.at(u, v);
  const crag = new Crag(seed);
  const oy = Math.min(0, land.low) - 2, ny = Math.ceil((EXTENT.top - oy) / STEP) + 1;
  const air = (u: number, y: number, v: number) => smin(crag.rock(u, y, v), y - groundUnder(u, v), 1.6);
  const d = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[i + nx * (j + ny * k)] = air(-EXTENT.half + i * STEP, oy + j * STEP, EXTENT.back + k * STEP);
  const field: Field = { ox: -EXTENT.half, oy, oz: EXTENT.back, step: STEP, nx, ny, nz, d };
  const look = new Noise(deriveSeed(seed, 'hold', 'crag-look'));
  const mesh = meshField(field, {
    // Only the crag and its fillet: the ground around is the land's own, and the field's cut edges are left out.
    mat: (u, y, v, up) => {
      if (Math.abs(u) > EXTENT.half - 0.8 || v < EXTENT.back + 0.8 || v > EXTENT.front - 0.8 || y > EXTENT.top - 0.8) return null;
      const h = groundUnder(u, v);
      if (crag.rock(u, y, v) > 2.2) return null;
      if (up > 0.6 && y < h + 0.35) return null;
      return up > 0.72 ? WildMat.Grass : WildMat.Rock;
    },
    tint: (u, y, v, m) => {
      // Streaks of weather down the face, darker where water runs, a little paler up high.
      const streak = look.fbm3(u / 1.6, y / 14, v / 1.6, 2), patch = look.fbm3(u / 5, y / 5, v / 5, 2);
      const tone = 0.8 + 0.18 * patch - 0.12 * Math.max(0, streak) + 0.08 * smoothstep(0, FACE.h, y);
      return scaleTint(m === WildMat.Grass ? GRASS : ROCK, tone);
    },
  });
  // The walk raster: rock at knee or chest height over the ground.
  const cols = Math.ceil((2 * EXTENT.half) / RASTER), rows = Math.ceil((EXTENT.front - EXTENT.back) / RASTER);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = -EXTENT.half + (c + 0.5) * RASTER, v = EXTENT.back + (r + 0.5) * RASTER, h = groundUnder(u, v);
    if (fieldAt(field, u, h + 0.8, v, 1) < BODY || fieldAt(field, u, h + 1.4, v, 1) < BODY) blocked[r * cols + c] = 1;
  }
  return { mesh, blocked, cols, rows };
}

/** Is a body at (u, v) of the gate's frame in the crag's way? */
export function inHoldRock(m: Pick<HoldRock, 'blocked' | 'cols' | 'rows'>, u: number, v: number): boolean {
  const c = Math.floor((u + EXTENT.half) / RASTER), r = Math.floor((v - EXTENT.back) / RASTER);
  if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return false;
  return m.blocked[r * m.cols + c] === 1;
}

// ——— The wardens: one carved dwarf in its own frame (feet on the plinth at y 0, facing +z, axe at +x). ———

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const sphere = (p: V3, c: V3, r: number) => len(sub(p, c)) - r;
/** A cone with round ends: radius ra at a, rb at b. */
function roundCone(p: V3, a: V3, b: V3, ra: number, rb: number): number {
  const ab = sub(b, a), ap = sub(p, a), t = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
  return len(sub(ap, [ab[0] * t, ab[1] * t, ab[2] * t])) - (ra + (rb - ra) * t);
}
const capsule = (p: V3, a: V3, b: V3, r: number) => roundCone(p, a, b, r, r);
/** An ellipsoid (near enough a distance close to its surface). */
function ellipsoid(p: V3, c: V3, r: V3): number {
  const q: V3 = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  return (len(q) - 1) * Math.min(r[0], r[1], r[2]);
}

/** The carved dwarf (positive in air). */
function dwarf(p: V3): number {
  const [x, y, z] = p, s = (a: number, b: number) => smin(a, b, 0.07);
  // The robe to the feet, ample and pleated, wider at the hem; its belt.
  const pleats = y < 1.9 ? 0.035 * Math.sin(Math.atan2(z, x) * 11) * smoothstep(1.9, 0.6, y) : 0;
  const robe = roundCone([x, y, z / 0.82], [0, 0.18, 0], [0, 1.85, 0], 0.8, 0.6) * 0.82 + pleats;
  const belt = Math.max(Math.abs(y - 1.86) - 0.08, Math.hypot(x, z / 0.84) - 0.67);
  const buckle = sphere([x, (y - 1.86) * 1.3, z], [0, 0, 0.6], 0.11);
  let d = s(s(robe, belt), buckle);
  // Chest and broad shoulders.
  d = s(d, ellipsoid(p, [0, 2.32, 0], [0.74, 0.64, 0.52]));
  d = s(d, capsule(p, [-0.6, 2.76, -0.04], [0.6, 2.76, -0.04], 0.29));
  // The arms folded over the chest: upper arms down the sides, forearms crossed before the beard.
  for (const k of [-1, 1]) {
    const elbow: V3 = [k * 0.7, 2.08, 0.2];
    d = s(d, roundCone(p, [k * 0.74, 2.7, 0], elbow, 0.22, 0.18));
    d = s(d, roundCone(p, elbow, [-k * 0.3, 2.28 + k * 0.05, 0.52], 0.18, 0.15));
  }
  // The head under its helm, a heavy brow and nose.
  d = s(d, sphere(p, [0, 3.14, 0.06], 0.31));
  d = s(d, capsule(p, [0, 3.18, 0.36], [0, 3.04, 0.42], 0.065));
  d = s(d, capsule(p, [-0.17, 3.24, 0.3], [0.17, 3.24, 0.3], 0.06));
  // The beard: full under the face and falling over the folded arms to the belt, combed into strands.
  const strands = 0.022 * Math.sin(x * 38) * smoothstep(3.0, 2.4, y);
  d = s(d, roundCone([x, y, z], [0, 2.98, 0.32], [0, 1.98, 0.66], 0.29, 0.1) + strands);
  // The helm: a dome on a brim, a crest from brow to nape and a nasal guard.
  const dome = Math.max(sphere(p, [0, 3.26, 0.04], 0.37), 3.2 - y);
  const brim = Math.max(Math.abs(y - 3.22) - 0.05, Math.hypot(x, z - 0.04) - 0.43);
  let helm = Math.min(dome, brim);
  helm = Math.min(helm, capsule(p, [0, 3.6, -0.28], [0, 3.62, 0.3], 0.06));
  helm = Math.min(helm, Math.max(Math.abs(x) - 0.05, Math.abs(y - 3.08) - 0.13, Math.abs(z - 0.4) - 0.05));
  d = Math.min(d, helm);
  // The great axe, upright at his side: a haft from the plinth to over his head, a double bit at its top.
  const ax = 0.98, az = 0.28, ay = 3.42;
  const haft = Math.max(Math.hypot(x - ax, z - az) - 0.075, -y, y - 3.95);
  const lobes = Math.min(Math.hypot(x - (ax + 0.3), y - ay) - 0.42, Math.hypot(x - (ax - 0.3), y - ay) - 0.42);
  const bit = Math.max(lobes, Math.abs(z - az) - 0.07, Math.abs(y - ay) - (0.12 + 0.75 * Math.abs(x - ax)));
  return Math.min(d, haft, bit);
}

/** The carved dwarf as a mesh in its own frame. */
export function warden(): BuildingMesh {
  const box = { x0: -1.0, x1: 1.55, y0: -0.12, y1: 4.05, z0: -0.75, z1: 1.0 };
  const nx = Math.ceil((box.x1 - box.x0) / FINE) + 1, ny = Math.ceil((box.y1 - box.y0) / FINE) + 1, nz = Math.ceil((box.z1 - box.z0) / FINE) + 1;
  const d = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    d[i + nx * (j + ny * k)] = dwarf([box.x0 + i * FINE, box.y0 + j * FINE, box.z0 + k * FINE]);
  }
  return meshField({ ox: box.x0, oy: box.y0, oz: box.z0, step: FINE, nx, ny, nz, d }, {
    // Not his underside on the plinth, nor the field's own walls (beyond it counts as rock).
    mat: (x, y, z) => (y < 0.02 || x < box.x0 + 2 * FINE || x > box.x1 - 2 * FINE || y > box.y1 - 2 * FINE || z < box.z0 + 2 * FINE || z > box.z1 - 2 * FINE ? null : WildMat.Rock),
    // Weathered darker at the foot and in the folds under the beard and arms; the axe darker still.
    tint: (x, y) => scaleTint(CARVED, (0.72 + 0.28 * smoothstep(0, 1.2, y)) * (x > 0.86 ? 0.82 : 1)),
  });
}

/** A warden on the gate's side `side` (−1 left, +1 right, mirrored so the axe is on the outer side), into `k`. */
function placeWarden(k: MeshKit, m: BuildingMesh, side: number): void {
  const turn = side * WARDENS.turn, c = Math.cos(turn), s = Math.sin(turn), X = side * WARDENS.x;
  const n = m.position.length / 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lx = m.position[3 * i] * side, ly = m.position[3 * i + 1], lz = m.position[3 * i + 2];
    pos[3 * i] = X + lx * c + lz * s; pos[3 * i + 1] = WARDENS.plinth + ly; pos[3 * i + 2] = WARDENS.z - lx * s + lz * c;
    const nx = m.normal[3 * i] * side, ny = m.normal[3 * i + 1], nz = m.normal[3 * i + 2];
    nor[3 * i] = nx * c + nz * s; nor[3 * i + 1] = ny; nor[3 * i + 2] = -nx * s + nz * c;
  }
  // Mirrored, each triangle turns the other way round.
  const idx = side > 0 ? m.index : m.index.map((_v, i) => m.index[i - (i % 3) + [0, 2, 1][i % 3]]);
  k.append(pos, nor, m.uv, m.mat, m.tint, idx);
}

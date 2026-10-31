/**
 * A town's buildings as meshes (pure, runs in the terrain worker): @futuremagic/settlement builds each
 * building (and each fence and haystack of its farmland), and those of one square cell are merged into
 * one mesh near and one far (fewer draws).
 */
import { buildingMesh, fixtureMesh, harbourMesh, wallMesh, doorLeaves, hatchLadderTopMesh, hatchLidMesh, interiorMesh, planInterior, propMesh, type BuildingMesh, type DoorLeaf, type InteriorFixture, type InteriorPlan, type TownBuilding, type TownProp } from '@futuremagic/settlement';
import type { Town } from './town';

/** Side of a merge cell, metres. */
export const TOWN_CELL = 64;

/** Where one building's triangles are in a merged mesh: its id, the first index and how many. */
export type MeshRange = [id: number, start: number, count: number];

/** The buildings of one cell, near and far, positions relative to (x, 0, z), and each building's place in them (to hide one). */
export interface TownCellMesh {
  x: number;
  z: number;
  near: BuildingMesh | ReadyMesh;
  far: BuildingMesh | ReadyMesh;
  nearRanges: MeshRange[];
  farRanges: MeshRange[];
}

/** Every cell of a town that has buildings (or a stretch of its wall, or fixtures out of doors) in it. */
/** `signs`: a shield over the door of these buildings (by id, its colour), the guild houses. `height`: the ground the fixtures stand on (none: none drawn). */
export function townMeshes(town: Town, signs: ReadonlyMap<number, [number, number, number]> = new Map(), height?: (x: number, z: number) => number): TownCellMesh[] {
  const cells = new Map<string, { i: number; j: number; list: TownBuilding[]; props: TownProp[] }>();
  const cellAt = (x: number, z: number) => {
    const i = Math.floor(x / TOWN_CELL), j = Math.floor(z / TOWN_CELL), key = `${i},${j}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { i, j, list: [], props: [] }));
    return c;
  };
  for (const b of town.plan.buildings) cellAt(b.cx, b.cz).list.push(b);
  for (const p of town.plan.props) (p.kind === 'fence' ? cellAt(p.posts[0], p.posts[2]) : cellAt(p.x, p.z)).props.push(p);
  // The wall (a capital's): its pieces go to the cell of their middle.
  const wall = town.plan.wall, inCell = (i: number, j: number) => (x: number, z: number) => Math.floor(x / TOWN_CELL) === i && Math.floor(z / TOWN_CELL) === j;
  if (wall) {
    const R = wall.ring, n = R.length >> 1;
    for (let k = 0; k < n; k++) cellAt((R[k * 2] + R[((k + 1) % n) * 2]) / 2, (R[k * 2 + 1] + R[((k + 1) % n) * 2 + 1]) / 2);
    for (const t of [...wall.towers, ...wall.gates]) cellAt(t.x, t.z);
  }
  // The fixtures out of doors (stalls, wells, benches, anvils ...): where people do what they do.
  if (height) for (const f of town.plan.fixtures) cellAt(f.x, f.z);
  // A harbour town's quay and piers (S2): all in the cell of the quay's middle.
  const harbour = height ? town.plan.harbour : undefined, hn = harbour ? harbour.edge.length >> 2 : 0;
  const harbourCell = harbour ? cellAt(harbour.edge[hn * 2], harbour.edge[hn * 2 + 1]) : null;
  return [...cells.values()].map((cell) => {
    const { i, j, list, props } = cell;
    const x = (i + 0.5) * TOWN_CELL, z = (j + 0.5) * TOWN_CELL;
    const meshes = (detail: boolean) => {
      const parts = list.map((b) => buildingMesh(b, [x, 0, z], detail, { sign: signs.get(b.id) }));
      const walls = wall ? [wallMesh(wall, [x, 0, z], detail, inCell(i, j))] : [];
      if (height) walls.push(fixtureMesh(town.plan.fixtures, (fx, fz) => town.fixtureGround(fx, fz, height), [x, 0, z], detail, inCell(i, j)));
      if (harbour && height && cell === harbourCell) {
        walls.push(harbourMesh(harbour, height, [x, 0, z], detail));
      }
      return { mesh: mergeMeshes([...parts, ...props.map((p) => propMesh(p, [x, 0, z], detail)), ...walls]), ranges: rangesOf(list, parts) };
    };
    const near = meshes(true), far = meshes(false);
    return { x, z, near: near.mesh, far: far.mesh, nearRanges: near.ranges, farRanges: far.ranges };
  });
}

/** Each building's index range in a mesh merged from `parts` (in order, first). */
function rangesOf(list: readonly TownBuilding[], parts: readonly BuildingMesh[]): MeshRange[] {
  let k = 0;
  return parts.map((p, i) => { const r: MeshRange = [list[i].id, k, p.index.length]; k += p.index.length; return r; });
}

/** The buffers to hand over from a worker. */
export function townMeshBuffers(cells: readonly TownCellMesh[]): ArrayBuffer[] {
  return cells.flatMap((c) => [c.near, c.far].flatMap((m) => [m.position.buffer, m.normal.buffer, m.uv.buffer, m.mat.buffer, m.tint.buffer, m.index.buffer, ...readyBuffers(m)] as ArrayBuffer[]));
}

/** One mesh of several (same attributes, indices shifted). */
export function mergeMeshes(parts: readonly BuildingMesh[]): BuildingMesh {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.position.length / 3; ni += p.index.length; }
  const out: BuildingMesh = {
    position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), uv: new Float32Array(nv * 2),
    mat: new Uint8Array(nv), tint: new Uint8Array(nv * 3), index: new Uint32Array(ni),
  };
  let v = 0, k = 0;
  for (const p of parts) {
    out.position.set(p.position, v * 3); out.normal.set(p.normal, v * 3); out.uv.set(p.uv, v * 2);
    out.mat.set(p.mat, v); out.tint.set(p.tint, v * 3);
    for (let i = 0; i < p.index.length; i++) out.index[k + i] = p.index[i] + v;
    v += p.position.length / 3; k += p.index.length;
  }
  return out;
}

/**
 * A building drawn open (D38): its rooms' plan, and its outside with the doorway open and every storey inside, as one
 * mesh; its door's leaves apart (`doors`), to swing as one comes and goes; a cellar's hatch has its lid apart (`lid`,
 * null: none), to swing open (app/hatchClimb.ts), and its ladder's top (`ladderTop`), to rise out of the hole as the
 * lid opens.
 */
export interface OpenHouse {
  readonly plan: InteriorPlan;
  readonly mesh: BuildingMesh;
  readonly lid: BuildingMesh | null;
  readonly ladderTop: BuildingMesh | null;
  readonly doors: readonly DoorLeaf[];
}

/**
 * `b` planned inside and drawn open round its middle (`hatch`: a cellar's trapdoor; `hall`: a guild's hall; `sign`:
 * the shield over its door). Tens of milliseconds for a big house: a terrain worker does it (floor F2).
 */
/** The plan's hatch down to its cellar (undefined: none). */
export const hatchOf = (plan: InteriorPlan): InteriorFixture | undefined => plan.fixtures.find((f) => f.kind === 'hatch');

export function openHouse(b: TownBuilding, opts: { readonly hatch: boolean; readonly hall: boolean }, sign?: [number, number, number]): OpenHouse {
  const plan = planInterior(b, opts), at: [number, number, number] = [b.cx, 0, b.cz];
  // A hatch on the ground floor: the plinth's top open over it (its shaft shows through).
  const f = hatchOf(plan);
  const hole = f && f.storey === 0 ? { a0: f.a - f.w / 2, a1: f.a + f.w / 2, b0: f.b - f.d / 2, b1: f.b + f.d / 2 } : undefined;
  return {
    plan, mesh: mergeMeshes([buildingMesh(b, at, true, { open: true, sign, hole }), interiorMesh(plan, b, at, { lid: false, doors: false })]),
    lid: hatchLidMesh(plan, b, at), ladderTop: hatchLadderTopMesh(plan, b, at), doors: doorLeaves(plan, b, at),
  };
}

/**
 * A building-format mesh made ready for the GPU off the main thread (in the terrain worker): its byte attributes as
 * floats (WebGPU has no 1- or 3-byte vertex formats) and its bounding sphere, which cost a town's founding some 30 ms
 * on the main thread (render/materials/building.ts takes them as they are).
 */
export interface ReadyMesh extends BuildingMesh {
  readonly matF: Float32Array;
  readonly tintF: Float32Array;
  /** Middle x, y, z and radius (radius −1: empty). */
  readonly sphere: readonly [number, number, number, number];
}

/** The buffers a ready mesh adds (none for a plain one). */
function readyBuffers(m: BuildingMesh): ArrayBuffer[] {
  const r = m as Partial<ReadyMesh>;
  return r.matF && r.tintF ? [r.matF.buffer as ArrayBuffer, r.tintF.buffer as ArrayBuffer] : [];
}

/** `m` made ready for the GPU (see ReadyMesh). */
export function readyMesh(m: BuildingMesh): ReadyMesh {
  return { ...m, matF: floatsOf(m.mat, 1), tintF: floatsOf(m.tint, 1 / 255), sphere: sphereOf(m.position) };
}

/** Bytes as floats times `k`, in a plain loop (`Float32Array.from` with a map boxed every value: garbage by the megabyte per town). */
export function floatsOf(src: ArrayLike<number>, k: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] * k;
  return out;
}

/**
 * The sphere round flat x, y, z positions, as three's `computeBoundingSphere` makes it (the box's middle, out to the
 * farthest point), in plain loops: three's goes through a vector per vertex, garbage by the megabyte per town.
 */
export function sphereOf(p: ArrayLike<number>): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x0 > x1) return [0, 0, 0, -1];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r2 = 0;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const dx = p[i] - cx, dy = p[i + 1] - cy, dz = p[i + 2] - cz, d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return [cx, cy, cz, Math.sqrt(r2)];
}

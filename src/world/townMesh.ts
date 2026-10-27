/**
 * A town's buildings as meshes (pure, runs in the terrain worker): @futuremagic/settlement builds each
 * building (and each fence and haystack of its farmland), and those of one square cell are merged into
 * one mesh near and one far (fewer draws).
 */
import { buildingMesh, hatchLidMesh, interiorMesh, planInterior, propMesh, type BuildingMesh, type InteriorFixture, type InteriorPlan, type TownBuilding, type TownProp } from '@futuremagic/settlement';
import type { Town } from './town';

/** Side of a merge cell, metres. */
export const TOWN_CELL = 64;

/** Where one building's triangles are in a merged mesh: its id, the first index and how many. */
export type MeshRange = [id: number, start: number, count: number];

/** The buildings of one cell, near and far, positions relative to (x, 0, z), and each building's place in them (to hide one). */
export interface TownCellMesh {
  x: number;
  z: number;
  near: BuildingMesh;
  far: BuildingMesh;
  nearRanges: MeshRange[];
  farRanges: MeshRange[];
}

/** Every cell of a town that has buildings in it. */
/** `signs`: a shield over the door of these buildings (by id, its colour), the guild houses. */
export function townMeshes(town: Town, signs: ReadonlyMap<number, [number, number, number]> = new Map()): TownCellMesh[] {
  const cells = new Map<string, { i: number; j: number; list: TownBuilding[]; props: TownProp[] }>();
  const cellAt = (x: number, z: number) => {
    const i = Math.floor(x / TOWN_CELL), j = Math.floor(z / TOWN_CELL), key = `${i},${j}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { i, j, list: [], props: [] }));
    return c;
  };
  for (const b of town.plan.buildings) cellAt(b.cx, b.cz).list.push(b);
  for (const p of town.plan.props) (p.kind === 'fence' ? cellAt(p.posts[0], p.posts[2]) : cellAt(p.x, p.z)).props.push(p);
  return [...cells.values()].map(({ i, j, list, props }) => {
    const x = (i + 0.5) * TOWN_CELL, z = (j + 0.5) * TOWN_CELL;
    const meshes = (detail: boolean) => {
      const parts = list.map((b) => buildingMesh(b, [x, 0, z], detail, { sign: signs.get(b.id) }));
      return { mesh: mergeMeshes([...parts, ...props.map((p) => propMesh(p, [x, 0, z], detail))]), ranges: rangesOf(list, parts) };
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
  return cells.flatMap((c) => [c.near, c.far].flatMap((m) => [m.position.buffer, m.normal.buffer, m.uv.buffer, m.mat.buffer, m.tint.buffer, m.index.buffer] as ArrayBuffer[]));
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
 * A building drawn open (D38): its rooms' plan, and its outside with the door open and every storey inside, as one
 * mesh; a cellar's hatch has its lid apart (`lid`, null: none), to swing open (app/hatchClimb.ts).
 */
export interface OpenHouse { readonly plan: InteriorPlan; readonly mesh: BuildingMesh; readonly lid: BuildingMesh | null }

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
  return { plan, mesh: mergeMeshes([buildingMesh(b, at, true, { open: true, sign, hole }), interiorMesh(plan, b, at, { lid: false })]), lid: hatchLidMesh(plan, b, at) };
}

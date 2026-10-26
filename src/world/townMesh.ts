/**
 * A town's buildings as meshes (pure, runs in the terrain worker): @futuremagic/settlement builds each
 * building (and each fence and haystack of its farmland), and those of one square cell are merged into
 * one mesh near and one far (fewer draws).
 */
import { buildingMesh, propMesh, type BuildingMesh, type TownBuilding, type TownProp } from '@futuremagic/settlement';
import type { Town } from './town';

/** Side of a merge cell, metres. */
export const TOWN_CELL = 64;

/** The buildings of one cell, near and far, positions relative to (x, 0, z). */
export interface TownCellMesh {
  x: number;
  z: number;
  near: BuildingMesh;
  far: BuildingMesh;
}

/** Every cell of a town that has buildings in it. */
export function townMeshes(town: Town): TownCellMesh[] {
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
    const meshes = (detail: boolean) => mergeMeshes([...list.map((b) => buildingMesh(b, [x, 0, z], detail)), ...props.map((p) => propMesh(p, [x, 0, z], detail))]);
    return { x, z, near: meshes(true), far: meshes(false) };
  });
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

/**
 * A cellar as meshes (pure): walls, floors, ceilings, stairs and door frames in one static mesh; each
 * door with a state (locked, barred, hidden) as its own piece, so it can vanish when it opens; the props.
 * Positions in the cellar's own frame (metres), in the building format, drawn with the building shader.
 */
import { DIRS, type Door, type PathCell, type PlacedLink } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { DungeonProp } from '../../setting/contract';
import { CELL, STOREY, type Cellar, type Prop } from './cellar';
import { BuildingMat as M, MeshKit, type Tint } from './meshKit';
import { DOOR_W, PASSAGE_H, isFeature, stairDrop } from './space';
import { Rng, deriveSeed } from '@futuremagic/core';

/** Height of a door's opening. */
export const DOOR_H = 2.1;

export interface DoorPiece {
  /** The link id. */
  readonly link: number;
  readonly kind: 'locked' | 'oneway' | 'secret';
  readonly mesh: BuildingMesh;
}

export interface CellarMeshes {
  readonly shell: BuildingMesh;
  readonly props: BuildingMesh;
  readonly doors: DoorPiece[];
}

const STONE: Tint = [176, 160, 136], OLD: Tint = [150, 146, 136], LIME: Tint = [214, 206, 190], EARTH: Tint = [120, 96, 72];
const FLAG: Tint = [128, 118, 102], OAK: Tint = [120, 90, 62], DARK_OAK: Tint = [84, 62, 44], IRON: Tint = [60, 60, 64];

/** Corners of side `k` of cell (i, j), travelling so that the face looks into the cell. */
function sideEdge(i: number, j: number, k: number): [number, number, number, number] {
  const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL;
  return k === 0 ? [x1, z1, x1, z0] : k === 1 ? [x0, z1, x1, z1] : k === 2 ? [x0, z0, x0, z1] : [x1, z0, x0, z0];
}

/** A wall face on side k of a cell from y0 to y1, with an optional hole (lateral s0..s1 along the face, height h0..h1). */
function wallWithHole(kit: MeshKit, i: number, j: number, k: number, y0: number, y1: number, hole: [number, number, number, number] | null, mat: M, tint: Tint): void {
  const [ax, az, bx, bz] = sideEdge(i, j, k);
  const along = (s: number) => [ax + ((bx - ax) * s) / CELL, az + ((bz - az) * s) / CELL];
  const seg = (s0: number, s1: number, h0: number, h1: number) => {
    if (s1 - s0 < 0.005 || h1 - h0 < 0.005) return;
    const [px, pz] = along(s0), [qx, qz] = along(s1);
    kit.wall(px, pz, qx, qz, h0, h1, mat, tint, s0 + i * 0.37 + j * 0.71);
  };
  if (!hole) { seg(0, CELL, y0, y1); return; }
  const [s0, s1, h0, h1] = hole;
  seg(0, s0, y0, y1);
  seg(s1, CELL, y0, y1);
  seg(s0, s1, y0, Math.max(y0, h0));
  seg(s0, s1, Math.min(y1, h1), y1);
}

export function cellarMeshes(c: Cellar): CellarMeshes {
  const shell = new MeshKit(), propKit = new MeshKit();
  const L = c.layout;
  const owner = (i: number, j: number, l: number) => {
    for (const r of L.rooms) if (i >= r.x && i < r.x + r.w && j >= r.z && j < r.z + r.d && l >= r.level && l < r.level + r.height) return r.id;
    return undefined;
  };
  // Path cells by key, and which path they belong to.
  const pathAt = new Map<string, { link: number; cell: PathCell }>();
  L.links.forEach((pl, li) => {
    for (const cell of pl.path) {
      pathAt.set(`${cell.x},${cell.z},${cell.level}`, { link: li, cell });
      if (cell.stair) pathAt.set(`${cell.x},${cell.z},${cell.level - 1}`, { link: li, cell });
    }
  });
  const own = (i: number, j: number, l: number): number | undefined => {
    const r = owner(i, j, l);
    if (r !== undefined) return r;
    const p = pathAt.get(`${i},${j},${l}`);
    return p ? -1 - p.link : undefined;
  };
  // Openings: by the cell they open from and the side.
  const openings = new Map<string, { pl: PlacedLink; door: Door; end: 0 | 1 }>();
  for (const pl of L.links) pl.doors.forEach((door, end) => {
    openings.set(`${door.x},${door.z},${door.level},${door.dir}`, { pl, door, end: end as 0 | 1 });
    const nx = door.x + DIRS[door.dir][0], nz = door.z + DIRS[door.dir][1];
    openings.set(`${nx},${nz},${door.level},${(door.dir + 2) % 4}`, { pl, door, end: end as 0 | 1 });
  });
  const hole = (i: number, j: number, lv: number, k: number): [number, number, number, number] | null => {
    const o = openings.get(`${i},${j},${lv},${k}`);
    if (!o) return null;
    return [CELL / 2 - DOOR_W / 2, CELL / 2 + DOOR_W / 2, lv * STOREY, lv * STOREY + DOOR_H];
  };
  const eraOf = (room: number) => c.rooms[room].era;
  const wallMat = (room: number): [M, Tint] => room === c.graph.entrance ? [M.Plaster, LIME] : eraOf(room) === 'older' ? [M.Ashlar, OLD] : c.rooms[room].use.id === 'burrow' ? [M.Rubble, EARTH] : [M.Rubble, STONE];

  // Rooms: floor, ceiling (beams under the house's storey), walls per storey with their openings.
  for (const r of L.rooms) {
    const [wm, wt] = wallMat(r.id);
    const y0 = r.level * STOREY, y1 = (r.level + r.height) * STOREY;
    const older = eraOf(r.id) === 'older';
    shell.flat(r.x * CELL, r.z * CELL, (r.x + r.w) * CELL, (r.z + r.d) * CELL, y0, true, older ? M.Ashlar : M.Ashlar, older ? OLD : FLAG);
    shell.flat(r.x * CELL, r.z * CELL, (r.x + r.w) * CELL, (r.z + r.d) * CELL, y1, false, older ? M.Ashlar : M.Oak, older ? OLD : DARK_OAK);
    if (!older) for (let b = 0.6; b < r.w * CELL - 0.3; b += 1.4) shell.box(r.x * CELL + b, y1 - 0.22, (r.z + r.d / 2) * CELL, 0.2, 0.22, r.d * CELL, 0, M.Oak, DARK_OAK);
    for (let j = r.z; j < r.z + r.d; j++) for (let i = r.x; i < r.x + r.w; i++) for (let k = 0; k < 4; k++) {
      const ni = i + DIRS[k][0], nj = j + DIRS[k][1];
      if (ni >= r.x && ni < r.x + r.w && nj >= r.z && nj < r.z + r.d) continue;
      for (let lv = r.level; lv < r.level + r.height; lv++) wallWithHole(shell, i, j, k, lv * STOREY, (lv + 1) * STOREY, hole(i, j, lv, k), wm, wt);
    }
  }
  // Passages: floor, ceiling, walls; stairs as steps.
  L.links.forEach((pl, li) => {
    for (const cell of pl.path) {
      const { x: i, z: j, level: l } = cell;
      const old = l < 0;
      const [wm, wt]: [M, Tint] = pl.link.tags.includes('dug') ? [M.Rubble, EARTH] : old ? [M.Ashlar, OLD] : [M.Rubble, STONE];
      const top = l * STOREY, ceil = top + PASSAGE_H;
      const st = cell.stair;
      const lo = st ? top - stairDrop(cell, (i + (st.dir === 0 ? 1 : st.dir === 2 ? 0 : 0.5)) * CELL, (j + (st.dir === 1 ? 1 : st.dir === 3 ? 0 : 0.5)) * CELL) : top;
      shell.flat(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL, ceil, false, M.Oak, DARK_OAK);
      if (!st) shell.flat(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL, top, true, M.Ashlar, FLAG);
      else {
        // Steps: four per cell, solid down to the bottom of the flight.
        const steps = 4, d = st.dir, base = top - ((st.step + 1) / st.run) * STOREY;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps, h = top - ((st.step + t0 + 0.5 / steps) / st.run) * STOREY;
          const a0 = d === 0 || d === 1 ? t0 : 1 - t1, a1 = d === 0 || d === 1 ? t1 : 1 - t0;
          const [x0, x1, z0, z1] = d % 2 === 0 ? [i + a0, i + a1, j, j + 1] : [i, i + 1, j + a0, j + a1];
          shell.box(((x0 + x1) / 2) * CELL, base, ((z0 + z1) / 2) * CELL, (x1 - x0) * CELL, h - base, (z1 - z0) * CELL, 0, M.Ashlar, FLAG);
        }
      }
      for (let k = 0; k < 4; k++) {
        const ni = i + DIRS[k][0], nj = j + DIRS[k][1];
        const same = (lv: number) => own(ni, nj, lv) === -1 - li;
        if (st) {
          // Open towards the next cells of the flight (on either storey); walls elsewhere, down to the bottom.
          const bottom = Math.min(lo, top - ((st.step + 1) / st.run) * STOREY);
          let gap: [number, number, number, number] | null = null;
          for (const lv of [l, l - 1]) if (same(lv)) {
            const n = pathAt.get(`${ni},${nj},${lv}`)!.cell;
            const nf = n.stair ? n.level * STOREY - ((n.stair.step + (k === n.stair.dir ? 0 : 1)) / n.stair.run) * STOREY : n.level * STOREY;
            gap = [0, CELL, Math.min(nf, gap?.[2] ?? Infinity), Math.max((n.stair ? n.level * STOREY : nf) + PASSAGE_H, gap?.[3] ?? -Infinity)];
          }
          wallWithHole(shell, i, j, k, bottom, ceil, gap, wm, wt);
        } else if (!same(l)) wallWithHole(shell, i, j, k, top, ceil, hole(i, j, l, k), wm, wt);
      }
    }
  });

  // Door frames on every opening; door pieces for the doors with a state.
  const doors: DoorPiece[] = [];
  for (const pl of L.links) pl.doors.forEach((door, end) => {
    if (end === 1 && pl.path.length === 0) return;
    const o = { pl, end: end as 0 | 1 };
    const k = door.dir, [ax, az, bx, bz] = sideEdge(door.x, door.z, k);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = (bx - ax) / CELL, uz = (bz - az) / CELL;
    const y = door.level * STOREY, yaw = Math.atan2(ux, uz) - Math.PI / 2;
    // Posts and lintel, standing a little into the room.
    const ox = -DIRS[k][0] * 0.06, oz = -DIRS[k][1] * 0.06;
    for (const side of [-1, 1]) shell.box(mx + ox + ux * side * (DOOR_W / 2 + 0.08), y, mz + oz + uz * side * (DOOR_W / 2 + 0.08), 0.16, DOOR_H, 0.16, yaw, M.Oak, OAK);
    shell.box(mx + ox, y + DOOR_H, mz + oz, DOOR_W + 0.32, 0.18, 0.18, yaw, M.Oak, OAK);
    if (!isFeature(o)) return;
    const kind = pl.link.kind;
    const out = DIRS[k];
    if (kind === 'grate') {
      for (let s = -2; s <= 2; s++) shell.box(mx + ux * s * (DOOR_W / 5), y, mz + uz * s * (DOOR_W / 5), 0.04, DOOR_H, 0.04, yaw, M.Slate, IRON);
      shell.box(mx, y + 1.0, mz, DOOR_W, 0.05, 0.05, yaw, M.Slate, IRON);
    } else if (kind === 'blocked') {
      const rng = new Rng(deriveSeed(c.decision.seed, 'rubble', pl.link.id));
      for (let n = 0; n < 14; n++) shell.box(mx + ux * rng.range(-0.7, 0.7) + out[0] * rng.range(-0.5, 0.5), y + rng.range(0, 1.6), mz + uz * rng.range(-0.7, 0.7) + out[1] * rng.range(-0.5, 0.5), rng.range(0.25, 0.6), rng.range(0.2, 0.5), rng.range(0.25, 0.6), rng.range(0, 3), M.Rubble, STONE);
    } else if (kind === 'drop') {
      // The broken edge: splintered boards and a beam end over the drop.
      const rng = new Rng(deriveSeed(c.decision.seed, 'ledge', pl.link.id));
      for (let n = 0; n < 4; n++) shell.box(mx + ux * rng.range(-0.5, 0.5) - out[0] * rng.range(0.2, 0.7), y - 0.08, mz + uz * rng.range(-0.5, 0.5) - out[1] * rng.range(0.2, 0.7), 0.22, 0.06, rng.range(0.6, 1.1), yaw + rng.range(-0.4, 0.4), M.Oak, DARK_OAK);
    } else if (kind === 'locked' || kind === 'oneway' || kind === 'secret') {
      const kit = new MeshKit();
      if (kind === 'secret') {
        const pale: Tint = c.setPiece.tint && pl.link.id === c.pieceLink ? [...c.setPiece.tint] as unknown as Tint : STONE;
        kit.box(mx, y, mz, DOOR_W + 0.02, DOOR_H + 0.02, 0.24, yaw, M.Rubble, pale);
      } else {
        kit.box(mx, y, mz, DOOR_W, DOOR_H, 0.08, yaw, M.Oak, OAK);
        if (kind === 'locked') kit.box(mx + ux * 0.45 - out[0] * 0.06, y + 1.0, mz + uz * 0.45 - out[1] * 0.06, 0.12, 0.16, 0.04, yaw, M.Slate, IRON);
        // The bar sits on the far side (the side it is opened from).
        else kit.box(mx + out[0] * 0.12, y + 1.1, mz + out[1] * 0.12, DOOR_W + 0.3, 0.14, 0.1, yaw, M.Oak, DARK_OAK);
      }
      doors.push({ link: pl.link.id, kind, mesh: kit.mesh() });
    }
  });

  for (const p of c.props) prop(propKit, p);
  return { shell: shell.mesh(), props: propKit.mesh(), doors };
}

/** One prop from the kit of simple pieces. */
function prop(k: MeshKit, p: Prop): void {
  const { x, y, z, yaw } = p;
  const rng = new Rng(deriveSeed(Math.round(x * 100), Math.round(z * 100), p.kind));
  const t = (base: Tint, v = 0.12): Tint => base.map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + rng.range(-v, v)))))) as unknown as Tint;
  const fwd = [Math.sin(yaw), Math.cos(yaw)];
  const spot = (u: number, w: number) => [x + Math.cos(yaw) * u + fwd[0] * w, z - Math.sin(yaw) * u + fwd[1] * w];
  const kind: DungeonProp = p.kind;
  switch (kind) {
    case 'barrel': k.cylinder(x, y, z, 0.32, 0.85, 10, M.Oak, t(OAK), 0.12); break;
    case 'cask': { const [a, b] = spot(-0.4, 0), [c2, d] = spot(0.4, 0); k.box(x, y, z, 1.4, 0.18, 0.5, yaw, M.Oak, t(DARK_OAK)); k.cylinder(a, y + 0.18, b, 0.4, 0.8, 10, M.Oak, t(OAK), 0.1); k.cylinder(c2, y + 0.18, d, 0.4, 0.8, 10, M.Oak, t(OAK), 0.1); break; }
    case 'vat': k.cylinder(x, y, z, 0.7, 1.3, 14, M.Oak, t(OAK), 0.05); break;
    case 'rack': for (let s = 0; s < 3; s++) k.box(x, y + 0.05 + s * 0.6, z, 1.6, 0.06, 0.45, yaw, M.Oak, t(DARK_OAK)); for (const u of [-0.78, 0.78]) { const [a, b] = spot(u, 0); k.box(a, y, b, 0.08, 1.8, 0.45, yaw, M.Oak, t(DARK_OAK)); } for (let s = 0; s < 6; s++) { const [a, b] = spot(-0.6 + s * 0.24, 0); k.box(a, y + 0.12 + (s % 3) * 0.6, b, 0.1, 0.1, 0.4, yaw, M.Glass, [40, 60, 40]); } break;
    case 'crate': k.box(x, y, z, 0.7, 0.6, 0.7, yaw + rng.range(-0.3, 0.3), M.Oak, t([150, 118, 80])); if (rng.chance(0.5)) k.box(x, y + 0.6, z, 0.55, 0.45, 0.55, yaw + rng.range(-0.5, 0.5), M.Oak, t([150, 118, 80])); break;
    case 'sack': k.box(x, y, z, 0.55, 0.5, 0.4, yaw + rng.range(-0.6, 0.6), M.Plaster, t([170, 150, 112])); break;
    case 'shelf': k.box(x, y, z, 1.4, 1.7, 0.08, yaw, M.Oak, t(DARK_OAK)); for (let s = 0; s < 3; s++) k.box(x, y + 0.4 + s * 0.5, z, 1.4, 0.04, 0.35, yaw, M.Oak, t(OAK)); break;
    case 'table': { const [a, b] = spot(0, -0.3); k.box(a, y + 0.72, b, 1.2, 0.06, 0.7, yaw, M.Oak, t(OAK)); for (const [u, w] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) { const [px, pz] = spot(u, w - 0.3); k.box(px, y, pz, 0.07, 0.72, 0.07, yaw, M.Oak, t(DARK_OAK)); } break; }
    case 'stool': k.cylinder(x, y, z, 0.18, 0.45, 8, M.Oak, t(OAK)); break;
    case 'cot': k.box(x, y, z, 1.9, 0.35, 0.8, yaw + Math.PI / 2, M.Oak, t(DARK_OAK)); k.box(x, y + 0.35, z, 1.8, 0.1, 0.7, yaw + Math.PI / 2, M.Thatch, t([180, 160, 110])); break;
    case 'straw': k.box(x, y, z, 1.2, 0.18, 0.9, yaw + rng.range(-0.5, 0.5), M.Thatch, t([190, 165, 100], 0.2)); break;
    case 'nest': for (let n = 0; n < 5; n++) k.box(x + rng.range(-0.4, 0.4), y, z + rng.range(-0.4, 0.4), rng.range(0.4, 0.8), rng.range(0.15, 0.35), rng.range(0.4, 0.8), rng.range(0, 3), M.Thatch, t([120, 100, 70], 0.25)); break;
    case 'rubble': for (let n = 0; n < 7; n++) k.box(x + rng.range(-0.5, 0.5), y + (n > 4 ? 0.25 : 0), z + rng.range(-0.5, 0.5), rng.range(0.2, 0.5), rng.range(0.15, 0.35), rng.range(0.2, 0.5), rng.range(0, 3), M.Rubble, t(STONE, 0.2)); break;
    case 'bones': for (let n = 0; n < 6; n++) k.box(x + rng.range(-0.4, 0.4), y, z + rng.range(-0.4, 0.4), 0.05, 0.05, rng.range(0.2, 0.45), rng.range(0, 3), M.Plaster, t([225, 215, 190])); k.cylinder(x + 0.2, y, z - 0.1, 0.1, 0.16, 8, M.Plaster, [225, 215, 190], 0.5); break;
    case 'candle': k.cylinder(x, y, z, 0.04, 0.25, 6, M.Plaster, [240, 230, 200]); break;
    case 'lantern': k.box(x, y, z, 0.2, 0.32, 0.2, yaw, M.Slate, IRON); k.box(x, y + 0.04, z, 0.14, 0.22, 0.14, yaw, M.Glass, [255, 200, 120]); break;
    case 'ledger': { const [a, b] = spot(0, -0.3); k.box(a, y, b, 0.5, 0.7, 0.4, yaw, M.Oak, t(DARK_OAK)); k.box(a, y + 0.7, b, 0.34, 0.06, 0.26, yaw + 0.2, M.Plaster, [150, 60, 40]); break; }
    case 'chest': k.box(x, y, z, 0.9, 0.5, 0.55, yaw, M.Oak, t(OAK)); k.box(x, y + 0.5, z, 0.92, 0.12, 0.57, yaw, M.Oak, t(DARK_OAK)); k.box(x, y + 0.3, z, 0.94, 0.06, 0.59, yaw, M.Slate, IRON); break;
    case 'web': { const [a, b] = spot(0, -0.4); k.box(a, y + 1.6, b, 1.6, 0.9, 0.02, yaw + 0.3, M.Plaster, [235, 235, 230]); break; }
    case 'bricks': for (let s = 0; s < 3; s++) k.box(x, y + s * 0.12, z, 0.7, 0.12, 0.4, yaw + s * 0.2, M.Ashlar, t([190, 120, 90])); break;
    case 'beam': k.box(x, y, z, 2.4, 0.22, 0.24, yaw + rng.range(-0.4, 0.4), M.Oak, t([60, 48, 40], 0.2)); break;
    case 'puddle': k.flat(x - 0.7, z - 0.5, x + 0.7, z + 0.5, y + 0.01, true, M.Glass, [30, 36, 40]); break;
    case 'bin': k.box(x, y, z, 1.0, 0.8, 0.6, yaw, M.Oak, t(OAK)); break;
    case 'jar': k.cylinder(x, y, z, 0.16, 0.42, 8, M.Tile, t([170, 110, 70]), 0.3); break;
    case 'ladder': { const [a, b] = spot(0, -0.15); for (const u of [-0.3, 0.3]) { const [px, pz] = spot(u, -0.15); k.box(px, y, pz, 0.08, STOREY, 0.08, yaw, M.Oak, t(OAK)); } for (let s = 0; s < 8; s++) k.box(a, y + 0.3 + s * 0.32, b, 0.6, 0.05, 0.06, yaw, M.Oak, t(OAK)); break; }
  }
}

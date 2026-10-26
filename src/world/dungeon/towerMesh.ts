/**
 * A ruined tower as it stands on the land (pure): a square keep of dressed stone, its storeys marked by
 * string courses and arrow slits, broken off at the top (one corner fallen lower than the rest), fallen
 * masonry heaped round its foot, and a doorway into the dark at the front, in the building mesh format so
 * it draws with the town's one building shader. Its own frame: the doorway at the origin, the way in
 * towards −z (turn it by the site's yaw), the ground at y 0. `inTowerShape` says where the walker cannot go.
 */
import { Rng, smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { BuildingMat, MeshKit, WildMat, scaleTint, varyTint, type Tint } from './meshKit';

/** The keep: half its width, its depth (from the front wall back), the walls' thickness, metres. */
export interface TowerSize { readonly half: number; readonly depth: number; readonly storeys: number }
const WALL = 1.3;
/** The doorway: half its width, its height; how far in the dark vestibule behind it runs. */
export const TOWER_DOOR = { half: 0.75, h: 2.5, deep: 2.6 } as const;
/** Where in the doorway the hero goes in (its frame). */
export const TOWER_WAY_IN = { x: 0, z: -1.6 } as const;
/** How far the walls go down into the ground (a keep's foot on ground a little uneven), metres. */
const FOOT = 2.2;
/** Height of a storey on the outside, metres. */
const STOREY_OUT = 3.4;

const STONE: Tint = [170, 162, 148], COURSE: Tint = [132, 124, 112], DARK: Tint = [10, 9, 8], MOSS: Tint = [150, 156, 120];

/** The keep's size for a tower dungeon whose rooms span `w` × `d` metres over `storeys` storeys above the ground. */
export function towerSize(w: number, d: number, storeys: number): TowerSize {
  return { half: Math.max(5, Math.min(9, w * 0.4)), depth: Math.max(10, Math.min(18, d * 0.8)), storeys: Math.max(3, Math.min(5, storeys)) };
}

export function towerMesh(size: TowerSize, seed = 1): BuildingMesh {
  const k = new MeshKit(), rng = new Rng(seed);
  const { half, depth } = size;
  const top = size.storeys * STOREY_OUT + 1.2;
  // The broken top: each metre of wall stands to its own height; one corner has fallen far lower.
  const fallen = rng.int(0, 3), heights = new Map<string, number>();
  const wallTop = (x: number, z: number) => {
    const key = `${Math.round(x)},${Math.round(z)}`;
    let h = heights.get(key);
    if (h === undefined) {
      // Whole near the top; towards the fallen corner the wall comes down in broken courses.
      const corner = [[half, 0], [-half, 0], [-half, -depth], [half, -depth]][fallen];
      const near = Math.min(1, Math.hypot(x - corner[0], z - corner[1]) / (half + depth * 0.4));
      const fall = (1 - smoothstep(0.25, 1, near)) * top * 0.55;
      h = top - Math.round((fall + rng.range(0, fall > 0.5 ? 1.2 : 0.25)) / 0.45) * 0.45;
      heights.set(key, h);
    }
    return h;
  };
  // Four walls of one-metre piers, each to its own height (faces with their texture upright, so the
  // coursed stone reads); the front one round the doorway, a window on each wall's upper storeys.
  const walls: [number, number, number, number][] = [[-half, 0, half, 0], [half, 0, half, -depth], [half, -depth, -half, -depth], [-half, -depth, -half, 0]];
  for (const [ax, az, bx, bz] of walls) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len), w = len / n, ux = (bx - ax) / len, uz = (bz - az) / len;
    // Inward: the walls run round the keep so that its inside is to their right.
    const ix = uz, iz = -ux, yaw = Math.atan2(-uz, ux);
    const front = az === 0 && bz === 0, mid = Math.floor(n / 2);
    for (let s = 0; s < n; s++) {
      const t0 = s * w, t1 = (s + 1) * w, cx = ax + ux * (t0 + w / 2) + ix * (WALL / 2), cz = az + uz * (t0 + w / 2) + iz * (WALL / 2);
      // Merlons stand a little higher on every other pier, where the top has not fallen.
      const h = wallTop(cx, cz) + (s % 2 === 0 && wallTop(cx, cz) > top - 1.6 ? 0.9 : 0);
      const tint = varyTint(rng, STONE, 0.07);
      const run = (y0: number, y1: number) => pier(k, ax, az, ux, uz, t0, t1, y0, y1, tint);
      if (front && Math.abs(cx) < TOWER_DOOR.half + 0.5 && Math.abs(cx) < TOWER_DOOR.half) { run(TOWER_DOOR.h, h); continue; }
      // A window on the upper storeys: the pier stands round a dark opening.
      const win = s === mid && !front;
      if (win) {
        let y = -FOOT;
        for (let st = 2; st < size.storeys && st * STOREY_OUT + 2 < h; st++) {
          const wy = st * STOREY_OUT + 0.7;
          run(y, wy);
          k.quad(onWall(ax, az, ux, uz, t1 - 0.1, 0.25, wy), onWall(ax, az, ux, uz, t1 - 0.1, 0.25, wy + 1.4), onWall(ax, az, ux, uz, t0 + 0.1, 0.25, wy + 1.4), onWall(ax, az, ux, uz, t0 + 0.1, 0.25, wy), [[0, 0], [0, 1], [1, 1], [1, 0]], BuildingMat.Plaster, DARK);
          y = wy + 1.4;
        }
        run(y, h);
      } else run(-FOOT, h);
      // A string course at every storey, and an arrow slit (dark) on some of the piers.
      for (let st = 1; st < size.storeys && st * STOREY_OUT < h - 0.4; st++) {
        k.box(cx - ix * 0.08, st * STOREY_OUT - 0.12, cz - iz * 0.08, w + 0.03, 0.22, WALL + 0.16, yaw, BuildingMat.Ashlar, COURSE);
        if (s % 4 === 2 && !win && st * STOREY_OUT + 2 < h) k.box(cx - ix * (WALL / 2 + 0.01), st * STOREY_OUT + 0.6, cz - iz * (WALL / 2 + 0.01), 0.18, 1.1, 0.02, yaw, BuildingMat.Plaster, DARK);
      }
    }
  }
  // The top storey's floor, open to the sky where the roof has gone: rubble and weeds over old boards.
  const floorY = (size.storeys - 1) * STOREY_OUT;
  k.flat(-half + WALL, -depth + WALL, half - WALL, -WALL, floorY, true, WildMat.Grass, MOSS);
  // The doorway: jambs of bigger stones, and the dark of the vestibule beyond.
  for (const side of [-1, 1]) k.stone(side * (TOWER_DOOR.half + 0.3), -0.2, 0.1, 0.6, TOWER_DOOR.h + 0.2, 0.5, rng.range(-0.04, 0.04), BuildingMat.Ashlar, varyTint(rng, STONE, 0.05), rng, 0.03, 0.2);
  const back = -TOWER_DOOR.deep;
  k.quad([-TOWER_DOOR.half, -0.1, back], [-TOWER_DOOR.half, TOWER_DOOR.h, back], [-TOWER_DOOR.half, TOWER_DOOR.h, -0.05], [-TOWER_DOOR.half, -0.1, -0.05], [[0, 0], [0, 1], [1, 1], [1, 0]], BuildingMat.Ashlar, [DARK, DARK, STONE, STONE]);
  k.quad([TOWER_DOOR.half, -0.1, -0.05], [TOWER_DOOR.half, TOWER_DOOR.h, -0.05], [TOWER_DOOR.half, TOWER_DOOR.h, back], [TOWER_DOOR.half, -0.1, back], [[0, 0], [0, 1], [1, 1], [1, 0]], BuildingMat.Ashlar, [STONE, STONE, DARK, DARK]);
  k.quad([-TOWER_DOOR.half, TOWER_DOOR.h, back], [TOWER_DOOR.half, TOWER_DOOR.h, back], [TOWER_DOOR.half, TOWER_DOOR.h, -0.05], [-TOWER_DOOR.half, TOWER_DOOR.h, -0.05], [[0, 0], [1, 0], [1, 1], [0, 1]], BuildingMat.Ashlar, [DARK, DARK, STONE, STONE]);
  k.quad([-TOWER_DOOR.half, 0.02, back], [-TOWER_DOOR.half, 0.02, -0.05], [TOWER_DOOR.half, 0.02, -0.05], [TOWER_DOOR.half, 0.02, back], [[0, 0], [0, 1], [1, 1], [1, 0]], BuildingMat.Ashlar, [DARK, STONE, STONE, DARK]);
  k.quad([-TOWER_DOOR.half, -0.1, back], [TOWER_DOOR.half, -0.1, back], [TOWER_DOOR.half, TOWER_DOOR.h, back], [-TOWER_DOOR.half, TOWER_DOOR.h, back], [[0, 0], [1, 0], [1, 1], [0, 1]], BuildingMat.Ashlar, DARK);
  // Fallen masonry round the foot, most below the fallen corner.
  const corner = [[half, 0], [-half, 0], [-half, -depth], [half, -depth]][fallen];
  for (let i = 0; i < 26; i++) {
    const heap = i < 14, a = rng.range(0, Math.PI * 2), r = heap ? rng.range(0.5, 4.5) : rng.range(0.5, 2.5);
    const bx = heap ? corner[0] + Math.cos(a) * r : rng.range(-half, half), bz = heap ? corner[1] + Math.sin(a) * r : rng.chance(0.5) ? 1.6 + rng.range(0, 1.5) : -depth - 1.6 - rng.range(0, 1.5);
    // Not in front of the door, and not inside the walls.
    if (Math.abs(bx) < TOWER_DOOR.half + 1.2 && bz > -1 && bz < 4.5) continue;
    if (Math.abs(bx) < half - 0.2 && bz < -0.2 && bz > -depth + 0.2) continue;
    const s = rng.range(0.4, 0.95);
    k.stone(bx, -0.25, bz, s * rng.range(1, 1.6), s * 0.7, s, rng.range(0, 3), BuildingMat.Ashlar, varyTint(rng, STONE, 0.1), rng, 0.08, 0.35);
  }
  return k.mesh();
}

/** A point on a wall's outer line, `t` along it and `inw` in from it (the wall from (ax, az) along (ux, uz), its inside to the right). */
function onWall(ax: number, az: number, ux: number, uz: number, t: number, inw: number, y: number): number[] {
  return [ax + ux * t + uz * inw, y, az + uz * t - ux * inw];
}

/** One pier of a wall from `t0` to `t1` along it, `y0` to `y1`: its faces outside, inside, on top and at its ends. */
function pier(k: MeshKit, ax: number, az: number, ux: number, uz: number, t0: number, t1: number, y0: number, y1: number, tint: Tint): void {
  if (y1 - y0 < 0.01) return;
  const P0 = onWall(ax, az, ux, uz, t0, 0, 0), P1 = onWall(ax, az, ux, uz, t1, 0, 0), Q0 = onWall(ax, az, ux, uz, t0, WALL, 0), Q1 = onWall(ax, az, ux, uz, t1, WALL, 0);
  const foot = scaleTint(tint, 0.72), crown = scaleTint(tint, 1.05);
  // (MeshKit.wall faces right of its way: outside is left of the wall's run, so the outer face runs back.)
  k.wall(P1[0], P1[2], P0[0], P0[2], y0, y1, BuildingMat.Ashlar, tint, -t1, foot, crown);
  k.wall(Q0[0], Q0[2], Q1[0], Q1[2], y0, y1, BuildingMat.Ashlar, scaleTint(tint, 0.85), t0);
  k.wall(P0[0], P0[2], Q0[0], Q0[2], y0, y1, BuildingMat.Ashlar, tint, 0, foot, crown);
  k.wall(Q1[0], Q1[2], P1[0], P1[2], y0, y1, BuildingMat.Ashlar, tint, 0, foot, crown);
  const T = [P0, Q0, Q1, P1].map((p) => [p[0], y1, p[2]]);
  // Facing up: wound the way that gives an upward normal.
  const e1 = [T[2][0] - T[0][0], T[2][2] - T[0][2]], e2 = [T[3][0] - T[1][0], T[3][2] - T[1][2]];
  const up = e1[1] * e2[0] - e1[0] * e2[1] > 0;
  const q = up ? T : [T[0], T[3], T[2], T[1]];
  k.quad(q[0], q[1], q[2], q[3], q.map((p) => [p[0], p[2]]), BuildingMat.Ashlar, crown);
}

/** Is a body of radius `r` at (x, z) of the tower's own frame inside its walls? (The doorway is open.) */
export function inTowerShape(size: TowerSize, x: number, z: number, r: number): boolean {
  if (Math.abs(x) < TOWER_DOOR.half - r && z < 1 && z > -TOWER_DOOR.deep + 0.3 + r) return false;
  return Math.abs(x) < size.half + r && z < r && z > -size.depth - r;
}

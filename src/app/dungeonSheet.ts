/**
 * The minimap's sheet below ground: the dungeon's own plan round the hero, as far as they have seen it
 * (game/dungeonMap.ts), drawn like a delver's sketch. Floors of the hero's storey on parchment, the rock dark,
 * walls inked, doors as short bars in their gaps (a hidden one stays wall until found), stairs hatched, the way
 * out marked; what was seen on the storeys above and below shows faintly. North up, `across` metres across.
 */
import { DIRS } from '@futuremagic/dungeon';
import type { DungeonSeen } from '../game/dungeonMap';
import { DOOR_W, isFeature, type DungeonSpace } from '../world/dungeon/space';

export interface BelowSheet {
  readonly space: DungeonSpace;
  readonly seen: DungeonSeen;
  /** Carved rock (a cave): every way opens a cell's whole side. */
  readonly carved: boolean;
  /** The way out (the ladder's foot or a barrow's doorway), dungeon frame. */
  readonly exit: { readonly x: number; readonly y: number; readonly z: number };
}

const ROCK = '#2e241b';
const FLOOR = '#d8c49a';
const GHOST = 'rgba(216, 196, 154, 0.22)';
const INK = '#1a120b';
const DOOR = '#7a4a22';
const EXIT = '#2f7a46';

/** Cells from the hero to the round's edge: a built dungeon's 2 m cells, a cave's bigger ones and wider halls. */
const BELOW_CELLS = 8, BELOW_CELLS_CAVE = 10;

/** Metres from the hero to the edge of the round below ground. */
export function belowRange(space: DungeonSpace, carved: boolean): number {
  return space.scale.cell * (carved ? BELOW_CELLS_CAVE : BELOW_CELLS);
}

/** Doors that stand in their gap (drawn as a bar while shut). */
const SHUTS = new Set(['door', 'locked', 'secret', 'oneway', 'grate']);

/**
 * Paints the plan round (x, z) on storey `level` (dungeon frame, metres), `across` metres across the canvas.
 * Always whole (nothing is inked later).
 */
export function paintBelow(canvas: HTMLCanvasElement, b: BelowSheet, x: number, z: number, level: number, across: number): boolean {
  const g = canvas.getContext('2d')!, size = canvas.width, s = size / across, C = b.space.scale.cell;
  const sx = (u: number) => size / 2 + (u - x) * s, sz = (w: number) => size / 2 + (w - z) * s;
  g.fillStyle = ROCK;
  g.fillRect(0, 0, size, size);
  const half = across / 2 + C, near = (i: number, j: number) => Math.abs((i + 0.5) * C - x) < half && Math.abs((j + 0.5) * C - z) < half;
  const here: (readonly [number, number])[] = [];
  // Floors: the storeys above and below faint, this one plain.
  g.fillStyle = GHOST;
  for (const [i, j, l] of b.seen.seenCells()) {
    if (!near(i, j)) continue;
    if (l === level) here.push([i, j]);
    else if (Math.abs(l - level) === 1 && !b.seen.has(i, j, level)) g.fillRect(sx(i * C), sz(j * C), C * s + 0.5, C * s + 0.5);
  }
  g.fillStyle = FLOOR;
  for (const [i, j] of here) g.fillRect(sx(i * C) - 0.25, sz(j * C) - 0.25, C * s + 0.5, C * s + 0.5);
  // Stairs: hatched across their run.
  const steps = new Path2D();
  for (const [i, j] of here) {
    const st = b.space.grid.stairs.get(`${i},${j},${level}`) ?? b.space.grid.stairs.get(`${i},${j},${level + 1}`);
    if (!st?.stair) continue;
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      if (st.stair.dir % 2 === 0) { steps.moveTo(sx((i + t) * C), sz(j * C)); steps.lineTo(sx((i + t) * C), sz((j + 1) * C)); }
      else { steps.moveTo(sx(i * C), sz((j + t) * C)); steps.lineTo(sx((i + 1) * C), sz((j + t) * C)); }
    }
  }
  g.strokeStyle = 'rgba(58, 44, 28, 0.55)';
  g.lineWidth = Math.max(1, s * 0.12);
  g.stroke(steps);
  // Walls, and doors in their gaps.
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.5, s * 0.28);
  const walls = new Path2D(), doors = new Path2D();
  for (const [i, j] of here) for (let d = 0; d < 4; d++) {
    const edge = wallOf(b, i, j, level, d);
    if (edge === 'none') continue;
    // The edge's two ends.
    const [dx, dz] = DIRS[d], mx = (i + 0.5 + dx * 0.5) * C, mz = (j + 0.5 + dz * 0.5) * C;
    const ax = mx - dz * C * 0.5, az = mz - dx * C * 0.5, bx = mx + dz * C * 0.5, bz = mz + dx * C * 0.5;
    if (edge === 'wall') { walls.moveTo(sx(ax), sz(az)); walls.lineTo(sx(bx), sz(bz)); continue; }
    if (b.carved) continue;
    // A doorway: wall either side of a gap DOOR_W wide; a shut door is a bar in it.
    const f = Math.min(0.5, DOOR_W / 2 / C);
    const doorPt = (t: number): [number, number] => [sx(mx + (bx - mx) * t * 2), sz(mz + (bz - mz) * t * 2)];
    walls.moveTo(...doorPt(-0.5)); walls.lineTo(...doorPt(-f));
    walls.moveTo(...doorPt(f)); walls.lineTo(...doorPt(0.5));
    if (edge === 'shut') { doors.moveTo(...doorPt(-f)); doors.lineTo(...doorPt(f)); }
  }
  g.stroke(walls);
  g.strokeStyle = DOOR;
  g.lineWidth = Math.max(1.2, s * 0.22);
  g.stroke(doors);
  // The way out, where the hero came in.
  const e = b.exit;
  if (b.space.levelAt(e.y) === level) {
    const r = Math.max(3, s * 0.45);
    g.fillStyle = EXIT;
    g.strokeStyle = '#e8f3d0';
    g.lineWidth = 1;
    const mark = new Path2D();
    mark.moveTo(sx(e.x), sz(e.z) - r); mark.lineTo(sx(e.x) + r * 0.9, sz(e.z) + r * 0.7); mark.lineTo(sx(e.x) - r * 0.9, sz(e.z) + r * 0.7); mark.closePath();
    g.fill(mark); g.stroke(mark);
  }
  return true;
}

/** What stands on side `d` of a seen cell: nothing, a wall, an open doorway, or a door shut in it. */
export function wallOf(b: Pick<BelowSheet, 'space'>, i: number, j: number, l: number, d: number): 'none' | 'wall' | 'open' | 'shut' {
  const s = b.space, a = s.own(i, j, l), ni = i + DIRS[d][0], nj = j + DIRS[d][1], n = s.own(ni, nj, l);
  if (n === undefined) return 'wall';
  if (n === a) return a >= 0 || s.floorsMeet(i, j, ni, nj, l, d) ? 'none' : 'wall';
  const o = s.opening(i, j, l, d);
  if (!o) return 'wall';
  const kind = o.pl.link.kind, open = s.open.has(o.pl.link.id);
  if (!isFeature(o) || kind === 'open' || kind === 'drop') return 'open';
  // A hidden way is wall until it is found; rubble that blocks it too.
  if ((kind === 'secret' && !open) || kind === 'blocked') return 'wall';
  return SHUTS.has(kind) && !open ? 'shut' : 'open';
}

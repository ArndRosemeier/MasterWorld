/**
 * A cellar as meshes (pure): walls, floors, ceilings, stairs and door frames in one static mesh; each
 * door with a state (locked, barred, hidden) as its own piece, so it can vanish when it opens; the props.
 * Positions in the cellar's own frame (metres), in the building format, drawn with the building shader.
 *
 * Hand-made, not boxes: walls of limewash, rubble, brick or ashlar by the room's use and age, flagstone and
 * earth floors, plank ceilings on joists; damp darkens every wall's foot and soot its top (tints per
 * corner); the props are AssetGenerator's (propModels.ts) when their pack is given, the simple kit pieces
 * otherwise (tests, tools); torch sconces where torchSpots says.
 */
import { DIRS, type Door, type PathCell, type PlacedLink } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { DungeonProp } from '../../setting/contract';
import { CELL, STOREY, cellIn, type Cellar, type Prop } from './cellar';
import { BuildingMat as M, CellarMat as C, MeshKit, WildMat, scaleTint, varyTint, type Tint } from './meshKit';
import { stampModel, type PropModels, type Stamp } from './propModels';
import type { PropModel } from '@futuremagic/props';
import { DOOR_W, DungeonSpace, PASSAGE_H, isFeature, keySpot, stairDrop } from './space';
import { TORCH_OUT, torchSpots } from './torches';
import { Rng, deriveSeed } from '@futuremagic/core';

/** Height of a door's opening. */
export const DOOR_H = 2.1;

export interface DoorPiece {
  /** The link id. */
  readonly link: number;
  readonly kind: 'locked' | 'oneway' | 'secret';
  readonly mesh: BuildingMesh;
  /** The doorway's middle on its floor (x, y, z), and the way through it (x, z; unit). */
  readonly at: readonly [number, number, number];
  readonly through: readonly [number, number];
  /**
   * How it opens, seen: `swing` on the vertical line through `hinge` (a door, a grate, a hidden door in the
   * wall), away from whoever opens it; `push` (stacked stones, a wedged boulder) shoved through the way and
   * tumbling down; `gone` (a ladder let down out of sight).
   */
  readonly opens: 'swing' | 'push' | 'gone';
  readonly hinge?: readonly [number, number, number];
  /** A barred door's bar, apart: lifted out of its brackets and set down against the wall before it swings. */
  readonly bar?: BuildingMesh;
}

/** A chest's lid, apart from its body, to lift as it is searched: about its hinge along the back's top edge. */
export interface ChestLid {
  readonly mesh: BuildingMesh;
  /** A point on the hinge's line (cellar frame). */
  readonly hinge: readonly [number, number, number];
  /** The hinge's line (x, z; level), turned about which by a positive angle the lid's front comes up. */
  readonly axis: readonly [number, number];
}

export interface CellarMeshes {
  readonly shell: BuildingMesh;
  readonly props: BuildingMesh;
  readonly doors: DoorPiece[];
  /** One per chest, in the order of the cellar's props (as world/dungeon/treasure.ts numbers its hoards). */
  readonly lids: ChestLid[];
  /** The keys lying where they are picked up (keySpot), by the room that holds each. */
  readonly keys: { readonly room: number; readonly mesh: BuildingMesh }[];
}

const STONE: Tint = [176, 160, 136], OLD: Tint = [150, 146, 136], EARTH: Tint = [120, 96, 72];
const OAK: Tint = [120, 90, 62], DARK_OAK: Tint = [84, 62, 44], IRON: Tint = [60, 60, 64], ROPE: Tint = [150, 128, 92];
/** Tints on the cellar's own textures (they carry their colour; these only age them). */
const WASH: Tint = [236, 228, 210], FLAGS: Tint = [204, 200, 194], OLD_FLAGS: Tint = [188, 186, 180], BRICK: Tint = [214, 200, 188];
const RAFTERS: Tint = [168, 146, 124], DIRT: Tint = [176, 160, 140];
/** The cave's rock (world/dungeon/caveRock.ts draws the same). */
const CAVE_ROCK: Tint = [168, 160, 148];

/** A wall's look: its layer, tint, and how damp its foot is (0 dry .. 1 wet). */
interface WallLook { readonly mat: number; readonly tint: Tint; readonly damp: number }



/**
 * A wall face from (px, pz) to (qx, qz), h0 .. h1, on a storey from `floor` to `top`: cut at the bands so
 * damp darkens the first 0.8 m up from the floor and soot the last half metre under the ceiling.
 */
function grimyWall(kit: MeshKit, px: number, pz: number, qx: number, qz: number, h0: number, h1: number, floor: number, top: number, look: WallLook, u0: number): void {
  const foot = 0.8, soot = 0.5;
  const grimeAt = (y: number): Tint => {
    const f = Math.min(1, Math.max(0, (y - floor) / foot)), t = Math.min(1, Math.max(0, (top - y) / soot));
    const k = (0.5 + 0.5 * f * f - 0.15 * look.damp * (1 - f)) * (0.72 + 0.28 * t);
    return scaleTint(look.tint, Math.max(0.25, k));
  };
  const cuts = [h0, floor + foot * 0.5, floor + foot, top - soot, h1].filter((y, i, a) => i === 0 || i === a.length - 1 || (y > h0 + 0.01 && y < h1 - 0.01)).sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) kit.wall(px, pz, qx, qz, cuts[i], cuts[i + 1], look.mat, look.tint, u0, grimeAt(cuts[i]), grimeAt(cuts[i + 1]));
}

/** Corners of side `k` of cell (i, j), travelling so that the face looks into the cell. */
function sideEdge(i: number, j: number, k: number): [number, number, number, number] {
  const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL;
  return k === 0 ? [x1, z1, x1, z0] : k === 1 ? [x0, z1, x1, z1] : k === 2 ? [x0, z0, x0, z1] : [x1, z0, x0, z0];
}

/**
 * A wall face on side k of a cell from y0 to y1, with an optional hole (lateral s0..s1 along the face, height
 * h0..h1); its grime runs from `floor` to `top` (default y0 .. y1).
 */
function wallWithHole(kit: MeshKit, i: number, j: number, k: number, y0: number, y1: number, hole: [number, number, number, number] | null, look: WallLook, floor = y0, top = y1): void {
  const [ax, az, bx, bz] = sideEdge(i, j, k);
  const along = (s: number) => [ax + ((bx - ax) * s) / CELL, az + ((bz - az) * s) / CELL];
  const seg = (s0: number, s1: number, h0: number, h1: number) => {
    if (s1 - s0 < 0.005 || h1 - h0 < 0.005) return;
    const [px, pz] = along(s0), [qx, qz] = along(s1);
    grimyWall(kit, px, pz, qx, qz, h0, h1, floor, top, look, s0 + i * 0.37 + j * 0.71);
  };
  if (!hole) { seg(0, CELL, y0, y1); return; }
  const [s0, s1, h0, h1] = hole;
  seg(0, s0, y0, y1);
  seg(s1, CELL, y0, y1);
  seg(s0, s1, y0, Math.max(y0, h0));
  seg(s0, s1, Math.min(y1, h1), y1);
}

/** Room uses whose walls are limewashed (lived-in, kept) and whose are brick (old vaults, cells). */
const WASHED = new Set(['store', 'counting-room', 'herb-store', 'bunks', 'refuge', 'wine-store', 'lookout']);
const BRICKED = new Set(['cistern', 'watch-cells', 'ward-niche', 'cask-hall']);
const EARTHEN = new Set(['burrow', 'rat-nest', 'coal-hole', 'collapse', 'flooded-way']);
const WET = new Set(['cistern', 'flooded-way']);

/** A tower's rooms that were lived in (limewashed) and its walls of dressed stone; its upper floors are boards. */
const TOWER_WASHED = new Set(['solar', 'study', 'library', 'hall', 'barracks', 'toll-room', 'refuge']);
const ASHLAR: Tint = [196, 186, 170];

/**
 * `models`: AssetGenerator's props (public/props/cellar.fmpk); without them, the kit pieces. A carved
 * dungeon (a cave, world/dungeon/caveRock.ts) has no built shell: only its doors, props and what stands in
 * its ways are made here.
 */
export function cellarMeshes(c: Cellar, models?: PropModels): CellarMeshes {
  const shell = new MeshKit(), propKit = new MeshKit();
  const L = c.layout;
  const shape = c.form.space, carved = shape.carved, tower = shape.walls === 'dressed';
  const space = new DungeonSpace(L);
  const owner = (i: number, j: number, l: number) => {
    for (const r of L.rooms) if (cellIn(r, i, j) && l >= r.level && l < r.level + r.height) return r.id;
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
  const useOf = (room: number) => c.rooms[room].use.id;
  const wallLook = (room: number): WallLook => {
    const use = useOf(room), damp = WET.has(use) ? 1 : eraOf(room) === 'older' ? 0.6 : 0.3;
    if (tower) {
      if (EARTHEN.has(use)) return { mat: M.Rubble, tint: STONE, damp };
      if (eraOf(room) === 'older' || L.rooms[room].level < 0) return { mat: M.Ashlar, tint: OLD, damp: Math.max(damp, 0.6) };
      return TOWER_WASHED.has(use) ? { mat: C.Limewash, tint: WASH, damp: 0.2 } : { mat: M.Ashlar, tint: ASHLAR, damp: 0.2 };
    }
    if (room === c.graph.entrance || WASHED.has(use)) return { mat: C.Limewash, tint: WASH, damp };
    if (EARTHEN.has(use)) return { mat: M.Rubble, tint: EARTH, damp };
    if (BRICKED.has(use)) return { mat: C.Brick, tint: BRICK, damp };
    return eraOf(room) === 'older' ? { mat: M.Ashlar, tint: OLD, damp } : { mat: M.Rubble, tint: STONE, damp };
  };
  const floorLook = (room: number): [number, Tint] => EARTHEN.has(useOf(room)) ? [C.Earth, DIRT] : eraOf(room) === 'older' ? [C.Flagstone, OLD_FLAGS] : tower && L.rooms[room].level > 0 ? [C.Boards, RAFTERS] : [C.Flagstone, FLAGS];

  // Rooms: floor, ceiling (planks on joists under the house's storey; older: a brick vault's flat), walls per storey with their openings.
  for (const r of carved ? [] : L.rooms) {
    const look = wallLook(r.id);
    const y0 = r.level * STOREY, y1 = (r.level + r.height) * STOREY;
    const older = eraOf(r.id) === 'older';
    const [fm, ft] = floorLook(r.id);
    shell.flat(r.x * CELL, r.z * CELL, (r.x + r.w) * CELL, (r.z + r.d) * CELL, y0, true, fm, ft);
    shell.flat(r.x * CELL, r.z * CELL, (r.x + r.w) * CELL, (r.z + r.d) * CELL, y1, false, older ? C.Brick : C.Boards, older ? scaleTint(BRICK, 0.8) : RAFTERS);
    if (!older) for (let b = 0.6; b < r.w * CELL - 0.3; b += 1.4) shell.box(r.x * CELL + b, y1 - 0.22, (r.z + r.d / 2) * CELL, 0.2, 0.22, r.d * CELL, 0, M.Oak, DARK_OAK);
    for (let j = r.z; j < r.z + r.d; j++) for (let i = r.x; i < r.x + r.w; i++) for (let k = 0; k < 4; k++) {
      const ni = i + DIRS[k][0], nj = j + DIRS[k][1];
      if (cellIn(r, ni, nj)) continue;
      for (let lv = r.level; lv < r.level + r.height; lv++) wallWithHole(shell, i, j, k, lv * STOREY, (lv + 1) * STOREY, hole(i, j, lv, k), look, y0, y1);
    }
  }
  // Passages: floor, ceiling, walls; stairs as steps.
  (carved ? [] : L.links).forEach((pl, li) => {
    for (const cell of pl.path) {
      const { x: i, z: j, level: l } = cell;
      const old = l < 0;
      const dug = pl.link.tags.includes('dug');
      const look: WallLook = dug ? { mat: M.Rubble, tint: EARTH, damp: 0.5 } : tower ? { mat: M.Ashlar, tint: old ? OLD : ASHLAR, damp: old ? 0.6 : 0.2 } : old ? { mat: C.Brick, tint: BRICK, damp: 0.6 } : { mat: M.Rubble, tint: STONE, damp: 0.3 };
      const top = l * STOREY, ceil = top + PASSAGE_H;
      const st = cell.stair;
      const lo = st ? top - stairDrop(cell, (i + (st.dir === 0 ? 1 : st.dir === 2 ? 0 : 0.5)) * CELL, (j + (st.dir === 1 ? 1 : st.dir === 3 ? 0 : 0.5)) * CELL) : top;
      shell.flat(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL, ceil, false, old ? C.Brick : C.Boards, old ? scaleTint(BRICK, 0.8) : RAFTERS);
      if (!st) shell.flat(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL, top, true, dug ? C.Earth : tower && l > 0 ? C.Boards : C.Flagstone, dug ? DIRT : tower && l > 0 ? RAFTERS : old ? OLD_FLAGS : FLAGS);
      else {
        // Steps: four per cell, solid down to the bottom of the flight.
        const steps = 4, d = st.dir, base = top - ((st.step + 1) / st.run) * STOREY;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps, h = top - ((st.step + t0 + 0.5 / steps) / st.run) * STOREY;
          const a0 = d === 0 || d === 1 ? t0 : 1 - t1, a1 = d === 0 || d === 1 ? t1 : 1 - t0;
          const [x0, x1, z0, z1] = d % 2 === 0 ? [i + a0, i + a1, j, j + 1] : [i, i + 1, j + a0, j + a1];
          shell.box(((x0 + x1) / 2) * CELL, base, ((z0 + z1) / 2) * CELL, (x1 - x0) * CELL, h - base, (z1 - z0) * CELL, 0, dug ? C.Earth : C.Flagstone, dug ? DIRT : FLAGS);
        }
      }
      for (let k = 0; k < 4; k++) {
        const ni = i + DIRS[k][0], nj = j + DIRS[k][1];
        // The same way on, where its floors meet (not the side of its own stair, with the way above or below).
        const same = (lv: number) => own(ni, nj, lv) === -1 - li && space.floorsMeet(i, j, ni, nj, lv, k);
        if (st) {
          // Open towards the next cells of the flight (on either storey); walls elsewhere, down to the bottom.
          const bottom = Math.min(lo, top - ((st.step + 1) / st.run) * STOREY);
          let gap: [number, number, number, number] | null = null;
          for (const lv of [l, l - 1]) if (same(lv)) {
            const n = pathAt.get(`${ni},${nj},${lv}`)!.cell;
            const nf = n.stair ? n.level * STOREY - ((n.stair.step + (k === n.stair.dir ? 0 : 1)) / n.stair.run) * STOREY : n.level * STOREY;
            gap = [0, CELL, Math.min(nf, gap?.[2] ?? Infinity), Math.max((n.stair ? n.level * STOREY : nf) + PASSAGE_H, gap?.[3] ?? -Infinity)];
          }
          wallWithHole(shell, i, j, k, bottom, ceil, gap, look, lo, ceil);
        } else if (!same(l)) wallWithHole(shell, i, j, k, top, ceil, hole(i, j, l, k), look);
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
    const kind = pl.link.kind;
    // Posts and lintel, standing a little into the room (a cave's openings are the rock's own).
    const ox = -DIRS[k][0] * 0.06, oz = -DIRS[k][1] * 0.06;
    if (!carved) {
      for (const side of [-1, 1]) shell.box(mx + ox + ux * side * (DOOR_W / 2 + 0.08), y, mz + oz + uz * side * (DOOR_W / 2 + 0.08), 0.16, DOOR_H, 0.16, yaw, M.Oak, OAK);
      shell.box(mx + ox, y + DOOR_H, mz + oz, DOOR_W + 0.32, 0.18, 0.18, yaw, M.Oak, OAK);
    }
    if (!isFeature(o)) return;
    const out = DIRS[k];
    if (kind === 'grate' && carved) {
      // A crack in the rock: teeth of stone across the way, a hand's breadth apart.
      const rng = new Rng(deriveSeed(c.decision.seed, 'crack', pl.link.id));
      for (let s = -3; s <= 3; s++) shell.stone(mx + ux * s * 0.32, y - 0.2, mz + uz * s * 0.32, rng.range(0.16, 0.24), DOOR_H + 0.9, rng.range(0.35, 0.6), yaw + rng.range(-0.2, 0.2), WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.08), rng, 0.04, 0.3);
    } else if (kind === 'grate') {
      for (let s = -2; s <= 2; s++) shell.box(mx + ux * s * (DOOR_W / 5), y, mz + uz * s * (DOOR_W / 5), 0.04, DOOR_H, 0.04, yaw, M.Slate, IRON);
      shell.box(mx, y + 1.0, mz, DOOR_W, 0.05, 0.05, yaw, M.Slate, IRON);
    } else if (kind === 'blocked') {
      // The fallen way: a heap of stones up to the lintel, each on the ones below; in a cellar a ceiling beam came down with it.
      const rng = new Rng(deriveSeed(c.decision.seed, 'rubble', pl.link.id));
      for (const st of fallStones(rng, mx, y, mz, ux, uz, out[0], out[1])) {
        if (carved) shell.stone(st.x, st.y0, st.z, st.sx, st.sy, st.sz, st.yaw, WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.1), rng, 0.06, 0.4);
        else shell.stone(st.x, st.y0, st.z, st.sx, st.sy, st.sz, st.yaw, M.Rubble, varyTint(rng, STONE, 0.12), rng, 0.05, 0.3);
      }
      if (!carved) shell.box(mx - out[0] * 0.25, y + 3 * FALL_ROW - 0.04, mz - out[1] * 0.25, DOOR_W + 0.5, 0.2, 0.22, yaw + rng.range(-0.25, 0.25), M.Oak, DARK_OAK);
    } else if (kind === 'drop' && !carved) {
      // The broken edge: splintered boards and a beam end over the drop.
      const rng = new Rng(deriveSeed(c.decision.seed, 'ledge', pl.link.id));
      for (let n = 0; n < 4; n++) shell.box(mx + ux * rng.range(-0.5, 0.5) - out[0] * rng.range(0.2, 0.7), y - 0.08, mz + uz * rng.range(-0.5, 0.5) - out[1] * rng.range(0.2, 0.7), 0.22, 0.06, rng.range(0.6, 1.1), yaw + rng.range(-0.4, 0.4), M.Oak, DARK_OAK);
    } else if (kind === 'locked' || kind === 'oneway' || kind === 'secret') {
      const kit = new MeshKit();
      let opens: DoorPiece['opens'] = 'swing', hinge: [number, number, number] | undefined, bar: BuildingMesh | undefined;
      // The left post (as a leaf's hinge is put), `back` further along the wall.
      const post = (back: number): [number, number, number] => [mx - ux * (DOOR_W / 2 + back), y, mz - uz * (DOOR_W / 2 + back)];
      if (kind === 'secret' && carved) {
        // Stones stacked dry across the way, the hill's own rock around them.
        const pale: Tint = c.setPiece.tint && pl.link.id === c.pieceLink ? [...c.setPiece.tint] as unknown as Tint : CAVE_ROCK;
        const rng = new Rng(deriveSeed(c.decision.seed, 'stacked', pl.link.id));
        opens = 'push';
        for (let row = 0; row < 5; row++) for (let s = -2; s <= 2; s++) kit.stone(mx + ux * (s * 0.42 + (row % 2) * 0.2), y + row * 0.46 - 0.05, mz + uz * (s * 0.42 + (row % 2) * 0.2), 0.46, 0.5, 0.5, yaw + rng.range(-0.15, 0.15), WildMat.Rock, varyTint(rng, pale, 0.1), rng, 0.05, 0.4);
      } else if (kind === 'oneway' && carved && c.setPiece.id === 'pulled-ladder' && pl.link.id === c.pieceLink) {
        // A step of rock too high to climb, the rope ladder pulled up and coiled on its top, tied to a spur.
        opens = 'gone';
        const rng = new Rng(deriveSeed(c.decision.seed, 'step', pl.link.id));
        kit.stone(mx, y - 0.2, mz, DOOR_W + 0.6, 2.1, 1.2, yaw, WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.06), rng, 0.07, 0.35);
        const tx = mx + out[0] * 0.3, tz = mz + out[1] * 0.3;
        for (let n = 0; n < 5; n++) kit.box(tx + ux * (n - 2) * 0.08, y + 1.92 + n * 0.05, tz + uz * (n - 2) * 0.08, 0.5, 0.04, 0.05, yaw + n * 0.25, M.Oak, DARK_OAK);
        kit.cylinder(tx + ux * 0.6, y + 1.9, tz + uz * 0.6, 0.06, 0.35, 6, M.Thatch, ROPE);
      } else if (kind === 'oneway' && carved) {
        // A boulder rolled into the gap from beyond and wedged there with smaller stones: levered out from the far side.
        opens = 'push';
        const rng = new Rng(deriveSeed(c.decision.seed, 'wedged', pl.link.id));
        // Round and knocked about (no slab): a great boulder bulging into the way, a smaller one jammed beside its shoulder.
        const rock = (k: number) => scaleTint(CAVE_ROCK, rng.range(0.82, 1) * k);
        kit.stone(mx + out[0] * 0.35, y - 0.3, mz + out[1] * 0.35, DOOR_W + 0.8, DOOR_H + 0.2, 1.9, yaw + rng.range(-0.5, 0.5), WildMat.Rock, rock(1), rng, 0.2, 0.88);
        const side = rng.chance(0.5) ? 1 : -1;
        kit.stone(mx + ux * side * 0.75 + out[0] * 0.2, y + DOOR_H * 0.45, mz + uz * side * 0.75 + out[1] * 0.2, 0.9, 0.8, 0.9, rng.range(0, 3), WildMat.Rock, rock(0.92), rng, 0.12, 0.8);
        for (let n = 0; n < 4; n++) {
          const s = rng.range(-1, 1);
          kit.stone(mx + ux * s * 0.7 + out[0] * rng.range(0.7, 1.1), y - 0.05, mz + uz * s * 0.7 + out[1] * rng.range(0.7, 1.1), rng.range(0.3, 0.5), rng.range(0.25, 0.45), rng.range(0.3, 0.5), rng.range(0, 3), WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.1), rng, 0.06, 0.4);
        }
      } else if (kind === 'locked' && carved) {
        // An iron grate leaded into the rock, chained and locked: whoever used the cave kept the far side to themselves.
        hinge = post(0.15);
        for (let s = -3; s <= 3; s++) kit.box(mx + ux * s * (DOOR_W / 6), y - 0.1, mz + uz * s * (DOOR_W / 6), 0.05, DOOR_H + 0.4, 0.05, yaw, M.Slate, IRON);
        for (const h of [0.35, 1.25, DOOR_H + 0.1]) kit.box(mx, y + h, mz, DOOR_W + 0.3, 0.06, 0.06, yaw, M.Slate, IRON);
        kit.box(mx + ux * 0.45 - out[0] * 0.06, y + 1.05, mz + uz * 0.45 - out[1] * 0.06, 0.16, 0.14, 0.06, yaw, M.Slate, IRON);
      } else if (kind === 'secret') {
        const pale: Tint = c.setPiece.tint && pl.link.id === c.pieceLink ? [...c.setPiece.tint] as unknown as Tint : STONE;
        kit.box(mx, y, mz, DOOR_W + 0.02, DOOR_H + 0.02, 0.24, yaw, M.Rubble, pale);
        hinge = post(0);
      } else {
        hinge = post(0);
        const leaf = models?.get(kind === 'locked' ? 'door_sturdy' : 'door_plank');
        if (leaf) {
          // The leaf's origin is its hinge: start it at the left post.
          const w = leaf.max[0] - leaf.min[0], sx = DOOR_W / w, sy = DOOR_H / (leaf.max[1] - leaf.min[1]);
          const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
          stampModel(kit, leaf, { x: mx - c0 * (DOOR_W / 2 + leaf.min[0] * sx), y, z: mz + s0 * (DOOR_W / 2 + leaf.min[0] * sx), yaw, scale: [sx, sy, 1] });
        } else kit.box(mx, y, mz, DOOR_W, DOOR_H, 0.08, yaw, M.Oak, OAK);
        if (kind === 'locked') kit.box(mx + ux * 0.45 - out[0] * 0.06, y + 1.0, mz + uz * 0.45 - out[1] * 0.06, 0.12, 0.16, 0.04, yaw, M.Slate, IRON);
        else {
          // The bar sits on the far side (the side it is opened from), apart: it is lifted off first.
          const b = new MeshKit();
          b.box(mx + out[0] * 0.12, y + 1.1, mz + out[1] * 0.12, DOOR_W + 0.3, 0.14, 0.1, yaw, M.Oak, DARK_OAK);
          bar = b.mesh();
        }
      }
      doors.push({ link: pl.link.id, kind, mesh: kit.mesh(), at: [mx, y, mz], through: [out[0], out[1]], opens, ...(hinge ? { hinge } : {}), ...(bar ? { bar } : {}) });
    }
  });

  const lids: ChestLid[] = [];
  for (const p of c.props) {
    if (p.kind === 'chest') lids.push(chest(propKit, p, models));
    else if (!models || !modelProp(propKit, p, models)) prop(propKit, p);
  }
  if (models) dress(propKit, c, models);
  for (const t of torchSpots(c)) sconce(shell, t.x, t.y, t.z, t.nx, t.nz);
  const keys = L.links.filter((pl) => pl.link.kind === 'locked' && pl.link.key !== undefined).map((pl) => ({ room: pl.link.key!, mesh: keyMesh(keySpot(L, pl.link.key!), deriveSeed(c.decision.seed, 'key', pl.link.id)) }));
  return { shell: shell.mesh(), props: propKit.mesh(), doors, lids, keys };
}

/** An old iron key with a brass bow, lying on the floor at `at`, turned by its seed (a hand long: seen from a few steps). */
function keyMesh(at: readonly [number, number, number], seed: number): BuildingMesh {
  const k = new MeshKit(), rng = new Rng(seed), yaw = rng.range(0, 6.28), c = Math.cos(yaw), s = Math.sin(yaw);
  const [x, y, z] = at, BRASS: Tint = [214, 170, 92], DARK_IRON: Tint = [92, 88, 84];
  // Along the key (u): the bow's ring of four bars, the shaft, the bit.
  const put = (u: number, w: number, su: number, sw: number, h: number, t: Tint, mat: number) => k.box(x + c * u + s * w, y + 0.005, z - s * u + c * w, su, h, sw, yaw, mat, t);
  for (const [u, w, su, sw] of [[-0.13, 0, 0.022, 0.08], [-0.05, 0, 0.022, 0.08], [-0.09, 0.03, 0.08, 0.022], [-0.09, -0.03, 0.08, 0.022]]) put(u, w, su, sw, 0.018, BRASS, M.Plaster);
  put(0.04, 0, 0.17, 0.018, 0.018, DARK_IRON, M.Slate);
  put(0.11, 0.025, 0.035, 0.05, 0.012, DARK_IRON, M.Slate);
  return k.mesh();
}

/** Where a chest's lid sits on its body (m over its foot; furn_chest's lid is its top 10 cm), and its back (m behind its middle). */
const CHEST_SEAM = 0.42, CHEST_BACK = 0.25;
/** furn_chest's body and lid apart (no face crosses the seam), once per model. */
const chestParts = new WeakMap<PropModel, { readonly body: PropModel; readonly lid: PropModel }>();

/** A chest: its body into `body`, its lid apart. */
function chest(body: MeshKit, p: Prop, models: PropModels | undefined): ChestLid {
  // A prop's yaw turns the model's +z to the wall it stands at: the chest's front (its lock, where it is opened
  // from) faces the room, so it is turned round.
  const { x, y, z } = p, yaw = p.yaw + Math.PI, lid = new MeshKit();
  const rng = new Rng(deriveSeed(Math.round(x * 100), Math.round(z * 100), p.kind));
  const m = models?.get('furn_chest');
  if (m) {
    let parts = chestParts.get(m);
    if (!parts) chestParts.set(m, (parts = { body: facesWhere(m, (cy) => cy < CHEST_SEAM), lid: facesWhere(m, (cy) => cy >= CHEST_SEAM) }));
    const s: Stamp = { x, y, z, yaw, shade: rng.range(0.85, 1.12), across: true };
    stampModel(body, parts.body, s);
    stampModel(lid, parts.lid, s);
  } else {
    const t = (base: Tint): Tint => varyTint(rng, base, 0.12);
    body.box(x, y, z, 0.9, CHEST_SEAM, 0.55, yaw, M.Oak, t(OAK));
    body.box(x, y + 0.26, z, 0.94, 0.06, 0.59, yaw, M.Slate, IRON);
    lid.box(x, y + CHEST_SEAM, z, 0.92, 0.12, 0.57, yaw, M.Oak, t(DARK_OAK));
  }
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // The model's back top edge, (0, seam, -back), placed as stampModel places it; its line is the model's -x (about
  // +x a positive turn would take the front, +z, down).
  return { mesh: lid.mesh(), hinge: [x - CHEST_BACK * s, y + CHEST_SEAM, z - CHEST_BACK * c], axis: [-c, s] };
}

/** The faces of `m` whose middle's height `keep` takes (the vertices stay; unused ones cost nothing drawn). */
function facesWhere(m: PropModel, keep: (y: number) => boolean): PropModel {
  const P = m.positions, I = m.indices, out: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    if (keep((P[3 * I[t] + 1] + P[3 * I[t + 1] + 1] + P[3 * I[t + 2] + 1]) / 3)) out.push(I[t], I[t + 1], I[t + 2]);
  }
  return { ...m, indices: Uint32Array.from(out) };
}

/** Height of one course of a fallen way's heap (five reach the lintel). */
const FALL_ROW = DOOR_H / 5;

/** A stone of a heap: a box centred at (x, y0 + sy/2, z), turned by yaw. */
export interface HeapStone { readonly x: number; readonly y0: number; readonly z: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly yaw: number }

/**
 * The stones of a fallen way in the doorway at (mx, y, mz) (u along the wall, o out through it): courses
 * that narrow towards the lintel, so the heap spills out on both sides and every stone rests on the course
 * below (its foot a little into it), the lowest on the floor.
 */
export function fallStones(rng: Rng, mx: number, y: number, mz: number, ux: number, uz: number, ox: number, oz: number): HeapStone[] {
  const out: HeapStone[] = [];
  for (let r = 0; r < 5; r++) {
    const deep = 1.1 - r * 0.22, wide = DOOR_W / 2 + (r === 0 ? 0.25 : 0.05), size = 0.5 - r * 0.03;
    const nu = Math.max(1, Math.round((2 * wide) / size)), no = Math.max(1, Math.round((2 * deep) / size));
    for (let i = 0; i < nu; i++) for (let j = 0; j < no; j++) {
      const u = -wide + ((i + 0.5) / nu) * 2 * wide + rng.range(-0.06, 0.06), o = -deep + ((j + 0.5) / no) * 2 * deep + rng.range(-0.06, 0.06);
      const sx = Math.min(size * rng.range(0.85, 1.15), (2 * wide) / nu + 0.1), sz = Math.min(size * rng.range(0.85, 1.15), (2 * deep) / no + 0.1);
      out.push({ x: mx + ux * u + ox * o, y0: y + r * FALL_ROW - (r ? 0.06 : 0.03), z: mz + uz * u + oz * o, sx, sy: FALL_ROW + rng.range(0.04, 0.12), sz, yaw: Math.atan2(ux, uz) - Math.PI / 2 + rng.range(-0.3, 0.3) });
    }
  }
  return out;
}

/** A torch in an iron sconce, its flame (lit by the lights) at (x, y, z), the wall behind it along -n. */
function sconce(k: MeshKit, x: number, y: number, z: number, nx: number, nz: number): void {
  const yaw = Math.atan2(nx, nz);
  const wx = x - nx * TORCH_OUT, wz = z - nz * TORCH_OUT;
  k.box(wx + nx * 0.02, y - 0.42, wz + nz * 0.02, 0.1, 0.22, 0.04, yaw, M.Slate, IRON); // wall plate
  k.box(x - nx * 0.12, y - 0.36, z - nz * 0.12, 0.03, 0.03, 0.22, yaw, M.Slate, IRON); // arm
  k.cylinder(x, y - 0.38, z, 0.045, 0.06, 8, M.Slate, IRON); // ring
  k.cylinder(x, y - 0.5, z, 0.028, 0.44, 6, M.Oak, DARK_OAK); // shaft
  k.cylinder(x, y - 0.08, z, 0.05, 0.1, 8, M.Thatch, [70, 52, 38]); // pitch-soaked head
}

/** Props drawn with AssetGenerator's models; false if the kind has none (the kit draws it). */
function modelProp(k: MeshKit, p: Prop, models: PropModels): boolean {
  const { x, y, z, yaw } = p;
  const rng = new Rng(deriveSeed(Math.round(x * 100), Math.round(z * 100), p.kind));
  const fwd = [Math.sin(yaw), Math.cos(yaw)];
  const spot = (u: number, w: number) => [x + Math.cos(yaw) * u + fwd[0] * w, z - Math.sin(yaw) * u + fwd[1] * w];
  const t = (base: Tint, v = 0.12): Tint => varyTint(rng, base, v);
  const stampAs = (name: string, s: Partial<Stamp> & { x: number; z: number }): boolean => {
    const m = models.get(name);
    if (!m) return false;
    stampModel(k, m, { y, yaw, shade: rng.range(0.85, 1.12), ...s });
    return true;
  };
  switch (p.kind) {
    case 'barrel': return stampAs('prop_barrel', { x, z, yaw: rng.range(0, 6.28), round: true });
    case 'cask': {
      // Two casks on their sides in a cradle.
      k.box(x, y, z, 1.5, 0.14, 0.5, yaw, M.Oak, DARK_OAK);
      for (const u of [-0.4, 0.4]) { const [a, b] = spot(u, 0); stampAs('prop_barrel', { x: a, y: y + 0.12, z: b, yaw: yaw + Math.PI / 2, roll: Math.PI / 2, round: true, scale: [1.15, 1.05, 1.15] }); }
      return true;
    }
    case 'vat': return stampAs('prop_barrel', { x, z, yaw: rng.range(0, 6.28), round: true, scale: [2.1, 1.45, 2.1] });
    case 'crate': {
      stampAs('prop_crate', { x, z, yaw: yaw + rng.range(-0.3, 0.3), across: true, scale: [1.15, 1.1, 1.15] });
      if (rng.chance(0.5)) stampAs('prop_crate', { x: x + rng.range(-0.06, 0.06), y: y + 0.6, z: z + rng.range(-0.06, 0.06), yaw: yaw + rng.range(-0.5, 0.5), across: true, scale: [0.9, 0.85, 0.9] });
      return true;
    }
    case 'bin': return stampAs('prop_crate', { x, z, across: true, scale: [1.7, 1.4, 1.1] });
    case 'shelf': case 'rack': {
      stampAs('furn_cellar_shelf', { x, z, scale: [p.kind === 'shelf' ? 0.9 : 1, 0.95, 1] });
      // Bottles, jars and candles on the boards.
      // The model's board tops (furn_cellar_shelf), times its height scale.
      const boards = [0.42, 1.02, 1.62].map((h) => h * 0.95);
      for (let s = 0; s < 9; s++) {
        if (rng.chance(0.3)) continue;
        const [a, b] = spot(-0.6 + (s % 3) * 0.6 + rng.range(-0.1, 0.1), rng.range(-0.05, 0.05));
        const yy = y + boards[Math.floor(s / 3)];
        if (p.kind === 'rack') for (let n = 0; n < 4; n++) { const [c2, d] = spot(-0.75 + (s % 3) * 0.6 + n * 0.1, 0); k.cylinder(c2, yy, d, 0.04, 0.3, 6, M.Plaster, t([34, 52, 34], 0.25)); }
        else if (rng.chance(0.75)) stampAs('sculpt_clay_urn', { x: a, y: yy, z: b, yaw: rng.range(0, 6.28), round: true, scale: [0.3, 0.34, 0.3] });
        else stampAs('prop_candles', { x: a, y: yy, z: b, round: true });
      }
      return true;
    }
    case 'table': {
      const [a, b] = spot(0, -0.3);
      stampAs('furn_kitchen_table', { x: a, z: b, across: true });
      if (rng.chance(0.6)) stampAs('prop_candles', { x: a + rng.range(-0.3, 0.3), y: y + 0.77, z: b + rng.range(-0.15, 0.15), round: true });
      return true;
    }
    case 'stool': return stampAs('furn_chair', { x, z, yaw: yaw + rng.range(-0.6, 0.6) });
    case 'cot': return stampAs('furn_bed', { x, z, yaw: yaw + Math.PI / 2, across: true, scale: [0.6, 0.6, 0.9] });
    case 'candle': return stampAs('prop_candles', { x, z, round: true });
    case 'lantern': return stampAs('prop_crypt_lantern', { x, z, round: true });
    case 'bones': return stampAs('prop_bone_pile', { x, z, yaw: rng.range(0, 6.28), scale: [0.9, 0.7, 0.9] });
    case 'jar': return stampAs('sculpt_clay_urn', { x, z, yaw: rng.range(0, 6.28), round: true, scale: [0.55, 0.6, 0.55] });
    case 'rubble': {
      for (let n = 0; n < 6; n++) stampAs(n < 2 ? 'rock_chunk_angular' : 'rock_cobble_worn', { x: x + rng.range(-0.5, 0.5), z: z + rng.range(-0.5, 0.5), yaw: rng.range(0, 6.28), scale: n < 2 ? [0.45, 0.4, 0.45] : [0.8, 0.9, 0.8] });
      return true;
    }
    default: return false;
  }
}

/** Small things left about (not in anyone's way): buckets, rope, a skull, stones; by the room's use. */
const LITTER: Readonly<Record<string, readonly string[]>> = {
  store: ['prop_bucket', 'prop_rope_coil'], 'grain-store': ['prop_bucket'], cooperage: ['prop_bucket', 'prop_rope_coil'],
  brewhouse: ['prop_bucket'], 'cask-hall': ['prop_bucket'], 'smugglers-store': ['prop_rope_coil', 'prop_bucket'],
  bunks: ['prop_bucket'], hideout: ['prop_rope_coil', 'prop_candles'], 'watch-cells': ['prop_skull', 'rock_cobble_worn'],
  guardroom: ['prop_bucket', 'prop_skull'], burrow: ['prop_skull', 'rock_cobble_worn'], 'rat-nest': ['prop_skull'],
  'web-hall': ['prop_skull'], collapse: ['rock_cobble_worn', 'rock_cobble_worn'], 'old-hall': ['rock_cobble_worn'],
  'realm-store': ['rock_cobble_worn'], cistern: ['rock_cobble_worn'], refuge: ['prop_candles'],
};

/** Litter along the walls of every room, clear of the doors and the props already standing. */
function dress(k: MeshKit, c: Cellar, models: PropModels): void {
  const L = c.layout;
  const doors = L.links.flatMap((pl) => pl.doors.map((d) => [(d.x + 0.5 + DIRS[d.dir][0] * 0.5) * CELL, (d.z + 0.5 + DIRS[d.dir][1] * 0.5) * CELL, d.level]));
  for (const r of L.rooms) {
    const kinds = LITTER[c.rooms[r.id].use.id];
    if (!kinds) continue;
    const rng = new Rng(deriveSeed(c.decision.seed, 'litter', r.id));
    const taken = c.props.filter((p) => p.room === r.id).map((p) => [p.x, p.z]);
    const y = r.level * STOREY;
    for (let n = 0, tries = 0; n < kinds.length + 1 && tries < 24; tries++) {
      const name = kinds[n % kinds.length];
      const m = models.get(name);
      if (!m) break;
      // A spot a little in from a random wall.
      const side = rng.int(0, 3), t = rng.range(0.15, 0.85), inset = 0.35;
      const x0 = r.x * CELL + inset, x1 = (r.x + r.w) * CELL - inset, z0 = r.z * CELL + inset, z1 = (r.z + r.d) * CELL - inset;
      const x = side === 0 ? x0 : side === 1 ? x1 : x0 + (x1 - x0) * t, z = side === 2 ? z0 : side === 3 ? z1 : z0 + (z1 - z0) * t;
      if (doors.some((d) => d[2] === r.level && Math.hypot(d[0] - x, d[1] - z) < 1.3)) continue;
      if (taken.some((q) => Math.hypot(q[0] - x, q[1] - z) < 0.9)) continue;
      taken.push([x, z]);
      stampModel(k, m, { x, y, z, yaw: rng.range(0, 6.28), shade: rng.range(0.85, 1.1), round: name !== 'prop_rope_coil' && name !== 'rock_cobble_worn', scale: name === 'rock_cobble_worn' ? [0.6, 0.7, 0.6] : undefined });
      n++;
    }
  }
}

/** One prop from the kit of simple pieces. */
function prop(k: MeshKit, p: Prop): void {
  const { x, y, z, yaw } = p;
  const rng = new Rng(deriveSeed(Math.round(x * 100), Math.round(z * 100), p.kind));
  const t = (base: Tint, v = 0.12): Tint => varyTint(rng, base, v);
  const fwd = [Math.sin(yaw), Math.cos(yaw)];
  const spot = (u: number, w: number) => [x + Math.cos(yaw) * u + fwd[0] * w, z - Math.sin(yaw) * u + fwd[1] * w];
  const kind: DungeonProp = p.kind;
  switch (kind) {
    case 'barrel': k.cylinder(x, y, z, 0.32, 0.85, 10, M.Oak, t(OAK), 0.12); break;
    case 'cask': { const [a, b] = spot(-0.4, 0), [c2, d] = spot(0.4, 0); k.box(x, y, z, 1.4, 0.18, 0.5, yaw, M.Oak, t(DARK_OAK)); k.cylinder(a, y + 0.18, b, 0.4, 0.8, 10, M.Oak, t(OAK), 0.1); k.cylinder(c2, y + 0.18, d, 0.4, 0.8, 10, M.Oak, t(OAK), 0.1); break; }
    case 'vat': k.cylinder(x, y, z, 0.7, 1.3, 14, M.Oak, t(OAK), 0.05); break;
    case 'rack': for (let s = 0; s < 3; s++) k.box(x, y + 0.05 + s * 0.6, z, 1.6, 0.06, 0.45, yaw, M.Oak, t(DARK_OAK)); for (const u of [-0.78, 0.78]) { const [a, b] = spot(u, 0); k.box(a, y, b, 0.08, 1.8, 0.45, yaw, M.Oak, t(DARK_OAK)); } for (let s = 0; s < 6; s++) { const [a, b] = spot(-0.6 + s * 0.24, 0); k.box(a, y + 0.12 + (s % 3) * 0.6, b, 0.1, 0.1, 0.4, yaw, M.Plaster, [34, 52, 34]); } break;
    case 'crate': k.box(x, y, z, 0.7, 0.6, 0.7, yaw + rng.range(-0.3, 0.3), M.Oak, t([150, 118, 80])); if (rng.chance(0.5)) k.box(x, y + 0.6, z, 0.55, 0.45, 0.55, yaw + rng.range(-0.5, 0.5), M.Oak, t([150, 118, 80])); break;
    case 'sack': {
      const a0 = rng.range(0, 6.28), b0 = rng.range(0, 6.28), lean = rng.range(0.8, 1.15);
      k.sack(x, y, z, 0.27 * lean, 0.72 / lean, M.Plaster, t([150, 124, 88]), (a, tt) => Math.sin(2 * a + a0) * 0.6 * Math.sin(Math.PI * tt) + Math.sin(3 * a + b0 + tt * 4) * 0.4);
      break;
    }
    case 'shelf': k.box(x, y, z, 1.4, 1.7, 0.08, yaw, M.Oak, t(DARK_OAK)); for (let s = 0; s < 3; s++) k.box(x, y + 0.4 + s * 0.5, z, 1.4, 0.04, 0.35, yaw, M.Oak, t(OAK)); break;
    case 'table': { const [a, b] = spot(0, -0.3); k.box(a, y + 0.72, b, 1.2, 0.06, 0.7, yaw, M.Oak, t(OAK)); for (const [u, w] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) { const [px, pz] = spot(u, w - 0.3); k.box(px, y, pz, 0.07, 0.72, 0.07, yaw, M.Oak, t(DARK_OAK)); } break; }
    case 'stool': k.cylinder(x, y, z, 0.18, 0.45, 8, M.Oak, t(OAK)); break;
    case 'cot': k.box(x, y, z, 1.9, 0.35, 0.8, yaw + Math.PI / 2, M.Oak, t(DARK_OAK)); k.box(x, y + 0.35, z, 1.8, 0.1, 0.7, yaw + Math.PI / 2, M.Thatch, t([180, 160, 110])); break;
    case 'straw': k.box(x, y, z, 1.2, 0.18, 0.9, yaw + rng.range(-0.5, 0.5), M.Thatch, t([190, 165, 100], 0.2)); break;
    case 'nest': for (let n = 0; n < 5; n++) k.box(x + rng.range(-0.4, 0.4), y, z + rng.range(-0.4, 0.4), rng.range(0.4, 0.8), rng.range(0.15, 0.35), rng.range(0.4, 0.8), rng.range(0, 3), M.Thatch, t([120, 100, 70], 0.25)); break;
    case 'rubble': for (let n = 0; n < 7; n++) k.box(x + rng.range(-0.5, 0.5), y, z + rng.range(-0.5, 0.5), rng.range(0.2, 0.5), rng.range(0.15, 0.35), rng.range(0.2, 0.5), rng.range(0, 3), M.Rubble, t(STONE, 0.2)); break;
    case 'bones': for (let n = 0; n < 6; n++) k.box(x + rng.range(-0.4, 0.4), y, z + rng.range(-0.4, 0.4), 0.05, 0.05, rng.range(0.2, 0.45), rng.range(0, 3), M.Plaster, t([225, 215, 190])); k.cylinder(x + 0.2, y, z - 0.1, 0.1, 0.16, 8, M.Plaster, [225, 215, 190], 0.5); break;
    case 'candle': k.cylinder(x, y, z, 0.04, 0.25, 6, M.Plaster, [240, 230, 200]); break;
    case 'lantern': k.box(x, y, z, 0.2, 0.32, 0.2, yaw, M.Slate, IRON); k.box(x, y + 0.04, z, 0.14, 0.22, 0.14, yaw, M.Glass, [255, 200, 120]); break;
    case 'ledger': { const [a, b] = spot(0, -0.3); k.box(a, y, b, 0.5, 0.7, 0.4, yaw, M.Oak, t(DARK_OAK)); k.box(a, y + 0.7, b, 0.34, 0.06, 0.26, yaw + 0.2, M.Plaster, [150, 60, 40]); break; }
    case 'web': {
      // Threads spun across the corner of wall and ceiling: spokes from a hub, a few turns of spiral.
      const [hx, hz] = spot(0, -0.35), hy = y + 2.0, spokes = 8, silk: Tint = [205, 205, 198];
      const end = (i: number, f: number): number[] => { const a = (i / spokes) * Math.PI * 2 + 0.3; const [px, pz] = spot(Math.cos(a) * 0.8 * f, -0.35 - Math.max(0, Math.sin(a)) * 0.3 * f); return [px, hy + Math.sin(a) * 0.55 * f, pz]; };
      const thread = (p0: number[], p1: number[]) => { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], len = Math.hypot(dx, dy, dz); const w = 0.006; const nx = -dz / (Math.hypot(dx, dz) || 1) * w, nz = dx / (Math.hypot(dx, dz) || 1) * w; k.quad([p0[0] - nx, p0[1], p0[2] - nz], [p1[0] - nx, p1[1], p1[2] - nz], [p1[0] + nx, p1[1] + w * 2, p1[2] + nz], [p0[0] + nx, p0[1] + w * 2, p0[2] + nz], [[0, 0], [len, 0], [len, 0.01], [0, 0.01]], M.Plaster, silk); };
      for (let i = 0; i < spokes; i++) thread([hx, hy, hz], end(i, 1));
      for (const f of [0.3, 0.55, 0.8]) for (let i = 0; i < spokes; i++) thread(end(i, f), end(i + 1, f));
      break;
    }
    case 'bricks': for (let s = 0; s < 3; s++) k.box(x, y + s * 0.12, z, 0.7, 0.12, 0.4, yaw + s * 0.2, M.Ashlar, t([190, 120, 90])); break;
    case 'beam': k.box(x, y, z, 2.4, 0.22, 0.24, yaw + rng.range(-0.4, 0.4), M.Oak, t([150, 116, 84], 0.2)); break;
    case 'puddle': k.flat(x - 0.7, z - 0.5, x + 0.7, z + 0.5, y + 0.01, true, M.Plaster, [44, 48, 50]); break;
    case 'bin': k.box(x, y, z, 1.0, 0.8, 0.6, yaw, M.Oak, t(OAK)); break;
    case 'jar': k.cylinder(x, y, z, 0.16, 0.42, 8, M.Tile, t([170, 110, 70]), 0.3); break;
    case 'door': {
      // The way out of a tower: a heavy door in a stone frame, standing ajar on grey daylight.
      const [a, b] = spot(0, -0.5);
      for (const u of [-0.75, 0.75]) { const [px, pz] = spot(u, -0.45); k.box(px, y, pz, 0.3, 2.4, 0.3, yaw, M.Ashlar, t([186, 176, 160])); }
      { const [px, pz] = spot(0, -0.45); k.box(px, y + 2.4, pz, 1.8, 0.35, 0.34, yaw, M.Ashlar, t([186, 176, 160])); }
      k.box(a, y, b, 1.2, 2.4, 0.04, yaw, M.Plaster, [196, 204, 212]);
      // The leaf stands open, back against the wall beside its frame.
      { const [px, pz] = spot(-1.45, -0.4); k.box(px, y, pz, 1.1, 2.3, 0.08, yaw, M.Oak, t(DARK_OAK)); }
      break;
    }
    case 'ladder': { const [a, b] = spot(0, -0.15); for (const u of [-0.3, 0.3]) { const [px, pz] = spot(u, -0.15); k.box(px, y, pz, 0.08, STOREY, 0.08, yaw, M.Oak, t(OAK)); } for (let s = 0; s < 8; s++) k.box(a, y + 0.3 + s * 0.32, b, 0.6, 0.05, 0.06, yaw, M.Oak, t(OAK)); break; }
  }
}

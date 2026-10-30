/**
 * A natural cave's rock (plan 5.6, 8: "carved as an SDF cave"; pure, runs in a worker): the dungeon's rooms
 * and ways, carved out of solid rock instead of built. The layout's space (world/dungeon/space.ts) gives the
 * floors, ceilings and the walls between ways; here its walls are thickened into rock, its corners rounded,
 * and the walls and ceilings bulge inward with noise, more in the wide caverns than in the narrow ways and
 * least at the foot of a wall, so the floor stays level where people walk and things stand. The field is
 * meshed with surface nets (@futuremagic/volume) into the building format: rock on walls and roofs, silt
 * and rock on the floors, so it draws with the town's one building shader.
 *
 * The walker reads the same field (`CaveSpace`), with the layout's own space over it for the doors that
 * are still shut, so what is seen is what is walked.
 */
import { Noise, Rng, deriveSeed, smin, smoothstep } from '@futuremagic/core';
import { DIRS } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { ScaledLayout } from './cellar';
import { WildMat, scaleTint, type Tint } from './meshKit';
import { brickField, fieldAt, meshField, setSample, type BrickField } from './rockMesh';
import { DungeonSpace } from './space';
import { THROAT_BEYOND, throatAir, throatNoise, throatShade, type ThroatFrame } from './caveThroat';
import { inFrame } from './site';
import { blockAt, caveFeatures, domeAt, hallAt, miteAt, floorLift, toCourse, type CaveBlock, type CaveFeatures, type CaveMite } from './caveFeatures';

/** Sample spacing of the cave's field, metres: a sixth of a cell, 0.4 m at least (a cellar-sized cave's). */
export const caveStep = (cell: number): number => Math.max(0.4, Math.min(0.6, cell / 6));
/** Half the least thickness of rock between two ways side by side, metres, for a 2 m cell. */
const SKIN = 0.15;
/** How far a cavern's walls lean in for every metre they rise above head height. */
const LEAN = 0.22;

/** The cave's rock as signed distances (positive in air), in bricks, in the dungeon's own frame. */
export type CaveField = BrickField;

/** A stalactite: where it hangs, how long it is and how thick at its root. */
interface Stalactite { readonly x: number; readonly z: number; readonly len: number; readonly r: number }

/** The field around every room and way of the layout, a cell of rock beyond. */
export function caveField(layout: ScaledLayout, seed: number, feat = caveFeatures(layout, seed), step = caveStep(layout.scale.cell), throat: CaveThroat | null = null): CaveField {
  const space = new DungeonSpace(layout, true), { cell: CELL, storey: STOREY } = layout.scale;
  // Everything that is a length in a cellar-sized cave grows with the cell.
  const g = CELL / 2;
  const noise = new Noise(deriveSeed(seed, 'cave', 'rock'));
  const [lo, hi] = layout.levels;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const k of space.grid.cells.keys()) {
    const [i, j] = k.split(',').map(Number);
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const ox = (i0 - 1) * CELL, oz = (j0 - 1) * CELL, oy = lo * STOREY - 1.2;
  const nx = Math.ceil(((i1 + 2) * CELL - ox) / step) + 1, nz = Math.ceil(((j1 + 2) * CELL - oz) / step) + 1;
  const shaftTop = Math.max((hi + 1) * STOREY + 1, ...feat.shafts.map((s) => s.top + 1));
  const ny = Math.ceil((shaftTop - oy) / step) + 1;
  // Per cell column: the lowest and highest storey anything is on there (the solid rock between is not sampled).
  const ci = i1 - i0 + 3, cj = j1 - j0 + 3;
  const colLo = new Int16Array(ci * cj).fill(32767), colHi = new Int16Array(ci * cj).fill(-32768);
  for (const k of space.grid.cells.keys()) {
    const [i, j, l] = k.split(',').map(Number), c = (j - j0 + 1) * ci + (i - i0 + 1);
    colLo[c] = Math.min(colLo[c], l); colHi[c] = Math.max(colHi[c], l);
  }
  // The storeys to sample in a column: its own and its neighbours' (none: solid rock).
  const sLo = new Int16Array(ci * cj).fill(32767), sHi = new Int16Array(ci * cj).fill(-32768);
  for (let j = 0; j < cj; j++) for (let i = 0; i < ci; i++) for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
    const x = i + u, z = j + v;
    if (x >= 0 && z >= 0 && x < ci && z < cj) { sLo[j * ci + i] = Math.min(sLo[j * ci + i], colLo[z * ci + x]); sHi[j * ci + i] = Math.max(sHi[j * ci + i], colHi[z * ci + x]); }
  }
  // Doorways (their middles on the floor): the rock bulges least there, so every way stays wide enough to pass.
  // Each column keeps the doorways near enough to matter (the bulge is full 2.2 m from one).
  const near: number[][][] = Array.from({ length: ci * cj }, () => []);
  for (const pl of layout.links) for (const dr of pl.doors) {
    const q = [(dr.x + 0.5 + DIRS[dr.dir][0] * 0.5) * CELL, dr.level * STOREY + 1, (dr.z + 0.5 + DIRS[dr.dir][1] * 0.5) * CELL];
    const reach = Math.ceil(2.2 / CELL) + 1, a = dr.x - i0 + 1, b = dr.z - j0 + 1;
    for (let v = -reach; v <= reach; v++) for (let u = -reach; u <= reach; u++) {
      const x = a + u, z = b + v;
      if (x >= 0 && z >= 0 && x < ci && z < cj) near[z * ci + x].push(q);
    }
  }
  const fromDoor = (c: number, x: number, y: number, z: number) => {
    let best = Infinity;
    for (const q of near[c]) best = Math.min(best, Math.hypot(q[0] - x, (q[1] - y) * 0.7, q[2] - z));
    return best;
  };
  // The stalactites hanging from the caverns' roofs (none near the walls, where the roof is low, nor in a shaft).
  const drips = new Map<number, Stalactite[]>();
  for (const c of feat.halls.values()) {
    if (!c.cavern) continue;
    const rng = new Rng(deriveSeed(seed, 'cave', 'stalactites', c.id)), list: Stalactite[] = [];
    const n = Math.round(((c.x1 - c.x0) * (c.z1 - c.z0)) / 14);
    for (let t = 0; t < n; t++) {
      const u = rng.range(0.12, 0.88), v = rng.range(0.12, 0.88);
      const s: Stalactite = { x: c.x0 + (c.x1 - c.x0) * u, z: c.z0 + (c.z1 - c.z0) * v, len: rng.range(0.8, 4.5) * rng.range(0.5, 1), r: rng.range(0.25, 0.75) };
      if (!feat.shafts.some((h) => Math.hypot(h.x - s.x, h.z - s.z) < h.r + s.r + 0.5)) list.push(s);
    }
    drips.set(c.id, list);
  }
  // What stands on each hall's floor (blocks, stalagmites), and its shafts.
  const blocks = new Map<number, CaveBlock[]>(), mites = new Map<number, CaveMite[]>();
  for (const b of feat.blocks) blocks.set(b.hall, [...(blocks.get(b.hall) ?? []), b]);
  for (const m of feat.mites) mites.set(m.hall, [...(mites.get(m.hall) ?? []), m]);
  const shaftAt = (x: number, z: number) => feat.shafts.find((s) => Math.hypot(x - s.x, z - s.z) < s.r * 1.5 + 1);
  const f = brickField(ox, oy, oz, step, nx, ny, nz);
  const gullet = throat ? throatNoise(throat.seed) : null;
  for (let k = 0; k < nz; k++) {
    const z = oz + k * step;
    for (let i = 0; i < nx; i++) {
      const x = ox + i * step;
      const col = Math.floor((z - oz) / CELL) * ci + Math.floor((x - ox) / CELL);
      if (sLo[col] > sHi[col]) continue;
      const shaft = shaftAt(x, z);
      // The floor's relief here, once per hall over this column (it depends on x and z alone).
      let reliefHall = -1, relief = 0;
      const ja = Math.max(0, Math.floor((sLo[col] * STOREY - 1.2 - oy) / step)), jb = Math.min(ny - 1, Math.ceil(((shaft ? shaft.top - (sHi[col] + 1) * STOREY : 0) + (sHi[col] + 1) * STOREY + 1 - oy) / step));
      for (let j = ja; j <= jb; j++) {
        const y = oy + j * step;
        const p = space.parts(x, y, z, 3 * g, 0.6 * g);
        let walls = p.walls - SKIN * g, ceil = p.ceil, round = 0.2 * g;
        const own = space.own(Math.floor(x / CELL), Math.floor(z / CELL), space.levelAt(y));
        const hall = own !== undefined && own >= 0 ? feat.halls.get(own) : undefined, cav = hall?.cavern ? hall : undefined;
        let high = 0;
        if (cav) {
          // A cavern: the roof a dome, the walls leaning in above head height, so it is a hall of rock, not a box.
          const up = y - cav.floor;
          high = smoothstep(3, 9, up);
          ceil = Math.min(ceil, domeAt(cav, x, z) - y);
          // The walls lean in from their sides, not across a doorway (its opening goes on into the rock).
          const l = space.levelAt(y), ci0 = Math.floor(x / CELL), cj0 = Math.floor(z / CELL);
          const side = (d: number, i: number, j: number, k: number) => (space.opening(i, j, l, k) ? Infinity : d);
          const edge = Math.min(
            side(cav.x1 - x, cav.x1 / CELL - 1, cj0, 0), side(cav.z1 - z, ci0, cav.z1 / CELL - 1, 1),
            side(x - cav.x0, cav.x0 / CELL, cj0, 2), side(z - cav.z0, ci0, cav.z0 / CELL, 3),
          );
          if (edge < Infinity) walls = smin(walls, edge - SKIN * g - LEAN * Math.max(0, up - 3), 1.5);
        }
        if (Math.min(walls, ceil) < 1.8 * g + high * 2.5 && p.floor > -0.5) {
          // A way's rock stays close to its walls; a room's bulges (less towards its doorways, below).
          const amp = own !== undefined && own >= 0 ? 1 : 0;
          // Lumps of rock and the grain of its beds; least at the wall's foot, where things stand; big ones high in a cavern.
          const lump = noise.fbm3(x / (2.6 * g), y / (2.1 * g), z / (2.6 * g), 3) * 0.5 + 0.5;
          const bed = Math.sin(y * 2.3 + noise.fbm3(x / 9, y / 9, z / 9, 2) * 4) * (0.03 + amp * 0.04);
          const grit = noise.fbm3(x / 0.8 + 31.7, y / 0.8, z / 0.8, 2) * (0.04 + amp * 0.04);
          const foot = 0.2 + 0.8 * smoothstep(0.3, 1.6, p.floor);
          const open = 0.25 + 0.75 * smoothstep(0.8, 2.2, fromDoor(col, x, y, z));
          const crag = high * (noise.fbm3(x / 7, y / 6, z / 7 + 13.1, 3) * 0.5 + 0.5) * 2.2;
          walls -= (((0.08 + amp * 0.42) * lump * foot) * g + bed + grit + crag) * open;
          ceil -= (0.05 + amp * 0.38) * g * (noise.fbm3(x / (3.1 * g) + 7.3, y / (3.1 * g), z / (3.1 * g), 2) * 0.5 + 0.5) + grit + crag * 0.6;
          round += amp * 0.8 * g;
        }
        // The floor heaped, stepped and banked, with its pools and stream (caveFeatures.ts); its walls curve into
        // it (in a cavern over a metre and a half), and blocks and stalagmites stand on it.
        if (hall && reliefHall !== hall.id) { reliefHall = hall.id; relief = floorLift(feat, hall, x, z); }
        const floor = hall ? (p.floor - relief - noise.fbm3(x / 0.9 + 3.1, y / 0.9, z / 0.9, 2) * 0.07 * (hall.cavern ? 1 : 0.5)) * 0.8 : p.floor;
        let d = smin(smin(walls, ceil, round), floor, cav ? 1.6 : hall ? 0.8 : 0.45);
        if (hall) {
          for (const b of blocks.get(hall.id) ?? []) if (Math.abs(x - b.x) < 2 && Math.abs(z - b.z) < 2) d = smin(d, blockAt(b, x, y, z), 0.25);
          for (const m of mites.get(hall.id) ?? []) if (Math.abs(x - m.x) < m.r + 0.7 && Math.abs(z - m.z) < m.r + 0.7) d = smin(d, miteAt(m, x, y, z), 0.35);
        }
        // Stalactites over a cavern's floor, from its roof down (their tips well over a body's head).
        if (cav && high > 0) for (const s of drips.get(cav.id)!) {
          const hd = Math.hypot(x - s.x, z - s.z);
          if (hd > s.r + 0.6) continue;
          const tip = domeAt(cav, s.x, s.z) - s.len, t = (y - tip) / s.len;
          const cone = t < 0 ? Math.hypot(hd, y - tip) : (hd - s.r * Math.min(1, t)) * 0.85;
          d = Math.min(d, cone);
        }
        // A shaft up through the roof to the day: a rough chimney, its rim worn round, shut a little under its top.
        if (shaft && y > shaft.roof - 4) {
          const a = Math.atan2(z - shaft.z, x - shaft.x);
          const r = shaft.r * (1 + 0.22 * noise.fbm3(Math.cos(a) * 1.3, y / 2.5, Math.sin(a) * 1.3, 2)) + 1.4 * smoothstep(shaft.roof + 0.5, shaft.roof - 3, y);
          const air = Math.min(r - Math.hypot(x - shaft.x, z - shaft.z), shaft.top - y);
          d = -smin(-d, -air, 0.8);
        }
        // The throat out of the entrance room's wall, to the portal from the mouth and a little past it (caveThroat.ts).
        if (throat && gullet) d = Math.max(d, inThroat(throat, gullet, x, y, z));
        setSample(f, i, j, k, d);
      }
    }
  }
  return f;
}

/** Where a cave's throat leaves its entrance room (caveThroat.ts), and the seed its mouth's side makes its lumps from. */
export type CaveThroat = ThroatFrame & { readonly seed: number };

/** The throat's air at a point of the cave's frame: from a little into the entrance room to a little past the portal. */
function inThroat(t: ThroatFrame, noise: ReturnType<typeof throatNoise>, x: number, y: number, z: number): number {
  const [u, w] = inFrame(t, x, z), v = y - t.y;
  if (Math.abs(u) > 3 || v < -1.5 || v > 4.5 || w > THROAT_BEYOND + 1.5 || w < -THROAT_IN - 1.5) return -1;
  return Math.min(throatAir(noise, u, v, w), THROAT_BEYOND - w, w + THROAT_IN);
}

/** The throat's darkening at a point of the cave's frame (1 away from it). */
function throatDark(t: ThroatFrame, x: number, y: number, z: number): number {
  const [u, w] = inFrame(t, x, z);
  return Math.abs(u) > 3.5 || y - t.y > 5 ? 1 : throatShade(w);
}

/** How far the throat reaches on into the cave past its portal (m): through the rock to the wall and well into the room. */
const THROAT_IN = 4;

/** The field at a point (trilinear); solid rock outside it. */
export const caveAt = (f: CaveField, x: number, y: number, z: number): number => fieldAt(f, x, y, z);

/**
 * A cave's space to walk in: its rock, and the layout's doors still shut (a grate, a wedged boulder, a hidden
 * way). Nothing else of the layout's space walls it in, so where the rock is open one walks.
 */
export class CaveSpace extends DungeonSpace {
  constructor(layout: ScaledLayout, readonly rock: CaveField, readonly features: CaveFeatures) {
    super(layout);
  }

  /** The floor as carved: heaped, stepped and banked in the rooms, hollowed under water (caveFeatures.ts). */
  override floorAt(x: number, z: number, y: number): number | null {
    const at = super.floorAt(x, z, y);
    if (at === null) return null;
    const hall = hallAt(this.features, this, x, at + 0.1, z);
    return hall ? at + floorLift(this.features, hall, x, z) : at;
  }

  override sdf(x: number, y: number, z: number): number {
    return Math.min(caveAt(this.rock, x, y, z), this.shut(x, y, z));
  }
}

/** The rock as it is (grey with a little ochre), and silt on the floors. */
const ROCK: Tint = [168, 160, 148], SILT: Tint = [150, 132, 110];
/** Silt so thin that the rock shows through (warm: a grey floor stood cold against the brown walls). */
const BARE: Tint = [138, 124, 106];

/** The cave's rock as one mesh in the building format (its own frame). */
export function caveShell(f: CaveField, layout: ScaledLayout, seed: number, feat = caveFeatures(layout, seed), throat: CaveThroat | null = null): BuildingMesh {
  const space = new DungeonSpace(layout, true);
  const noise = new Noise(deriveSeed(seed, 'cave', 'tint'));
  // Damp: by the water, and where a shaft lets the rain in.
  const wetness = (x: number, z: number): number => {
    let w = 0;
    for (const p of feat.pools) w = Math.max(w, smoothstep(p.r + 1.8, p.r * 0.6, Math.hypot(x - p.x, z - p.z)));
    for (const s of feat.streams) w = Math.max(w, smoothstep(s.w + 1.2, s.w * 0.5, toCourse(s.pts, x, z)));
    for (const s of feat.shafts) w = Math.max(w, 0.6 * smoothstep(s.r + 3, s.r, Math.hypot(x - s.x, z - s.z)));
    return w;
  };
  return meshField(f, {
    // All of it rock; the silt on the floors is in the tint, which blends smoothly from vertex to vertex. A
    // material chosen per triangle (by a patch noise, or by how level it lies on a heaped floor) left saw-tooth
    // edges along the mesh grid.
    mat: () => WildMat.Rock,
    tint: (x, y, z, _m, up) => {
      // Damp darkens the foot of the walls and the wet ground, the beds of the rock run in bands, and some stretches are darker.
      const floor = Math.max(0, space.parts(x, y + 0.05, z, 3).floor);
      const hall = hallAt(feat, space, x, y + 0.05, z), over = hall ? y - hall.floor : 0;
      const band = 0.9 + 0.1 * Math.sin(y * 1.7 + noise.fbm3(x / 6, y / 6, z / 6, 2) * 3);
      const damp = 1 - 0.35 * wetness(x, z) * (1 - smoothstep(0.5, 2.5, floor));
      // Near the portal the throat is as dark as the mouth's way in at that depth (caveThroat.ts).
      const dark = throat ? throatDark(throat, x, y, z) : 1;
      const s = (0.62 + 0.38 * smoothstep(0, 0.9, floor)) * band * damp * dark * (0.85 + 0.3 * (noise.fbm3(x / 5, y / 5, z / 5, 2) * 0.5 + 0.5));
      // Walls are bare rock; the floor (lying level, `up`) is silted, thin silt showing the grey of the rock under it.
      const flat = smoothstep(0.7, 0.92, up);
      if (flat <= 0) return scaleTint(ROCK, s);
      // Thin silt shows the grey of the rock under it; thick patches are brown, lying in the hollows; heaps and steps are bare.
      const thick = smoothstep(-0.45, 0.15, noise.fbm3(x / 3.5, 0.5, z / 3.5, 2)) * (1 - smoothstep(0.15, 0.5, over));
      const thin = 1 - thick;
      const silt: Tint = [SILT[0] + (BARE[0] - SILT[0]) * thin, SILT[1] + (BARE[1] - SILT[1]) * thin, SILT[2] + (BARE[2] - SILT[2]) * thin];
      return scaleTint([ROCK[0] + (silt[0] - ROCK[0]) * flat, ROCK[1] + (silt[1] - ROCK[1]) * flat, ROCK[2] + (silt[2] - ROCK[2]) * flat], s);
    },
  });
}

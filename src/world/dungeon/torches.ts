/**
 * Where a cellar's torches hang (pure): a sconce on the wall beside a doorway, about one a room (two in a
 * big room), at shoulder height, so every way in is lit from the side. cellarMesh draws the sconces; the
 * lights and flames hang on the same spots.
 */
import { DIRS } from '@futuremagic/dungeon';
import { deriveSeed } from '@futuremagic/core';
import { cellIn, type Cellar } from './cellar';
import { caveFeatures } from './caveFeatures';

export interface TorchSpot {
  /** The flame, in the cellar's frame (metres). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The wall's normal, into the room. */
  readonly nx: number;
  readonly nz: number;
  readonly room: number;
}

/** Height of the flame above the floor. */
export const TORCH_Y = 1.85;
/** How far the flame stands out from the wall. */
export const TORCH_OUT = 0.24;

export function torchSpots(c: Cellar): TorchSpot[] {
  // A natural cave has none: the lantern is all the light there is.
  if (!c.form.space.torches) return [];
  const L = c.layout;
  const out: TorchSpot[] = [];
  const opening = new Set<string>();
  for (const pl of L.links) for (const d of pl.doors) opening.add(`${d.x},${d.z},${d.level},${d.dir}`);
  for (const r of L.rooms) {
    const doors = L.links.flatMap((pl) => pl.doors.filter((d) => d.room === r.id && d.level === r.level));
    const want = r.w * r.d >= 6 ? 2 : 1;
    let placed = 0;
    for (const d of doors) {
      if (placed >= want) break;
      const [ox, oz] = DIRS[d.dir];
      // Along the wall: try the cell to either side of the doorway's cell, on the same side, if it is wall.
      const along = DIRS[(d.dir + 1) % 4];
      for (const s of [1, -1]) {
        const i = d.x + along[0] * s, j = d.z + along[1] * s;
        if (!cellIn(r, i, j) || opening.has(`${i},${j},${d.level},${d.dir}`)) continue;
        // On the wall face of that side, a little way from the doorway.
        const { cell, storey } = L.scale, cx = (d.x + 0.5) * cell + ox * cell / 2, cz = (d.z + 0.5) * cell + oz * cell / 2;
        const off = cell * 0.62 * s;
        out.push({
          x: cx + along[0] * off - ox * TORCH_OUT, y: d.level * storey + TORCH_Y, z: cz + along[1] * off - oz * TORCH_OUT,
          nx: -ox, nz: -oz, room: r.id,
        });
        placed++;
        break;
      }
    }
  }
  // None under a drowned storey's water (S8): a torch does not burn there.
  return L.flood === undefined ? out : out.filter((t) => t.y > L.flood! + 0.2);
}

/** A crack's daylight hangs this far under a cavern's roof (m). */
const CRACK_DOWN = 3;
/** Under a shaft the daylight hangs this high over the floor (m), so it lies on the floor in a pool. */
const SHAFT_UP = 7;

/** The seed of a cave's rock and features (cellars.ts carves it with the same). */
export const caveSeed = (c: Cellar): number => deriveSeed(c.decision.seed, 'cave', 'rock');

/**
 * Where a natural cave's daylight falls in (pure): down the shaft through a cavern's roof onto its floor
 * (caveFeatures.ts), and through a crack high in the roof of every cavern (a room three storeys high or more)
 * over its middle. A cave without caverns has none (the lantern alone).
 */
export function caveGlows(c: Cellar): { x: number; y: number; z: number }[] {
  if (c.form.space.torches || !c.form.space.carved) return [];
  const { cell, storey } = c.layout.scale;
  const shafts = caveFeatures(c.layout, caveSeed(c)).shafts;
  return [
    ...shafts.map((s) => ({ x: s.x, y: s.floor + SHAFT_UP, z: s.z })),
    ...c.layout.rooms.flatMap((r) => {
      const h = c.graph.rooms[r.id]?.height ?? 1;
      return h >= 3 ? [{ x: (r.x + r.w / 2) * cell, y: (r.level + h) * storey - CRACK_DOWN, z: (r.z + r.d / 2) * cell }] : [];
    }),
  ];
}

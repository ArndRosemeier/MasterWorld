/**
 * Where a cellar's torches hang (pure): a sconce on the wall beside a doorway, about one a room (two in a
 * big room), at shoulder height, so every way in is lit from the side. cellarMesh draws the sconces; the
 * lights and flames hang on the same spots.
 */
import { DIRS } from '@futuremagic/dungeon';
import { cellIn, type Cellar } from './cellar';

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
  return out;
}

/**
 * A cave lock drawn (D63, phase K6; pure): the shut way of a story, as the old caves drew it but as wide as the cave is where it stands
 * (world/cave/locks.ts): a boulder wedged in the gap with smaller stones jammed round it, an iron grate leaded into the rock, stones
 * stacked dry across the way. Each is a piece of its own for the view to open on screen (rule 11): the boulder tumbles away, the
 * grate swings, the stones topple. Seeded by the cave and the link.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { CAVE_ROCK, DOOR_H, IRON, type DoorPiece } from '../dungeon/cellarMesh';
import { BuildingMat as M, MeshKit, WildMat, scaleTint, varyTint } from '../dungeon/meshKit';
import type { CaveLock } from './locks';

/** The piece for a lock of the cave whose seed is `seed`: its mesh in the cave's frame, where it stands and how it opens. */
export function lockPiece(l: CaveLock, seed: number): DoorPiece {
  const kit = new MeshKit(), rng = new Rng(deriveSeed(seed, 'lock', l.link)), { x, y, z, tx, tz, width: w } = l;
  // Along the wall (across the way), and the yaw that turns a box's width that way.
  const ux = -tz, uz = tx, yaw = Math.atan2(ux, uz) - Math.PI / 2, high = Math.min(l.height - 0.2, DOOR_H + 1.2);
  const tone = (k: number) => scaleTint(CAVE_ROCK, rng.range(0.82, 1) * k);
  let opens: DoorPiece['opens'] = 'push', hinge: [number, number, number] | undefined;
  if (l.kind === 'secret') {
    // Stones stacked dry across the way, in courses that break their joints, to the height of a doorway or more.
    const rows = Math.ceil(high / 0.46), across = Math.ceil(w / 0.42);
    for (let row = 0; row < rows; row++) for (let s = 0; s < across; s++) {
      const u = (s - (across - 1) / 2) * 0.42 + (row % 2) * 0.2;
      kit.stone(x + ux * u, y + row * 0.46 - 0.05, z + uz * u, 0.46, 0.5, 0.5, yaw + rng.range(-0.15, 0.15), WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.1), rng, 0.05, 0.4);
    }
  } else if (l.kind === 'oneway') {
    // A boulder rolled into the gap from beyond and wedged there; a smaller one jammed at its shoulder and stones in its lee.
    kit.stone(x + tx * 0.35, y - 0.3, z + tz * 0.35, w + 0.8, high + 0.5, 1.9, yaw + rng.range(-0.5, 0.5), WildMat.Rock, tone(1), rng, 0.2, 0.88);
    const side = rng.chance(0.5) ? 1 : -1;
    kit.stone(x + ux * side * (w / 2 + 0.1) + tx * 0.2, y + high * 0.4, z + uz * side * (w / 2 + 0.1) + tz * 0.2, 0.9, 0.8, 0.9, rng.range(0, 3), WildMat.Rock, tone(0.92), rng, 0.12, 0.8);
    for (let n = 0; n < 3 + Math.round(w); n++) {
      const s = rng.range(-1, 1) * (w / 2 + 0.2), d = rng.range(0.7, 1.1);
      kit.stone(x + ux * s + tx * d, y - 0.05, z + uz * s + tz * d, rng.range(0.3, 0.5), rng.range(0.25, 0.45), rng.range(0.3, 0.5), rng.range(0, 3), WildMat.Rock, varyTint(rng, CAVE_ROCK, 0.1), rng, 0.06, 0.4);
    }
  } else {
    // An iron grate leaded into the rock, chained and locked; it swings on its post at one side.
    opens = 'swing';
    const bars = Math.round(w * 3.5), post = w / 2 + 0.15;
    hinge = [x - ux * post, y, z - uz * post];
    for (let s = 0; s <= bars; s++) { const u = (s / bars - 0.5) * w; kit.box(x + ux * u, y - 0.1, z + uz * u, 0.05, high + 0.4, 0.05, yaw, M.Slate, IRON); }
    for (const h of [0.35, high * 0.55, high + 0.1]) kit.box(x, y + h, z, w + 0.3, 0.06, 0.06, yaw, M.Slate, IRON);
    kit.box(x + ux * (w / 2 - 0.2) - tx * 0.06, y + 1.05, z + uz * (w / 2 - 0.2) - tz * 0.06, 0.16, 0.14, 0.06, yaw, M.Slate, IRON);
    kit.box(x - ux * (w / 2 + 0.05), y - 0.1, z - uz * (w / 2 + 0.05), 0.14, high + 0.5, 0.2, yaw, M.Slate, IRON);
  }
  return { link: l.link, kind: l.kind, mesh: kit.mesh(), at: [x, y, z], through: [tx, tz], opens, ...(hinge ? { hinge } : {}) };
}

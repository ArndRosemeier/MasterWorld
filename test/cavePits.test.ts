import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves } from './support/formedCave';
import { formedWorld } from '../src/game/formedWorld';
import { caveWater } from '../src/world/cave/water';
import type { BrickField } from '../src/world/dungeon/rockMesh';
import { pitReport } from '../tools/loop/pitCheck';

/** The smallest pit the concession opens (world/cave/concede.ts PIT_MIN): a nook of fewer cells (under about 1.5 m²) may still hold the hero. */
const NOOK = 4;

// Arnd 2026-11-17: in a hole in a cave, the hero could not climb out in any direction. Every place the game's walker gets to
// from the way in must let it climb back out (tools/loop/pitCheck.ts; `npm run loop:pits` measures many more caves).
for (const [rock, seed] of [['massive', 6], ['jointed', 5], ['thin-bedded', 1]] as const) {
  test(`cave pits: in a ${rock} cave (seed ${seed}) no hollow the hero can get into traps them`, () => {
    const { c, reading: g, dressing } = formedCave(seed, rock);
    const world = formedWorld(c.field as BrickField, undefined, caveWater(dressing, caves.dress.water.bed, caves.dress.water.poolDepth), dressing.ladders);
    const rep = pitReport(world, g), pits = rep.pits.filter((p) => p.cells >= NOOK);
    assert.ok(rep.reached > 0.9 * g.stats.reached, `the walker gets to ${rep.reached} of the ${g.stats.reached} cells the reader reached`);
    assert.equal(pits.length, 0, `trapped: ${pits.map((p) => `${p.cells} cells at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`).join('; ')}`);
    assert.ok(rep.trapped <= 2 * NOOK, `${rep.trapped} cells in nooks`);
  });
}

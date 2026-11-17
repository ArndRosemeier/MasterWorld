/**
 * The pit check over many formed caves (Arnd 2026-11-17: the hero in a hole in a cave, unable to climb out in any direction):
 * in each kind of cave on several seeds, every place the game's Walker can get to from the way in must let it climb back out
 * (tools/loop/pitCheck.ts). `npm run loop:pits [-- seeds]` (`VERBOSE=1` lists every cave and the climbs that failed; `STRICT=1`
 * exits 1 when any cave holds a trap of `PIT` cells or more). Headless, about 25 s for 8 seeds.
 * test/cavePits.test.ts holds three caves to no trap at all in `npm test`.
 *
 * Measured 2026-11-17 on seeds 1-8 of every rock (40 caves) after the climb and the concession were made generous: no trap in
 * the lava tubes and mines; of the 24 solution caves 14 have none, seven only nooks of 1-3 cells (under 1.5 m², smaller than the
 * concession opens), and three more: jointed 4 (a 29-cell pit only drops of 6-10 m lead into, which the concession finds no way
 * to open), jointed 6 (6 cells) and jointed 7 (pits of 4-13 cells whose few ways out the walker misses). Before: up to 1700
 * cells of a cave trapped, and climbs over 3 m failed four times in five. `loop:caves` went from 2, 2 and 4 of 6 solution
 * caves walked in and out to 5, 4 and 5.
 */
import { classic } from '../../src/setting/classic/index';
import { caveWater } from '../../src/world/cave/water';
import { formedWorld } from '../../src/game/formedWorld';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';
import type { BrickField } from '../../src/world/dungeon/rockMesh';
import { pitReport } from './pitCheck';

const caves = classic.caves!, seeds = Number(process.argv[2] ?? 8);
/** The block's size (as the unit tests' and loop:caves'). */
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
/** A trap of this many cells (about 3 m², a body can stand in it) or more fails the strict check. */
const PIT = 8;

let worst = 0, failed = false;
for (const rock of ['massive', 'jointed', 'thin-bedded', 'basalt', 'hard-rock']) {
  for (let seed = 1; seed <= seeds; seed++) {
    const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), r = readFormed(c, caves, dressFormed(c, caves)), g = r.reading;
    const world = formedWorld(c.field as BrickField, undefined, caveWater(r.dressing, caves.dress.water.bed, caves.dress.water.poolDepth), r.dressing.ladders);
    const rep = pitReport(world, g), big = rep.pits.filter((p) => p.cells >= PIT);
    worst = Math.max(worst, rep.pits[0]?.cells ?? 0);
    if (big.length) failed = true;
    if (rep.trapped || process.env.VERBOSE) {
      console.log(`${rock} ${seed}: ${rep.trapped} of ${rep.reached} cells trapped (${rep.tried} climbs tried, ${rep.failed.length} failed, the reader's own count ${g.stats.trapped})${rep.pits.length ? `; pits ${rep.pits.slice(0, 6).map((p) => `${p.cells} at ${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}`).join(', ')}` : ''}`);
      if (process.env.VERBOSE) for (const f of rep.failed) console.log(`    failed: up ${f.rise.toFixed(1)} m from cell ${f.a} to ${f.b}`);
    }
  }
}
console.log(`largest trap: ${worst} cells`);
if (failed && process.env.STRICT) { console.log(`FAILED: a trap of ${PIT} cells or more`); process.exit(1); }

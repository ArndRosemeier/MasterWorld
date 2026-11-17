/**
 * The squeeze sweep (D63: no squeezing, ever): formed caves of every rock and size on many seeds, each formed, dressed and read
 * as the game makes it, then swept for mouths the hero sees from where they can go with air behind them they cannot get into
 * (world/cave/squeeze.ts): `low` (no standing ground behind: a slot, a crawl) and `beyond` (standing ground the concession did
 * not join). It also counts what the concession had to shut (slots left by what was cut, piled or fallen, before the last word).
 * `npm run caves:squeeze [-- seeds [rocks] [sizes]]`; fails when a low squeeze is left, or a part of the cave is cut off.
 * About 2 min for 6 seeds of the three solution rocks, small and medium, and the lava tubes and mines.
 */
import { classic } from '../../src/setting/classic/index';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';
import { findSqueezes } from '../../src/world/cave/squeeze';
import type { BrickField } from '../../src/world/dungeon/rockMesh';

const caves = classic.caves!;
const seeds = Number(process.argv[2] ?? 6), rocks = (process.argv[3] ?? 'massive,jointed,thin-bedded,basalt,hard-rock').split(','), sizes = (process.argv[4] ?? 'small,medium').split(',');
let low = 0, beyond = 0, sealed = 0, cutOff = 0, n = 0, worst = 0;
const t0 = Date.now();
for (const rock of rocks) for (const size of sizes) for (let seed = 1; seed <= seeds; seed++) {
  const t = Date.now(), c = formCave(caves, seed, rock, size), d = dressFormed(c, caves), r = readFormed(c, caves, d);
  const left = findSqueezes(c.field as BrickField, r.reading, c.skeleton, r.dressing), lo = left.filter((q) => q.kind === 'low'), by = left.filter((q) => q.kind === 'beyond');
  n++; low += lo.length; beyond += by.length; sealed += r.sealed.length; cutOff += r.reading.stats.cutOff; worst = Math.max(worst, Date.now() - t);
  const say = (q: (typeof left)[number]) => `${q.kind} ${q.volume.toFixed(0)} m3 ${q.deep.toFixed(1)} m deep at ${q.x.toFixed(0)},${q.y.toFixed(0)},${q.z.toFixed(0)}`;
  if (lo.length || by.length || r.sealed.length || r.reading.stats.cutOff || process.env.VERBOSE) console.log(`${rock} ${size} ${seed}: shut ${r.sealed.length}${r.sealed.length ? ` (${r.sealed.map((q) => `${q.volume.toFixed(0)} m3`).join(', ')})` : ''}, left ${left.length}${left.length ? `: ${left.map(say).join('; ')}` : ''}, cut off ${r.reading.stats.cutOff} cells, ${Date.now() - t} ms`);
}
console.log(`${n} caves in ${((Date.now() - t0) / 1000).toFixed(0)} s (slowest ${worst} ms): ${low} low squeezes left, ${beyond} spaces beyond a mouth too small, ${sealed} slots shut, ${cutOff} cells cut off`);
if (low || cutOff) process.exit(1);

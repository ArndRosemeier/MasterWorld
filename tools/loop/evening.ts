/**
 * The loop check (plan A6): a scripted hero plays evenings headless (game/evening.ts) in a few worlds, and
 * once goes down reckless to check a fall; then evenings in a village and a hamlet (plan B3a). `npm run loop [-- evenings seed...]`. A slow check (at most
 * 5 min), run in CI beside npm test and before every phase gate. Prints each step; exits 1 if an evening broke.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { playEvening, type EveningOptions } from '../../src/game/evening';

const evenings = Number(process.argv[2] ?? 6);
const seeds = process.argv.length > 3 ? process.argv.slice(3) : ['masterworld', 'alpha', 'x4'];
const clock = (h: number) => `day ${Math.floor(h / 24)} ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const runs: { seed: string; opts: EveningOptions; what: string }[] = [
  ...seeds.map((seed) => ({ seed, opts: { evenings }, what: `${evenings} evenings` })),
  { seed: seeds[0], opts: { evenings: 1, reckless: true }, what: 'a reckless evening (a fall)' },
  // A second town (plan B3a): the same game in a village out on the land, through the same code.
  { seed: seeds[0], opts: { evenings: 3, settlement: 'village' }, what: '3 evenings in a village' },
  { seed: seeds[1] ?? seeds[0], opts: { evenings: 2, settlement: 'hamlet' }, what: '2 evenings in a hamlet' },
];
let failed = 0;
const all = performance.now();
for (const { seed, opts, what } of runs) {
  console.log(`\n== ${seed}: ${what}`);
  const t0 = performance.now();
  const r = playEvening(parseSeed(seed), classic, { ...opts, log: (s) => console.log(`${clock(s.hour)}  ${s.what}`) });
  console.log(`${r.ok ? 'passed' : 'FAILED'}: ${r.cleared.length} places cleared, ${r.falls} falls, ${r.earned} copper earned, bought ${r.bought.join(', ') || 'nothing'}, lessons ${r.lessons.join(', ') || 'none'}, spent ${r.spent.join('/')} a night, purse ${r.purse}, power ${r.power[0]} -> ${r.power[1]}; ${(r.seconds / 60).toFixed(0)} min played in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (!r.ok) failed++;
}
console.log(`\n${failed ? `${failed} of ${runs.length} FAILED` : `all ${runs.length} passed`} in ${((performance.now() - all) / 1000).toFixed(1)} s`);
if (failed) process.exit(1);

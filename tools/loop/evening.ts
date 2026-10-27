/**
 * The loop check (plan A6): a scripted hero plays evenings headless (game/evening.ts) in a few worlds, and
 * once goes down reckless to check a fall; then evenings in a village and a hamlet (plan B3a), and a mage (C3). `npm run loop [-- evenings seed...]`. A slow check (at most
 * 5 min), run in CI beside npm test and before every phase gate. Prints each step; exits 1 if an evening broke.
 * The runs play side by side, one process each (as many at once as there are cores); their logs print in order.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
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
  // A mage (plan C3): asks the bard, opens a school at its teacher and casts in the first place.
  { seed: seeds[2] ?? seeds[0], opts: { evenings: 3, mage: true }, what: '3 evenings as a mage' },
];

/** Play one run here; true if it passed. */
function play(i: number): boolean {
  const { seed, opts, what } = runs[i];
  console.log(`\n== ${seed}: ${what}`);
  const t0 = performance.now();
  const r = playEvening(parseSeed(seed), classic, { ...opts, log: (s) => console.log(`${clock(s.hour)}  ${s.what}`) });
  console.log(`${r.ok ? 'passed' : 'FAILED'}: ${r.cleared.length} places cleared, ${r.falls} falls, ${r.earned} copper earned, bought ${r.bought.join(', ') || 'nothing'}, lessons ${r.lessons.join(', ') || 'none'}, opened ${r.opened.join(', ') || 'none'}, spent ${r.spent.join('/')} a night, purse ${r.purse}, power ${r.power[0]} -> ${r.power[1]}${r.spells ? `, ${r.spells} spells cast` : ''}; plays like a ${r.style ?? 'newcomer'} (challenge x${r.challengeLean.toFixed(2)}); longest overdue ${Object.entries(r.overdue).map(([n, s]) => `${n} ${(s / 60).toFixed(1)}`).join(', ')} min; ${(r.seconds / 60).toFixed(0)} min played in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return r.ok;
}

/** Run i in its own process: its whole log, and whether it passed. */
function child(i: number): Promise<{ out: string; ok: boolean }> {
  return new Promise((done) => {
    const p = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { env: { ...process.env, LOOP_RUN: String(i) } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ out, ok: code === 0 }));
  });
}

const all = performance.now();
const one = process.env.LOOP_RUN;
if (one !== undefined) {
  process.exit(play(Number(one)) ? 0 : 1);
} else {
  const results: Promise<{ out: string; ok: boolean }>[] = [];
  let next = 0;
  const slots = Math.max(1, Math.min(runs.length, availableParallelism()));
  const start = (): void => {
    if (next >= runs.length) return;
    const p = child(next++);
    results.push(p);
    void p.then(start);
  };
  for (let k = 0; k < slots; k++) start();
  let failed = 0;
  for (let i = 0; i < runs.length; i++) {
    while (results.length <= i) await new Promise((r) => setTimeout(r, 50));
    const r = await results[i];
    process.stdout.write(r.out);
    if (!r.ok) failed++;
  }
  console.log(`\n${failed ? `${failed} of ${runs.length} FAILED` : `all ${runs.length} passed`} in ${((performance.now() - all) / 1000).toFixed(1)} s`);
  if (failed) process.exit(1);
}

/**
 * The loop check (plan A6): a scripted hero plays evenings headless (game/evening.ts) in a few worlds, and
 * once goes down reckless to check a fall; then evenings in a village, a hamlet (plan B3a) and the capital (C15), and a mage (C3). `npm run loop [-- evenings seed...]`. A slow check (at most
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
  // The level a run ends at is printed, not held to a band (Arnd 2026-10-30: these runs are artificial; he judges
  // progression in play). `levels` stays for a run by hand.
  // The start towns stand by the sea (Arnd 2026-10-30): these runs are the harbour town's (S2), its tavern on the quay.
  ...seeds.map((seed) => ({ seed, opts: { evenings }, what: `${evenings} evenings` })),
  { seed: seeds[0], opts: { evenings: 1, reckless: true }, what: 'a reckless evening (a fall)' },
  // A second town (plan B3a): the same game in a village out on the land, through the same code.
  { seed: seeds[0], opts: { evenings: 3, settlement: 'village' }, what: '3 evenings in a village' },
  { seed: seeds[1] ?? seeds[0], opts: { evenings: 2, settlement: 'hamlet' }, what: '2 evenings in a hamlet' },
  // The capital (C15): an evening in the first city, its 700 houses and 2700 people.
  { seed: seeds[0], opts: { evenings: 1, settlement: 'capital' }, what: 'an evening in the capital' },
  // Coverage (gate Q): the kinds of task that come by chance in the runs above, each played end to end at least once.
  ...(['parley', 'thief', 'watch'] as const).map((kind) => ({ seed: seeds[0], opts: { evenings: 3, only: [kind] }, what: `3 evenings asking ${kind} where it fits` })),
  // A household that lied about whose heirloom it is (Q3): the seed is one where the first fetches turn out so.
  { seed: 'x4', opts: { evenings: 3, only: ['heirloom'] }, what: '3 evenings asking heirloom (a lie)' },
  // A mage (plan C3): asks the bard, opens a school at its teacher and casts in the first place.
  { seed: seeds[2] ?? seeds[0], opts: { evenings: 3, mage: true }, what: '3 evenings as a mage' },
];

/** Play one run here; true if it passed. */
function play(i: number): boolean {
  const { seed, opts, what } = runs[i];
  console.log(`\n== ${seed}: ${what}`);
  const t0 = performance.now();
  const r = playEvening(parseSeed(seed), classic, { ...opts, log: (s) => console.log(`${clock(s.hour)}  ${s.what}`) });
  console.log(`${r.ok ? "passed" : "FAILED"}: ${r.cleared.length} places cleared (asked: ${r.verbs.join(", ")}${r.twists.length ? `; twists: ${r.twists.join(", ")}` : ""}${r.consequences.length ? `; consequences: ${r.consequences.join(", ")}` : ""}${r.wants.length ? `; wants: ${r.wants.join(", ")}` : ""}), ${r.falls} falls, ${r.earned} copper earned, bought ${r.bought.join(', ') || 'nothing'}, learned ${r.lessons.join(', ') || 'nothing'}, spent ${r.spent.join('/')} a night, purse ${r.purse}, power ${r.power[0]} -> ${r.power[1]}, level ${r.level} (${r.xp} xp)${r.spells ? `, ${r.spells} spells cast` : ''}; plays like a ${r.style ?? 'newcomer'} (challenge x${r.challengeLean.toFixed(2)}); longest overdue ${Object.entries(r.overdue).map(([n, s]) => `${n} ${(s / 60).toFixed(1)}`).join(', ')} min; ${(r.seconds / 60).toFixed(0)} min played in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const met = (): boolean => {
    const kinds = r.verbs.filter((v) => !/\((dwellers|task|deed|other)\)$/.test(v)).map((v) => v.split(' ')[0]);
    return r.ok && new Set(kinds).size >= 3 && kinds.every((v, k) => k === 0 || v !== kinds[k - 1]) && r.twists.length > 0 && r.consequences.length > 0 && r.wants.length > 0;
  };
  console.log(`GATEQ ${JSON.stringify({ met: met(), ok: r.ok, verbs: r.verbs.map((v) => v.split(' ')[0]), wants: r.wants, twists: r.twists, consequences: r.consequences })}`);
  if (met()) console.log('gate Q: met (3+ kinds of task, none twice in a row, a twist, a consequence, a want, replayed from the log)');
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
  // Gate Q is held by the check (the plan thread's review, 2026-11-01): the variety must not rot unseen.
  const seen = results.length ? await Promise.all(results) : [];
  const gate = seen.flatMap((r) => r.out.split('\n').filter((l) => l.startsWith('GATEQ ')).map((l) => JSON.parse(l.slice(6)) as { met: boolean; verbs: string[]; wants: string[]; twists: string[] }));
  const have = (f: (g: (typeof gate)[number]) => string[]) => new Set(gate.flatMap(f));
  const missing: string[] = [];
  for (const v of ['clear', 'fetch', 'lost', 'seal', 'parley', 'watch', 'thief']) if (!have((g) => g.verbs).has(v)) missing.push(`no run asked ${v}`);
  if (have((g) => g.wants).size < 3) missing.push(`only ${have((g) => g.wants).size} kinds of want across the runs (at least 3)`);
  if (have((g) => g.twists).size < 3) missing.push(`only ${[...have((g) => g.twists)].join(', ') || 'no'} twists (first, changed and lied)`);
  if (!gate.some((g) => g.met)) missing.push('no run met gate Q (3+ kinds of task, no repeat, a twist, a consequence, a want)');
  for (const m of missing) console.log(`GATE Q FAILED: ${m}`);
  if (missing.length) failed++;
  else console.log(`gate Q holds across the runs: verbs ${[...have((g) => g.verbs)].join(', ')}; wants ${[...have((g) => g.wants)].join(', ')}; twists ${[...have((g) => g.twists)].join(', ')}`);
  console.log(`\n${failed ? `${failed} of ${runs.length} FAILED` : `all ${runs.length} passed`} in ${((performance.now() - all) / 1000).toFixed(1)} s`);
  if (failed) process.exit(1);
}

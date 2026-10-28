/**
 * `npm test`: the test files in a few processes side by side (one per core), each running its share of the files one
 * after the other in one process (`--test-isolation=none`). The modules are loaded and compiled once per process, not
 * once per file, which halves the time (MW: 47 s down to about 25 s on 4 cores). Files share their process, so a test
 * file never changes what another one sees: a fixture it changes is its own (test/frontierLand.ts).
 *
 * The shares are balanced by each file's time last measured (tools/test/times.json; `--save-times` writes it anew).
 * `npm test -- test/town.test.ts` runs the files given; TEST_PROCS=n sets how many processes. One test may take 5 s
 * (docs/CHECKS.md).
 */
import { spawn } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PATTERNS = ['test/**/*.test.ts', 'tools/**/*.test.mjs'];
const TIMES = 'tools/test/times.json';
const argv = process.argv.slice(2);
const save = argv.includes('--save-times');
const flags = argv.filter((a) => a.startsWith('--') && a !== '--save-times');
const given = argv.filter((a) => !a.startsWith('--'));
const files = [...new Set((given.length ? given : PATTERNS).flatMap((p) => globSync(p)))]
  .map((f) => f.split(path.sep).join('/')).filter((f) => !f.includes('node_modules/')).sort();

let known = {};
try { known = JSON.parse(readFileSync(TIMES, 'utf8')); } catch { /* no times yet: all alike */ }
// A file's own setup is not in its time: each counts a little more than its tests.
const guess = (f) => (known[f] ?? 1) + 0.3;

// Heaviest first, each to the share with the least so far.
const k = Math.max(1, Math.min(files.length, Number(process.env.TEST_PROCS) || os.availableParallelism()));
const shares = Array.from({ length: k }, () => ({ files: [], weight: 0 }));
for (const f of [...files].sort((a, b) => guess(b) - guess(a) || a.localeCompare(b))) {
  const s = shares.reduce((a, b) => (b.weight < a.weight ? b : a));
  s.files.push(f);
  s.weight += guess(f);
}

const isolation = Number(process.versions.node.split('.')[0]) >= 23 ? '--test-isolation=none' : '--experimental-test-isolation=none';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'mw-test-'));
const t0 = performance.now();
const runs = shares.filter((s) => s.files.length).map((s, i) => new Promise((done) => {
  const out = path.join(tmp, `times-${i}.json`);
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--test', isolation, '--test-timeout=5000',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=./tools/test/times.mjs', `--test-reporter-destination=${out}`,
    ...flags, ...s.files,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  child.stdout.on('data', (d) => log.push(d));
  child.stderr.on('data', (d) => log.push(d));
  child.on('close', (code, signal) => {
    const secs = (performance.now() - t0) / 1000;
    let res = { per: {}, pass: 0, fail: 0 };
    try { res = JSON.parse(readFileSync(out, 'utf8')); } catch { /* it died before its reporter wrote */ }
    process.stdout.write(`\n── share ${i + 1} of ${k}: ${s.files.length} files, ${res.pass} passed, ${res.fail} failed, ${secs.toFixed(1)} s ──\n`);
    process.stdout.write(Buffer.concat(log));
    done({ ok: code === 0 && !signal, files: s.files, ...res, secs });
  });
}));
const results = await Promise.all(runs);
rmSync(tmp, { recursive: true, force: true });

const per = Object.assign({}, ...results.map((r) => r.per));
const pass = results.reduce((a, r) => a + r.pass, 0), fail = results.reduce((a, r) => a + r.fail, 0);
const slow = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, t]) => `${f} ${t.toFixed(1)} s`);
const secs = (performance.now() - t0) / 1000;
console.log(`\n${files.length} files in ${k} processes: ${pass} passed, ${fail} failed, ${secs.toFixed(1)} s (shares ${results.map((r) => r.secs.toFixed(0)).join(', ')} s)`);
console.log(`slowest files: ${slow.join(', ')}`);
if (save) {
  const all = given.length ? { ...known, ...per } : Object.fromEntries(files.map((f) => [f, per[f] ?? known[f] ?? 1]));
  const round = Object.fromEntries(Object.entries(all).sort().map(([f, t]) => [f, Math.round(t * 100) / 100]));
  writeFileSync(TIMES, JSON.stringify(round, null, 1) + '\n');
  console.log(`wrote ${TIMES}`);
}
process.exitCode = results.every((r) => r.ok) ? 0 : 1;

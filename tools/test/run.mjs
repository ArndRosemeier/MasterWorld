/**
 * `npm test`: the test files in a few processes side by side (one per core), each running its share of the files one
 * after the other in one process (`--test-isolation=none`). The modules are loaded and compiled once per process, not
 * once per file, which halves the time (MW: 47 s down to about 25 s on 4 cores). Files share their process, so a test
 * file never changes what another one sees: a fixture it changes is its own (test/frontierLand.ts).
 *
 * The files are dealt out as the processes come to them, heaviest first by each file's time last measured (tools/test/times.json; `--save-times` writes it anew).
 * `npm test -- test/town.test.ts` runs the files given; `npm test -- --changed=origin/main` the files a change can break; TEST_PROCS=n sets how many processes. One test may take 5 s
 * (docs/CHECKS.md).
 */
import { spawn } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PATTERNS = ['test/**/*.test.ts', 'tools/**/*.test.mjs'];
const TIMES = 'tools/test/times.json';
const argv = process.argv.slice(2);
const save = argv.includes('--save-times');
// `--changed=<ref>`: only the files a change since <ref> can break (tools/test/affected.mjs; everything when it is unsure).
const changed = argv.find((a) => a.startsWith('--changed='))?.slice('--changed='.length);
const flags = argv.filter((a) => a.startsWith('--') && a !== '--save-times' && !a.startsWith('--changed='));
let given = argv.filter((a) => !a.startsWith('--'));
if (changed) {
  const { affected, changedFiles } = await import('./affected.mjs');
  const res = await affected(changedFiles(changed));
  console.log(`--changed=${changed}: ${res.full ? `everything (${res.why})` : `${res.tests.length} test files (${res.why})`}`);
  if (!res.full) {
    if (!res.tests.length) { console.log('no test file reaches what changed'); process.exit(0); }
    given = res.tests;
  }
}
const files = [...new Set((given.length ? given : PATTERNS).flatMap((p) => globSync(p)))]
  .map((f) => f.split(path.sep).join('/')).filter((f) => !f.includes('node_modules/')).sort();

let known = {};
try { known = JSON.parse(readFileSync(TIMES, 'utf8')); } catch { /* no times yet: all alike */ }
// (A file's time is its setup at the top and its tests; a file not measured yet counts 1 s.)
const guess = (f) => known[f] ?? 1;

// Every process gets the same list of wrappers, heaviest first, and takes each file not yet taken when its turn comes
// (tools/test/claim.mjs): a process that finishes early takes the next file, so they all end together.
const k = Math.max(1, Math.min(files.length, Number(process.env.TEST_PROCS) || os.availableParallelism()));
const ordered = [...files].sort((a, b) => guess(b) - guess(a) || a.localeCompare(b));

const isolation = Number(process.versions.node.split('.')[0]) >= 23 ? '--test-isolation=none' : '--experimental-test-isolation=none';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'mw-test-'));
const claims = path.join(tmp, 'claims'), tiles = path.join(tmp, 'tiles');
mkdirSync(claims);
mkdirSync(tiles);
const wrapUrl = pathToFileURL(path.resolve('tools/test/claim.mjs')).href;
const stubs = ordered.map((f, i) => {
  const stub = path.join(tmp, `${String(i).padStart(3, '0')}.mjs`);
  writeFileSync(stub, `import { wrap } from ${JSON.stringify(wrapUrl)};\nwrap(${JSON.stringify(claims)}, ${JSON.stringify(f)}, ${JSON.stringify(pathToFileURL(path.resolve(f)).href)});\n`);
  return stub;
});
const t0 = performance.now();
const runs = Array.from({ length: k }, (_, i) => new Promise((done) => {
  const out = path.join(tmp, `times-${i}.json`);
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--import', './tools/test/tileStore.mjs', '--test', isolation, '--test-timeout=5000',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=./tools/test/times.mjs', `--test-reporter-destination=${out}`,
    ...flags, ...stubs,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MW_TILE_STORE: tiles } });
  const log = [];
  child.stdout.on('data', (d) => log.push(d));
  child.stderr.on('data', (d) => log.push(d));
  child.on('close', (code, signal) => {
    const secs = (performance.now() - t0) / 1000;
    let res = { pass: 0, fail: 0 };
    try { res = JSON.parse(readFileSync(out, 'utf8')); } catch { /* it died before its reporter wrote */ }
    // (The wrappers of files another process took are skipped: not shown.)
    const text = Buffer.concat(log).toString().split('\n').filter((l) => !l.includes('# taken') && !/^\s+✔ barrier /.test(l)).join('\n');
    process.stdout.write(`\n── process ${i + 1} of ${k}: ${res.pass} passed, ${res.fail} failed, ${secs.toFixed(1)} s ──\n${text}`);
    done({ ok: code === 0 && !signal, ...res, secs });
  });
}));
const results = await Promise.all(runs);
// Each file's seconds, its setup at the top included (written by its wrapper).
const per = {};
for (const f of files) {
  try { per[f] = Number(readFileSync(path.join(claims, encodeURIComponent(f), 'ms'), 'utf8')) / 1000; } catch { /* not run */ }
}
rmSync(tmp, { recursive: true, force: true });
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

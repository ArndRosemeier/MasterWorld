/**
 * Which tests and slow simulations a change can break (docs/CHECKS.md, "What a PR runs").
 *
 *   node tools/test/affected.mjs [--base <ref>] [--files a,b,c] [--github-output]
 *
 * A pull request runs only the tests whose imports (their import closure, read by esbuild) reach a file it changed;
 * a push to main, a manual run and anything this script is unsure of runs everything. Be unsure, not wrong:
 *   - a changed file outside src/, test/, docs/ and the dev tools (a dependency, the lockfile, the submodule pin,
 *     public/ assets, the CI files, the test runner) runs everything;
 *   - a test that reads files (a source scan, a data pack) depends on what it reads (`READS`, found in its text; a
 *     directory built with `${}` counts as the whole directory);
 *   - package.json counts only where its dependencies changed.
 * Prints JSON: { full, why, tests, sims } where `sims` names the slow simulations to run (the CI matrix names).
 * `npm test -- --changed [ref]` runs the tests it names. Its own test: tools/test/affected.test.mjs.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The slow simulations: the entry each one starts from, and its CI job (name, command, warning seconds). */
export const SIM_JOBS = {
  variety: { entry: 'tools/variety/cellars.ts', name: 'Dungeon variety', run: 'npm run variety', warn: 90 },
  evening: { entry: 'tools/loop/evening.ts', name: 'The evening loop (evenings)', run: 'npm run loop:evening', warn: 90 },
  voyage: { entry: 'tools/loop/voyage.ts', name: 'The evening loop (voyage)', run: 'npm run loop:voyage', warn: 60 },
  fray: { entry: 'tools/loop/fray.ts', name: 'The evening loop (fray)', run: 'npm run loop:fray', warn: 60 },
  walk: { entry: 'tools/loop/landformWalk.ts', name: 'A landform every minute of walking (gate L)', run: 'npm run walk:landforms', warn: 60 },
};
const SIMS = Object.fromEntries(Object.entries(SIM_JOBS).map(([k, v]) => [k, v.entry]));
/** Changes that can break anything and are not read through an import: run everything. */
const EVERYTHING = /^(package-lock\.json|tsconfig[^/]*\.json|vite\.config\.ts|\.gitmodules|vendor\/|\.github\/|public\/|tools\/props\/|tools\/test\/(affected|run|claim|tileStore|times)\.mjs$|tools\/guards\/(rules\.json|pins\.mjs|budget\.mjs)$)/;
/** Changes that cannot break a test or a simulation. */
const NOTHING = /^(docs\/|shots\/|reports\/|[^/]*\.md$|tools\/test\/times\.json$|tools\/(shot|preview|packs|zfight|ground|water|units)\/(?!.*\.test\.mjs$)|\.gitignore$)/;
/** Tools tests depend on their own tool's folder (they run the tool); the guards' scan reads all of src and the shared packages. */
const TOOL_DEPS = { 'tools/guards/guards.test.mjs': ['src/', 'vendor/assetgenerator/packages/core/src/', 'vendor/assetgenerator/packages/stage/src/', 'tools/guards/', 'tools/duplicate-candidates/', 'tools/repeated-code/'] };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

/** Every test file and simulation entry with the files it imports, directly or not (repo-relative). */
export async function closures(entries) {
  const { build } = await import('esbuild');
  const r = await build({
    entryPoints: entries, bundle: true, splitting: true, write: false, metafile: true, outdir: 'out', platform: 'node',
    format: 'esm', packages: 'external', logLevel: 'silent', absWorkingDir: root,
  });
  const g = r.metafile.inputs, out = {};
  for (const e of entries) {
    const seen = new Set(), stack = [e];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f) || !g[f]) continue;
      seen.add(f);
      for (const i of g[f].imports) if (!i.external) stack.push(i.path);
    }
    out[e] = seen;
  }
  return out;
}

/** What a test file reads from the repo besides its imports: [prefix] paths found in its text. */
export function readsOf(text) {
  if (!/readFileSync|readdirSync|globSync|existsSync/.test(text)) return [];
  const found = new Set();
  for (const m of text.matchAll(/['"`]((?:\.\.\/)*(?:src|docs|public|tools|node_modules)\/[^'"`]*)['"`]/g)) found.add(m[1].replace(/^(\.\.\/)+/, '').split('${')[0]);
  return [...found];
}

/** The files a change touched: `git diff --name-only <base>`, with package.json looked at only for its dependencies. */
export function changedFiles(base) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const files = git('diff', '--name-only', base).split('\n').filter(Boolean);
  return files.filter((f) => {
    if (f !== 'package.json') return true;
    try {
      const dep = (s) => { const j = JSON.parse(s); return JSON.stringify([j.dependencies, j.devDependencies, j.overrides, j.engines]); };
      return dep(git('show', `${base}:package.json`)) !== dep(readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch { return true; }
  });
}

export async function affected(files) {
  const tests = globSync(['test/**/*.test.ts', 'tools/**/*.test.mjs'], { cwd: root }).map((f) => f.split(path.sep).join('/')).filter((f) => !f.includes('node_modules/')).sort();
  const all = { full: true, tests, sims: Object.keys(SIMS) };
  if (files === null) return { ...all, why: 'everything asked for' };
  const hit = files.find((f) => EVERYTHING.test(f));
  if (hit) return { ...all, why: `${hit} can break anything` };
  const rest = files.filter((f) => !NOTHING.test(f));
  const odd = rest.find((f) => !/^(src|test|tools)\//.test(f));
  if (odd) return { ...all, why: `${odd} is not a file the tests are known to read` };
  let clos;
  try { clos = await closures([...tests.filter((t) => t.endsWith('.ts')), ...Object.values(SIMS)]); } catch (e) { return { ...all, why: `the imports could not be read (${String(e.message).split('\n')[0]})` }; }
  const dependsOn = (deps, f) => deps.has(f) || [...deps].some((d) => d.endsWith('/') && f.startsWith(d));
  const pick = (name) => {
    const deps = new Set(clos[name] ?? []);
    if (name.startsWith('tools/')) { deps.add(name); deps.add(name.split('/').slice(0, 2).join('/') + '/'); }
    for (const d of TOOL_DEPS[name] ?? []) deps.add(d);
    for (const d of readsOf(readFileSync(path.join(root, name), 'utf8'))) deps.add(d);
    return rest.some((f) => dependsOn(deps, f));
  };
  const picked = tests.filter(pick);
  const sims = Object.keys(SIMS).filter((s) => pick(SIMS[s]));
  return { full: false, why: `${rest.length} changed files`, tests: picked, sims };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const files = val('--files') ? val('--files').split(',').filter(Boolean) : val('--base') ? changedFiles(val('--base')) : null;
  const res = await affected(files);
  console.error(`${res.full ? 'everything' : `${res.tests.length} of the test files`}, simulations: ${res.sims.join(', ') || 'none'} (${res.why})`);
  if (a.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `sims=${JSON.stringify(res.sims)}\nmatrix=${JSON.stringify(res.sims.map((k) => { const { name, run, warn } = SIM_JOBS[k]; return { name, run, warn }; }))}\nfull=${res.full}\n`);
  }
  console.log(JSON.stringify(res));
}

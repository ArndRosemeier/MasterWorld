import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affected, readsOf } from './affected.mjs';

test('affected: docs and dev tools run nothing; a render-only file only the tests that reach it', async () => {
  const docs = await affected(['docs/CHECKS.md', 'tools/shot/set.mjs', 'shots/x.png']);
  assert.deepEqual([docs.full, docs.tests, docs.sims], [false, [], []]);
  const gaits = await affected(['src/render/folk/gaits.ts']);
  assert.equal(gaits.full, false);
  assert.ok(gaits.tests.includes('test/gaits.test.ts') && gaits.tests.length < 20 && !gaits.sims.length, gaits.tests.join());
});

test('affected: the land runs the world tests and the simulations; a test file runs itself', async () => {
  const land = await affected(['src/world/terrain.ts']);
  assert.ok(land.tests.includes('test/terrain.test.ts') && land.tests.includes('test/capital.test.ts'));
  assert.ok(land.sims.includes('evening') && land.sims.includes('walk'));
  const own = await affected(['test/gaits.test.ts']);
  assert.deepEqual(own.tests, ['test/gaits.test.ts']);
});

test('affected: what it cannot place runs everything', async () => {
  for (const f of ['vendor/assetgenerator', 'package-lock.json', '.github/workflows/ci.yml', 'public/props/cellar.fmpk', 'tools/test/run.mjs', 'Dockerfile']) {
    const r = await affected([f]);
    assert.equal(r.full, true, f);
    assert.ok(r.tests.length > 150 && r.sims.length === 5, f);
  }
  assert.equal((await affected(null)).full, true);
});

test('affected: a test that reads source files depends on what it reads', async () => {
  assert.deepEqual(readsOf("readFileSync(new URL('../src/main.ts', import.meta.url))"), ['src/main.ts']);
  assert.deepEqual(readsOf('readdirSync(new URL(`../src/${d}/`, import.meta.url))'), ['src/']);
  assert.deepEqual(readsOf("import x from '../src/world/a'"), []);
  const main = await affected(['src/main.ts']);
  assert.ok(main.tests.includes('test/situations.test.ts') && main.tests.includes('test/caveMine.test.ts'));
});

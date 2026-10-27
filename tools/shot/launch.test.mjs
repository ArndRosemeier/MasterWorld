import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pinSeed, stalePacks } from './launch.mjs';

const installed = JSON.parse(readFileSync('node_modules/@actors/generator/package.json', 'utf8')).version;
const dist = (version) => {
  const d = mkdtempSync(join(tmpdir(), 'mw-dist-'));
  if (version) {
    mkdirSync(join(d, 'packs/human'), { recursive: true });
    writeFileSync(join(d, 'packs/human/.selection'), JSON.stringify({ version }));
  }
  return d;
};

test('packs from the installed Actors are fresh; older or none are stale', () => {
  assert.equal(stalePacks(dist(installed)), '');
  assert.match(stalePacks(dist('0.0.1')), /from Actors 0\.0\.1/);
  assert.match(stalePacks(dist()), /from Actors none/);
});

test('every page a check opens starts in a pinned world', async () => {
  const scripts = [];
  const fake = {
    newContext: async () => ({ addInitScript: async (s) => scripts.push(s), newPage: async () => ({ on: () => undefined }), close: async () => undefined }),
  };
  pinSeed(fake, 'masterworld');
  await fake.newContext({});
  await fake.newPage({});
  assert.deepEqual(scripts, ['window.__mwSeed = "masterworld";', 'window.__mwSeed = "masterworld";']);
  const free = { newContext: async () => ({}) }, before = free.newContext;
  pinSeed(free, 'fresh');
  assert.equal(free.newContext, before);
});

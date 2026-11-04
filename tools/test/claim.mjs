/**
 * The wrapper of one test file for tools/test/run.mjs. Every process gets the same list of wrappers, heaviest file
 * first; when its turn comes in a process (the wrappers' tests run one after the other) the wrapper takes the file with
 * an atomic `mkdir` and runs it, or skips it when another process took it first. So a process that finishes early
 * takes the next file on the list: the processes end together, however far the times last measured are off.
 *
 * The file's tests become subtests of the wrapper, which waits for them (the `barrier` subtest runs after them: a
 * test's subtests run one after the other). The wrapper's own time limit is long; each test keeps `--test-timeout`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';

export function wrap(claims, name, url) {
  test(name, { timeout: 3_600_000 }, async (t) => {
    const dir = `${claims}/${encodeURIComponent(name)}`;
    try { mkdirSync(dir); } catch { t.skip('taken'); return; }
    // (The file's setup at its top is the import: it counts in the file's time.)
    const t0 = performance.now();
    await import(url);
    await t.test('barrier', () => {});
    writeFileSync(`${dir}/ms`, String(Math.round(performance.now() - t0)));
  });
}

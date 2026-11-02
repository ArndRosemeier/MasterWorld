import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves } from './support/formedCave';
import { reachFree } from '../src/world/cave/reader';

test('rubble ramps (K5): the concession ramps the tall faces that are the only way on, so most of a solution cave walks without a tall climb, and no ramp costs ground', () => {
  const above = caves.way.ramp.above;
  for (const [rock, seed] of [['massive', 2], ['jointed', 1], ['thin-bedded', 2], ['thin-bedded', 3]] as const) {
    const { reading: g, opened } = formedCave(seed, rock);
    const free = reachFree(g, above, g.entries).reached, share = free.reduce((n, v) => n + v, 0) / g.count;
    assert.ok(opened.length >= 4, `${rock} ${seed}: ${opened.length} ways opened (ramps among them)`);
    assert.ok(share >= 0.45, `${rock} ${seed}: ${(share * 100).toFixed(0)} % of the cave reached without a face over ${above} m`);
    assert.ok(g.stats.reached >= 0.9 * g.stats.cells && g.stats.cutOff === 0, `${rock} ${seed}: reached ${g.stats.reached} of ${g.stats.cells}, ${g.stats.cutOff} cut off`);
    // A ramp starts on a ledge and falls no further than the highest face climbed.
    for (const { a, b } of opened) assert.ok(a[1] - b[1] <= caves.way.climb + 0.5 && b[1] - a[1] <= caves.way.maxCut + 0.5, 'a way opened rises or falls within the cave\'s own limits');
  }
});

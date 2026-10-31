import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { settlementOf } from '../src/world/decisions';
import { farHarbourFor, offShore, seaWays, voyageArrived, voyageOf, voyageTopic, SEA_DEPTH } from '../src/vgm/voyages';
import { frontierLand } from './frontierLand';

const { home, seed, terrain, first, regions } = frontierLand();
const def = classic.voyage!;
const water = (x: number, z: number) => terrain.waterDepth(x, z);

// S4: passage from the start's harbour. No other harbour is in reach at first, so the VGM opens one along the coast.
test('voyages: the VGM opens a far harbour along the coast in reach, joined to the start by the sea; passage there is a journey by sea', () => {
  assert.deepEqual(seaWays(def, seed, first, home, [home], water), [], 'no harbour to sail to yet');
  const c = { seed, log: first, terrain, regions, home, hero: home, hours: 9 };
  const r = farHarbourFor(def, c, home, [home], water);
  assert.ok(r && r.site?.harbour, 'a far harbour');
  assert.deepEqual(farHarbourFor(def, c, home, [home], water), r, 'seeded');
  const far = settlementOf(r, regions.fills)!;
  assert.ok(far.harbour, 'a harbour town');
  const d = Math.hypot(far.x - home.x, far.z - home.z);
  assert.ok(d >= def.reach[0] && d <= def.reach[1], `${d.toFixed(0)} m off`);
  assert.equal(farHarbourFor(def, c, home, [home, far], water), null, 'one in reach is enough');
  // The way there: from off the start's harbour to off the far one, all over water deep enough for a ship.
  const [w] = seaWays(def, seed, [...first, r], home, [home, far], water);
  assert.ok(w && w.to === far.id);
  const a = offShore(home.harbour!, water)!, b = offShore(far.harbour!, water)!;
  assert.deepEqual(w.route.slice(0, 2), [a.x, a.z]);
  assert.deepEqual(w.route.slice(-2), [b.x, b.z]);
  for (let i = 0; i < w.route.length; i += 2) assert.ok(water(w.route[i], w.route[i + 1]) >= SEA_DEPTH - 1, `aground at ${i / 2}`);
  assert.ok(w.metres >= Math.hypot(b.x - a.x, b.z - a.z) - 1 && w.metres < d * 2.5, `${w.metres.toFixed(0)} m by sea`);
  // Time and fare as the setting says: 7 m/s with the clock running as ashore, so many game hours; a day's wage or so.
  assert.ok(Math.abs(w.hours - (w.metres / def.speed) * 24 / 3600) < 1e-9);
  assert.ok(w.fare >= def.least);
  assert.match(voyageTopic(def, w), /^Passage by ship to the village \d+\.\d km \w+/);
  assert.match(voyageArrived(def, w), /^The ship comes in to the village, \d+ hours? at sea\.$/);
  const j = voyageOf(first, home.id, w, 30);
  assert.equal(j.by, 'sea');
  assert.equal(j.arrive, 30 + w.hours);
  assert.deepEqual(j.route, w.route);
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j, 'plain data in the log');
});

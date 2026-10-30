import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionDecisions, walkFrontier } from '../src/vgm/frontier';
import { settlementOf } from '../src/world/decisions';
import { townsfolk } from '../src/sim/people';
import { townSpots } from '../src/sim/spots';
import { nearestCoast } from '../src/world/coast';
import { frontierLand } from './frontierLand';

const { first, home, regions, seed, terrain } = frontierLand();

/** S2: where a river meets the sea, the VGM opens a harbour town; it replays from the log. */
test('harbour town: opened by a river mouth, with its quay, piers, berths and harbour folk', () => {
  // Walking north towards the coast (the river by the start reaches the sea some 2 km north) until one is founded.
  const NORTH = -Math.PI / 2;
  const log = [...first, ...walkFrontier({ seed, log: first, terrain, regions, home }, NORTH, 5, (d) => !!settlementOf(d, regions.fills)?.harbour)];
  const d = regionDecisions(log).find((x) => settlementOf(x, regions.fills)?.harbour);
  assert.ok(d, 'a harbour town was opened');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d, 'it is plain data in the log');
  const t = settlementOf(d, regions.fills)!;
  assert.ok(terrain.height(t.x, t.z) >= 1.5, 'its middle on dry ground');
  terrain.settleMore([d]);
  const plan = terrain.town(d.id)!.plan, h = plan.harbour;
  assert.ok(h, 'the town has its harbour');
  assert.ok(h.piers.length >= 1 && h.berths.length >= 1, `${h.piers.length} piers, ${h.berths.length} berths`);
  for (const b of h.berths) assert.ok(terrain.waterDepth(b.x, b.z) >= 2, 'a ship floats at its berth');
  // The quay and the piers are floors: one stands on a pier's deck out over the water.
  const town = terrain.town(d.id)!, p = h.piers[0], mx = (p.x0 + p.x1) / 2, mz = (p.z0 + p.z1) / 2;
  assert.equal(town.stand(mx, mz), p.deckY);
  assert.ok(terrain.waterDepth(p.x1, p.z1) > 1, 'the pier reaches out over the water');
  const folk = townsfolk(plan, t.seed ?? seed);
  for (const trade of ['harbourmaster']) assert.ok(folk.some((p) => p.trade === trade && p.role === 'trade'), `no ${trade}`);
  const spots = townSpots(plan);
  assert.ok(spots.some((s) => s.activity === 'haul'), 'a crane to work');
});

test('coast: a beach, a sea cliff and the bed off the beach near the start, each facing the sea (S1)', () => {
  const t = terrain, s = home;
  const beach = nearestCoast(t, 'beach', s.x, s.z), cliff = nearestCoast(t, 'cliff', s.x, s.z), under = nearestCoast(t, 'under', s.x, s.z);
  assert.ok(beach && cliff && under);
  // The beach: dry sand just above the water, the sea 30 m out from it.
  assert.ok(beach.y > 0 && beach.y < 3, `beach at ${beach.y} m`);
  assert.ok(t.height(beach.x + beach.seaX * 30, beach.z + beach.seaZ * 30) < 0, 'sea in front of the beach');
  // The cliff: high over the sea, which lies below it within 120 m.
  assert.ok(cliff.y > 20, `cliff top at ${cliff.y} m`);
  let sea = false;
  for (let m = 10; m <= 120 && !sea; m += 10) sea = t.height(cliff.x + cliff.seaX * m, cliff.z + cliff.seaZ * m) < 0;
  assert.ok(sea, 'sea below the cliff');
  // Under the sea: on the bed at least 5 m down, within a few hundred metres of the beach.
  assert.ok(under.y <= -5 && t.waterDepth(under.x, under.z) >= 5);
  assert.ok(Math.hypot(under.x - beach.x, under.z - beach.z) < 600);
});

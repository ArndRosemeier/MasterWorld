import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionDecisions, walkFrontier } from '../src/vgm/frontier';
import { settlementOf } from '../src/world/decisions';
import { townsfolk } from '../src/sim/people';
import { townSpots } from '../src/sim/spots';
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

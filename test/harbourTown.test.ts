import { test } from 'node:test';
import assert from 'node:assert/strict';
import { townsfolk } from '../src/sim/people';
import { townSpots } from '../src/sim/spots';
import { nearestCoast } from '../src/world/coast';
import { afloatAt, fleetOf } from '../src/world/fleet';
import { frontierLand } from './frontierLand';

const { home, seed, terrain } = frontierLand();

/** S2 and the start (Arnd 2026-10-30): the start town is a sea town by a river's mouth; it replays from the log. */
test('harbour town: the start town stands by a river mouth, with its quay, piers, berths and harbour folk', () => {
  const d = home;
  assert.ok(d.harbour, 'the start town has a harbour');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d, 'it is plain data in the log');
  const t = d;
  assert.ok(terrain.height(t.x, t.z) >= 1.5, 'its middle on dry ground');
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
  // Its fleet (S2): every vessel at its mooring at night; the fishing boats out at sea by mid-morning, sails set or
  // lying at their grounds, and home again by evening. Where each is follows from the seed and the hour alone.
  const water = terrain.waterDepth.bind(terrain), fleet = fleetOf(h, t.seed ?? seed, water);
  const boats = fleet.filter((v) => v.trip);
  assert.ok(boats.length >= 1, 'fishing boats');
  for (const v of fleet) { const a = afloatAt(v, 26); assert.deepEqual([a.x, a.z, a.sailing], [v.mooring.x, v.mooring.z, false], 'moored at 2 at night'); }
  for (const v of boats) {
    const a = afloatAt(v, 24 + 10);
    assert.ok(Math.hypot(a.x - v.mooring.x, a.z - v.mooring.z) > 200 && water(a.x, a.z) > 2, 'out at sea at 10');
    assert.deepEqual(afloatAt(v, 24 * 3 + 21), afloatAt(v, 21), 'home at 21, each day alike');
    assert.equal(afloatAt(v, 21).x, v.mooring.x);
  }
  assert.deepEqual(fleetOf(h, t.seed ?? seed, water), fleet, 'the same fleet from the same seed');
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

/** Arnd 2026-10-31 (seed y29auv by 13454, 12637): crates on the quay were drawn and stood at the land's height under its paving, unseen yet in the way. */
test('harbour town: its cargo and crane stand on the quay, and block feet there, not under it', () => {
  const town = terrain.town(home.id)!, height = terrain.height.bind(terrain);
  const onQuay = town.plan.fixtures.filter((f) => (f.kind === 'cargo' || f.kind === 'crane') && town.harbourFloor(f.x, f.z) !== null);
  assert.ok(onQuay.length >= 1, 'cargo or a crane on the quay');
  for (const f of onQuay) {
    const g = town.fixtureGround(f.x, f.z, height);
    assert.equal(g, town.harbourFloor(f.x, f.z), 'stands on the quay floor');
    assert.ok(town.fixtureAt(f.x, f.z, 0.4, g, height), 'in the way of one on the quay');
    assert.ok(!town.fixtureAt(f.x, f.z, 0.4, g + 3, height), 'not of one above it');
  }
});

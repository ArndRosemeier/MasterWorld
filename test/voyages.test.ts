import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { settlementOf } from '../src/world/decisions';
import { farHarbourFor, offShore, seaWays, voyageArrived, voyageOf, voyagesIn, voyageTopic, SEA_DEPTH } from '../src/vgm/voyages';
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

test('voyages: the passage ship sails out from her berth along the way, lies at a free berth of the far harbour, and sails home', async () => {
  const { fleetOf, passageShip, farBerth, voyageAfloat, LIE_OVER } = await import('../src/world/fleet');
  const land = frontierLand({ own: true }), t = land.terrain;
  const c = { seed, log: land.first, terrain: t, regions, home: land.home, hero: land.home, hours: 9 };
  const r = farHarbourFor(def, c, land.home, [land.home], water)!, far = settlementOf(r, regions.fills)!;
  t.settleMore([r]);
  const homeTown = t.town(land.home.id)!, farTown = t.town(far.id)!;
  const ship = passageShip(fleetOf(homeTown.plan.harbour!, land.home.seed ?? seed, water))!;
  assert.ok(ship, 'the start\'s harbour has a ship for passengers');
  const berth = farBerth(farTown.plan.harbour!, far.seed ?? seed, ship.mooring.plan)!;
  assert.ok(berth, 'a free berth at the far harbour takes her');
  const [w] = seaWays(def, seed, [...land.first, r], land.home, [land.home, far], water);
  const j = voyagesIn([voyageOf(land.first, land.home.id, w, 30)])[0].v, m = ship.mooring;
  assert.equal(voyageAfloat(j, m, berth, 29.9), null, 'at home before she sails');
  const off = voyageAfloat(j, m, berth, 30)!;
  assert.ok(Math.hypot(off.x - m.x, off.z - m.z) < 0.01 && off.sailing, 'she casts off from her own berth');
  for (let h = 30; h < j.arrive; h += 0.1) {
    const a = voyageAfloat(j, m, berth, h)!;
    assert.ok(a.sailing && water(a.x, a.z) >= m.plan.draft, `afloat at ${h.toFixed(1)}`);
  }
  const lying = voyageAfloat(j, m, berth, j.arrive + 1)!;
  assert.ok(!lying.sailing && lying.berth && Math.hypot(lying.x - berth.x, lying.z - berth.z) < 0.01, 'at the far quay');
  assert.equal(lying.berth.side, -berth.side, 'bow in: her land side the other side');
  assert.ok(voyageAfloat(j, m, berth, j.arrive + LIE_OVER + 0.5)!.sailing, 'home again');
  assert.equal(voyageAfloat(j, m, berth, j.arrive + LIE_OVER + (j.arrive - j.at) + 0.1), null, 'back at her berth');
});

test('voyages: out at sea, away from both harbours, the clock runs faster aboard; near either and ashore it does not', async () => {
  const { seaPace, SEA_PACE } = await import('../src/world/fleet');
  const v = { at: 10, arrive: 14, route: [0, 0, 2000, 0, 4000, 0] };
  assert.equal(seaPace(v, 11, 50, 0), 1, 'off the harbour she left');
  assert.equal(seaPace(v, 13.9, 3950, 0), 1, 'off the one she makes');
  assert.equal(seaPace(v, 12, 2000, 0), SEA_PACE, 'out at sea');
  const half = seaPace(v, 11, 650, 0);
  assert.ok(half > 1 && half < SEA_PACE, 'rising to it');
  assert.equal(seaPace(v, 15, 2000, 0), 1, 'lying at the far quay');
});

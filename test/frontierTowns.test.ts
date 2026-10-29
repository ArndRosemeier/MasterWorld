import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { OPEN_GROUND, regionDecisions } from '../src/vgm/frontier';
import { byFreshWater } from '../src/world/freshWater';
import { settlementOf } from '../src/world/decisions';
import { townPlanOf } from '../src/world/town';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement, woodsOf } from '../src/world/flora';
import { EAST, SOUTH, WEST, frontierLand } from './frontierLand';

const { along, first, home, regions, seed, terrain } = frontierLand();

test('frontier: waystations, hamlets and villages are towns of their size from the one planner, settled from the log', () => {
  // The three walks number their regions alike: each walk's places get ids of their own on the one land.
  const founded = [along(EAST), along(SOUTH), along(WEST)].flatMap((log, w) => regionDecisions(log).filter((d) => settlementOf(d, regions.fills)).map((d) => ({ ...d, id: `w${w}-${d.id}` })));
  const sizes = new Set<string>();
  for (const d of founded) {
    const t = settlementOf(d, regions.fills)!;
    // The capital takes a second to plan: test/capital.test.ts has it.
    if (sizes.has(t.size!) || t.size === 'capital') continue;
    sizes.add(t.size!);
    terrain.settleMore([d]);
    const town = terrain.town(d.id)!;
    assert.ok(town, `${t.size} settled`);
    const kinds = new Set(town.plan.buildings.map((b) => b.kind));
    if (t.size === 'hamlet') assert.ok(town.plan.buildings.length >= 5 && !kinds.has('temple') && !kinds.has('inn'), `hamlet: ${town.plan.buildings.length} buildings`);
    else if (t.size === 'waystation') assert.deepEqual([...kinds].sort(), ['inn', 'stable'], 'a waystation: an inn and a stable');
    else for (const k of ['temple', 'inn', 'smithy']) assert.ok(kinds.has(k as never), `village without a ${k}`);
    // Planned once: a worker's plan and the main thread's agree.
    assert.deepEqual(townPlanOf(t, terrain).buildings.map((b) => b.cx), town.plan.buildings.map((b) => b.cx));
    for (const b of town.plan.buildings) assert.ok(terrain.waterDepth(b.cx, b.cz) <= 0, `${t.size}: a house in the water`);
  }
  assert.deepEqual([...sizes].sort(), ['hamlet', 'village', 'waystation']);
  // Every one stands by fresh water (D50): a brook, river or lake within reach of its edge.
  for (const d of founded) {
    const t = settlementOf(d, regions.fills)!;
    assert.ok(byFreshWater(terrain, t.x, t.z, t.radius), `${d.id} (${t.size}) has water`);
  }
  terrain.settle(first);
  assert.equal(terrain.towns.length, 1);
});

test('frontier: places take open ground where there is any (the woods round the start are mostly closed)', () => {
  const w = woodsOf(terrain);
  const around = (x: number, z: number, r: number) => {
    let s = w(x, z);
    for (let a = 0; a < 8; a++) s += w(x + Math.cos((a * Math.PI) / 4) * r * 0.7, z + Math.sin((a * Math.PI) / 4) * r * 0.7);
    return s / 9;
  };
  let land = 0, openLand = 0;
  for (let x = -5000; x <= 5000; x += 250) for (let z = -5000; z <= 5000; z += 250) {
    if (terrain.height(home.x + x, home.z + z) < 2) continue;
    land++;
    if (around(home.x + x, home.z + z, 30) <= OPEN_GROUND) openLand++;
  }
  const sites = [EAST, SOUTH, WEST].flatMap((dir) => regionDecisions(along(dir)).flatMap((d) => (d.site ? [d.site] : [])));
  const open = sites.filter((s) => around(s.x, s.z, s.r) <= OPEN_GROUND).length;
  // Few spots are open, yet about half the places find one (more than five times the open share of the land): the
  // frontier looks beside the point when its own square has none. (Which squares get which places shifts with every
  // change to the land; this seed moved between 0.48 and 0.57.)
  assert.ok(open / sites.length >= 0.45 && open / sites.length > (5 * openLand) / land, `${open} of ${sites.length} places on open ground; ${openLand} of ${land} spots of land are open`);
});

test('frontier: trees keep out of a place and what its people cleared round it, in workers as here', () => {
  // A barrow field (a hamlet's fields clear the wood as the start town's do).
  const place = [along(EAST), along(SOUTH), along(WEST)].flatMap(regionDecisions).find((d) => d.fill === 'barrows' && d.site)!;
  const s = place.site!;
  // The workers and the main thread hear of the region as a later decision (RoadWork.clear).
  terrain.settleMore([place]);
  const c = terrain.clearings.get(place.id)!;
  assert.ok(c && c.r === s.r + regions.fills.find((f) => f.id === 'barrows')!.clearing!, 'the clearing reaches past the footprint');
  const x0 = Math.floor((s.x - 48) / 32) * 32, z0 = Math.floor((s.z - 48) / 32) * 32;
  const plants = floraPlacement(terrain, { seed, setting: classic.id, x0, z0, size: 96, spacing: NEAR_SPACING });
  for (let i = 0; i < plants.length; i += FLORA_STRIDE) {
    if (FLORA_KINDS[plants[i + 5]].trunk > 0) assert.ok(Math.hypot(plants[i] - c.x, plants[i + 2] - c.z) >= c.r, 'no trunk in the clearing');
  }
  terrain.settle(first);
  assert.equal(terrain.clearings.has(place.id), false);
});

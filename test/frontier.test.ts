import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { FRONTIER, OPEN_GROUND, nextRegion, walkFrontier, regionDecisions, regionLine, regionMapOf, settlementsOf } from '../src/vgm/frontier';
import { keyId, sizeOf } from '../src/world/regions';
import { byFreshWater } from '../src/world/freshWater';
import { settlementOf, type Decision, type DecisionLog } from '../src/world/decisions';
import { townPlanOf } from '../src/world/town';
import { layOutSite } from '../src/world/sites';
import { TOWN_LAYERS } from '../src/render/terrain/groundTextures';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement, woodsOf } from '../src/world/flora';

const seed = parseSeed('masterworld');
// The start's land with small drainage tiles (as the flora, water and roads tests): the same town, faster.
const terrain = new Terrain(seed, classic, { cell: 2000, core: 96, margin: 32, minArea: 120 });
const first = firstDecisions(terrain, startPlace(terrain));
terrain.settle(first);
const home = terrain.towns[0].decision;
const regions = classic.regions!;

/** Walks `km` from the start along `dir` (radians, atan2(z, x)). */
const walk = (km: number, dir: number, from: DecisionLog = first): Decision[] => [...from, ...walkFrontier({ seed, log: from, terrain, regions, home }, dir, km)];

// The walks, made when a test first needs them (each test has its own time budget).
const walks = new Map<number, Decision[]>();
const along = (dir: number) => walks.get(dir) ?? walks.set(dir, walk(5, dir)).get(dir)!;
const EAST = 0, SOUTH = Math.PI / 2, WEST = Math.PI;

test('frontier: walking 5 km opens the start region first, then regions ahead, all in the log', () => {
  const opened = regionDecisions(along(EAST));
  assert.equal(opened[0].fill, FRONTIER.start);
  assert.ok(opened.length >= 10, `${opened.length} regions`);
  const map = regionMapOf(along(EAST), regions.country);
  // Every spot of the way and the land 2 km ahead of its end is open.
  for (let m = 0; m <= 7000; m += 100) assert.ok(map.at(home.x + m, home.z), `open at ${m} m`);
  // Some regions hold places, and more than one kind of them.
  const places = new Set(opened.filter((d) => d.site).map((d) => d.fill));
  assert.ok(places.size >= 2, `places: ${[...places].join(', ')}`);
  for (const d of opened) assert.ok(regionLine(d, regions, home).startsWith(`${d.id}: `));
});

test('frontier: the log replays the same regions, and the same walk makes the same log', () => {
  const again = walk(5, 0);
  assert.deepEqual(again, along(EAST));
  const a = regionMapOf(along(EAST), regions.country).all().map((r) => `${keyId(r.key)}=${r.data.fill}`).sort();
  const b = regionMapOf(JSON.parse(JSON.stringify(along(EAST))), regions.country).all().map((r) => `${keyId(r.key)}=${r.data.fill}`).sort();
  assert.deepEqual(b, a);
  // Opening from a saved log goes on as if never saved.
  const half = along(EAST).slice(0, first.length + 6);
  assert.ok(regionDecisions(half).length === 6);
});

test('frontier: regions never overlap, and places stand on dry, gentle land inside their square', () => {
  const map = regionMapOf(along(EAST), regions.country);
  const all = map.all();
  // No square holds another: the cover has no overlaps.
  const ids = new Set(all.map((r) => keyId(r.key)));
  assert.equal(ids.size, all.length);
  for (const d of regionDecisions(along(EAST))) {
    if (!d.site) continue;
    const s = sizeOf(d.level);
    assert.ok(d.site.x > d.x * s && d.site.x < (d.x + 1) * s && d.site.z > d.z * s && d.site.z < (d.z + 1) * s, `${d.id} inside its square`);
    assert.ok(terrain.height(d.site.x, d.site.z) > 2 && terrain.waterDepth(d.site.x, d.site.z) === 0, `${d.id} on dry land`);
    assert.ok(Math.hypot(d.site.x - home.x, d.site.z - home.z) > 600, `${d.id} out of town`);
  }
});

test('frontier: standing still opens nothing more; hamlets and villages count as settlements', () => {
  let log: Decision[] = [...first];
  for (let i = 0; i < 40; i++) {
    const d = nextRegion({ seed, log, terrain, regions, home, hero: home, heading: null, hours: 0 });
    if (!d) break;
    log = [...log, d];
  }
  assert.equal(nextRegion({ seed, log, terrain, regions, home, hero: home, heading: null, hours: 0 }), null);
  const towns = settlementsOf(along(EAST), regions);
  assert.equal(towns[0].id, 'town-1');
  for (const s of towns.slice(1)) assert.ok(['hamlet', 'village'].includes(regionDecisions(along(EAST)).find((d) => d.id === s.id)?.fill ?? ''));
});

test('frontier: every place lays out on the land, seeded, with known layers, solid where it stands', () => {
  const h = (x: number, z: number) => terrain.height(x, z);
  const seen = new Set<string>();
  for (const log of [along(EAST), along(SOUTH), along(WEST)]) {
    for (const d of regionDecisions(log)) {
      const fill = regions.fills.find((f) => f.id === d.fill);
      if (!d.site || !fill || seen.has(fill.place) || settlementOf(d, regions.fills)) continue;
      seen.add(fill.place);
      const a = layOutSite(d, fill.place, h)!;
      assert.ok(a.mesh.index.length > 0, `${fill.place} has a mesh`);
      assert.ok(a.mesh.mat.every((m) => m < TOWN_LAYERS.length), `${fill.place} layers`);
      assert.ok(a.mesh.position.every((v) => Number.isFinite(v)));
      assert.deepEqual(layOutSite(d, fill.place, h)!.mesh.position, a.mesh.position, `${fill.place} seeded`);
      assert.ok(a.solids.length > 0);
      // Everything stands inside the place's footprint (trees keep out of it).
      for (let i = 0; i < a.mesh.position.length; i += 3) assert.ok(Math.hypot(a.mesh.position[i], a.mesh.position[i + 2]) < d.site.r + 4, `${fill.place} inside its footprint`);
    }
  }
  assert.deepEqual([...seen].sort(), ['barrows', 'camp', 'ruin']);
});

test('frontier: hamlets and villages are towns of their size from the one planner, settled from the log', () => {
  const founded = [along(EAST), along(SOUTH), along(WEST)].flatMap((log) => regionDecisions(log).filter((d) => settlementOf(d, regions.fills)));
  const sizes = new Set<string>();
  for (const d of founded) {
    const t = settlementOf(d, regions.fills)!;
    if (sizes.has(t.size!)) continue;
    sizes.add(t.size!);
    terrain.settleMore([d]);
    const town = terrain.town(d.id)!;
    assert.ok(town, `${t.size} settled`);
    const kinds = new Set(town.plan.buildings.map((b) => b.kind));
    if (t.size === 'hamlet') assert.ok(town.plan.buildings.length >= 5 && !kinds.has('temple') && !kinds.has('inn'), `hamlet: ${town.plan.buildings.length} buildings`);
    else for (const k of ['temple', 'inn', 'smithy']) assert.ok(kinds.has(k as never), `village without a ${k}`);
    // Planned once: a worker's plan and the main thread's agree.
    assert.deepEqual(townPlanOf(t, terrain).buildings.map((b) => b.cx), town.plan.buildings.map((b) => b.cx));
    for (const b of town.plan.buildings) assert.ok(terrain.waterDepth(b.cx, b.cz) <= 0, `${t.size}: a house in the water`);
  }
  assert.deepEqual([...sizes].sort(), ['hamlet', 'village']);
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
  // Few spots are open, yet most places find one: the frontier looks beside the point when its own square has none.
  assert.ok(open / sites.length >= 0.5 && open / sites.length > (5 * openLand) / land, `${open} of ${sites.length} places on open ground; ${openLand} of ${land} spots of land are open`);
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

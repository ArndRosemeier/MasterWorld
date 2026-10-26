import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { FRONTIER, nextRegion, walkFrontier, regionDecisions, regionLine, regionMapOf, settlementsOf } from '../src/vgm/frontier';
import { keyId, sizeOf } from '../src/world/regions';
import type { Decision, DecisionLog } from '../src/world/decisions';
import { hitsSolid, layOutSite } from '../src/world/sites';
import { TOWN_LAYERS } from '../src/render/terrain/groundTextures';

const seed = parseSeed('masterworld');
const { terrain, log: first, home } = openWorld(seed, classic);
const regions = classic.regions!;

/** Walks `km` from the start along `dir` (radians, atan2(z, x)). */
const walk = (km: number, dir: number, from: DecisionLog = first): Decision[] => [...from, ...walkFrontier({ seed, log: from, terrain, regions, home }, dir, km)];

const east = walk(5, 0);

test('frontier: walking 5 km opens the start region first, then regions ahead, all in the log', () => {
  const opened = regionDecisions(east);
  assert.equal(opened[0].fill, FRONTIER.start);
  assert.ok(opened.length >= 10, `${opened.length} regions`);
  const map = regionMapOf(east, regions.country);
  // Every spot of the way and the land 2 km ahead of its end is open.
  for (let m = 0; m <= 7000; m += 100) assert.ok(map.at(home.x + m, home.z), `open at ${m} m`);
  // Some regions hold places, and more than one kind of them.
  const places = new Set(opened.filter((d) => d.site).map((d) => d.fill));
  assert.ok(places.size >= 2, `places: ${[...places].join(', ')}`);
  for (const d of opened) assert.ok(regionLine(d, regions, home).startsWith(`${d.id}: `));
});

test('frontier: the log replays the same regions, and the same walk makes the same log', () => {
  const again = walk(5, 0);
  assert.deepEqual(again, east);
  const a = regionMapOf(east, regions.country).all().map((r) => `${keyId(r.key)}=${r.data.fill}`).sort();
  const b = regionMapOf(JSON.parse(JSON.stringify(east)), regions.country).all().map((r) => `${keyId(r.key)}=${r.data.fill}`).sort();
  assert.deepEqual(b, a);
  // Opening from a saved log goes on as if never saved.
  const half = east.slice(0, first.length + 6);
  assert.ok(regionDecisions(half).length === 6);
});

test('frontier: regions never overlap, and places stand on dry, gentle land inside their square', () => {
  const map = regionMapOf(east, regions.country);
  const all = map.all();
  // No square holds another: the cover has no overlaps.
  const ids = new Set(all.map((r) => keyId(r.key)));
  assert.equal(ids.size, all.length);
  for (const d of regionDecisions(east)) {
    if (!d.site) continue;
    const s = sizeOf(d.level);
    assert.ok(d.site.x > d.x * s && d.site.x < (d.x + 1) * s && d.site.z > d.z * s && d.site.z < (d.z + 1) * s, `${d.id} inside its square`);
    assert.ok(terrain.height(d.site.x, d.site.z) > 2 && terrain.waterDepth(d.site.x, d.site.z) === 0, `${d.id} on dry land`);
    assert.ok(Math.hypot(d.site.x - home.x, d.site.z - home.z) > 600, `${d.id} out of town`);
  }
});

test('frontier: standing still opens nothing more; hamlets count as settlements', () => {
  let log: Decision[] = [...first];
  for (let i = 0; i < 40; i++) {
    const d = nextRegion({ seed, log, terrain, regions, home, hero: home, heading: null, hours: 0 });
    if (!d) break;
    log = [...log, d];
  }
  assert.equal(nextRegion({ seed, log, terrain, regions, home, hero: home, heading: null, hours: 0 }), null);
  const towns = settlementsOf(east, regions);
  assert.equal(towns[0].id, 'town-1');
  for (const s of towns.slice(1)) assert.equal(regionDecisions(east).find((d) => d.id === s.id)?.fill, 'hamlet');
});

test('frontier: every place lays out on the land, seeded, with known layers, solid where it stands', () => {
  const h = (x: number, z: number) => terrain.height(x, z);
  const seen = new Set<string>();
  for (const dir of [0, Math.PI / 2, Math.PI]) {
    const log = dir === 0 ? east : walk(5, dir);
    for (const d of regionDecisions(log)) {
      const fill = regions.fills.find((f) => f.id === d.fill);
      if (!d.site || !fill || seen.has(fill.place)) continue;
      seen.add(fill.place);
      const a = layOutSite(d, fill.place, h)!;
      assert.ok(a.mesh.index.length > 0, `${fill.place} has a mesh`);
      assert.ok(a.mesh.mat.every((m) => m < TOWN_LAYERS.length), `${fill.place} layers`);
      assert.ok(a.mesh.position.every((v) => Number.isFinite(v)));
      assert.deepEqual(layOutSite(d, fill.place, h)!.mesh.position, a.mesh.position, `${fill.place} seeded`);
      assert.ok(a.solids.length > 0);
      // Everything stands inside the place's footprint (trees keep out of it).
      for (let i = 0; i < a.mesh.position.length; i += 3) assert.ok(Math.hypot(a.mesh.position[i], a.mesh.position[i + 2]) < d.site.r + 4, `${fill.place} inside its footprint`);
      // A hamlet's houses stand apart, their doors free.
      for (const b of a.buildings) {
        for (const o of a.buildings) if (o !== b) assert.ok(!hitsSolid([{ poly: o.poly }], b.cx, b.cz, 0.5), 'houses apart');
        assert.ok(!hitsSolid(a.solids, b.door[0], b.door[1], 0.3), 'door free');
      }
      if (fill.place === 'hamlet') assert.ok(a.buildings.length >= 3);
    }
  }
  assert.deepEqual([...seen].sort(), ['barrows', 'camp', 'hamlet', 'ruin']);
});

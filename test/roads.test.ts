import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { linkRoad } from '../src/vgm/roads';
import { settlementsOf, walkFrontier } from '../src/vgm/frontier';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement } from '../src/world/flora';
import { grassMask } from '../src/world/grass';
import { ROAD_REACH, WAY_WIDTH, emptyRoad, roadMask } from '../src/world/roads';
import { archY, bridgeMesh, bridgeSideAt, bridgesOn, deckAt, deckY } from '../src/world/bridges';
import { emptyWater, inChannel } from '../src/world/hydro';
import { Walker } from '../src/game/walker';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
// The start's land with small drainage tiles (as the flora and water tests): the same town, a quarter of the time.
const terrain = new Terrain(seed, classic, SMALL);
const log = firstDecisions(terrain, startPlace(terrain));
terrain.settle(log);
const town = terrain.towns[0];
// The first hamlet the VGM founds on a walk south-east from the start (plan B1). (East, it stands across the river
// where it has no ford: no track reaches it.)
const regions = classic.regions!;
const walked = walkFrontier({ seed, log, terrain, regions, home: town.decision }, Math.PI / 4, 5, (d) => d.fill === 'hamlet' && !!d.site);
const hamlet = settlementsOf(walked, regions).find((t) => walked.some((d) => d.id === t.id && d.kind === 'region' && d.fill === 'hamlet'))!;
// As the world worker routes it (WorldJobs.linkRoad): from the roads already decided alone.
const road = linkRoad(terrain, log.filter((d) => d.kind === 'road'), hamlet, 'track')!;
const pt = (k: number) => ({ x: road.pts[k * 3], y: road.pts[k * 3 + 1], z: road.pts[k * 3 + 2] });
const n = road.pts.length / 3;
// Points well inside the road (not at its ends, not in water), and the bare land's height beside them.
// (Nor by a brook it bridges: there its bank is cut open under the deck, the bridges' test has those. Nor where
// it comes down a river's bank to a ford: the river cuts its channel through the road's shoulders by design.)
const inner = Array.from({ length: n }, (_, k) => k).filter((k) => k > 6 && k < n - 6 && k % 5 === 0 && terrain.waterDepth(pt(k).x, pt(k).z) <= 0
  && !inChannel(terrain.hydro.brookAt(pt(k).x, pt(k).z), 4) && !inChannel(terrain.hydro.riverAt(pt(k).x, pt(k).z, emptyWater()), 4));
const bare = inner.map((k) => terrain.height(pt(k).x, pt(k).z));
// A track out to a spot 1.8 km south of the town, past a brook, for the bridges (the hamlet's track may cross none).
// Its own id: laid with the hamlet track's (both are the log's first road), the net kept only the first.
const brookRoad = { ...linkRoad(terrain, log.filter((d) => d.kind === 'road'), { id: 'ford', x: town.decision.x, z: town.decision.z + 1800, r: 20 }, 'track')!, id: 'road-ford' };
const bp = (k: number) => ({ x: brookRoad.pts[k * 3], y: brookRoad.pts[k * 3 + 1], z: brookRoad.pts[k * 3 + 2] });
const bn = brookRoad.pts.length / 3;
terrain.addRoad(road);
terrain.addRoad(brookRoad);

test('roads: a hamlet out on the land gets a cart track to a road out of the town', () => {
  assert.ok(road, 'a road');
  const d = Math.hypot(hamlet.x - town.decision.x, hamlet.z - town.decision.z);
  assert.ok(d > 1500 && d < 5000, `hamlet ${d.toFixed(0)} m out`);
  assert.equal(road.way, 'track');
  assert.equal(road.to, town.decision.id);
  assert.equal(road.from, hamlet.id);
  // It ends at the end of one of the town's roads out.
  const end = pt(n - 1);
  const ends = town.plan.streets.filter((s) => s.kind === 'road').map((s) => [s.pts[s.pts.length - 2], s.pts[s.pts.length - 1]]);
  assert.ok(ends.some(([x, z]) => Math.hypot(x - end.x, z - end.z) < 0.5), 'joins a town road');
  for (let k = 1; k < n; k++) assert.ok(Math.hypot(pt(k).x - pt(k - 1).x, pt(k).z - pt(k - 1).z) < 7, 'points about 6 m apart');
});

test('roads: the ground is levelled to the road, flat across it, and eases back over the shoulders', () => {
  assert.ok(inner.length > 20);
  let moved = 0;
  inner.forEach((k, i) => {
    const p = pt(k), q = pt(k + 1);
    const L = Math.hypot(q.x - p.x, q.z - p.z), ax = -(q.z - p.z) / L, az = (q.x - p.x) / L;
    const h0 = terrain.height(p.x, p.z);
    assert.ok(Math.abs(h0 - p.y) < 0.35, `on the profile at ${k}: ${h0.toFixed(2)} vs ${p.y.toFixed(2)}`);
    const l = terrain.height(p.x + ax * 1.2, p.z + az * 1.2), r = terrain.height(p.x - ax * 1.2, p.z - az * 1.2);
    assert.ok(Math.abs(l - r) < 0.3, `level across at ${k}: ${(l - r).toFixed(2)}`);
    moved = Math.max(moved, Math.abs(h0 - bare[i]));
  });
  assert.ok(moved > 0.05, 'the land was cut or filled somewhere');
  // Far beside the road the land is its own.
  const p = pt(inner[3]), q = pt(inner[3] + 1), side = WAY_WIDTH.track / 2 + ROAD_REACH + 20;
  const L = Math.hypot(q.x - p.x, q.z - p.z), ax = -(q.z - p.z) / L, az = (q.x - p.x) / L;
  // Straight out to either side (a winding road may come back round on one of them).
  const off = [1, -1].map((s) => terrain.roads.nearest(p.x + ax * side * s, p.z + az * side * s, emptyRoad()));
  assert.ok(off.includes(null), 'land beside the road is its own');
});

test('roads: no tree stands on the track or by its edge, and grass grows only between its ruts', () => {
  const p = pt(inner[Math.floor(inner.length / 2)]);
  const x0 = Math.floor(p.x / 64) * 64, z0 = Math.floor(p.z / 64) * 64;
  const plants = floraPlacement(terrain, { seed, setting: classic.id, x0, z0, size: 64, spacing: NEAR_SPACING });
  for (let r = 0; r < plants.length; r += FLORA_STRIDE) {
    const edge = terrain.roads.fromEdge(plants[r], plants[r + 2]);
    assert.ok(edge >= (FLORA_KINDS[plants[r + 5]].trunk > 0 ? 3 : 0.8), `a plant ${edge.toFixed(1)} m from the edge`);
  }
  const res = 64, gx = p.x - 16, gz = p.z - 16, g = grassMask(terrain, { seed, setting: classic.id, x0: gx, z0: gz, size: 32, res });
  const here = emptyRoad();
  let ruts = 0, middle = 0;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const r = terrain.roads.nearest(gx + (i + 0.5) / 2, gz + (j + 0.5) / 2, here);
    if (!r || r.edge >= 0) continue;
    const dense = g[(j * res + i) * 4 + 1];
    if (Math.abs(r.across) > 0.5) { ruts++; assert.equal(dense, 0, 'grass in a rut'); } else middle++;
  }
  assert.ok(ruts > 10 && middle > 0, `${ruts} rut samples, ${middle} middle`);
});

test('roads: the mask holds the distances the shader draws from; roads replay from the log', () => {
  const p = pt(inner[5]);
  const m = roadMask(terrain.roads, { seed, setting: classic.id, x0: p.x - 2, z0: p.z - 2, size: 4, res: 1 });
  assert.ok(m[2] < 0 && Math.abs(m[0]) < WAY_WIDTH.track / 2 + 0.6 && m[1] === 1, `on the track: ${[...m].map((v) => v.toFixed(2))}`);
  const far = roadMask(terrain.roads, { seed, setting: classic.id, x0: p.x + 300, z0: p.z + 300, size: 4, res: 1 });
  assert.deepEqual([...far], [ROAD_REACH, 0, ROAD_REACH, 0]);
  // Settling the log with the road in it lays the same road (workers and loaded games), and laying it twice changes nothing.
  const laid = terrain.roads.roads.length;
  terrain.settleMore([road, ...log]);
  assert.equal(terrain.roads.roads.length, laid);
  const q = pt(inner[8]), h = terrain.height(q.x, q.z);
  // (The brook's track, laid with addRoad above, is settled again too: the bridge tests below stand on it.)
  terrain.settle([...log, road, brookRoad]);
  assert.equal(terrain.height(q.x, q.z), h);
});

test('roads: every brook the track crosses has a bridge over its open channel', () => {
  const bridges = bridgesOn(brookRoad, terrain.hydro, bp(0).x, bp(0).z, 1e5, () => true);
  assert.ok(bridges.length >= 1, 'it crosses a brook');
  const w = emptyWater();
  let wet = 0;
  for (let k = 0; k + 1 < bn; k++) for (let t = 0; t < 1; t += 0.25) {
    const x = bp(k).x + (bp(k + 1).x - bp(k).x) * t, z = bp(k).z + (bp(k + 1).z - bp(k).z) * t;
    if (!inChannel(terrain.hydro.brookAt(x, z, w))) continue;
    wet++;
    const on = bridges.map((b) => deckAt(b, x, z)).find((y) => y !== null);
    assert.ok(on !== undefined, `a brook under the track at ${x.toFixed(0)}, ${z.toFixed(0)} without a bridge`);
    // The brook runs on under it (its channel open), the deck well over the water.
    assert.ok(terrain.height(x, z) < w.level, `ground ${(terrain.height(x, z) - w.level).toFixed(2)} m over the water under the bridge`);
    assert.ok(on! > w.level + 0.9, 'the deck over the water');
  }
  assert.ok(wet > 0);
  for (const b of bridges) {
    assert.ok(b.arches.length >= 1);
    for (const [a0, a1] of b.arches) assert.ok(archY(b, (a0 + a1) / 2)! > b.level + 0.4, 'room under the arch');
    // Its ends meet the road (a lip, no step to climb).
    assert.ok(Math.abs(deckY(b, 0) - terrain.height(b.x0, b.z0)) < 0.35 && Math.abs(deckY(b, 1) - terrain.height(b.x1, b.z1)) < 0.35, 'the deck meets the road');
    assert.ok(bridgeMesh(b).index.length > 0);
    // The parapets stop a body on the deck at its sides; the way along it is open, and so is the road beyond.
    const t = 0.5, dx = b.x1 - b.x0, dz = b.z1 - b.z0, L = Math.hypot(dx, dz), mx = b.x0 + dx * t, mz = b.z0 + dz * t, y = deckY(b, t);
    const side = (u: number) => [mx - dz / L * u, mz + dx / L * u] as const;
    assert.equal(bridgeSideAt(b, ...side(0), 0.3, y), false, 'the middle of the deck is open');
    assert.ok(bridgeSideAt(b, ...side(b.half - 0.2), 0.3, y) && bridgeSideAt(b, ...side(-(b.half - 0.2)), 0.3, y), 'the parapets stop a body on the deck');
    assert.ok(bridgeSideAt(b, ...side(b.half + 0.2), 0.3, y - 1.5), 'its walls stop a body in the brook beside it');
    assert.equal(bridgeSideAt(b, ...side(b.half - 0.2), 0.3, y + 1), false, 'not over the parapet');
    assert.equal(bridgeSideAt(b, b.x0 - dx / L * 2, b.z0 - dz / L * 2, 0.3, y), false, 'the road before it is open');
    assert.ok(Math.abs(deckAt(b, ...side(0))! - y) < 1e-6, 'the deck is the ground between its parapets');
  }
});

test('roads: the hero walks over every bridge both ways, no jump over the steep banks under the deck', () => {
  const bridges = bridgesOn(brookRoad, terrain.hydro, bp(0).x, bp(0).z, 1e5, () => true);
  const deck = (x: number, z: number) => bridges.map((b) => deckAt(b, x, z)).find((y) => y !== null) ?? null;
  const world = {
    height: (x: number, z: number) => terrain.height(x, z),
    floor: deck,
    rockSurface: () => null,
    waterLevel: () => null,
    wall: (x: number, z: number, r: number, y?: number) => bridges.some((b) => bridgeSideAt(b, x, z, r, y)),
  };
  for (const b of bridges) for (const dir of [1, -1]) {
    const L = Math.hypot(b.x1 - b.x0, b.z1 - b.z0), ux = ((b.x1 - b.x0) / L) * dir, uz = ((b.z1 - b.z0) / L) * dir;
    const [sx, sz] = dir > 0 ? [b.x0 - ux * 5, b.z0 - uz * 5] : [b.x1 - ux * 5, b.z1 - uz * 5];
    const w = new Walker(world);
    w.place(sx, sz);
    let lowest = Infinity;
    for (let k = 0; k < 60 * 6; k++) {
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-ux, -uz), walk: false, up: false, down: false }, 1 / 60);
      const d = deck(w.pos.x, w.pos.z);
      if (d !== null) lowest = Math.min(lowest, w.pos.y - d);
    }
    const made = (w.pos.x - sx) * ux + (w.pos.z - sz) * uz;
    assert.ok(made > L + 10, `${b.id} ${dir > 0 ? 'forth' : 'back'}: stopped ${made.toFixed(1)} m in, of ${(L + 10).toFixed(1)}`);
    assert.ok(lowest > -0.05, `${b.id}: on the deck all the way (${lowest.toFixed(2)})`);
  }
});

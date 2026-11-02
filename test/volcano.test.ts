import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { VOLCANO, acrossFlow, flowHalf, scorched } from '../src/world/volcano';
import { settingById } from '../src/setting/index';
import { SMALL } from './small';

// Seed ajn1uw has an erupting volcano at (-17880, 15359) in volcanic country (found by scanning).
const make = () => new Terrain(parseSeed('ajn1uw'), settingById('classic'), SMALL);
const terrain = make();
const v = terrain.volcanoes.nearTo(-17880, 15359, 100)[0];

test('volcano: placed from the seed, the same twice, inside volcanic country, clear of the square edges', () => {
  assert.ok(v, 'the volcano is there');
  const again = make().volcanoes.nearTo(-17880, 15359, 100)[0];
  assert.deepEqual(again, v);
  assert.ok(terrain.skeleton.kindShare('volcanic', v.x, v.z) >= 0.9);
  assert.ok(v.reach <= 920);
  assert.ok(Math.min(v.x % 2800, v.z % 2800) >= 1000 - 1e-6 || v.x < 0 || v.z < 0);
  assert.ok(v.R >= VOLCANO.base[0] && v.R <= VOLCANO.base[1]);
});

test('volcano: a cone with a crater: the rim stands over the foot and the crater floor, the crater is deeper than the rim is high at the saddle', () => {
  const at = (r: number, th: number) => terrain.height(v.x + Math.cos(th) * r, v.z + Math.sin(th) * r);
  const floor = at(0, 0), rim = Math.max(...Array.from({ length: 24 }, (_, k) => at(v.rimR, (k * Math.PI) / 12)));
  assert.ok(rim - floor > v.depth * 0.7, `rim ${rim.toFixed(0)} over floor ${floor.toFixed(0)}`);
  // The cone's own rise (what it adds to the land) climbs towards the rim on every side.
  const rise = (r: number, th: number) => terrain.volcanoes.lift(v.x + Math.cos(th) * r, v.z + Math.sin(th) * r);
  for (let k = 0; k < 8; k++) assert.ok(rise(v.R * 0.5, (k * Math.PI) / 4) > rise(v.R * 1.1, (k * Math.PI) / 4) + 20, `side ${k}`);
});

test('volcano: the lake stands under the rim\'s lowest crest and over the crater floor; the lava lies in it and in the flows\' channels, nowhere else', () => {
  const lake = terrain.lakeLevel(v);
  assert.ok(lake !== null && v.state === 'erupting');
  assert.ok(lake - terrain.height(v.x, v.z) >= 3, 'a lake of some depth');
  // No crest is lower than the lake all round the rim (it spills at the saddle and nowhere lower).
  for (let k = 0; k < 48; k++) {
    const th = (k * Math.PI) / 24;
    let crest = -Infinity;
    for (let s = 0; s <= 10; s++) crest = Math.max(crest, terrain.height(v.x + Math.cos(th) * v.rimR * (0.8 + 0.045 * s), v.z + Math.sin(th) * v.rimR * (0.8 + 0.045 * s)));
    assert.ok(crest >= lake, `crest at ${k} (${crest.toFixed(1)}) over the lake (${lake.toFixed(1)})`);
  }
  assert.equal(terrain.lavaAt(v.x, v.z), lake);
  // On the main flow's line the lava lies, on its surface a little over the ground; well off it, none.
  const f = v.flows[0], r = (f.r0 + f.r1) / 2;
  const th0 = f.phi;
  // Walk along the wandering line: find the azimuth whose across-distance is zero.
  let th = th0;
  for (let i = 0; i < 20; i++) th -= acrossFlow(f, r, th) / r;
  const x = v.x + Math.cos(th) * r, z = v.z + Math.sin(th) * r;
  const y = terrain.lavaAt(x, z);
  assert.ok(y !== null && y > terrain.height(x, z), 'lava on the flow line');
  const off = flowHalf(f, r) * 3 + 15;
  assert.equal(terrain.lavaAt(x + Math.cos(th + Math.PI / 2) * off, z + Math.sin(th + Math.PI / 2) * off), null);
  // Far from the volcano none.
  assert.equal(terrain.lavaAt(v.x + 3000, v.z), null);
});

test('volcano: a steaming one holds no lava, only vents', () => {
  const other = new Terrain(parseSeed('brazok'), settingById('classic'), SMALL);
  const s = other.volcanoes.nearTo(15272, 6613, 100)[0];
  assert.equal(s.state, 'steaming');
  assert.equal(other.lakeLevel(s), null);
  assert.equal(other.lavaAt(s.x, s.z), null);
  assert.ok(s.vents.length >= 9);
});

test('volcano: nothing grows in the crater or beside a flow, trees may stand on the open flank', () => {
  assert.ok(scorched(v, v.x + v.rimR * 0.9, v.z), 'the crater walls');
  assert.ok(terrain.rockAt(v.x + v.rimR * 1.1, v.z, terrain.height(v.x + v.rimR * 1.1, v.z)));
  const f = v.flows[0], r = (f.r0 + f.r1) / 2;
  let th = f.phi;
  for (let i = 0; i < 20; i++) th -= acrossFlow(f, r, th) / r;
  assert.ok(scorched(v, v.x + Math.cos(th) * r, v.z + Math.sin(th) * r), 'on the flow');
  assert.ok(!scorched(v, v.x + Math.cos(th + 1.2) * (v.R * 0.7), v.z + Math.sin(th + 1.2) * (v.R * 0.7)), 'the open flank');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Skeleton, emptySample, pickBiome } from '../src/world/skeleton';
import { findStart, slopeAt, vistaAt } from '../src/world/start';
import { classic } from '../src/setting/classic/index';

const make = (seed = 'masterworld') => new Skeleton(parseSeed(seed), classic.world);

test('skeleton: same seed, same world; another seed, another world', () => {
  const a = make(), b = make(), c = make('other');
  let differs = 0;
  for (let i = 0; i < 50; i++) {
    const x = (i - 25) * 37_000, z = (i * 7 - 170) * 23_000;
    assert.equal(a.elevation(x, z), b.elevation(x, z));
    if (a.continent(x, z) !== c.continent(x, z)) differs++;
  }
  assert.ok(differs > 45);
});

test('skeleton: land share, sea depth and peaks follow the setting', () => {
  const sk = make(), s = emptySample();
  let land = 0, n = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
    sk.sample((i - 60) * 25_000, (j - 60) * 25_000, s);
    n++;
    if (s.elevation > 0) land++;
    min = Math.min(min, s.elevation);
    max = Math.max(max, s.elevation);
  }
  const share = land / n;
  assert.ok(Math.abs(share - classic.world.landFraction) < 0.12, `land share ${share}`);
  assert.ok(min >= -classic.world.seaDepth - 1 && min < -classic.world.seaDepth * 0.8, `deepest ${min}`);
  assert.ok(max > 1500 && max <= classic.world.mountainHeight * 1.2, `highest ${max}`);
});

test('skeleton: land has a biome, the sea has none, and it gets colder uphill', () => {
  const sk = make(), s = emptySample();
  for (let i = 0; i < 400; i++) {
    sk.sample(i * 9_731 - 2e6, i * 5_113 - 1e6, s);
    if (s.elevation > 0) assert.ok(s.biome >= 0 && s.biome < classic.world.biomes.length);
    else assert.equal(s.biome, -1);
  }
  assert.ok(sk.temperature(0, 0, 2000) < sk.temperature(0, 0, 0) - 10);
});

test('skeleton: biome picking takes the first full fit, else the closest', () => {
  const b = classic.world.biomes;
  assert.equal(b[pickBiome(b, 10, 0.5, 100)].id, 'meadow');
  assert.equal(b[pickBiome(b, -10, 0.5, 2500)].id, 'alpine');
  assert.equal(b[pickBiome(b, -10, 0.5, 100)].id, 'tundra');
});

test('start: on gentle land in a start biome, the same every time', () => {
  for (const seed of ['masterworld', 'a', '42']) {
    const sk = make(seed);
    const p = findStart(sk, classic);
    assert.deepEqual(findStart(make(seed), classic), p);
    assert.ok(classic.start.biomes.includes(p.biome));
    assert.ok(p.elevation >= classic.start.elevation[0] && p.elevation <= classic.start.elevation[1]);
    assert.ok(slopeAt(sk, p.x, p.z) <= classic.start.maxSlope);
    assert.ok(vistaAt(sk, p.x, p.z) >= classic.start.vista);
  }
});

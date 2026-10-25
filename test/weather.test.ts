import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Skeleton } from '../src/world/skeleton';
import { PRESETS, Weather, calm, type Climate, lightning, orderWeight, prevailingWind, type WeatherState } from '../src/world/weather';

const seed = parseSeed('masterworld');
const temperate = () => ({ temperature: 11, moisture: 0.5 });
const weather = (climate: (x: number, z: number) => Climate = temperate) => new Weather(seed, classic.world.weather, climate);
const KEYS = ['cover', 'density', 'dark', 'sun', 'fog', 'mist', 'rain', 'snow', 'wind', 'storm', 'wet'] as const;

test('weather: deterministic, and every value in range', () => {
  const a = weather(), b = weather();
  for (let h = 0; h < 200; h += 3.7) {
    const s = a.state(-32000, 32000, h);
    assert.deepEqual(b.state(-32000, 32000, h), s);
    for (const k of KEYS) assert.ok(s[k] >= 0 && s[k] <= 1, `${k} = ${s[k]} at ${h} h`);
  }
});

test('weather: changes smoothly over a game minute and over a hundred metres', () => {
  const w = weather();
  const step = (s: WeatherState, t: WeatherState) => Math.max(...KEYS.map((k) => Math.abs(s[k] - t[k])));
  for (let h = 0; h < 100; h += 1.3) {
    assert.ok(step(w.state(-32000, 32000, h), w.state(-32000, 32000, h + 1 / 60)) < 0.04, `jump at ${h} h`);
    assert.ok(step(w.state(-32000, 32000, h), w.state(-31900, 32000, h)) < 0.05, `jump in space at ${h} h`);
  }
});

test('weather: a temperate climate has fair days, rain and the odd storm, but no snow', () => {
  const w = weather();
  let rainy = 0, clear = 0, stormy = 0, misty = 0, snowy = 0;
  const n = 600;
  for (let i = 0; i < n; i++) {
    const s = w.state(-32000 + i * 1500, 32000, i * 1.9);
    if (s.rain > 0.3) rainy++;
    if (s.cover < 0.4) clear++;
    if (s.storm > 0.3) stormy++;
    if (s.mist > 0.3) misty++;
    if (s.snow > 0.5 && s.rain > 0.1) snowy++;
  }
  const share = (k: number) => k / n;
  assert.ok(share(rainy) > 0.08 && share(rainy) < 0.4, `rain ${share(rainy)}`);
  assert.ok(share(clear) > 0.25, `clear ${share(clear)}`);
  assert.ok(stormy > 0 && stormy < rainy, `storms ${stormy} of ${rainy} rainy`);
  assert.ok(misty > 0, 'never mist');
  assert.equal(snowy, 0);
});

test('weather: it snows where it is cold, and a dry climate rains less', () => {
  const cold = weather(() => ({ temperature: -8, moisture: 0.6 }));
  const dry = weather(() => ({ temperature: 25, moisture: 0.05 }));
  const wet = weather(() => ({ temperature: 12, moisture: 0.9 }));
  let snow = 0, precip = 0, dryRain = 0, wetRain = 0;
  for (let h = 0; h < 2000; h += 2.3) {
    const c = cold.state(-32000, 32000, h);
    if (c.rain > 0.2) { precip++; if (c.snow > 0.9) snow++; }
    dryRain += dry.state(-32000, 32000, h).rain;
    wetRain += wet.state(-32000, 32000, h).rain;
  }
  assert.ok(precip > 0 && snow === precip, `${snow} of ${precip} falls as snow`);
  assert.ok(dryRain < wetRain * 0.5, `dry ${dryRain}, wet ${wetRain}`);
});

test('weather: the ground stays wet after rain and dries over hours', () => {
  const w = weather();
  w.order({ kind: 'rain', from: 10, to: 12, ramp: 0.25 });
  w.order({ kind: 'clear', from: 12.25, to: 30, ramp: 0.25 });
  assert.ok(w.state(-32000, 32000, 11).wet > 0.6);
  const after = [12.5, 14, 17, 22].map((h) => w.state(-32000, 32000, h).wet);
  assert.ok(after[0] > 0.6, `just after: ${after[0]}`);
  for (let i = 1; i < after.length; i++) assert.ok(after[i] <= after[i - 1] + 1e-9, `drying: ${after}`);
});

test('weather: the VGM orders a storm here; it rolls in, holds and clears, and elsewhere nothing changes', () => {
  const plain = weather(), w = weather();
  const at = { x: -32000, z: 32000, radius: 3000 };
  w.order({ kind: 'storm', from: 30, to: 32, ramp: 1, at });
  const here = (h: number) => w.state(at.x, at.z, h);
  assert.deepEqual(here(28.5), plain.state(at.x, at.z, 28.5), 'before the ramp');
  const rolling = here(29.5), full = here(31);
  assert.ok(full.storm > 0.99 && full.rain > 0.99 && full.cover > 0.99, 'the storm holds');
  assert.ok(rolling.storm > 0 && rolling.storm < full.storm, 'it rolls in');
  assert.deepEqual(w.state(at.x + 5000, at.z, 31), plain.state(at.x + 5000, at.z, 31), 'far away nothing changes');
  assert.ok(here(33.5).storm < 0.5, 'and clears');
  assert.equal(orderWeight({ kind: 'fog', from: 0, to: 1, strength: 0.5 }, 0, 0, 0.5), 0.5);
  assert.throws(() => w.order({ kind: 'storm', from: 2, to: 1 }));
});

test('weather: presets say what they are', () => {
  assert.ok(PRESETS.clear.cover < PRESETS.fair.cover && PRESETS.fair.cover < PRESETS.overcast.cover);
  assert.ok(PRESETS.storm.storm === 1 && PRESETS.rain.storm === 0 && PRESETS.snow.snow === 1);
  assert.ok(PRESETS.fog.fog > PRESETS.rain.fog && PRESETS.fog.mist === 1);
});

test('weather: the real climate of the start is temperate', () => {
  const sk = new Skeleton(seed, classic.world);
  const w = weather((x, z) => sk.sample(x, z));
  const s = w.state(-32000, 32000, 16, calm());
  assert.ok(s.snow < 0.01, 'no snow at the start');
  assert.ok(Math.abs(w.prevailing - prevailingWind(seed)) < 1e-12);
});

test('lightning: only in storms, deterministic, brief', () => {
  let lit = 0, n = 0;
  for (let t = 0; t < 600; t += 0.05) {
    n++;
    assert.equal(lightning(seed, t, 0).light, 0);
    const f = lightning(seed, t, 1);
    assert.deepEqual(lightning(seed, t, 1), f);
    assert.ok(f.light >= 0 && f.light <= 1);
    if (f.light > 0.2) lit++;
  }
  assert.ok(lit > 5 && lit / n < 0.03, `${lit} of ${n} moments lit`);
});

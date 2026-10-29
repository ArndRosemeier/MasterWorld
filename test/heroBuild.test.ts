import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomConfig, type CharacterCatalog, type CharacterConfig } from '@actors/generator';
import { Rng } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { inBuild } from '../src/render/hero/build';

/** Just enough of Actors' catalog for randomConfig: the classic peoples, no clothes or hair. */
const catalog = {
  races: classic.hero.races.map((id) => ({ id })), outfits: [], hair: [], eyes: [], brows: [], details: [],
  garmentColors: [], hairColors: [], animations: [],
} as unknown as CharacterCatalog;
const base = { race: 'human', race2: null, raceMix: 0, body: { gender: 1, ageYears: 30, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5 }, outfit: [], garmentColors: {} } as unknown as CharacterConfig;

test('hero build: every random classic hero is 19-38, lean and fit, of every people and both sexes', () => {
  const build = classic.hero.build!;
  const races = new Set<string>(), sexes = new Set<boolean>();
  for (let seed = 1; seed <= 300; seed++) {
    const rng = new Rng(seed), random = () => rng.float();
    const c = inBuild(() => randomConfig(catalog, base, { random, race: 'any', outfit: false }), build, random);
    const b = c.body;
    assert.ok(b.ageYears >= 19 && b.ageYears <= 38, `age ${b.ageYears}`);
    assert.ok(b.weight >= 0.15 && b.weight <= 0.5, `weight ${b.weight}`);
    assert.ok(b.muscle >= 0.5 && b.muscle <= 0.9, `muscle ${b.muscle}`);
    assert.ok(b.proportions >= 0.5 && b.proportions <= 1, `proportions ${b.proportions}`);
    assert.notEqual(c.hairColor, '#9a968f', 'no grey hair of an old roll');
    races.add(c.race);
    sexes.add(b.gender < 0.5);
  }
  assert.deepEqual([...races].sort(), [...classic.hero.races].sort());
  assert.equal(sexes.size, 2);
});

test('hero build: without a build the roll is left as drawn', () => {
  const rng = new Rng(7), random = () => rng.float();
  const once = inBuild(() => randomConfig(catalog, base, { random, race: 'human', outfit: false }), undefined, random);
  const again = new Rng(7);
  assert.deepEqual(once.body, randomConfig(catalog, base, { random: () => again.float(), race: 'human', outfit: false }).body);
});

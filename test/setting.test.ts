import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSetting, type SettingModule } from '../src/setting/contract';
import { classic } from '../src/setting/classic/index';

test('setting: the classic module is valid', () => {
  assert.deepEqual(validateSetting(classic), []);
});

test('setting: authoring errors are reported', () => {
  const bad: SettingModule = {
    ...classic,
    id: 'Bad Id',
    version: 0,
    world: { ...classic.world, landFraction: 2, biomes: [classic.world.biomes[0], { ...classic.world.biomes[0], surface: 'lava' as never, flora: { trees: 10, cover: 3, mix: { palm: 1 } as never, shrubs: 0 } }] },
    start: { ...classic.start, biomes: ['nowhere'] },
  };
  const errors = validateSetting(bad).join('\n');
  for (const want of ['lowercase slug', 'version', 'landFraction', 'defined twice', 'surface "lava"', 'cover must be', 'tree "palm"', '"nowhere"']) assert.ok(errors.includes(want), `missing: ${want}\n${errors}`);
});

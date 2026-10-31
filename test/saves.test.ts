import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, checkSave, saveLabel, type SaveData } from '../src/app/saveGame';

const save: SaveData = {
  version: SAVE_VERSION, game: '0.001', setting: { id: 'classic', version: 1 }, seed: 'masterworld', log: [],
  clock: { day: 1, hour: 14.5 }, hero: { x: 1, y: 2, z: 3, yaw: 0, below: false }, cellars: { 'cellar-1': { open: [2], keys: [1], read: [0] } },
  talk: null, journal: [], character: null, director: null, mode: 'classic', remains: [],
  looks: { name: 'Wenna', look: { race: 'dwarf', body: { gender: 0.1, ageYears: 33 }, outfit: ['briefs', 'med-tunic'], garmentColors: { 'med-tunic': '#7a3a2a' } } },
};

test('saves: a save survives being written out as JSON and read back', () => {
  const back = checkSave(JSON.parse(JSON.stringify(save)), { id: 'classic', version: 1 });
  assert.deepEqual(back, save);
});

test('saves: a first-version save loads with a fresh hero sheet', () => {
  const { character: _c, director: _d, ...old } = save;
  const back = checkSave({ ...old, version: 1 }, { id: 'classic', version: 1 }) as SaveData;
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.character, null);
  assert.deepEqual(back.cellars, save.cellars);
});

test('saves: a second-version save loads with a hero drawn anew, and keeps the sheet', () => {
  const { looks: _l, ...old } = save;
  const back = checkSave({ ...old, version: 2 }, { id: 'classic', version: 1 }) as SaveData;
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.looks, null);
  assert.equal(back.character, save.character);
});

test('saves: other settings, newer games and junk are refused with a reason', () => {
  assert.match(checkSave({ ...save, setting: { id: 'other', version: 1 } }, { id: 'classic', version: 1 }) as string, /setting "other"/);
  assert.match(checkSave({ ...save, version: SAVE_VERSION + 1 }, { id: 'classic', version: 1 }) as string, /newer version of the game/);
  assert.match(checkSave({ ...save, setting: { id: 'classic', version: 2 } }, { id: 'classic', version: 1 }) as string, /newer version of the setting/);
  assert.equal(checkSave(null, { id: 'classic', version: 1 }), 'not a MasterWorld save');
  assert.equal(checkSave({ hello: 1 }, { id: 'classic', version: 1 }), 'not a MasterWorld save');
});

test('saves: the slot line says the day, the time and where', () => {
  assert.equal(saveLabel(save, 'in the town'), 'Day 2, 14:30, in the town');
});

test('saves: a new save is named as typed, else "Save N" after the highest, and never overwrites a save', async () => {
  const { saveName } = await import('../src/app/saveGame');
  assert.equal(saveName('  Before the  crypt ', []), 'Before the crypt');
  assert.equal(saveName('', ['autosave', 'Save 2', 'slot 1', 'save 7']), 'Save 8');
  assert.equal(saveName('', []), 'Save 1');
  assert.equal(saveName('Autosave', []), 'Autosave 2');
  assert.equal(saveName('crypt', ['Crypt', 'crypt 2']), 'crypt 3');
  assert.equal(saveName('x'.repeat(60), []).length, 40);
});

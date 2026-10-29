import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { addToBar, BAR_SLOTS, cleanBar, clearSlot, defaultBar, placeOnBar, POTION, REST, swapOnBar } from '../src/game/actionBar';
import { barSlotOf, cleanBindings, DEFAULT_BINDINGS } from '../src/input/controls';
import type { AbilityDef, SettingModule } from '../src/setting/contract';

test('action bar: ten slots, the known abilities, the potion and resting first, keys 1 to 0', () => {
  const bar = defaultBar(['strike', 'heavy', 'shove', 'breath']);
  assert.equal(bar.length, BAR_SLOTS);
  assert.deepEqual(bar.slice(0, 6), ['strike', 'heavy', 'shove', 'breath', POTION, REST]);
  assert.ok(bar.slice(6).every((x) => x === null));
  assert.equal(barSlotOf(DEFAULT_BINDINGS, 'Digit1'), 0);
  assert.equal(barSlotOf(DEFAULT_BINDINGS, 'Digit0'), 9);
  assert.equal(barSlotOf(DEFAULT_BINDINGS, 'KeyW'), -1);
  assert.equal(barSlotOf(DEFAULT_BINDINGS, ''), -1);
});

test('action bar: placing swaps, clearing empties, a new ability takes the first free slot', () => {
  const bar = defaultBar(['strike', 'heavy']);
  const moved = placeOnBar(bar, 0, 'heavy');
  assert.deepEqual(moved.slice(0, 3), ['heavy', 'strike', POTION], 'heavy moved to 1, strike went where heavy was');
  assert.deepEqual(swapOnBar(moved, 0, 9).slice(0, 1), [null]);
  assert.equal(swapOnBar(moved, 0, 9)[9], 'heavy');
  const cleared = clearSlot(moved, 1);
  assert.equal(cleared[1], null);
  assert.equal(addToBar(cleared, 'bird')[1], 'bird', 'into the first gap');
  assert.equal(addToBar(cleared, 'heavy'), cleared, 'already there');
  assert.deepEqual(placeOnBar(bar, 12, 'x'), bar, 'no such slot');
});

test('action bar: a saved bar is cleaned (unknown, doubled, too long), none saved gives the default', () => {
  const known = ['strike', 'heavy'];
  assert.deepEqual(cleanBar(undefined, known), defaultBar(known));
  const c = cleanBar(['heavy', 'gone', 'heavy', 7, POTION, null, null, null, null, null, 'strike'], known);
  assert.equal(c.length, BAR_SLOTS);
  assert.deepEqual(c.slice(0, 5), ['heavy', null, null, null, POTION]);
  assert.ok(!c.includes('strike'), 'past the tenth slot');
});

test('action bar: old key bindings (strike … potion) give way to the bar keys', () => {
  const b = cleanBindings({ strike: ['Digit1', ''], forward: ['KeyW', ''] });
  assert.ok(!('strike' in b));
  assert.deepEqual(b.bar1, ['Digit1', '']);
  assert.deepEqual(b.bar10, ['Digit0', '']);
  assert.deepEqual(b.book, ['KeyK', '']);
});

test('action bar: a taught ability is learned onto the bar and saved with the hero', () => {
  const taught: AbilityDef = { id: 'taught-test', icon: '✦', name: 'Test', cooldown: 0, ops: [{ op: 'look', look: 'test' }], text: '', taught: true };
  const setting: SettingModule = { ...classic, abilities: [...classic.abilities, taught] };
  const hero = new Character(setting);
  assert.ok(!hero.knows('taught-test'), 'not known at the start');
  assert.ok(!hero.bar.includes('taught-test'));
  const free = hero.bar.indexOf(null);
  assert.ok(hero.learn('taught-test'));
  assert.ok(!hero.learn('taught-test'), 'only once');
  assert.ok(hero.knows('taught-test'));
  assert.equal(hero.bar[free], 'taught-test', 'the first free slot (after the past\'s ability, the potion and resting)');
  hero.bar = swapOnBar(hero.bar, free, 9);
  const again = new Character(setting, JSON.parse(JSON.stringify(hero.save())));
  assert.ok(again.knows('taught-test'));
  assert.equal(again.bar[9], 'taught-test', 'the arrangement is kept');
  assert.ok(again.forget('taught-test'));
  assert.ok(!again.bar.includes('taught-test'));
  // A save from before the bar: the default bar.
  const { bar: _bar, learned: _learned, ...old } = hero.save();
  assert.deepEqual(new Character(setting, old).bar, defaultBar(['strike', 'heavy', 'shove', 'breath']));
});

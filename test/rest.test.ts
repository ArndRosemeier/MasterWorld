import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { Rest, type RestWatch } from '../src/game/rest';

const calm: RestWatch = { moving: false, fighting: false, afoot: true };

test('rest: sitting brings health, mana and stamina back faster than standing still', () => {
  const regain = (resting: boolean) => {
    const hero = new Character(classic);
    hero.health = 10; hero.stamina = 0; hero.mana = 0;
    hero.resting = resting;
    hero.recover(2, false, 10);
    return { health: hero.health - 10, stamina: hero.stamina, mana: hero.mana };
  };
  const stood = regain(false), sat = regain(true);
  assert.ok(sat.health >= stood.health * 2.5, `health ${sat.health} vs ${stood.health}`);
  assert.ok(sat.stamina > stood.stamina, 'stamina');
  assert.ok(sat.mana >= stood.mana || sat.mana === 0, 'mana (none before a school is opened)');
  // In a fight resting gives nothing.
  const hero = new Character(classic);
  hero.health = 10; hero.resting = true;
  hero.recover(2, true);
  assert.equal(hero.health, 10);
});

test('rest: never in a fight or off foot; moving, a fight or a wound stands the hero up', () => {
  const hero = new Character(classic), rest = new Rest(hero);
  assert.match(rest.toggle({ ...calm, fighting: true }) ?? '', /fight/);
  assert.ok(rest.toggle({ ...calm, afoot: false }));
  assert.equal(rest.sitting, false);
  assert.equal(rest.toggle(calm), null);
  assert.ok(rest.sitting);
  assert.equal(rest.watch(calm), null);
  assert.equal(rest.watch({ ...calm, moving: true }), 'moved');
  assert.equal(rest.sitting, false);
  rest.toggle(calm);
  hero.health -= 5;
  assert.equal(rest.watch(calm), 'hurt');
  rest.toggle(calm);
  assert.equal(rest.watch({ ...calm, fighting: true }), 'fight');
  rest.toggle(calm);
  rest.toggle(calm);
  assert.equal(rest.sitting, false, 'the key again stands up');
});

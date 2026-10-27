import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Director, NEEDS, type Need } from '../src/vgm/director';
import { PlayerModel } from '../src/vgm/playerModel';
import { paddockWolvesFor } from '../src/vgm/situations';
import { seed, terrain, walk, EAST } from './frontierLand';

/**
 * A bot plays 90 minutes. Whenever a need is overdue the VGM makes a move for it (counted, by need), which
 * meets it, and the bot takes it up its own way (`takes`: what that shows of it); `does` is what it does
 * besides, each step (seconds into play).
 */
function play(takes: (n: Need, d: Director) => void, does: (t: number, d: Director) => void = () => {}): { moves: Record<Need, number>; d: Director } {
  const d = new Director(classic.director), moves = Object.fromEntries(NEEDS.map((n) => [n, 0])) as Record<Need, number>;
  for (let t = 0; t < 90 * 60; t += 5) {
    d.observe(5, { fighting: 0, pressure: 0, health: 1, talking: false, underground: false, inTown: false, leads: 1 });
    does(t, d);
    const n = d.overdue;
    if (n) { moves[n]++; d.needs[n] = 0; takes(n, d); }
  }
  return { moves, d };
}

// A fighter fights every ambush and has only a quick look at what else it is shown; a mage fights with spells, looks round the old places and practises its spells.
const fighter = play((n, d) => {
  if (n === 'challenge') d.model.note('fighter');
  else if (n === 'discovery') d.model.note('explorer', 0.3);
});
const mage = play((n, d) => {
  if (n === 'challenge') for (let k = 0; k < 4; k++) d.model.count('casts');
  else if (n === 'discovery') d.model.note('explorer', 0.5);
}, (t, d) => { if (t % 90 === 0) d.model.count('casts'); });

test('player model: a mage and a fighter bot are told apart, and get measurably different moves', () => {
  assert.equal(fighter.d.model.style, 'fighter');
  assert.equal(mage.d.model.style, 'mage');
  assert.ok(fighter.d.model.lean('challenge') > 1.3 && mage.d.model.lean('challenge') < 1, `challenge lean ${fighter.d.model.lean('challenge')} / ${mage.d.model.lean('challenge')}`);
  const f = fighter.moves, m = mage.moves;
  // Moves meeting Challenge, against those meeting Discovery and Reward.
  assert.ok(f.challenge >= m.challenge + 2, `challenge moves: fighter ${f.challenge}, mage ${m.challenge}`);
  assert.ok(m.discovery + m.reward >= f.discovery + f.reward + 2, `discovery+reward moves: mage ${m.discovery + m.reward}, fighter ${f.discovery + f.reward}`);
});

test('player model: old evidence fades, a newcomer has no lean, and it saves', () => {
  const p = new PlayerModel(classic.director);
  assert.equal(p.style, null);
  assert.equal(p.lean('challenge'), 1, 'no lean before it knows anything');
  for (let k = 0; k < 5; k++) p.note('fighter');
  assert.equal(p.style, 'fighter');
  for (let k = 0; k < 4; k++) p.count('casts');
  p.decay(60 * 60);
  for (let k = 0; k < 8; k++) p.count('casts');
  assert.equal(p.style, 'mage', 'what they do now counts most');
  assert.equal(p.history.casts, 12);
  const back = new PlayerModel(classic.director, JSON.parse(JSON.stringify(p.asSaved())));
  assert.deepEqual(back.shares, p.shares);
  const d = new Director(classic.director, JSON.parse(JSON.stringify(fighter.d.snapshot())));
  assert.equal(d.model.style, 'fighter', 'the Director saves its model');
});

test('player model: a fighter meets the wolves at the paddock more often (C10 leans)', () => {
  const town = terrain.towns[0], log = walk(2, EAST);
  const at = (hours: number, lean?: (n: Need) => number) => paddockWolvesFor({ seed, log: [...log, first], hours, near: town, setting: classic, ...(lean ? { lean } : {}) });
  const first = paddockWolvesFor({ seed, log, hours: 24 * 2 + 19, near: town, setting: classic })!;
  assert.ok(first);
  assert.equal(at(first.at + 24 * 3), null, 'not three days on, for anyone');
  assert.ok(at(first.at + 24 * 3, (n) => (n === 'challenge' ? 1.5 : 1)), 'three days on, for a fighter');
});

test('player model: a fight won with spells shows a mage, one without a fighter', () => {
  const d = new Director(classic.director);
  d.model.count('casts');
  d.met('challenge');
  const mage = d.model.evidence.mage;
  assert.ok(mage > 1 && d.model.evidence.fighter === 0);
  d.met('challenge');
  assert.equal(d.model.evidence.fighter, 1);
  assert.equal(d.model.evidence.mage, mage);
  assert.equal(d.model.history.fights, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { WARN_TURNS, validateFactions } from '../src/setting/contract';
import { foeCry } from '../src/game/foeSpeech';
import { SIGNAL_CLIPS, foeClip } from '../src/render/dungeon/foes';
import { PACK_CLIPS } from '../src/render/folk/looks';
import { MOVE_CLIPS } from '../src/render/folk/moves';

// D69 (open question 9): a humanoid foe shouts one short cry as it attacks, from its faction's words; nothing before the fight.
const def = (id: string) => classic.creatures.find((c) => c.id === id)!;

test('foe speech: the lawless have a short cry each; beasts and the walking dead say nothing', () => {
  assert.deepEqual(validateFactions(classic, 'classic'), []);
  for (const id of ['bandit', 'highwayman', 'goblin', 'cutthroat']) assert.ok(foeCry(classic, def(id), 3, 0), id);
  for (const id of ['wolf', 'deer', 'rat', 'giant spider', 'skeleton', 'ghoul', 'boar']) assert.equal(foeCry(classic, def(id), 3, 0), null, id);
  for (const l of Object.values(classic.factions.cries).flat()) assert.ok(l!.length <= 60, l);
});

test('foe speech: the cry is picked by a seed, so one camp does not always shout the same thing', () => {
  const said = new Set<string>();
  for (let n = 0; n < 40; n++) said.add(foeCry(classic, def('bandit'), 5, n)!);
  assert.ok(said.size >= 3, `${said.size} different cries`);
  assert.equal(foeCry(classic, def('bandit'), 5, 2), foeCry(classic, def('bandit'), 5, 2));
});

test('foe speech: a hold\'s wardens have a gesture clip of the people\'s own for each turn, only for a living one standing still', () => {
  const doing = { dead: false, speed: 0, fighting: false, low: null, action: null, variant: 0 } as const;
  for (const t of WARN_TURNS) {
    // A turn with no clip of its own has the weapon drawn: the fighting stance.
    assert.equal(foeClip(def('hold-warden'), { ...doing, signal: t, fighting: SIGNAL_CLIPS[t] === null }), SIGNAL_CLIPS[t] ?? foeClip(def('hold-warden'), { ...doing, fighting: true }));
    assert.equal(foeClip(def('hold-warden'), { ...doing, speed: 3, signal: t }), 'jog', 'on the move it walks');
    assert.ok(foeClip(def('skeleton'), { ...doing, signal: t }).includes('zombie'), 'the dead have nothing to gesture');
  }
});

test('foe speech: every gesture is a clip the pack ships (the people\'s own or a take cut for it)', () => {
  for (const t of WARN_TURNS) { const c = SIGNAL_CLIPS[t]; assert.ok(c === null || PACK_CLIPS.includes(c) || MOVE_CLIPS.includes(c), `${t}: ${c}`); }
});

test('foe speech: no cry calls the hero he or him (the hero may be a woman)', () => {
  const lines = Object.values(classic.factions.cries).flat();
  assert.ok(lines.length >= 12);
  for (const l of lines) assert.doesNotMatch(l!, /\b(he|him|his|himself)\b/i, l);
});

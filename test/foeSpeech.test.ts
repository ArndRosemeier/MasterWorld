import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { BREAK_CAUSES, STANCE_SPEECH, WARN_TURNS, validateFactions } from '../src/setting/contract';
import { foeLine } from '../src/game/foeSpeech';
import { SIGNAL_CLIPS, foeClip } from '../src/render/dungeon/foes';
import { PACK_CLIPS } from '../src/render/folk/looks';
import { MOVE_CLIPS } from '../src/render/folk/moves';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';

// D64 (R3): the one who speaks for a band says each turn of its stance in a short line, with a gesture; beasts and the mindless say nothing.
const def = (id: string) => classic.creatures.find((c) => c.id === id)!;
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const hero = (x: number): Quarry => ({ x, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard });

test('foe speech: the setting gives every warning stance a line for every turn it speaks and every way it ends, all short', () => {
  assert.deepEqual(validateFactions(classic, 'classic'), []);
  for (const kind of ['guard', 'rob', 'jeer'] as const) {
    const need = STANCE_SPEECH[kind];
    const creature = classic.creatures.find((c) => c.stance?.kind === kind)!;
    assert.ok(creature, kind);
    for (const t of need.turns) assert.ok(foeLine(classic, creature, t, 3, 0), `${kind} ${t}`);
    for (const b of need.breaks) assert.ok(foeLine(classic, creature, b, 3, 0), `${kind} ${b}`);
  }
});

test('foe speech: beasts, the mindless and wardens (the hold speaks for them) never speak', () => {
  for (const id of ['wolf', 'deer', 'rat', 'giant spider', 'skeleton', 'ghoul', 'hold-warden']) {
    for (const t of WARN_TURNS) assert.equal(foeLine(classic, def(id), t, 1, 0), null, `${id} ${t}`);
    for (const b of BREAK_CAUSES) assert.equal(foeLine(classic, def(id), b, 1, 0), null, `${id} ${b}`);
  }
});

test('foe speech: the lines are picked by a seed, so one band does not always say the same thing', () => {
  const said = new Set<string>();
  for (let n = 0; n < 40; n++) said.add(foeLine(classic, def('bandit'), 'warn', 5, n)!);
  assert.ok(said.size >= 3, `${said.size} different warnings`);
  assert.equal(foeLine(classic, def('bandit'), 'warn', 5, 2), foeLine(classic, def('bandit'), 'warn', 5, 2));
});

test('foe speech: every turn a den speaks has a line, a gesture on its speaker, and a last warning or a demand draws the band\'s weapons', () => {
  const run = (kind: string, n: number, x: number, secs: number) => {
    const d = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, 5);
    d.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });
    const out: DenEvent[] = [], signals = new Set<string>();
    for (let t = 0; t < secs; t += 0.1) {
      for (const e of d.step(0.1, hero(x))) {
        out.push(e);
        if (e.kind === 'warn') signals.add(e.who.signal ?? 'none');
      }
    }
    return { d, out, signals };
  };
  const g = run('bandit', 3, 8, 4);
  const turns = g.out.filter((e) => e.kind === 'warn').map((e) => (e as Extract<DenEvent, { kind: 'warn' }>).turn);
  assert.deepEqual(turns, ['warn', 'last']);
  for (const e of g.out) if (e.kind === 'warn') assert.ok(foeLine(classic, e.who.def, e.turn, e.who.id, 0), e.turn);
  assert.ok(g.signals.has('warn') && g.signals.has('last'), 'the speaker gestures each turn');
  assert.ok(g.d.creatures.every((c) => c.armed), 'weapons drawn for the last warning');
  const j = run('goblin', 3, 8, 1);
  assert.ok(j.out.some((e) => e.kind === 'warn' && e.turn === 'jeer' && e.who.signal === 'jeer'));
});

test('foe speech: every turn has a gesture clip of the people\'s own, only for a living one standing still', () => {
  const doing = { dead: false, speed: 0, fighting: false, low: null, action: null, variant: 0 } as const;
  for (const t of WARN_TURNS) {
    assert.equal(foeClip(def('bandit'), { ...doing, signal: t }), SIGNAL_CLIPS[t]);
    assert.equal(foeClip(def('bandit'), { ...doing, speed: 3, signal: t }), 'jog', 'on the move it walks');
    assert.notEqual(foeClip(def('skeleton'), { ...doing, signal: t }), SIGNAL_CLIPS[t], 'the dead have nothing to gesture');
  }
});

test('foe speech: every gesture is a clip the pack ships (the people\'s own or a take cut for it)', () => {
  for (const t of WARN_TURNS) assert.ok(PACK_CLIPS.includes(SIGNAL_CLIPS[t]) || MOVE_CLIPS.includes(SIGNAL_CLIPS[t]), `${t}: ${SIGNAL_CLIPS[t]}`);
});

test('foe speech: no line calls the hero he or him (the hero may be a woman)', () => {
  const lines = Object.values(classic.factions.words).flatMap((w) => [...Object.values(w!.turns), ...Object.values(w!.breaks), ...Object.values(w!.talk ?? {})].flat());
  assert.ok(lines.length > 40);
  for (const l of lines) assert.doesNotMatch(l!, /\b(he|him|his|himself)\b/i, l);
});

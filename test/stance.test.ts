import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateStance } from '../src/setting/contract';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';

// D64 (phase R): a humanoid foe warns before it fights; only the mindless attack on notice.
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const hero = (x: number, extra: Partial<Quarry> = {}): Quarry => ({ x, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard, ...extra });
const band = (kind: string, n: number, seed = 5) =>
  new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
/** Steps the den with the hero at x for `secs`, the events with their time. */
function run(d: Den, x: number, secs: number, extra: Partial<Quarry> = {}): DenEvent[] {
  const out: DenEvent[] = [];
  for (let t = 0; t < secs; t += 0.1) out.push(...d.step(0.1, hero(x, extra)));
  return out;
}
const kinds = (es: readonly DenEvent[]) => es.filter((e) => e.kind === 'warn' || e.kind === 'break').map((e) => (e.kind === 'warn' ? e.turn : `break:${e.cause}`));
/** Scatter the band tight round the origin so they hear each other. */
const huddle = (d: Den) => d.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });

test('stance: the classic setting gives every humanoid a stance and no beast one', () => {
  assert.deepEqual(classic.creatures.flatMap((c) => validateStance(c, 'classic')), []);
  const by = (id: string) => classic.creatures.find((c) => c.id === id)!.stance?.kind;
  assert.equal(by('bandit'), 'guard');
  assert.equal(by('highwayman'), 'rob');
  assert.equal(by('goblin'), 'jeer');
  assert.equal(by('hold-warden'), 'bar');
  assert.equal(by('skeleton'), 'mindless');
  assert.equal(by('ghoul'), 'mindless');
  assert.equal(by('wolf'), undefined);
});

test('stance: smugglers warn, warn again nearer, hold while the hero stays outside the line, and fight when it is crossed', () => {
  const d = band('bandit', 3);
  huddle(d);
  const st = classic.creatures.find((c) => c.id === 'bandit')!.stance!;
  let es = run(d, st.warn! - 2, 6);
  assert.deepEqual(kinds(es), ['warn'], 'a warning, no blow');
  assert.equal(d.fighting.length, 0);
  assert.ok(d.creatures.every((c) => c.state === 'warn'), 'the whole band stands together');
  es = run(d, (st.warn! + st.line!) / 2 - 0.2, 3);
  assert.deepEqual(kinds(es), ['last']);
  es = run(d, st.line! + 0.5, 25);
  assert.ok(kinds(es).every((k) => k === 'last'), 'it only repeats itself');
  assert.equal(d.fighting.length, 0);
  es = run(d, st.line! - 0.5, 1);
  assert.deepEqual(kinds(es), ['break:line']);
  assert.equal(d.fighting.length, 3, 'the band fights as one');
});

test('stance: a hero who backs off is let be, and the band goes back to its post', () => {
  const d = band('bandit', 2);
  huddle(d);
  const st = classic.creatures.find((c) => c.id === 'bandit')!.stance!;
  run(d, st.warn! - 2, 3);
  const es = run(d, st.warn! * 1.4, 2);
  assert.deepEqual(kinds(es), ['settle']);
  assert.ok(d.creatures.every((c) => c.state !== 'warn' && c.state !== 'fight'));
  assert.equal(run(d, st.warn! * 1.4, 30).filter((e) => e.kind === 'break').length, 0);
});

test('stance: a blow while the band talks starts the fight and is named as the cause', () => {
  const d = band('bandit', 3);
  huddle(d);
  run(d, 8, 3);
  const es = d.wound(d.creatures[0], { damage: 1, outcome: 'hit' }, { x: 8, y: 0, z: 0 });
  assert.ok(kinds(es).includes('break:struck'));
  assert.equal(d.fighting.length, 3);
});

test('stance: the mindless attack at once and say nothing; a beast never speaks', () => {
  for (const kind of ['skeleton', 'ghoul', 'wolf', 'giant rat']) {
    const d = band(kind, 2);
    huddle(d);
    const es = run(d, 4, 8);
    assert.deepEqual(kinds(es), [], kind);
    assert.ok(d.fighting.length > 0, `${kind} fights`);
  }
});

test('stance: bandits halt the hero, walk up, demand, and fight when the demand goes unmet', () => {
  const d = band('highwayman', 3);
  huddle(d);
  const st = classic.creatures.find((c) => c.id === 'highwayman')!.stance!;
  const es = run(d, 20, st.patience! + 20);
  const k = kinds(es);
  assert.deepEqual(k.slice(0, 2), ['warn', 'demand'], 'halt, then the price');
  assert.deepEqual(k.at(-1), 'break:patience');
  assert.equal(d.fighting.length, 3);
});

test('stance: goblins jeer; a lone one only jeers, three fight when their patience is spent, a weak hero is not waited for', () => {
  const lone = band('goblin', 1);
  huddle(lone);
  const es = run(lone, 8, 40);
  assert.ok(kinds(es).every((k) => k === 'jeer') && kinds(es).length > 3);
  assert.equal(lone.fighting.length, 0);
  const three = band('goblin', 3);
  huddle(three);
  assert.ok(kinds(run(three, 8, 30)).includes('break:many'));
  const weak = band('goblin', 3);
  huddle(weak);
  assert.deepEqual(kinds(run(weak, 8, 4, { frail: true })).slice(0, 2), ['jeer', 'break:frail']);
});

test('stance: a faction that hates the hero attacks at once and says why; a faction that likes them greets them and lets them pass', () => {
  const hated = band('bandit', 3);
  huddle(hated);
  const es = run(hated, 8, 2, { regard: () => 'hated' });
  assert.deepEqual(kinds(es), ['break:hated']);
  assert.equal(hated.fighting.length, 3);
  const friends = band('bandit', 3);
  huddle(friends);
  const hello = run(friends, 3, 30, { regard: () => 'friend' });
  assert.deepEqual(kinds(hello), ['greet'], 'greeted once');
  assert.equal(friends.fighting.length, 0);
  const unwelcome = band('bandit', 3);
  huddle(unwelcome);
  assert.deepEqual(kinds(run(unwelcome, 9, 2, { regard: () => 'unwelcome' })), ['warn'], 'unwelcome is warned, not attacked');
});

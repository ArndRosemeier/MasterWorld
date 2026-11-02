import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateFactions, validateSetting } from '../src/setting/contract';
import { foeLine } from '../src/game/foeSpeech';
import { OpenGround, groupDanger, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';

// R8 (D64): cutthroats are the sinister kind: they fall on the hero at once with a war cry that says why, and they live far out (D29).
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const hero = (x: number): Quarry => ({ x, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard });
const humanoids = classic.creatures.filter((c) => c.body.kind === 'humanoid');
/** `n` of `kind` huddled at the origin, met by the hero at x for `secs`: the events in order. */
function meet(kind: string, n: number, x: number, secs: number): { den: Den; events: DenEvent[] } {
  const den = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, 5);
  den.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });
  const events: DenEvent[] = [];
  for (let t = 0; t < secs; t += 0.1) events.push(...den.step(0.1, hero(x)));
  return { den, events };
}

test('cutthroats: the classic setting has them, with lines for their cry', () => {
  assert.deepEqual(validateFactions(classic, 'classic'), []);
  assert.deepEqual(validateSetting(classic).filter((m) => /cutthroat/.test(m)), []);
  const c = classic.creatures.find((d) => d.id === 'cutthroat')!;
  assert.equal(c.faction, 'cutthroats');
  assert.equal(c.stance!.kind, 'murderous');
  assert.ok(foeLine(classic, c, 'murder', 4, 0), 'a war cry');
  assert.ok(new Set(Array.from({ length: 30 }, (_, n) => foeLine(classic, c, 'murder', 4, n))).size >= 3, 'several, picked by seed');
});

test('cutthroats: they fall on the hero the moment they notice, the whole band, and the cry says why', () => {
  const { den, events } = meet('cutthroat', 3, 9, 4);
  const first = events.find((e) => e.kind === 'warn' || e.kind === 'break');
  assert.ok(first && first.kind === 'break' && first.cause === 'murder', 'the first thing said is the cry');
  assert.equal(events.filter((e) => e.kind === 'warn').length, 0, 'no warning');
  assert.equal(den.fighting.length, 3);
});

test('cutthroats: they are the only kinds that attack without a warning or a known reason, besides the walking dead', () => {
  const at: string[] = [];
  for (const d of humanoids) {
    if (d.stance?.kind === 'bar') continue; // a hold's or the town's wardens: the hold speaks and the town keeps its peace (game/hold.ts)
    const { den, events } = meet(d.id, 2, 6, 3);
    const warned = events.some((e) => e.kind === 'warn');
    if (den.fighting.length && !warned) at.push(`${d.id}:${d.stance!.kind}`);
    if (d.stance!.kind === 'guard' || d.stance!.kind === 'rob' || d.stance!.kind === 'jeer') assert.ok(warned && !den.fighting.length, `${d.id} warns first`);
  }
  assert.deepEqual(at.map((s) => s.split(':')[1]).sort().filter((k, i, a) => a.indexOf(k) === i), ['mindless', 'murderous']);
  assert.ok(at.some((s) => s.startsWith('cutthroat:')));
});

test('cutthroats: they live farther out than any lurking band that is less dangerous, and past where the bandits lurk (D29)', () => {
  const dangerOf = (w: (typeof classic.wild)[number]) => groupDanger(classic.encounters.find((e) => e.id === w.encounter)!.creatures, classic.creatures);
  const humanWild = classic.wild.filter((w) => classic.encounters.find((e) => e.id === w.encounter)!.creatures.some((id) => classic.creatures.find((c) => c.id === id)!.body.kind === 'humanoid'));
  const mine = classic.wild.find((w) => w.id === 'cutthroats')!;
  for (const w of humanWild) {
    if (w === mine) continue;
    assert.ok(dangerOf(mine) > dangerOf(w), `worse than ${w.id}`);
    assert.ok(mine.ring[0] > w.ring[0], `and starts farther out than ${w.id}`);
    if (w.habitat === 'road') assert.ok(mine.ring[0] > w.ring[1], 'past where the bandits by the road lurk');
  }
});

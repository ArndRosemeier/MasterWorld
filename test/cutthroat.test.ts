import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateFactions, validateSetting } from '../src/setting/contract';
import { foeCry } from '../src/game/foeSpeech';
import { OpenGround, groupDanger, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';

// R8: cutthroats are the sinister kind and live far out (D29); since D69 every hostile foe attacks within its aggro radius, with one cry.
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const hero = (x: number): Quarry => ({ x, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard });
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
  assert.ok(foeCry(classic, c, 4, 0), 'a war cry');
  assert.ok(new Set(Array.from({ length: 30 }, (_, n) => foeCry(classic, c, 4, n))).size >= 3, 'several, picked by seed');
});

test('cutthroats: they fall on a hero within their radius, the whole camp, and the one who saw them cries out', () => {
  const { den, events } = meet('cutthroat', 3, 9, 4);
  assert.equal(events.filter((e) => e.kind === 'cry').length, 1, 'one cry');
  assert.equal(den.fighting.length, 3);
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

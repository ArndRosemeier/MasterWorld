import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateStance } from '../src/setting/contract';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';
import { Delve } from '../src/game/delve';
import { Character } from '../src/game/character';
import { Standing } from '../src/game/standing';
import { foeLine } from '../src/game/foeSpeech';

// R7 (D64): the ways out of a warning. The hero talks to the band (G): a robber names a share of the purse, a guard a pact; the band
// keeps its word and remembers it until the hero strikes. Striking first is always allowed and costs standing, once per band.
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const hero = (x: number): Quarry => ({ x, y: 0, z: 0, noise: 0.5, light: 0, alive: true, guard });
function band(kind: string, n: number, seed = 5): Den {
  const d = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
  d.creatures.forEach((c, i) => { c.x = -i * 0.8; c.z = 0; c.dir = 0; });
  return d;
}
function run(d: Den, x: number, secs: number): DenEvent[] {
  const out: DenEvent[] = [];
  for (let t = 0; t < secs; t += 0.1) out.push(...d.step(0.1, hero(x)));
  return out;
}
const turns = (es: readonly DenEvent[]) => es.filter((e) => e.kind === 'warn' || e.kind === 'break').map((e) => (e.kind === 'warn' ? e.turn : `break:${e.cause}`));
/** Highwaymen met and halted by the time the first word has been said (the hero 7 m off, within their talking range). */
const held = (seed = 5) => { const d = band('highwayman', 3, seed); run(d, 20, 6); return d; };

test('holdup: the classic setting\'s robbers and guards can be talked to, and its words for it are complete', () => {
  assert.deepEqual(classic.creatures.flatMap((c) => validateStance(c, 'classic')), []);
  const by = (id: string) => classic.creatures.find((c) => c.id === id)!;
  assert.equal(by('highwayman').stance!.talk, 'price');
  assert.equal(by('bandit').stance!.talk, 'pact');
  assert.equal(by('goblin').stance!.talk, undefined, 'a goblin only jeers');
  for (const t of ['terms', 'deal', 'short'] as const) assert.ok(foeLine(classic, by('highwayman'), t, 3, 0)?.length, `a robber says ${t}`);
});

test('holdup: paying a seeded share of the purse lets the hero pass, and the band keeps its word and remembers it', () => {
  const d = held();
  const who = d.hail();
  assert.ok(who, 'the hero can talk to the band that halted them');
  const a = d.parley(100)!;
  assert.equal(a.turn, 'terms');
  const [lo, hi] = classic.creatures.find((c) => c.id === 'highwayman')!.stance!.toll!;
  assert.ok(a.coins >= Math.round(100 * lo) && a.coins <= Math.round(100 * hi), `a share of the purse (${a.coins})`);
  // The same band and the same purse name the same price; another purse another (seeded, never random).
  const twin = held();
  assert.equal(twin.parley(100)!.coins, a.coins);
  const deal = d.parley(100)!;
  assert.equal(deal.turn, 'deal');
  assert.equal(deal.coins, a.coins);
  assert.equal(d.word, 'paid');
  assert.ok(d.creatures.every((c) => c.state !== 'warn' && c.state !== 'fight'), 'the band stands down');
  assert.equal(d.hail(), null, 'nothing left to talk about');
  // The hero stays at their door for a good while, goes and comes back: not a word of threat.
  const es = [...run(d, 3, 60), ...run(d, 40, 20), ...run(d, 6, 30)];
  assert.equal(d.fighting.length, 0);
  assert.ok(turns(es).every((t) => t === 'greet'), `only greetings (${turns(es).join(' ')})`);
});

test('holdup: a purse that cannot meet the price gets the short answer, and the patience runs out in a fight', () => {
  const d = held();
  assert.equal(d.parley(0)!.turn, 'terms');
  assert.equal(d.parley(0)!.turn, 'short');
  assert.equal(d.word, null);
  const es = run(d, 6, 20);
  assert.deepEqual(turns(es).at(-1), 'break:patience');
  assert.equal(d.fighting.length, 3);
});

test('holdup: refusing is still the old way: silence until the patience is spent', () => {
  const d = held();
  assert.ok(turns(run(d, 6, 25)).includes('break:patience'));
});

test('holdup: a guard asks for a pact, not coin; given, they let the hero by', () => {
  const d = band('bandit', 3);
  run(d, 10, 4);
  assert.ok(d.hail(), 'the smugglers have halted the hero');
  assert.deepEqual([d.parley(40)!.turn, d.parley(40)!.coins], ['terms', 0]);
  assert.equal(d.word, 'pact');
  const es = run(d, 3.5, 40);
  assert.equal(d.fighting.length, 0, 'nearer than their line but at their word');
  assert.ok(turns(es).every((t) => t === 'greet'));
});

test('holdup: goblins are not talked to', () => {
  const d = band('goblin', 3);
  run(d, 8, 4);
  assert.equal(d.hail(), null);
  assert.equal(d.parley(100), null);
});

test('holdup: striking first is always allowed: it breaks a word given and says who started it', () => {
  const d = held();
  d.parley(100);
  d.parley(100);
  const c = d.creatures[1];
  const es = d.wound(c, { damage: 3, outcome: 'hit' }, { x: 6, y: 0, z: 0 });
  assert.equal(d.word, null);
  assert.ok(turns(es).includes('break:struck'));
  assert.ok(d.fighting.length > 0);
});

test('holdup: the hero\'s game: G offers the speaker, the price leaves the purse, and the word is saved', () => {
  const me = new Character(classic);
  me.coins = 200;
  const delve = new Delve(null, held(), classic, me, 9);
  const pose = { x: 20, y: 0, z: 0 };
  const near = delve.within(pose);
  assert.equal(near?.kind, 'chief', 'the highwayman is offered to speak with');
  const terms = delve.speak()!;
  assert.equal(terms.kind, 'terms');
  assert.match(terms.text, /copper/);
  assert.equal(me.coins, 200, 'nothing is taken for the terms');
  const price = Number(/(\d+) copper/.exec(terms.text)![1]);
  const deal = delve.speak()!;
  assert.equal(deal.kind, 'struck');
  assert.equal(me.coins, 200 - price);
  assert.ok(price > 0);
  assert.equal(delve.tally().word, 'paid');
  const again = new Delve(null, band('highwayman', 3), classic, me, 9, delve.tally());
  assert.equal(again.den.word, 'paid', 'a loaded game remembers');
  assert.equal(delve.within(pose)?.kind ?? null, null, 'nothing more to say');
});

test('holdup: striking a band first costs standing with it once for each band', () => {
  const s = new Standing(classic, classic.peoples[0].id);
  const before = s.value('bandits');
  assert.equal(s.struckFirst('wild-1', 'bandits').length + s.struckFirst('wild-1', 'bandits').length, 1, 'counted once');
  assert.equal(s.value('bandits'), before + classic.factions.kill.first);
  assert.equal(s.struckFirst('wild-2', 'bandits').length, 1, 'another band, another count');
  assert.ok(s.did('first:wild-1'), 'kept with the deeds, saved with them');
});

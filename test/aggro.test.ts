import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateAggro, type Tier } from '../src/setting/contract';
import { aggroRadius, conOf, foeLevel } from '../src/sim/aggro';
import { Den, type DenEvent, type Quarry } from '../src/sim/creatures';
import { OpenGround, type Land } from '../src/sim/wild';
import { Delve } from '../src/game/delve';
import { Character } from '../src/game/character';

// D69, phase Z1: simple aggro scaled by the level difference, linked pulls, the leash home, con colours; the D64 stances are retired.
const A = classic.aggro, G = classic.growth;
const def = (id: string) => classic.creatures.find((c) => c.id === id)!;
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const guard = { defence: 20, armour: 1, open: false };
/** A hero of `level` at (x, z), running and lit (aggro does not care how loud). */
const hero = (x: number, z: number, level: number, regard?: Tier): Quarry => ({ x, y: 0, z, noise: 1, light: 9, alive: true, guard, level, ...(regard ? { regard: () => regard } : {}) });
/** A camp of `kind` standing where `at` says (each a post), played with the classic rules. */
function camp(kind: string, at: readonly (readonly [number, number])[], seed = 3): Den {
  const den = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), at.map(() => ({ creature: kind, room: 0 })), classic.creatures, seed);
  den.creatures.forEach((c, i) => { c.x = at[i][0]; c.z = at[i][1]; c.until = 1e9; });
  den.rules = classic;
  return den;
}
const run = (den: Den, secs: number, q: (t: number) => Quarry): DenEvent[] => {
  const out: DenEvent[] = [];
  for (let t = 0; t < secs; t += 0.1) out.push(...den.step(0.1, q(t)));
  return out;
};

test('aggro: the classic picks: 10 m at even level, 1.5 m wider a level above to 20 m, 1 m narrower a level below to 5 m, none five below', () => {
  assert.deepEqual(validateAggro(A, 'classic'), []);
  const r = (diff: number) => aggroRadius(A, {}, 6 + diff, 6);
  assert.equal(r(0), 10);
  assert.equal(r(1), 11.5);
  assert.equal(r(4), 16);
  assert.equal(r(9), 20);
  assert.equal(r(-1), 9);
  assert.equal(r(-4), 6);
  assert.equal(r(-5), 0, 'grey: starts nothing');
  assert.equal(aggroRadius(A, { aggro: 15 }, 6, 6), 15, 'a kind may set its own');
  // A foe's level is the level whose even fight its danger is, as the target plate shows it.
  assert.equal(foeLevel(G, def('goblin')), 1);
  assert.equal(foeLevel(G, def('cutthroat')), 5);
});

test('con: grey, green, blue, white, yellow, red by the level difference', () => {
  assert.deepEqual([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 7].map((d) => conOf(A, 10 + d, 10)), ['grey', 'grey', 'green', 'green', 'blue', 'blue', 'white', 'yellow', 'yellow', 'red', 'red']);
});

test('aggro: a hero walking past a camp 2 m outside its radius never pulls it; a step inside does', () => {
  // Smugglers are level 2: even for a level 2 hero, 10 m.
  const den = camp('bandit', [[0, 0], [1, 0], [0, 1]]);
  const r = den.aggroOf(den.creatures[0], hero(0, 0, 2));
  assert.equal(r, 10);
  // Along a line 12 m from the nearest of them, from far on one side to far on the other, and back.
  const past = run(den, 40, (t) => hero(-40 + 4 * (t < 20 ? t : 40 - t), 1 + r + 2, 2));
  assert.equal(past.filter((e) => e.kind === 'notice').length, 0, 'not pulled');
  assert.ok(den.creatures.every((c) => c.state === 'idle' || c.state === 'alert'), 'they watch at most');
  assert.ok(den.creatures.every((c) => c.z < 1.5), 'none crept towards the hero');
  const pulled = run(den, 1, () => hero(0, 1 + r - 1, 2));
  assert.equal(den.fighting.length, 3, 'inside it: the camp');
  assert.equal(pulled.filter((e) => e.kind === 'cry').length, 1, 'one cry, from the one that saw the hero');
});

test('aggro: pulling one brings its links within 12 m and no one else', () => {
  const den = camp('bandit', [[0, 0], [8, 0], [20, 0], [0, 30]]);
  run(den, 6, () => hero(-9, 0, 2));
  assert.deepEqual(den.creatures.map((c) => c.state === 'fight'), [true, true, false, false]);
});

test('aggro: a foe chased more than 40 m from its post gives up, goes home and heals', () => {
  const den = camp('bandit', [[0, 0]]);
  const c = den.creatures[0];
  run(den, 0.5, () => hero(-8, 0, 2));
  assert.equal(c.state, 'fight');
  c.health = c.def.health * 0.5;
  // The hero runs off faster than it can follow.
  const events = run(den, 20, (t) => hero(-8 - 7 * t, 0, 2));
  assert.ok(events.some((e) => e.kind === 'home'), 'it gave up');
  assert.ok((c.state as string) === 'idle' && Math.hypot(c.x, c.z) < 1.5, `home at its post (${c.state}, ${Math.hypot(c.x, c.z).toFixed(1)} m)`);
  assert.equal(c.health, c.def.health, 'and whole again');
});

test('aggro: a foe that fights on 25 s with no blow either way gives up too', () => {
  const den = camp('bandit', [[0, 0]]);
  const c = den.creatures[0];
  run(den, 0.5, () => hero(-8, 0, 2));
  // Chilled to the hero's walking pace, it follows a hero who keeps a step ahead, inside its leash.
  c.slow = 1 - 1.4 / c.def.speed;
  let x = -3, home = -1;
  for (let t = 0; t < 32 && home < 0; t += 0.1) {
    x = c.x - 3;
    for (const e of den.step(0.1, hero(x, 0, 2))) if (e.kind === 'home') home = t;
  }
  assert.ok(home > 22 && home < 28, `gave up after about 25 s (${home.toFixed(1)} s)`);
  assert.ok(Math.hypot(c.x, c.z) < 40, 'still inside its leash');
});

test('aggro: a grey foe never starts a fight, even beside the hero; struck, it fights back', () => {
  // Goblins are level 1: grey for a level 6 hero.
  const den = camp('goblin', [[0, 0], [1.2, 0]]);
  assert.equal(conOf(A, foeLevel(G, def('goblin')), 6), 'grey');
  run(den, 10, () => hero(1.5, 1.5, 6));
  assert.equal(den.fighting.length, 0);
  den.wound(den.creatures[0], { outcome: 'hit', damage: 2 }, { x: 1.5, y: 0, z: 1.5 });
  assert.equal(den.creatures[0].state, 'fight');
});

test('aggro: a neutral one (deer, boar, a peaceful giant) fights only when struck', () => {
  for (const kind of ['boar', 'deer', 'giant elk']) {
    const den = camp(kind, [[0, 0]]);
    const events = run(den, 10, (t) => hero(Math.max(2, 20 - 3 * t), 0, 1));
    assert.equal(events.filter((e) => e.kind === 'swing' || e.kind === 'blow').length, 0, `${kind} struck no blow`);
    assert.notEqual(den.creatures[0].state, 'fight', kind);
  }
  const boar = camp('boar', [[0, 0]]);
  boar.wound(boar.creatures[0], { outcome: 'hit', damage: 2 }, { x: 2, y: 0, z: 0 });
  const after = run(boar, 4, () => hero(2, 0, 1));
  assert.ok(after.some((e) => e.kind === 'swing'), 'struck, the boar fights');
});

test('aggro: a faction that counts the hero a friend lets them by; behind a ridge the hero is not seen', () => {
  const den = camp('bandit', [[0, 0]]);
  run(den, 6, () => hero(3, 0, 2, 'friend'));
  assert.equal(den.fighting.length, 0, 'a friend');
  const walled = new Den(new OpenGround({ ...flat, height: (x) => (Math.abs(x - 2.5) < 1 ? 5 : 0) }, [{ x: 0, z: 0, r: 0.01 }]), [{ creature: 'bandit', room: 0 }], classic.creatures, 3);
  walled.rules = classic;
  Object.assign(walled.creatures[0], { x: 0, z: 0, until: 1e9 });
  run(walled, 6, () => hero(5, 0, 2));
  assert.equal(walled.fighting.length, 0, 'not in its sight');
});

test('aggro: the game\'s fight weighs the radius by the hero\'s level and names the con; the hero\'s veil narrows it', () => {
  const pc = new Character(classic);
  const den = camp('cutthroat', [[0, 0]]);
  const delve = new Delve(null, den, classic, pc, 4);
  const q = delve.fight.quarry({ x: 0, y: 0, z: 0, yaw: 0, speed: 0 });
  // Cutthroats are level 5, four above a fresh hero: 16 m, and red.
  assert.equal(q.level, 1);
  assert.equal(den.aggroOf(den.creatures[0], q), 16);
  assert.equal(delve.fight.con(den.creatures[0]), 'red');
  assert.ok(den.aggroOf(den.creatures[0], { ...q, hide: 0.5 }) === 8, 'a veil halves it');
});

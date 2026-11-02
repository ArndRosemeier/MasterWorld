import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { opposed } from '../src/sim/factions';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, type Creature, type DenEvent, type Quarry } from '../src/sim/creatures';
import { Delve } from '../src/game/delve';
import { Character } from '../src/game/character';
import type { FightEvent } from '../src/game/fight';

// R5 (D65): creatures fight creatures. Bodies of factions at feud attack each other on sight, the fight is loud, allies never fight.
const guard = { defence: 20, armour: 1, open: false };
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
/** A hero far away: they play no part. */
const far: Quarry = { x: 900, y: 0, z: 900, noise: 0, light: 0, alive: true, guard };
/** A group of `kind` gathered at (x, 0), spread a little so they do not overlap. */
function group(kind: string, n: number, x: number, land: Land = flat, z = 0, seed = 3, defs = classic.creatures): Den {
  const d = new Den(new OpenGround(land, [{ x, z, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), defs, seed);
  d.creatures.forEach((c, i) => { c.x = x + (i % 2) * 1.2; c.z = z + Math.floor(i / 2) * 1.2; c.dir = 0; });
  d.feud = (a, b) => opposed(classic, a, b);
  return d;
}
/** Steps the dens together (each the others' neighbour) for `secs`; every den's events. */
function play(dens: readonly Den[], secs: number, q: Quarry = far): DenEvent[] {
  for (const d of dens) d.neighbours = dens.filter((o) => o !== d);
  const out: DenEvent[] = [];
  for (let t = 0; t < secs; t += 0.1) for (const d of dens) out.push(...d.step(0.1, q));
  return out;
}
const living = (d: Den) => d.creatures.filter((c) => c.state !== 'dead');

test('brawl: a wolf pack hunts the deer it sees, and brings one down', () => {
  const wolves = group('wolf', 4, 0), deer = group('deer', 4, 9);
  // A healthy deer outruns a wolf and the hunt breaks off; the one the winter left lame does not get away.
  deer.creatures[0].health = 6;
  const es = play([wolves, deer], 60);
  assert.ok(es.some((e) => e.kind === 'died' && e.who.def.id === 'deer' && e.by?.def.id === 'wolf'), 'a deer fell to a wolf');
  assert.ok(living(wolves).length === 4, 'the wolves are whole enough: the deer cannot stand against them');
});

/** The classic creatures with the wolf's chance of being seen by its prey set to `seen`. */
const wolvesSeen = (seen: number) => classic.creatures.map((d) => d.id === 'wolf' ? { ...d, stalks: { ...d.stalks!, seen } } : d);
/** A pack of three and a herd of three, the herd `gap` m off; healthy deer all. */
function hunt(seen: number, gap: number, seed: number, secs = 40): { es: DenEvent[]; wolves: Den; deer: Den } {
  const defs = wolvesSeen(seen), wolves = group('wolf', 3, 0, flat, 0, seed, defs), deer = group('deer', 3, gap, flat, 0, seed, defs);
  return { es: play([wolves, deer], secs), wolves, deer };
}

test('brawl: a wolf creeps up on a deer that has not noticed it, then one short burst brings it down', () => {
  const { es, deer } = hunt(0, 20, 3);
  assert.ok(es.some((e) => e.kind === 'died' && e.who.def.id === 'deer' && e.by?.def.id === 'wolf'), 'a deer fell to a wolf');
  assert.ok(living(deer).length < 3);
});

test('brawl: a deer that notices the wolf is far enough off to outrun the burst: the wolves give up and rest, the herd lives', () => {
  const { es, wolves, deer } = hunt(1, 20, 3, 20);
  assert.equal(living(deer).length, 3, 'nobody caught');
  assert.equal(es.filter((e) => e.kind === 'died').length, 0);
  assert.ok(wolves.creatures.every((c) => c.state !== 'brawl' && c.stalk === null), 'the hunt is over');
  assert.ok(wolves.creatures.some((c) => c.winded > 0), 'and they rest');
});

test('brawl: whether a deer notices a stalking wolf is a seeded chance: the same seed, the same hunt; the seeds differ', () => {
  const kills = (seed: number) => hunt(0.5, 20, seed).es.filter((e) => e.kind === 'died').length;
  const a = Array.from({ length: 12 }, (_, i) => kills(i + 1));
  assert.deepEqual(a, Array.from({ length: 12 }, (_, i) => kills(i + 1)), 'deterministic');
  assert.ok(a.some((n) => n > 0) && a.some((n) => n === 0), `some hunts end in a kill, some do not: ${a.join(' ')}`);
});

test('brawl: a wolf and a deer at ease with each other do not exist: only a feud starts a fight (allies and neutrals pass)', () => {
  // Wolves keep with wolves, goblins with goblins; wolves, boar and bandits (neutral to each other) leave each other be.
  const dens = [group('wolf', 3, 0), group('wolf', 3, 6), group('boar', 1, 12), group('bandit', 2, 18), group('goblin', 2, 40), group('goblin', 2, 46)];
  const es = play(dens.slice(0, 4), 40);
  assert.equal(es.filter((e) => e.kind === 'died' || e.kind === 'swing').length, 0, 'nobody struck a blow');
  assert.ok(dens.slice(0, 4).every((d) => d.creatures.every((c) => c.state !== 'brawl')));
  play(dens.slice(4), 40);
  assert.ok(dens.slice(4).every((d) => d.creatures.every((c) => c.state !== 'brawl' && c.health === c.def.health)));
});

test('brawl: the undead go for anything living in sight', () => {
  const bones = group('skeleton', 2, 0), boar = group('boar', 2, 8), goblins = group('goblin', 2, -8);
  const es = play([bones, boar, goblins], 3);
  assert.ok(bones.creatures.every((c) => c.state === 'brawl'), 'they turn on what they see');
  const swings = new Set(play([bones, boar, goblins], 40).filter((e) => e.kind === 'swing').map((e) => (e as { who: Creature }).who.def.faction));
  assert.ok(swings.has('undead') && (swings.has('beasts') || swings.has('goblins')), `blows were traded (${[...swings].join(', ')})`);
  assert.ok(es.every((e) => e.kind !== 'blow'), 'and none of it was the hero');
});

test('brawl: a fight is loud: those at feud with one side hear it and come, though they cannot see it', () => {
  // Goblins and smugglers are at feud; a second goblin group stands behind a ridge, out of sight, within earshot of the clash.
  const ridge: Land = { ...flat, height: (x) => (x > 6 && x < 8 ? 12 : 0) };
  const mk = (kind: string, n: number, x: number): Den => group(kind, n, x, ridge);
  const goblins = mk('goblin', 2, 0), smugglers = mk('bandit', 2, 3), late = mk('goblin', 2, 11);
  const dens = [goblins, smugglers, late];
  for (const d of dens) d.neighbours = dens.filter((o) => o !== d);
  const { hearing } = late.creatures[0].def.senses;
  assert.ok(Math.hypot(11 - 3, 0) < hearing, 'within earshot');
  for (let t = 0; t < 1; t += 0.1) for (const d of dens) d.step(0.1, far);
  assert.ok(late.creatures.every((c) => c.state === 'idle'), 'it sees nothing of it, and nothing has made a noise yet');
  for (let t = 0; t < 8; t += 0.1) for (const d of dens) d.step(0.1, far);
  assert.ok(late.creatures.some((c) => c.state === 'brawl'), 'it came to the noise');
});

test('brawl: a hero in the middle of it is still the one they turn on', () => {
  const wolves = group('wolf', 3, 0), deer = group('deer', 3, 12);
  const near: Quarry = { ...far, x: 3, z: 0, noise: 1, light: 20 };
  play([wolves, deer], 8, near);
  assert.ok(wolves.fighting.length > 0, 'the wolves hunt the hero');
});

/** A hero standing in the middle of a fray: the delves of two groups, each step both. */
function fray(a: string, b: string) {
  const hero = new Character(classic);
  const mk = (kind: string, x: number) => new Delve(null, group(kind, 3, x), classic, hero, 11 + x);
  const A = mk(a, 0), B = mk(b, 9);
  A.den.neighbours = [B.den];
  B.den.neighbours = [A.den];
  const pose = { x: 400, y: 0, z: 400, yaw: 0, speed: 0 };
  return { hero, A, B, pose };
}

test('brawl: no experience and no standing for kills the hero never hurt; a foe the hero struck pays', () => {
  const { hero, A, B, pose } = fray('wolf', 'deer');
  B.den.creatures[0].health = 6;
  const kills: Extract<FightEvent, { kind: 'killed' }>[] = [];
  for (let t = 0; t < 80; t += 0.1) for (const d of [A, B]) for (const e of d.step(0.1, pose)) if (e.kind === 'killed') kills.push(e);
  assert.ok(kills.length > 0, 'a deer fell');
  assert.ok(kills.every((k) => !k.byHero && k.xp === 0), 'nothing for it');
  assert.equal(hero.xp, 0);
  // One the hero hurt: the experience is theirs, and its faction's standing moves.
  const fresh = fray('wolf', 'deer'), target = fresh.A.den.creatures[0];
  fresh.A.fight.harm(target.id, 999, 'cut');
  const paid = fresh.A.step(0.1, fresh.pose).filter((e) => e.kind === 'killed');
  assert.equal(paid.length, 1);
  assert.ok(paid[0].kind === 'killed' && paid[0].byHero && paid[0].xp > 0);
  assert.ok(fresh.hero.xp > 0);
});

test('brawl: a den that spares its own (the town folk) has them knocked down, not killed, and they get up again', () => {
  const wolves = group('wolf', 4, 0), folk = group('townsman', 2, 6);
  folk.mercy = (c) => c.def.faction === 'watch';
  const es = play([wolves, folk], 200);
  assert.ok(es.some((e) => e.kind === 'down' && e.who.def.id === 'townsman' && e.by.def.id === 'wolf'), 'a townsman went down');
  assert.ok(!es.some((e) => e.kind === 'died' && e.who.def.id === 'townsman'), 'and none of them died');
  assert.ok(es.some((e) => e.kind === 'up'), 'one got up again');
  // Struck down by the hero's blow they still die: mercy is for the raiders' blows only.
  const one = folk.creatures[0];
  one.state = 'idle';
  one.health = 5;
  assert.ok(folk.wound(one, { damage: 50, outcome: 'hit' }, { x: 0, y: 0, z: 0 }).some((e) => e.kind === 'died'));
});

test('brawl: the watch sent at raiders goes for them unseen, and a tender cuts a fallen one\'s time short', () => {
  const wolves = group('wolf', 2, 0), watch = group('watchman', 2, 60);
  watch.mercy = () => true;
  for (const d of [wolves, watch]) d.neighbours = [wolves, watch].filter((o) => o !== d);
  for (const c of watch.creatures) watch.engage(c, { c: wolves.creatures[0], den: wolves });
  play([wolves, watch], 1);
  assert.ok(watch.creatures.every((c) => c.state === 'brawl'), 'sent');
  const fell = watch.creatures[0];
  fell.state = 'down';
  fell.downFor = 40;
  watch.tend(fell, 3);
  assert.equal(fell.downFor, 3);
});

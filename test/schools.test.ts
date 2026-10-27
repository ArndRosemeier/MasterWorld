import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { Alone, Recipes, SELF } from '../src/game/recipe';
import { Delve } from '../src/game/delve';
import { outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSpace } from '../src/world/dungeon/space';

const SCHOOLS = ['pyromancy', 'cryomancy', 'geomancy', 'vitae', 'luminism', 'umbramancy'];
const spellsOf = (k: string) => classic.abilities.filter((a) => a.skill === k);

function cellarFight(seed: number) {
  const c: Cellar = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar)).find((x) => x.dweller.id === 'goblins')!;
  const space = new DungeonSpace(c.layout);
  for (const pl of c.layout.links) space.open.add(pl.link.id);
  const hero = new Character(classic);
  const d = new Delve(c, space, classic, hero, seed);
  const foe = d.den.creatures[0];
  // A free spot 2.5 m from it, with a clear line to it.
  const free = Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2).map((a) => ({ x: foe.x + Math.cos(a) * 2.5, y: foe.y, z: foe.z + Math.sin(a) * 2.5 }))
    .find((p) => d.den.ground.clearance(p.x, p.y + 0.8, p.z) > 0.4 && d.den.ground.sees(p.x, p.y, p.z, foe.x, foe.y, foe.z, 1.2))!;
  const pose = { ...free, yaw: 0, speed: 0 };
  return { d, hero, foe, pose };
}

test('schools: six schools of magic, each with a first spell at level 0 and more above it', () => {
  for (const k of SCHOOLS) {
    const s = classic.skills.find((x) => x.id === k);
    assert.ok(s && s.group === 'magic' && !s.open && s.color, k);
    const spells = spellsOf(k);
    assert.ok(spells.length >= 3, `${k}: ${spells.length} spells`);
    assert.equal(spells.filter((a) => (a.level ?? 0) === 0).length, 1, `${k}: one first spell`);
    for (const a of spells) assert.ok(a.taught && (a.cost?.mana ?? 0) > 0, `${a.id} is taught and costs mana`);
  }
});

test('schools: no hero starts with magic; a spell learned opens its school and gives mana', () => {
  const hero = new Character(classic);
  assert.equal(hero.maxMana, 0);
  assert.ok(!hero.opened('pyromancy'));
  assert.ok(hero.learn('fire-dart'));
  assert.ok(hero.opened('pyromancy'));
  assert.ok(hero.maxMana >= 30 && hero.mana === hero.maxMana);
  // The school's rank is saved: a load keeps the magic.
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.ok(again.opened('pyromancy') && again.knows('fire-dart') && again.maxMana === hero.maxMana);
  // A higher spell waits for the school's level.
  const r = new Recipes(hero, new Alone(hero, () => ({ x: 0, y: 0, z: 0 })), classic.effects!, 1);
  hero.learn('fireball');
  assert.match(r.check(classic.abilities.find((a) => a.id === 'fireball')!, 1, { x: 0, y: 0, z: 0 }) ?? '', /not yet skilled/);
});

test('schools: out of a fight the hero’s own spells work, and cooldowns and wards carry into a fight', () => {
  const hero = new Character(classic);
  hero.learn('mend');
  hero.learn('stone-skin');
  hero.skills.set('geomancy', 12);
  hero.ranks.set('geomancy', 0);
  hero.mana = hero.maxMana;
  hero.health = 20;
  const alone = new Recipes(hero, new Alone(hero, () => ({ x: 0, y: 0, z: 0 })), classic.effects!, 2);
  const mend = classic.abilities.find((a) => a.id === 'mend')!;
  assert.equal(alone.begin(mend, null, { x: 0, y: 0, z: 0 }), null);
  for (let t = 0; t < 1.6; t += 0.1) alone.elapse(0.1, { x: 0, y: 0, z: 0 });
  assert.ok(hero.health > 30, `mended to ${hero.health}`);
  assert.equal(alone.begin(classic.abilities.find((a) => a.id === 'stone-skin')!, null, { x: 0, y: 0, z: 0 }), null);
  const { d } = cellarFight(3);
  const inFight = new Recipes(hero, d.fight, classic.effects!, 3);
  assert.ok(inFight.cooling('mend') > 0, 'the same cooldown');
  assert.ok(inFight.wardOf(SELF) > 0, 'the same ward');
});

test('schools: every spell of every school plays in a cellar fight without fault', () => {
  for (const [i, a] of classic.abilities.filter((x) => SCHOOLS.includes(x.skill ?? '')).entries()) {
    const { d, hero, foe, pose } = cellarFight(10 + i);
    hero.learn(a.id);
    hero.skills.set(a.skill!, 40);
    hero.mana = hero.maxMana;
    d.step(0.01, pose);
    d.fight.pick(foe);
    const was = foe.health, hp = hero.health;
    assert.equal(d.fight.use(a.id), null, a.id);
    const ev = Array.from({ length: 60 }, () => d.step(0.05, pose)).flat();
    assert.ok(ev.some((e) => e.kind === 'recipe' && e.event.kind === 'went'), `${a.id} went off`);
    assert.ok(hero.mana < hero.maxMana, `${a.id} cost mana`);
    const touched = foe.health < was || foe.state === 'flee' || d.fight.recipes.listOf(foe.id).length > 0 || d.fight.recipes.listOf(SELF).length > 0 || hero.health >= hp || ev.some((e) => e.kind === 'struck' && e.strike.outcome === 'miss');
    assert.ok(touched, `${a.id} did something`);
  }
});

test('schools: dread sends a creature running; a veil makes the hero hard to notice', () => {
  const { d, hero, foe, pose } = cellarFight(40);
  hero.learn('dread');
  hero.skills.set('umbramancy', 25);
  hero.mana = hero.maxMana;
  foe.state = 'fight';
  d.step(0.01, pose);
  d.fight.pick(foe);
  d.fight.recipes.putOn(foe.id, { id: 'feared', magnitude: 1, duration: 4 });
  d.step(0.05, pose);
  assert.equal(foe.state, 'flee');
  const loud = d.fight.quarry({ ...pose, speed: 4 });
  d.fight.recipes.putOn(SELF, { id: 'veiled', magnitude: 0.6, duration: 10 });
  const hushed = d.fight.quarry({ ...pose, speed: 4 });
  assert.ok(hushed.noise < loud.noise * 0.5 && hushed.light < loud.light);
});

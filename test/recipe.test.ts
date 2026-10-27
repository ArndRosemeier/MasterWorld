import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateSetting, type AbilityDef, type SettingModule } from '../src/setting/contract';
import { aimsAtFoe, costText, Recipes, SELF, shapeOf, type Caster, type Mark, type RecipeEvent, type RecipeWorld, type TerrainEdit } from '../src/game/recipe';
import type { Blow } from '../src/sim/combat';
import { Character } from '../src/game/character';
import { Delve } from '../src/game/delve';
import { outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSpace } from '../src/world/dungeon/space';

/** A small world: the caster at the origin and foes where a test puts them. */
class TestWorld implements RecipeWorld {
  readonly hits: { id: number; blow: Blow }[] = [];
  readonly hurts: { id: number; amount: number }[] = [];
  readonly heals: { id: number; amount: number }[] = [];
  readonly edits: TerrainEdit[] = [];
  readonly shapes: string[] = [];
  ground = true;
  wall: number | null = null;
  me: Mark = { id: SELF, x: 0, y: 0, z: 0, radius: 0.35, foe: false };
  constructor(public foes: Mark[] = []) {}
  marks(): readonly Mark[] { return [this.me, ...this.foes]; }
  hit(id: number, blow: Blow): void { this.hits.push({ id, blow }); }
  harm(id: number, amount: number): void { this.hurts.push({ id, amount }); }
  heal(id: number, amount: number): number { this.heals.push({ id, amount }); return amount; }
  terrain(edit: TerrainEdit): boolean { this.edits.push(edit); return this.ground; }
  shape(op: { into: string }): string | null { this.shapes.push(op.into); return null; }
  clear(at: { x: number }): boolean { return this.wall === null || at.x < this.wall; }
}

const caster = (mana = 50): Caster => ({ stamina: 60, mana, health: 50, maxHealth: 80, skill: () => 20 });
const foe = (id: number, x: number, z = 0): Mark => ({ id, x, y: 0, z, radius: 0.4, foe: true });
const here = { x: 0, y: 0, z: 0 };
const kinds = (ev: readonly RecipeEvent[]) => ev.map((e) => e.kind);

/** Run the runner `t` seconds in steps of `dt`, gathering what happened. */
function run(r: Recipes, t: number, dt = 0.05, speed = 0): RecipeEvent[] {
  const out: RecipeEvent[] = [];
  for (let s = 0; s < t - 1e-9; s += dt) out.push(...r.elapse(dt, here, speed));
  return out;
}

const bolt: AbilityDef = {
  id: 'bolt', name: 'Bolt', text: '', skill: 'blades', cost: { mana: 10 }, cooldown: 4, cast: 1.5,
  ops: [{ op: 'projectile', speed: 20, damage: 10, kind: 'cold', effect: { id: 'chilled', magnitude: 0.4, duration: 3 }, onHit: [{ op: 'area', radius: 2, damage: 4 }] }],
};

test('recipes: costs are checked and paid, the cooldown runs, the cast needs standing still', () => {
  const w = new TestWorld([foe(1, 10)]), h = caster(5);
  const r = new Recipes(h, w, classic.effects!, 1);
  assert.match(r.check(bolt, 1, here) ?? '', /mana/);
  h.mana = 50;
  assert.match(r.check(bolt, null, here) ?? '', /target/);
  assert.match(r.check(bolt, 1, { x: -30, y: 0, z: 0 }) ?? '', /too far/);
  assert.equal(r.begin(bolt, 1, here), null);
  assert.deepEqual(kinds(r.elapse(0.01, here)), ['cast']);
  assert.equal(h.mana, 50, 'paid when it goes off, not before');
  // Walking breaks it; nothing is paid, the cooldown does not start.
  assert.deepEqual(kinds(run(r, 0.1, 0.05, 2)), ['broken']);
  assert.equal(r.cooling('bolt'), 0);
  assert.equal(h.mana, 50);
  r.begin(bolt, 1, here);
  const ev = run(r, 1.5);
  assert.ok(kinds(ev).includes('went') && kinds(ev).includes('loosed'), kinds(ev).join());
  assert.equal(h.mana, 40);
  assert.ok(r.cooling('bolt') > 3.9);
  assert.match(r.check(bolt, 1, here) ?? '', /not ready/);
  run(r, 4.1);
  assert.equal(r.cooling('bolt'), 0);
  assert.equal(costText(bolt), '10 mana');
});

test('recipes: a projectile flies at its speed, lands on its target, chills it and bursts', () => {
  const w = new TestWorld([foe(1, 10), foe(2, 11, 1), foe(3, 30)]);
  const r = new Recipes(caster(), w, classic.effects!, 2);
  r.begin({ ...bolt, cast: 0 }, 1, here);
  const early = run(r, 0.3);
  assert.ok(!kinds(early).includes('landed'), 'still in the air after 0.3 s at 20 m/s over 10 m');
  assert.equal(r.shots.length, 1);
  const ev = run(r, 0.4);
  const landed = ev.find((e) => e.kind === 'landed');
  assert.ok(landed && landed.kind === 'landed' && landed.on === 1);
  // The bolt itself on 1; the burst on 1 and 2 (near), never 3 (far) nor the caster.
  assert.deepEqual(w.hits.map((x) => x.id), [1, 1, 2]);
  assert.equal(w.hits[0].blow.kind, 'cold');
  assert.ok(w.hits[0].blow.damage[0] > 8 && w.hits[0].blow.damage[1] < 12);
  assert.ok(r.slowOf(1) > 0.3 && r.slowOf(2) === 0, 'chilled');
  run(r, 3.1);
  assert.equal(r.slowOf(1), 0, 'the chill wears off');
});

test('recipes: a projectile stops at a wall, and follows a target that moves', () => {
  const w = new TestWorld([foe(1, 10)]);
  w.wall = 5;
  const r = new Recipes(caster(), w, classic.effects!, 3);
  r.begin({ ...bolt, cast: 0, ops: [{ op: 'projectile', speed: 20, damage: 10 }] }, 1, here);
  const ev = run(r, 1);
  assert.ok(ev.some((e) => e.kind === 'landed' && e.on === null));
  assert.equal(w.hits.length, 0);
  w.wall = null;
  r.begin({ ...bolt, id: 'b2', cast: 0, ops: [{ op: 'projectile', speed: 10, damage: 10 }] }, 1, here);
  run(r, 0.5);
  w.foes = [foe(1, 6, 4)];
  run(r, 1.5);
  assert.deepEqual(w.hits.map((x) => x.id), [1]);
});

test('recipes: an area touches foes in its radius, a healing one friends; a zone ticks for its time', () => {
  const w = new TestWorld([foe(1, 2), foe(2, 6)]);
  const r = new Recipes(caster(), w, classic.effects!, 4);
  const nova: AbilityDef = { id: 'nova', name: 'Nova', text: '', aim: 'self', cooldown: 0, ops: [{ op: 'area', radius: 3, at: 'self', damage: 6 }] };
  r.begin(nova, null, here);
  assert.deepEqual(w.hits.map((x) => x.id), [1]);
  const balm: AbilityDef = { id: 'balm', name: 'Balm', text: '', aim: 'self', cooldown: 0, ops: [{ op: 'area', radius: 3, at: 'self', heal: 5 }] };
  r.begin(balm, null, here);
  assert.deepEqual(w.heals.map((x) => x.id), [SELF]);
  const ring: AbilityDef = {
    id: 'ring', name: 'Ring', text: '', cooldown: 0, aim: 'foe',
    ops: [{ op: 'zone', radius: 2, duration: 3, tick: 1, at: 'target', ops: [{ op: 'area', radius: 2, damage: 3 }] }],
  };
  w.hits.length = 0;
  r.begin(ring, 2, here);
  const ev = run(r, 3.2, 0.1);
  assert.equal(w.hits.filter((x) => x.id === 2).length, 3, 'one tick at once, then every second, three in all');
  assert.ok(ev.some((e) => e.kind === 'zone' && e.ended));
  assert.equal(r.zones.length, 0);
});

test('recipes: effects wear on: bleeding hurts over its time, mending heals, held and warded', () => {
  const w = new TestWorld([foe(1, 2)]);
  const r = new Recipes(caster(), w, classic.effects!, 5);
  r.putOn(1, { id: 'bleeding', magnitude: 2, duration: 3 });
  r.putOn(1, { id: 'held', magnitude: 1, duration: 1 });
  r.putOn(SELF, { id: 'warded', magnitude: 4, duration: 2 });
  assert.ok(r.isHeld(1) && r.heldFor(1) === 1 && r.wardOf(SELF) === 4);
  run(r, 3.2, 0.1);
  const total = w.hurts.filter((x) => x.id === 1).reduce((a, x) => a + x.amount, 0);
  assert.ok(Math.abs(total - 6) < 0.3, `bled ${total}`);
  assert.ok(!r.isHeld(1) && r.wardOf(SELF) === 0);
  // The same effect again refreshes it rather than stacking.
  r.putOn(SELF, { id: 'mending', magnitude: 3, duration: 2 });
  r.putOn(SELF, { id: 'mending', magnitude: 3, duration: 2 });
  run(r, 2.05, 0.05);
  const healed = w.heals.filter((x) => x.id === SELF).reduce((a, x) => a + x.amount, 0);
  assert.ok(Math.abs(healed - 6) < 0.3, `mended ${healed}`);
  // A chance of 0 never takes.
  r.putOn(1, { id: 'held', magnitude: 1, duration: 5, chance: 0 });
  assert.ok(!r.isHeld(1));
});

test('recipes: a terrain step asks the world, a delay waits, a change of shape goes to the world', () => {
  const w = new TestWorld([foe(1, 8)]);
  const r = new Recipes(caster(), w, classic.effects!, 6);
  const wall: AbilityDef = { id: 'wall', name: 'Wall', text: '', aim: 'foe', cooldown: 0, ops: [{ op: 'delay', t: 0.5, ops: [{ op: 'terrain', shape: 'wall', radius: 1, length: 4, height: 2 }] }] };
  r.begin(wall, 1, here);
  assert.equal(w.edits.length, 0);
  run(r, 0.6);
  assert.equal(w.edits.length, 1);
  assert.equal(w.edits[0].x, 8);
  assert.ok(Math.abs(w.edits[0].dir) < 1e-9, 'facing from the caster to the point');
  w.ground = false;
  r.begin(wall, 1, here);
  const ev = run(r, 0.6);
  assert.ok(ev.some((e) => e.kind === 'refused'));
  const bird = classic.abilities.find((a) => shapeOf(a))!;
  assert.ok(!aimsAtFoe(bird));
  r.begin(bird, null, here);
  assert.deepEqual(w.shapes, ['bird']);
  assert.ok(r.cooling(bird.id) > 0);
});

test('recipes: the setting checks every recipe step', () => {
  assert.deepEqual(validateSetting(classic), []);
  const bad: SettingModule = {
    ...classic,
    abilities: [...classic.abilities, { id: 'broken', name: 'Broken', text: '', cooldown: -1, skill: 'nope', ops: [{ op: 'zone', radius: 0, duration: 1, tick: 2, ops: [{ op: 'effect', to: 'target', effect: { id: 'ghost', magnitude: 1, duration: 1 } }] }] }],
  };
  const errors = validateSetting(bad).join('\n');
  for (const want of ['unknown skill "nope"', 'cooldown', 'zone needs a radius', 'tick within', 'effect "ghost"']) assert.ok(errors.includes(want), errors);
});

test('recipes: in a cellar fight, a spell flies at the target and hurts it; second wind needs no target', () => {
  const c: Cellar = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar)).find((x) => x.dweller.id === 'rats')!;
  const space = new DungeonSpace(c.layout);
  for (const pl of c.layout.links) space.open.add(pl.link.id);
  const setting: SettingModule = { ...classic, abilities: [...classic.abilities, { ...bolt, cost: { stamina: 5 }, cast: 0, range: 40, ops: [{ op: 'projectile', speed: 30, damage: 30, kind: 'cold' }] }] };
  const hero = new Character(setting);
  const d = new Delve(c, space, setting, hero, 7);
  const rat = d.den.creatures[0];
  const pose = { x: rat.x + 2, y: rat.y, z: rat.z, yaw: 0, speed: 0 };
  d.step(0.01, pose);
  d.fight.pick(rat);
  const was = rat.health, stamina = hero.stamina;
  assert.equal(d.fight.use('bolt'), null);
  assert.ok(hero.stamina < stamina);
  const ev = Array.from({ length: 20 }, () => d.step(0.05, pose)).flat();
  assert.ok(ev.some((e) => e.kind === 'recipe' && e.event.kind === 'landed'), ev.map((e) => e.kind).join());
  const struck = ev.find((e) => e.kind === 'struck');
  assert.ok(struck && struck.kind === 'struck' && struck.spell);
  if (struck.strike.outcome !== 'miss') assert.ok(rat.health < was || rat.state === 'dead');
  // Second wind: aimed at the hero, no target needed; its cooldown runs.
  assert.equal(d.fight.use('breath'), null);
  assert.ok(d.fight.recipes.cooling('breath') > 80);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { SIGHT_SHAPES } from '../src/setting/contract';
import { findIn, restingAt, sightFor, sightsOf, type NeedContext } from '../src/vgm/answers';
import { Township } from '../src/game/township';
import { answerNeed } from '../src/vgm/toolbox';
import { layOutSight } from '../src/world/sites';
import { EAST, frontierLand } from './frontierLand';

const { home, seed, terrain, walk } = frontierLand();

// C9: an overdue need asks the tools that meet it for their cheapest fitting move, on the hero's way.

const log = walk(2, EAST);
const out = { x: home.x + home.radius + 250, z: home.z };
const c = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: classic, hero: out, toward: { x: out.x + 600, z: out.z }, ...over });

test('answers: Discovery overdue puts a sight by the hero\'s way, on dry ground off towns and places', () => {
  const m = answerNeed('discovery', c());
  assert.ok(m, 'a sight fits');
  assert.equal(m.tool, 'sight');
  assert.equal(m.need, 'discovery');
  const d = m.decision;
  assert.equal(d.kind, 'sight');
  if (d.kind !== 'sight') return;
  assert.ok(classic.sights!.some((s) => s.id === d.sight));
  // Ahead on the way (towards +x), a little to its side.
  assert.ok(d.x > out.x + 40 && d.x < out.x + 300, `ahead: ${(d.x - out.x).toFixed(0)} m`);
  assert.ok(Math.abs(d.z - out.z) < 60, `by the way: ${(d.z - out.z).toFixed(0)} m aside`);
  const h = terrain.height(d.x, d.z);
  assert.equal(terrain.waterDepth(d.x, d.z, h), 0);
  for (const t of terrain.towns) assert.ok(Math.hypot(t.decision.x - d.x, t.decision.z - d.z) > t.decision.radius + 60);
  assert.deepEqual(sightFor(c()), d, 'seeded');
  // It stands in a glade of its own: the trees keep off it.
  terrain.settleMore([d]);
  assert.ok(terrain.fromClearing(d.x, d.z) < -10, 'in a glade');
  // The next keeps away from it and is another sight.
  const next = sightFor(c({ log: [...log, d], hero: { x: d.x + 400, z: d.z }, toward: { x: d.x + 1200, z: d.z } }));
  assert.ok(next && Math.hypot(next.x - d.x, next.z - d.z) >= 350, 'apart');
  assert.notEqual(next!.sight, d.sight, 'not the one met last');
  assert.equal(sightsOf([...log, d, next!]).length, 2);
});

test('answers: Reward overdue hides a find by the way; it holds something worth taking', () => {
  const m = answerNeed('reward', c());
  assert.ok(m && m.tool === 'cache' && m.need === 'reward');
  const d = m.decision;
  assert.ok(d.kind === 'sight' && d.need === 'reward');
  if (d.kind !== 'sight') return;
  const def = classic.sights!.find((x) => x.id === d.sight)!;
  assert.equal(def.need, 'reward', 'only a find answers Reward');
  const loot = findIn(classic, def, d, home)!;
  assert.ok(loot.items.length >= 1 && loot.coins > 0, 'something in it');
  assert.deepEqual(findIn(classic, def, d, home), loot, 'seeded');
  assert.equal(findIn(classic, classic.sights!.find((x) => !x.loot)!, d, home), null, 'a sight holds nothing');
});

test('answers: Challenge overdue puts an ambush of the wild ahead on the way', () => {
  const m = answerNeed('challenge', c());
  assert.ok(m && m.tool === 'ambush' && m.need === 'challenge');
  const d = m.decision;
  assert.ok(d.kind === 'wild' && d.group === 'ambush');
  if (d.kind !== 'wild') return;
  assert.equal(classic.encounters.find((e) => e.id === d.encounter)?.need, 'challenge');
  assert.ok(d.members.length >= 1);
  assert.ok(d.x > out.x + 40 && d.x < out.x + 300, `ahead: ${(d.x - out.x).toFixed(0)} m`);
  assert.equal(answerNeed('challenge', c({ log: [...log, d] }))!.decision.id, 'ambush-2', 'counted');
});

test('answers: People overdue brings a town\'s traveller to rest by the way; they stand there, then go on', () => {
  const m = answerNeed('people', c());
  assert.ok(m && m.tool === 'traveller' && m.need === 'people');
  const d = m.decision;
  assert.ok(d.kind === 'traveller');
  if (d.kind !== 'traveller') return;
  assert.ok(d.x > out.x + 40 && d.x < out.x + 300, `ahead: ${(d.x - out.x).toFixed(0)} m`);
  assert.ok(d.until > d.at);
  const withIt = [...log, d];
  assert.equal(answerNeed('people', c({ log: withIt })), null, 'the one town with an inn has its traveller out already');
  let hours = d.at + 0.5;
  const town = terrain.towns.find((t) => t.decision.id === d.town)!;
  const t = new Township(town, { seed, setting: classic, log: () => withIt, hours: () => hours });
  const a = t.life.agents.find((x) => x.person.role === 'traveller')!;
  assert.ok(!a.hidden && Math.hypot(a.x - d.x, a.z - d.z) < 0.01, 'resting where the VGM met the hero with them');
  assert.ok(t.posts.some((p) => p.x === d.x && p.z === d.z), 'the hero there is with that town\'s people');
  assert.equal(restingAt(withIt, hours).length, 1);
  hours = d.until + 0.1;
  void t.life;
  assert.ok(a.hidden && !a.post, 'on the road again');
  assert.equal(t.posts.length, t.retreats.length);
});

test('answers: a need with no tool for it, or a setting without sights, gets no answer', () => {
  assert.equal(answerNeed('purpose', c()), null);
  assert.equal(answerNeed('discovery', c({ setting: { ...classic, sights: [] } })), null);
});

test('answers: every sight shape stands on the land, with something the walker cannot go through', () => {
  for (const [i, shape] of SIGHT_SHAPES.entries()) {
    const l = layOutSight({ kind: 'sight', id: `sight-${i}`, sight: shape, x: out.x, z: out.z, yaw: 0.4, seed: 9 + i, at: 0 }, shape, (x, z) => terrain.height(x, z));
    assert.ok(l.mesh.index.length >= 36, `${shape}: drawn`);
    assert.ok(l.solids.length >= 1, `${shape}: solid`);
  }
});

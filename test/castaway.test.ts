import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import type { NeedContext } from '../src/vgm/answers';
import { castawayFor, castawaysAt, criesDue } from '../src/vgm/situations';
import { keepPromise } from '../src/vgm/leads';
import { wildFor } from '../src/vgm/wild';
import { Castaways, REACH, type CastawayHero } from '../src/game/shipCrews';
import type { CastawayDecision } from '../src/world/decisions';

const seed = parseSeed('masterworld'), { terrain, log } = openWorld(seed, classic), home = terrain.towns[0].decision;

/** A dry strand near the start, the sea beside it: where the giant crabs live (vgm/wild.ts habitat shore). */
function strand(): { x: number; z: number } {
  const crabs = wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, terrain.towns[0]).find((w) => w.group === 'crabs');
  if (!crabs) throw new Error('no strand');
  return { x: crabs.x, z: crabs.z };
}
const beach = strand();
const c = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: classic, hero: beach, toward: null, ...over });

/** The first castaway People's answer gives on the strand over the next few tries. */
function adrift(): CastawayDecision {
  for (let h = 30; h < 60; h++) { const d = castawayFor(c({ hours: h })); if (d) return d; }
  throw new Error('no castaway');
}

test('castaway (S9): by the sea, People\'s answer is now and then a fisher clinging to an upturned boat off the strand near the hero; one at a time; cries once seen', () => {
  const d = adrift();
  assert.equal(d.town, home.id, 'a fisher of the harbour town');
  const far = Math.hypot(d.x - beach.x, d.z - beach.z), deep = -terrain.height(d.x, d.z);
  assert.ok(far >= 45 && far <= 160, `${far.toFixed(0)} m off the hero`);
  assert.ok(deep >= 2.5 && deep <= 7, `${deep.toFixed(1)} m of water under them`);
  assert.deepEqual(castawayFor(c({ hours: d.at })), d, 'the same on every run');
  const more = [...log, d];
  assert.equal(castawayFor(c({ log: more, hours: d.at + 0.5 })), null, 'one adrift at a time');
  assert.deepEqual(castawaysAt(more, d.at + 0.5), [d]);
  assert.deepEqual(castawaysAt(more, d.until + 0.1), [], 'picked up by another boat in the end');
  assert.deepEqual(castawaysAt([...more, keepPromise(more, d.id, d.at + 0.3)!], d.at + 0.5), [], 'brought in');
  const cry = (hero: { x: number; z: number }) => criesDue({ log: more, setting: classic, towns: terrain.towns, hero, hours: d.at + 0.1, cried: new Set() }).filter((x) => x.kind === 'castaway');
  assert.equal(cry(home).length, 0, 'not heard from town');
  assert.equal(cry({ x: d.x + 20, z: d.z }).length, 1, 'cries once the hero is near enough to see them');
  assert.equal(castawayFor(c({ hero: { x: home.x + 5000, z: home.z + 5000 } })), null, 'none far from the sea and its harbour');
});

test('castaway (S9): the fisher treads water by the boat, takes hold of the hero swimming up, is brought in behind them and wades out onto the strand, saved once', () => {
  // A plain shore: the sea east of x = 0 (its bed falling 0.2 m a metre), dry land west of it.
  const water = { surface: () => 0, ground: (x: number) => -x * 0.2 };
  const d: CastawayDecision = { kind: 'castaway', id: 'castaway-1', town: 't', x: 30, z: 0, yaw: 0, seed: 5, at: 0, until: 2, situation: 'castaway' };
  const cast = new Castaways(seed);
  let saved = 0;
  cast.saved = () => { saved++; };
  const hero = (x: number, swimming = true, yaw = -Math.PI / 2): CastawayHero => ({ x, y: 0, z: 0, yaw, swimming });
  let [p] = cast.drift(0.1, [d], hero(-20, false), water);
  assert.equal(p.act, 'tread');
  assert.ok(Math.hypot(p.x - d.x, p.z - d.z) < 2, 'by the boat');
  assert.ok(p.y < 0 && p.y > -0.5, 'head and shoulders out of the water');
  // The hero swims out to them (facing +x: yaw −π/2) and takes them in tow.
  [p] = cast.drift(0.1, [d], hero(p.x - REACH * 0.6), water);
  assert.equal(cast.stateOf(d.id), 'towed');
  // Back towards the land (facing −x: yaw π/2): they swim along behind.
  for (let x = p.x; x > 2; x -= 0.15) [p] = cast.drift(0.1, [d], hero(x, true, Math.PI / 2), water);
  assert.equal(p.act, 'swim');
  assert.ok(p.x > 2.5, 'behind the hero, seaward');
  // On their feet in the shallows: the fisher wades on past them up onto the dry strand.
  for (let k = 0; k < 120; k++) [p] = cast.drift(0.1, [d], hero(1.5, false, Math.PI / 2), water);
  assert.equal(cast.stateOf(d.id), 'ashore');
  assert.ok(water.ground(p.x) > 0.15, 'out of the water');
  assert.equal(p.act, 'wait');
  assert.equal(saved, 1, 'saved, once');
  for (let k = 0; k < 20; k++) cast.drift(0.1, [], hero(1.5, false), water);
  assert.equal(saved, 1);
  assert.equal(cast.fishers.length, 1, 'stays where they came ashore while the hero is near');
  cast.drift(0.1, [], hero(-200, false), water);
  assert.equal(cast.fishers.length, 0, 'gone home once the hero has gone');
  // Never reached: another boat picks them up.
  const left = new Castaways(seed);
  left.drift(0.1, [d], hero(-50, false), water);
  assert.equal(left.drift(0.1, [], hero(-50, false), water).length, 0);
});

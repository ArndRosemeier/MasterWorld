import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, HERO_R, blocksHero, keepApart, radiusOf, type Creature, type Quarry } from '../src/sim/creatures';

// Bodies have substance (Arnd 2026-10-30): foes, the hero and other bands block each other, never pass through.
const guard = { defence: 20, armour: 1, open: false };
const hero = (x: number, z: number): Quarry => ({ x, y: 0, z, noise: 1, light: 0, alive: true, guard });
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const den = (kind: string, n: number, x: number, z: number, seed: number) =>
  new Den(new OpenGround(flat, [{ x, z, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
const rouse = (d: Den, q: Quarry) => { for (const c of d.creatures) d.wound(c, { damage: 0, outcome: 'miss' }, q); };
/** Lined up a body apart at x, along z. */
const line = (cs: readonly Creature[], x: number) => cs.forEach((c, i) => { c.x = x; c.z = (i - cs.length / 2) * 1.4; });
/** How deep the worst two living bodies (and a foe and the hero) overlap, metres. */
function worst(all: readonly Creature[], q: Quarry): number {
  let w = 0;
  const live = all.filter((c) => c.state !== 'dead' && !c.hop);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    if (blocksHero(a.def)) w = Math.max(w, radiusOf(a.def) + HERO_R - Math.hypot(a.x - q.x, a.z - q.z));
    for (let j = i + 1; j < live.length; j++) w = Math.max(w, radiusOf(a.def) + radiusOf(live[j].def) - Math.hypot(a.x - live[j].x, a.z - live[j].z));
  }
  return w;
}

test('bodies: a pack and a band rushing one hero never pass through each other, nor through the hero', () => {
  const q = hero(0, 0), wolves = den('wolf', 5, -8, 0, 3), bandits = den('highwayman', 3, 8, 0, 4);
  line(wolves.creatures, -8); line(bandits.creatures, 8);
  rouse(wolves, q); rouse(bandits, q);
  let deepest = 0;
  for (let i = 0; i < 160; i++) {
    wolves.neighbours = [bandits]; bandits.neighbours = [wolves];
    wolves.step(0.05, q); bandits.step(0.05, q); keepApart([wolves, bandits]);
    deepest = Math.max(deepest, worst([...wolves.creatures, ...bandits.creatures], q));
  }
  assert.ok(deepest < 0.03, `worst overlap ${deepest.toFixed(3)} m`);
  const near = [...wolves.creatures, ...bandits.creatures].filter((c) => Math.hypot(c.x, c.z) < 3).length;
  assert.ok(near >= 5, `they did close in (${near} near the hero)`);
});

test('bodies: with the ring round the hero full, the rest wait behind, neither hopping nor pressing in', () => {
  const q = hero(0, 0), pack = den('wolf', 10, -6, 0, 5);
  line(pack.creatures, -6);
  rouse(pack, q);
  let deepest = 0;
  for (let i = 0; i < 200; i++) { pack.step(0.05, q); deepest = Math.max(deepest, worst(pack.creatures, q)); }
  assert.ok(deepest < 0.03, `worst overlap ${deepest.toFixed(3)} m`);
  assert.ok(pack.creatures.every((c) => c.hopIn === 0), 'nobody leapt over the others');
});

test('bodies: the hero is blocked by a foe but not by a rat, and one stuck in a foe may step out', () => {
  const wolf = den('wolf', 1, 0, 0, 1), rat = den('rat', 1, 0, 0, 2), w = wolf.creatures[0], r = rat.creatures[0];
  w.x = 0; w.z = 0; r.x = 0; r.z = 0;
  assert.ok(!blocksHero(r.def) && blocksHero(w.def));
  assert.ok(wolf.pressedBy(0.5, 0, 0, HERO_R, 2, 0), 'walking into the wolf: blocked');
  assert.ok(!rat.pressedBy(0.3, 0, 0, HERO_R, 2, 0), 'a rat is stepped over');
  assert.ok(!wolf.pressedBy(0.6, 0, 0, HERO_R, 0.4, 0), 'already in it: may step out');
  assert.ok(!wolf.pressedBy(0.5, 3, 0, HERO_R, 2, 3), 'on a ledge above it: free');
  w.state = 'dead';
  assert.ok(!wolf.pressedBy(0.2, 0, 0, HERO_R, 2, 0), 'the dead do not block');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateCamps } from '../src/setting/contract';
import { levelOfDanger } from '../src/game/growth';
import { died, edgeOf, holdsNamed, levelled, postDef, respawnAfter, returned, returnsDue, RETURN_SEEN, type CampSave } from '../src/sim/camps';
import { Den } from '../src/sim/creatures';
import { OpenGround, type Land } from '../src/sim/wild';
import { bandOf, campsOf, layOutZone, zoneKeyAt, zonesOf, zonesWanted } from '../src/vgm/zones';
import type { CampDecision, Decision } from '../src/world/decisions';
import { boundsOf, type RegionKey } from '../src/world/regions';
import { startWorld } from './frontierLand';

// D69, phase Z2 (camps as data), Z3 (zones laid out ahead) and Z5 (density, roads as safe lanes).
const C = classic.camps!, G = classic.growth;
const def = (id: string) => classic.creatures.find((c) => c.id === id)!;
const campDef = (d: CampDecision) => C.camps.find((x) => x.id === d.camp)!;

/** The start's zone and the one east of it, laid out once for the file (each takes a few tenths of a second). */
let laid: { log: Decision[]; keys: RegionKey[] } | null = null;
function zones(): { log: Decision[]; keys: RegionKey[] } {
  if (laid) return laid;
  const w = startWorld(), home = w.home;
  let log: Decision[] = [...w.log];
  const k0 = zoneKeyAt(C, home.x, home.z), keys = [k0, { ...k0, z: k0.z + 1 }];
  for (const k of keys) log = [...log, ...layOutZone({ seed: w.terrain.seed, terrain: w.terrain, setting: classic, log, home, hours: 0 }, k)];
  return (laid = { log, keys });
}

test('camps: the classic camps and zones are well formed', () => {
  assert.deepEqual(validateCamps(classic, C, 'classic'), []);
  // Tents in the open are the exception (Z4: at most one camp in ten): no camp falls back to them more than one time in ten.
  for (const c of C.camps) {
    const total = Object.values(c.pieces).reduce((a, w) => a + (w ?? 0), 0);
    assert.ok((c.pieces.tents ?? 0) / total <= 0.1, `${c.id} is tents too often`);
  }
});

test('levels: a foe scaled to a level is that level\'s even fight, stronger the higher it stands', () => {
  const g = def('goblin');
  for (const lv of [1, 4, 9, 15, 20]) {
    const d = levelled(g, lv, G);
    assert.equal(levelOfDanger(G, d.danger), lv, `level ${lv}`);
    assert.equal(d.id, 'goblin', 'still a goblin');
  }
  assert.equal(levelled(g, 1, G), g, 'at its own level it is itself');
  const lo = levelled(g, 4, G), hi = levelled(g, 12, G);
  assert.ok(hi.health > lo.health && hi.attacks[0].damage[1] > lo.attacks[0].damage[1] && hi.attacks[0].prowess > lo.attacks[0].prowess && hi.defence > lo.defence);
});

test('zones: bands rise outwards from the start, neighbours differ by at most three, and each band lies in several directions', () => {
  const w = startWorld(), home = w.home, k0 = zoneKeyAt(C, home.x, home.z);
  assert.deepEqual(bandOf(C, k0, home), [1, 5], 'the start zone is 1 to 5');
  // A walk of 10 km out in any direction: the bands never fall, and rise.
  for (const a of [0, 1.3, 2.6, 4.2]) {
    let last = 0;
    for (let m = 0; m <= 10000; m += 250) {
      const lo = bandOf(C, zoneKeyAt(C, home.x + Math.cos(a) * m, home.z + Math.sin(a) * m), home)[0];
      assert.ok(lo >= last, `falls at ${m} m`);
      last = lo;
    }
    assert.ok(last >= 10, 'harder far out');
  }
  // Neighbours (side by side or corner to corner) differ by at most three at their lower end.
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const k = { level: C.zoneLevel, x: k0.x + dx, z: k0.z + dz }, lo = bandOf(C, k, home)[0];
    for (const [ex, ez] of [[1, 0], [0, 1], [1, 1], [1, -1]]) assert.ok(Math.abs(bandOf(C, { ...k, x: k.x + ex, z: k.z + ez }, home)[0] - lo) <= 3);
  }
  // Each band below the top lies on all four sides of the start: the hero has a choice of way.
  for (const lo of [4, 7, 10]) {
    const ways = new Set<string>();
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if (bandOf(C, { level: C.zoneLevel, x: k0.x + dx, z: k0.z + dz }, home)[0] === lo) ways.add(`${Math.sign(dx)},${Math.sign(dz)}`);
    assert.ok(ways.size >= 4, `band ${lo} in ${ways.size} directions`);
  }
});

test('zones: a zone is laid out whole, once, the same for the same log, with its camps dense and in its band', () => {
  const { log, keys } = zones();
  const w = startWorld(), t = w.terrain;
  assert.equal(zonesOf(log).length, 2);
  // Laid out once: asking again gives nothing, and the hero standing in it wants no zone there.
  assert.deepEqual(layOutZone({ seed: t.seed, terrain: t, setting: classic, log, home: w.home, hours: 9 }, keys[0]), []);
  assert.ok(!zonesWanted(log, C, w.home, 0).length);
  // The same log lays the same zone out (the log replays it).
  const again = layOutZone({ seed: t.seed, terrain: t, setting: classic, log: w.log, home: w.home, hours: 0 }, keys[0]);
  assert.deepEqual(again, log.slice(w.log.length, w.log.length + again.length));
  for (const z of zonesOf(log)) {
    const camps = campsOf(log).filter((c) => c.zone === z.id), sizes = camps.map((c) => campDef(c).size);
    assert.ok(camps.length >= 20 && camps.length <= C.density.count[1], `${z.name}: ${camps.length} camps`);
    assert.ok(sizes.includes('big'), `${z.name} has a big camp`);
    assert.ok(sizes.filter((s) => s === 'small').length > sizes.length / 2, `mostly small: ${sizes.join(' ')}`);
    for (const c of camps) {
      assert.ok(c.level >= z.band[0] && c.level <= z.band[1], `${c.id} level ${c.level} in ${z.band}`);
      for (const p of c.posts) assert.ok(p.level >= z.band[0] && p.level <= z.band[1] && Math.hypot(p.x - c.x, p.z - c.z) <= c.r * 1.15 + 0.01);
      assert.equal(c.posts.filter((p) => p.leader).length, 1, 'one leader');
    }
  }
  // Tents in the open at most one camp in ten (Z4).
  const all = campsOf(log);
  assert.ok(all.filter((c) => c.landmark === 'tents').length <= all.length / 10);
});

test('zones: camps stand apart, clear of towns, and no camp\'s aggro reaches a road (Z5: roads are safe lanes)', () => {
  const { log } = zones();
  const t = startWorld().terrain, camps = campsOf(log), reach = classic.aggro.max;
  for (let i = 0; i < camps.length; i++) for (let j = i + 1; j < camps.length; j++) {
    const a = camps[i], b = camps[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r >= C.apart - 0.1, `${a.id} and ${b.id} too close`);
  }
  const roads: number[][] = [];
  for (const d of log) if (d.kind === 'road') { const p: number[] = []; for (let i = 0; i < d.pts.length; i += 3) p.push(d.pts[i], d.pts[i + 2]); roads.push(p); }
  for (const town of t.towns) for (const s of town.plan.streets) if (s.kind === 'road') roads.push([...s.pts]);
  for (const c of camps) {
    // Every post's widest aggro (a foe far above the hero) stays off every road's centre line.
    for (const p of c.posts) for (const l of roads) for (let i = 0; i + 1 < l.length; i += 2) assert.ok(Math.hypot(l[i] - p.x, l[i + 1] - p.z) > reach, `${c.id} reaches a road`);
    for (const town of t.towns) assert.ok(Math.hypot(town.decision.x - c.x, town.decision.z - c.z) > town.decision.radius + c.r, `${c.id} in ${town.decision.id}`);
  }
});

test('zones: off the roads and towns, a camp\'s edge lies within about 200 m of almost any dry point (Z5)', () => {
  const { log, keys } = zones();
  const t = startWorld().terrain, camps = campsOf(log);
  for (const k of keys) {
    const [x0, z0, x1, z1] = boundsOf(k);
    let n = 0, near = 0;
    for (let x = x0 + 50; x < x1; x += 100) for (let z = z0 + 50; z < z1; z += 100) {
      if (t.height(x, z) < 2 || t.waterDepth(x, z) > 0) continue;
      if (t.towns.some((w) => Math.hypot(w.decision.x - x, w.decision.z - z) < w.decision.radius * 1.6 + C.town)) continue;
      n++;
      if (Math.min(...camps.map((c) => Math.hypot(c.x - x, c.z - z) - c.r)) <= 200) near++;
    }
    assert.ok(near >= n * 0.9, `zone ${k.x},${k.z}: ${near} of ${n} points near a camp`);
  }
});

/** A camp as the tests play it: three posts on flat land, the second its leader. */
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const CAMP: CampDecision = {
  kind: 'camp', id: 'camp:0:0:1', zone: 'zone:0:0', camp: 'goblin-warren', x: 0, z: 0, yaw: 0, r: 26, landmark: 'ruin', level: 4, seed: 77, at: 0,
  posts: [{ x: 0, z: 0, creature: 'goblin', level: 5, post: 0, leader: true }, { x: 10, z: 0, creature: 'goblin', level: 4, post: 1 }, { x: -10, z: 4, creature: 'goblin', level: 4, post: 1 }],
};

test('respawn: a camp\'s dead come back at their own posts after their time, seeded, the same for the same seed', () => {
  const kind = campDef(CAMP), seen = () => false, none = () => null;
  let save: CampSave = { dead: {}, rounds: {} };
  save = died(died(save, 1, 100), 2, 130);
  // Out on the land 6 minutes, give or take a fifth; each post and each return its own time.
  const t1 = respawnAfter(CAMP, C, 1, 0, false), t2 = respawnAfter(CAMP, C, 2, 0, false);
  for (const t of [t1, t2]) assert.ok(t >= 360 * 0.8 && t <= 360 * 1.2);
  assert.notEqual(t1, t2);
  assert.notEqual(respawnAfter(CAMP, C, 1, 1, false), t1, 'the next time differs');
  assert.equal(respawnAfter(CAMP, C, 1, 0, false), t1, 'seeded');
  assert.deepEqual(returnsDue(CAMP, kind, C, save, 100 + t1 - 1, seen, none).map((r) => r.post).filter((p) => p === 1), []);
  const due = returnsDue(CAMP, kind, C, save, 100 + Math.max(t1, t2 + 31), seen, none);
  assert.deepEqual(due.map((r) => r.post).sort(), [1, 2]);
  // A save in the middle keeps the timers: the same returns after a round trip through JSON.
  const kept = JSON.parse(JSON.stringify(save)) as CampSave;
  assert.deepEqual(returnsDue(CAMP, kind, C, kept, 100 + Math.max(t1, t2 + 31), seen, none), due);
  // Come back: it counts a round, and is no longer dead.
  const after = returned(save, 1);
  assert.equal(after.rounds[1], 1);
  assert.ok(!(1 in after.dead));
  // Who stands there is the post's kind at its level, or now and then its named one two levels higher.
  const usual = postDef(CAMP, kind, C, classic.creatures, G, 1, 0);
  assert.equal(levelOfDanger(G, usual.danger), 4);
  const rounds = Array.from({ length: 200 }, (_, r) => holdsNamed(CAMP, kind, C, 0, r)).filter(Boolean).length;
  assert.ok(rounds > 10 && rounds < 60, `named ${rounds} of 200`);
  const r = Array.from({ length: 200 }, (_, i) => i).find((i) => holdsNamed(CAMP, kind, C, 0, i))!;
  const named = postDef(CAMP, kind, C, classic.creatures, G, 0, r);
  assert.equal(levelOfDanger(G, named.danger), 7);
  assert.notEqual(named.name, 'goblin');
  assert.ok(!holdsNamed(CAMP, kind, C, 1, r), 'only at the leader\'s post');
  assert.ok(respawnAfter(CAMP, C, 0, r, true) >= 1800, 'a named one is slow to come back');
});

test('respawn: never in the hero\'s sight within 20 m unless its arrival is played', () => {
  const kind = campDef(CAMP);
  const hero = { x: 12, z: 0 };
  // The hero sees everything within 20 m of them.
  const seen = (x: number, z: number) => Math.hypot(x - hero.x, z - hero.z) <= RETURN_SEEN;
  const save = died(undefined, 1, 0), late = 10_000;
  // Its body lies at the hero's feet: it does not come back now.
  assert.deepEqual(returnsDue(CAMP, kind, C, save, late, seen, () => ({ x: 11, z: 0 })), []);
  // Its body lies out of sight: it walks in from the edge of the camp's ground, from a point the hero does not see.
  const due = returnsDue(CAMP, kind, C, save, late, seen, () => ({ x: -10, z: 4 }));
  assert.equal(due.length, 1);
  assert.ok(!seen(due[0].from.x, due[0].from.z) && Math.hypot(due[0].from.x, due[0].from.z) > CAMP.r);
  // Seen all round: it waits.
  assert.equal(edgeOf(CAMP, 1, () => true), null);
  // The dead rise where they fell, in sight too: that is the arrival played (rule 11).
  const dead = { ...kind, arrive: 'rise' as const };
  assert.deepEqual(returnsDue(CAMP, dead, C, save, late, seen, () => ({ x: 11, z: 0 })).map((r) => r.from), [{ x: 11, z: 0 }]);
  // In the den: a risen one comes up out of the ground and stands; a living one walks in to its post, taking no notice on the way.
  const den = new Den(new OpenGround(flat, CAMP.posts.map((p) => ({ x: p.x, z: p.z, r: 2 }))), CAMP.posts.map((p, i) => ({ creature: p.creature, room: i })), classic.creatures, 5, [1, 2]);
  const up = den.revive(1, levelled(def('skeleton'), 4, G), { x: 11, z: 0 }, 'rise')!;
  assert.ok(up.y < -1, 'starts under the ground');
  for (let i = 0; i < 50; i++) den.step(0.1, { x: 30, y: 0, z: 30, noise: 0, light: 0, alive: true, guard: { defence: 0, armour: 0, open: false } });
  assert.ok(Math.abs(up.y) < 0.01 && up.state !== 'dead', 'risen');
  const walk = den.revive(2, levelled(def('goblin'), 4, G), { x: -45, z: 4 }, 'walk')!;
  assert.equal(walk.state, 'home');
  for (let i = 0; i < 200; i++) den.step(0.1, { x: -30, y: 0, z: 4, noise: 1, light: 9, alive: true, guard: { defence: 0, armour: 0, open: false }, level: 4 });
  assert.ok(Math.hypot(walk.x + 10, walk.z - 4) < 4, `at its post (${walk.x.toFixed(1)}, ${walk.z.toFixed(1)})`);
  assert.equal(walk.lives, 1);
});

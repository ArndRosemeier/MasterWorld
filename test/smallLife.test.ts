import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { TRUNK_CELL } from '../src/world/trunks';
import { LIFE_CELL, SmallLife, type LifeHero, type LifeLand, type Squirrel } from '../src/sim/smallLife';

// A flat land: wood west of x = 0 (a tree every 8 m), open grass east of it.
const land: LifeLand = {
  height: () => 10,
  waterDepth: () => 0,
  woods: (x) => (x < 0 ? 1 : 0),
  trees: (i, j) => {
    const out: number[] = [];
    if (i * LIFE_CELL < 0) for (let a = 2; a < LIFE_CELL; a += 8) for (let b = 2; b < LIFE_CELL; b += 8) out.push(i * LIFE_CELL + a, j * LIFE_CELL + b, 0.35, 1);
    return Float32Array.from(out);
  },
};
const def = classic.smallLife!;
/** A squirrel's trunk (read through a call, so the checks do not narrow it for good). */
const trunkOf = (s: Squirrel) => s.trunk;
const at = (x: number, z: number, speed = 1.4): LifeHero => ({ x, y: 10, z, speed });

/** Steps `s` seconds with the hero standing at `h`. */
function run(life: SmallLife, s: number, h: LifeHero, day = 1, rain = 0) {
  const events = [];
  for (let t = 0; t < s; t += 0.05) events.push(...life.step(0.05, h, day, rain));
  return events;
}

test('small life: its squares are the trunks\' cells (one fetch serves both)', () => {
  assert.equal(LIFE_CELL, TRUNK_CELL);
});

test('small life: the woods have squirrels and woodland birds, the open land flocks; the same every time', () => {
  const a = new SmallLife(7, land, def), b = new SmallLife(7, land, def);
  run(a, 20, at(-200, 0));
  run(b, 20, at(-200, 0));
  assert.ok(a.squirrels.length >= 3, `${a.squirrels.length} squirrels in the wood`);
  assert.ok([...a.birds()].length >= 4, 'birds on the woodland floor');
  assert.deepEqual(a.squirrels.map((s) => [s.x, s.z, s.doing]), b.squirrels.map((s) => [s.x, s.z, s.doing]));
  // Over the open land: flocks in the air, no squirrels.
  const c = new SmallLife(7, land, def);
  run(c, 10, at(400, 0));
  assert.equal(c.squirrels.length, 0);
  const flying = [...c.birds()].filter((x) => x.doing === 'fly');
  assert.ok(flying.length >= 6, `${flying.length} birds wheeling`);
  assert.ok(flying.every((x) => x.y > 14), 'well above the ground');
});

test('small life: a squirrel watches, bolts up its tree to the far side when someone comes, and comes down head first when all is quiet', () => {
  const life = new SmallLife(3, land, def);
  run(life, 5, at(-200, 0));
  const s = life.squirrels[0];
  assert.ok(s && !trunkOf(s), 'one foraging');
  const T = s.tree;
  // Someone walks straight at it from 30 m.
  const a = Math.atan2(s.z - T.z, s.x - T.x);
  let up = false;
  for (let d = 30; d > 4; d -= 0.07) {
    const h = at(T.x + Math.cos(a) * d, T.z + Math.sin(a) * d);
    life.step(0.05, h, 1, 0);
    if ((trunkOf(s)?.h ?? 0) > 2) { up = true; break; }
  }
  assert.ok(up, `up the tree (${s.doing})`);
  assert.equal(s.pitch, Math.PI / 2, 'nose up');
  const h = at(T.x + Math.cos(a) * 5, T.z + Math.sin(a) * 5);
  run(life, 4, h);
  // Round the trunk, away from the one watching it.
  const side = Math.cos(trunkOf(s)!.a - a);
  assert.ok(side < -0.5, `on the far side (${side.toFixed(2)})`);
  // They go away: it comes down head first and forages again.
  let down = false;
  for (let t = 0; t < 60 && trunkOf(s); t += 0.05) {
    life.step(0.05, at(T.x + 30, T.z), 1, 0);
    if ((trunkOf(s)?.to ?? 1) <= 0 && s.doing === 'climb') down ||= s.pitch === -Math.PI / 2;
  }
  assert.ok(down && !trunkOf(s), 'down head first, back on the ground');
});

test('small life: ground birds take wing together into the crowns when someone comes near, and come back down later', () => {
  const life = new SmallLife(11, land, def);
  run(life, 3, at(-200, 0));
  const ground = [...life.birds()].filter((b) => b.doing !== 'fly');
  assert.ok(ground.length > 0);
  const b = ground[0];
  const events = run(life, 2, at(b.x + 3, b.z));
  assert.ok(events.some((e) => e.kind === 'wings'), 'wings heard');
  assert.ok(b.doing === 'fly' || b.doing === 'perch', `${b.doing}`);
  run(life, 8, at(b.x + 3, b.z));
  assert.equal(b.doing, 'perch', 'up in a crown');
  assert.ok(!b.shown, 'out of sight in it');
  // Off a way, and some time later they are back on the ground.
  run(life, 60, at(b.x + 40, b.z));
  assert.ok(b.shown && b.doing !== 'perch', `back down (${b.doing})`);
});

test('small life: a flock settles to feed, rises together when someone comes near; nothing out at night or in hard rain', () => {
  const life = new SmallLife(5, land, { ...def, birds: def.birds.filter((b) => b.habitat === 'flock') });
  let landed = false, rose = false;
  for (let t = 0; t < 240 && !rose; t += 0.05) {
    const pecking = [...life.birds()].filter((b) => b.doing !== 'fly' && b.y < 10.5);
    if (!landed && pecking.length >= 5) {
      landed = true;
      // Walk up to them.
      const b = pecking[0];
      const ev = run(life, 3, at(b.x + 10, b.z));
      rose = ev.some((e) => e.kind === 'wings' && e.count >= 5);
    } else life.step(0.05, at(400, 0), 1, 0);
  }
  assert.ok(landed, 'a flock came down');
  assert.ok(rose, 'and rose when someone came');
  run(life, 1, at(400, 0), 0.1);
  assert.equal([...life.birds()].length, 0, 'none at night');
  run(life, 1, at(400, 0), 1, 0.9);
  assert.equal([...life.birds()].length, 0, 'none in hard rain');
});

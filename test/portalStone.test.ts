import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beyondFrame, cleanStoneSave, hasRoom, homeFrame, NEAR_HOME, PortalStone, STONE_PORTAL, STONE_SHAPE, stoneShape, stoneSpot, type RoomProbe } from '../src/game/portalStone';
import { passesThrough, stepPoint, toFrame } from '../src/game/portal';
import { classic as setting } from '../src/setting/classic/index';
import { Character } from '../src/game/character';

const flat: RoomProbe = { standFloor: () => 10, blocksAt: () => false, rockGapAt: () => null, wetAt: () => null };
const floor = () => 10;

test('the stone floats ahead of the hero and over the shoulder; the portal opens beyond it', () => {
  const yaw = 0.7, feet = { x: 100, y: 10, z: -50 };
  const s = stoneSpot(feet, yaw), f = beyondFrame(s, yaw, floor);
  const fwd = (p: { x: number; z: number }) => -(p.x - feet.x) * Math.sin(yaw) - (p.z - feet.z) * Math.cos(yaw);
  assert.ok(fwd(s) > 1 && fwd(f) > fwd(s) + 1, 'the portal stands beyond the stone');
  assert.ok(s.y > feet.y + 1.6, 'over the head');
  // The hero stands behind the opening: walking on, they pass through it.
  const a = toFrame(f, { x: feet.x, y: 11, z: feet.z });
  assert.ok(a.z > 0);
  assert.ok(passesThrough({ realm: 'land', frame: f }, STONE_SHAPE, { x: feet.x, y: 11, z: feet.z }, { x: feet.x - Math.sin(yaw) * 6, y: 11, z: feet.z - Math.cos(yaw) * 6 }));
});

test('home, then a portal: the pair joins the far side to home; a new portal moves only the far side', () => {
  const st = new PortalStone();
  const home = homeFrame({ x: 0, y: 12, z: 0 }, 0, floor);
  assert.equal(st.markHome(home), false);
  assert.equal(st.portal, null);
  const far1 = beyondFrame({ x: 200, y: 12, z: 0 }, 1, floor);
  assert.ok(st.canOpen(far1, flat));
  const made = st.open(far1)!;
  assert.equal(made.closed, null);
  assert.equal(made.portal.id, STONE_PORTAL);
  assert.deepEqual(made.portal.a.frame, home);
  // Stepping out of the far one comes out at home.
  const out = stepPoint(made.portal.b.frame, made.portal.a.frame, { x: far1.x, y: 10, z: far1.z });
  assert.ok(Math.hypot(out.x - home.x, out.z - home.z) < 1e-9);
  const far2 = beyondFrame({ x: -300, y: 12, z: 40 }, 2, floor);
  const again = st.open(far2)!;
  assert.deepEqual(again.closed, { realm: 'land', frame: far1 });
  assert.deepEqual(again.portal.a.frame, home, 'home stays');
  assert.deepEqual(again.portal.b.frame, far2);
  // A new home closes both.
  assert.equal(st.markHome(homeFrame({ x: 50, y: 0, z: 50 }, 0, floor)), true);
  assert.equal(st.portal, null);
});

test('a portal fizzles without a home, on top of home, or without room', () => {
  const st = new PortalStone();
  const f = beyondFrame({ x: 100, y: 12, z: 0 }, 0, floor);
  assert.equal(st.canOpen(f, flat), null, 'no home');
  st.markHome(homeFrame({ x: 0, y: 12, z: 0 }, 0, floor));
  assert.equal(st.canOpen({ ...f, x: NEAR_HOME / 2, z: 0 }, flat), null, 'on top of home');
  assert.equal(st.canOpen(f, { ...flat, blocksAt: (x) => x > 100.5 }), null, 'a wall in the arch');
  assert.equal(st.canOpen(f, { ...flat, rockGapAt: (_x, y) => (y > 11.5 ? -1 : null) }), null, 'rock overhead');
  assert.equal(st.canOpen(f, { ...flat, standFloor: (x) => (x > 100 ? 13 : 10) }), null, 'a step in the floor');
  assert.equal(st.canOpen(f, { ...flat, wetAt: () => 11 }), null, 'under water');
  assert.ok(hasRoom(f, STONE_SHAPE, flat));
  assert.equal(st.canOpen(f, flat), 1);
});

test('in a tight spot the portal shrinks to fit, and the pair keeps that size', () => {
  const st = new PortalStone();
  st.markHome(homeFrame({ x: 0, y: 12, z: 0 }, 0, floor));
  const f = beyondFrame({ x: 100, y: 12, z: 0 }, 0, floor);
  // A gate passage 2 m wide, 2.6 m high.
  const gate: RoomProbe = { ...flat, blocksAt: (x) => Math.abs(x - f.x) > 1, rockGapAt: (_x, y) => (y > f.y + 2.6 ? -1 : null) };
  const k = st.canOpen(f, gate);
  assert.ok(k !== null && k < 1, `fits at ${k}`);
  assert.ok(hasRoom(f, stoneShape(k!), gate));
  const made = st.open(f, 'land', k!);
  assert.deepEqual(made?.portal.shape, stoneShape(k!));
  assert.deepEqual(new PortalStone(JSON.parse(JSON.stringify(st.kept()))).portal?.shape, stoneShape(k!));
});

test('a portal opens below ground, and on top of home only counts in the same realm', () => {
  const st = new PortalStone();
  st.markHome(homeFrame({ x: 0, y: 12, z: 0 }, 0, floor), 'cave-3');
  const near = beyondFrame({ x: 2, y: 12, z: 0 }, 0, floor);
  assert.equal(st.canOpen(near, flat, 'cave-3'), null);
  assert.equal(st.canOpen(near, flat, 'land'), 1);
  const made = st.open(near, 'land');
  assert.equal(made?.portal.a.realm, 'cave-3');
  assert.equal(made?.portal.b.realm, 'land');
  assert.deepEqual(new PortalStone(JSON.parse(JSON.stringify(st.kept()))).portal, made?.portal);
});

test('the stone is kept in the save, and a broken save marks nothing', () => {
  const st = new PortalStone();
  st.markHome({ x: 1, y: 2, z: 3, yaw: 0.5 });
  st.open({ x: 100, y: 2, z: 3, yaw: 1 });
  const back = new PortalStone(JSON.parse(JSON.stringify(st.kept())));
  assert.deepEqual(back.portal, st.portal);
  assert.deepEqual(cleanStoneSave({ home: { x: 'a' }, far: { x: 1, y: 1, z: 1, yaw: 0 } }), { home: null, far: null, homeRealm: 'land', farRealm: 'land', size: 1 });
  assert.deepEqual(cleanStoneSave(undefined), { home: null, far: null, homeRealm: 'land', farRealm: 'land', size: 1 });
});

test('every new hero carries a portal stone', () => {
  for (const bg of setting.backgrounds) {
    const c = new Character(setting);
    c.beginAs(bg);
    assert.ok(c.pack.some((it) => setting.items.items.find((d) => d.id === it.def)?.portal), bg.id);
  }
});

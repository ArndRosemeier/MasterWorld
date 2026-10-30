import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hullHalf, planShip, shipFloor, type Mooring } from '@futuremagic/settlement';
import { Walker, type WalkWorld } from '../src/game/walker';
import { Decks, toShip, toWorld, type Pose } from '../src/world/deck';

const plan = planShip(4, 'ship', 26);
// Moored heading +x, its port side (+b) along +z; the pier on its starboard side, off -z.
const pierEdge = -(plan.beam / 2 + 0.6);
const mooring: Mooring = { plan, x: 0, z: 0, ux: 1, uz: 0, side: -1, landY: 1.2 };

function sea(decks: Decks): WalkWorld {
  return {
    height: (_x, z) => (z < pierEdge ? mooring.landY : -12),
    rockSurface: () => null,
    waterLevel: (_x, z) => (z < pierEdge ? null : 0),
    floor: (x, z, y) => decks.underfoot(x, z, y),
    wall: (x, z, r, y) => decks.hull(x, z, r, y ?? 0),
  };
}

/** The swell under a ship: heave, pitch and roll (and, sailing, its way on along its heading). */
function swell(t: number, speed: number): Pose {
  return { x: speed * t, y: 0.45 * Math.sin(0.7 * t), z: 0, ux: 1, uz: 0, pitch: 0.06 * Math.sin(0.9 * t + 1), roll: 0.09 * Math.sin(1.3 * t) };
}

test('deck: the ship frame and the world agree both ways', () => {
  const p: Pose = { x: 5, y: 0.3, z: -2, ux: 0.6, uz: 0.8, pitch: 0.1, roll: -0.15 };
  const w = toWorld(p, 3, 2, -1.5), l = toShip(p, w.x, w.y, w.z);
  assert.ok(Math.abs(l.a - 3) < 1e-9 && Math.abs(l.h - 2) < 1e-9 && Math.abs(l.b + 1.5) < 1e-9);
  // Bow up: a point forward is higher; port up: a point to port is higher.
  const level = { ...p, pitch: 0, roll: 0 };
  assert.ok(toWorld({ ...level, pitch: 0.1 }, 5, 0, 0).y > toWorld(level, 5, 0, 0).y);
  assert.ok(toWorld({ ...level, roll: 0.1 }, 0, 0, 2).y > toWorld(level, 0, 0, 2).y);
});

test('deck: on a rolling, sailing deck the hero walks about and stands still on it, never falling through or sliding', () => {
  let walker: Walker | null = null;
  const decks = new Decks(() => walker?.pos ?? null), w = (walker = new Walker(sea(decks)));
  const dt = 1 / 60;
  decks.move('s', plan, swell(0, 3));
  // Between the main mast and the gangway.
  w.place(1.8, 0);
  assert.ok(!decks.hull(w.pos.x, w.pos.z, w.spec.radius, w.pos.y), 'clear where it starts');
  decks.boarded();
  assert.equal(decks.ship, 's');
  let still: { a: number; b: number } | null = null, worst = 0, slid = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const t = i * dt, pose = swell(t, 3);
    decks.move('s', plan, pose);
    // Four seconds walking round (turning as it goes), four standing.
    const walking = Math.floor(t / 4) % 2 === 0;
    w.step({ forward: walking ? 1 : 0, strafe: 0, heading: t * 0.9, walk: true, up: false, down: false }, dt);
    decks.boarded();
    if (w.mode === 'swim') { const q = toShip(pose, w.pos.x, w.pos.y, w.pos.z); assert.fail(`in the sea at ${t.toFixed(2)} s at a ${q.a.toFixed(2)} b ${q.b.toFixed(2)} (gangway ${plan.gangway!.a0.toFixed(2)}..${plan.gangway!.a1.toFixed(2)})`); }
    const l = toShip(pose, w.pos.x, w.pos.y, w.pos.z);
    const f = shipFloor(plan, l.a, l.b);
    worst = Math.max(worst, f === null ? Infinity : Math.abs(l.h - f));
    // Standing (once the last step has come to rest): where it stands on the deck stays put.
    if (!walking && t % 4 > 0.5) { still ??= { a: l.a, b: l.b }; slid = Math.max(slid, Math.hypot(l.a - still.a, l.b - still.b)); } else still = null;
  }
  assert.equal(decks.ship, 's', 'still aboard');
  assert.ok(worst < 0.15, `feet ${worst.toFixed(2)} m off the deck`);
  assert.ok(slid < 0.05, `slid ${slid.toFixed(3)} m standing`);
});

test('deck: up the gangplank from the pier, through the gangway and onto the deck', () => {
  let walker: Walker | null = null;
  const decks = new Decks(() => walker?.pos ?? null), w = (walker = new Walker(sea(decks)));
  const g = plan.gangway!, ga = (g.a0 + g.a1) / 2, dt = 1 / 60;
  decks.move('s', plan, swell(0, 0), mooring);
  const ends = decks.plankOf('s');
  assert.ok(ends && ends.foot.z < pierEdge && Math.abs(ends.foot.y - mooring.landY) < 1e-9, 'the plank rests on the pier');
  w.place(ga, pierEdge - 2.5);
  for (let i = 0; i < 6 * 60; i++) {
    decks.move('s', plan, swell(i * dt, 0), mooring);
    // Up towards the ship (+z: heading π).
    w.step({ forward: 1, strafe: 0, heading: Math.PI, walk: true, up: false, down: false }, dt);
    decks.boarded();
    assert.notEqual(w.mode, 'swim', 'fell in');
  }
  assert.equal(decks.ship, 's', `aboard (at z ${w.pos.z.toFixed(2)}, y ${w.pos.y.toFixed(2)})`);
  // And walked on across until the far rail stops it.
  assert.ok(w.pos.z > 0.5 && w.pos.z < plan.beam / 2, `at z ${w.pos.z.toFixed(2)}`);
});

test('deck: a deck is no floor to a swimmer below it (never lifted 2 m onto it); a hero put elsewhere is not carried back', () => {
  let walker: Walker | null = null;
  const decks = new Decks(() => walker?.pos ?? null), w = (walker = new Walker(sea(decks))), dt = 1 / 60;
  decks.move('s', plan, swell(0, 0));
  const edge = hullHalf(plan, 0, plan.deckY) - 0.3;
  assert.ok(Math.abs(decks.underfoot(0, edge, plan.deckY)! - plan.deckY) < 0.05, 'the deck to one on it');
  assert.equal(decks.underfoot(0, edge, -0.6), null, 'none to one in the water');
  // Swimming along its side, pressed against it: in the water all the while.
  w.place(0, hullHalf(plan, 0, 1.2) + w.spec.radius + 0.05);
  for (let i = 0; i < 3 * 60; i++) {
    decks.move('s', plan, swell(i * dt, 0));
    w.step({ forward: 1, strafe: 0.4, heading: Math.PI / 2, walk: false, up: false, down: false }, dt);
    decks.boarded();
    assert.ok(w.pos.y < 0.5, `lifted to ${w.pos.y.toFixed(2)} m`);
  }
  assert.equal(w.mode, 'swim');
  // Aboard, then put on the pier: the next swell does not carry it back.
  w.place(1.8, 0); decks.boarded();
  assert.equal(decks.ship, 's');
  w.place(1.8, pierEdge - 3); decks.move('s', plan, swell(1, 0));
  assert.ok(w.pos.z < pierEdge, 'stays where it was put');
});

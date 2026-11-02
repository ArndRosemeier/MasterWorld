import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three/webgpu';
import { planShip, shipFloor, shipLadders } from '@futuremagic/settlement';
import { Decks, toShip, toWorld, type Pose } from '../src/world/deck';
import type { WalkWorld } from '../src/game/walker';

// The cameras listen on the page; here nothing calls them.
const quiet = { addEventListener() {} };
(globalThis as { window?: unknown }).window ??= quiet;
const { Player } = await import('../src/app/player');
const { ShipClimb } = await import('../src/app/shipClimb');

const plan = planShip(4, 'ship', 26);

/** Under sail on the swell, heading north-east. */
function swell(t: number): Pose {
  const ux = Math.SQRT1_2, uz = Math.SQRT1_2, v = 2.5 * t;
  return { x: 40 + ux * v, y: 0.45 * Math.sin(0.7 * t), z: -20 + uz * v, ux, uz, pitch: 0.06 * Math.sin(0.9 * t + 1), roll: 0.09 * Math.sin(1.3 * t) };
}

test('ship climb: up a castle ladder from the main deck and down again, on a sailing, rolling ship, hands on the rungs', () => {
  let decks: Decks | null = null;
  const sea: WalkWorld = {
    height: () => -12, rockSurface: () => null, waterLevel: () => 0,
    floor: (x, z, y) => decks!.underfoot(x, z, y), wall: (x, z, r, y) => decks!.hull(x, z, r, y ?? 0),
  };
  const P = new Player(new PerspectiveCamera(), quiet as never, sea, false);
  decks = new Decks(() => P.walker.pos);
  const climb = new ShipClimb({ player: P, decks }), dt = 1 / 60;
  const fore = shipLadders(plan).find((l) => l.dir === -1)!;
  let t = 0;
  decks.move('s', plan, swell(t));
  // A metre aft of the forecastle ladder's foot.
  const at = toWorld(swell(0), fore.a - 1.2, plan.deckY, fore.b);
  P.walker.place(at.x, at.z, at.y + 0.1);
  // Settled on the deck.
  for (let i = 0; i < 30; i++) { t += dt; decks.move('s', plan, swell(t)); P.update(dt); decks.boarded(); }
  assert.equal(decks.ship, 's');
  for (const [way, floor] of [['up', fore.y1], ['down', fore.y0]] as const) {
    assert.equal(climb.climbOffered, way);
    assert.ok(climb.use(), `${way} the ladder`);
    let worst = 0;
    for (let i = 0; i < 20 * 60 && climb.busy; i++) {
      t += dt;
      const pose = swell(t);
      decks.move('s', plan, pose);
      P.update(dt);
      decks.boarded();
      // Both hands, while they hold on, on the ladder (within its stiles, by its rungs' line).
      const g = climb.limbs;
      for (const k of ['L', 'R'] as const) {
        const h = g?.[k];
        if (!h || h.w < 0.99 || h.flat) continue;
        const q = toShip(pose, h.p.x, h.p.y, h.p.z);
        worst = Math.max(worst, Math.abs(q.b - fore.b) - 0.25);
      }
    }
    assert.ok(!climb.busy, `${way}: the climb is over`);
    assert.ok(worst < 0.05, `${way}: a hand ${worst.toFixed(2)} m off the ladder`);
    const w = P.walker.pos, l = toShip(swell(t), w.x, w.y, w.z);
    assert.ok(Math.abs(l.h - floor) < 0.12, `${way}: feet at ${l.h.toFixed(2)}, the deck at ${floor.toFixed(2)}`);
    assert.equal(shipFloor(plan, l.a, l.b), floor);
    // And walks on from there as the ship sails, still aboard, on that deck.
    for (let i = 0; i < 60; i++) {
      t += dt; decks.move('s', plan, swell(t));
      P.walker.step({ forward: 0, strafe: 0, heading: 0, walk: true, up: false, down: false }, dt);
      decks.boarded();
    }
    const m = P.walker.pos, n = toShip(swell(t), m.x, m.y, m.z);
    assert.equal(decks.ship, 's');
    assert.ok(Math.abs(n.h - floor) < 0.12, `${way}: standing at ${n.h.toFixed(2)} after`);
  }
});

test('ship climb: down the companionway to the lower deck and along its passage on a sailing ship; the camera kept below', () => {
  let decks: Decks | null = null;
  const sea: WalkWorld = {
    height: () => -12, rockSurface: () => null, waterLevel: () => 0,
    floor: (x, z, y) => decks!.underfoot(x, z, y), wall: (x, z, r, y) => decks!.hull(x, z, r, y ?? 0),
  };
  const P = new Player(new PerspectiveCamera(), quiet as never, sea, false);
  decks = new Decks(() => P.walker.pos);
  const climb = new ShipClimb({ player: P, decks }), dt = 1 / 60, h = plan.hold!;
  const way = shipLadders(plan).find((l) => l.lean === 0)!;
  let t = 0;
  const tick = () => { t += dt; decks!.move('s', plan, swell(t)); P.update(dt); decks!.boarded(); };
  decks.move('s', plan, swell(t));
  // Forward of the companionway, on deck.
  const at = toWorld(swell(0), way.a + 1.2, plan.deckY + 0.1, way.b);
  P.walker.place(at.x, at.z, at.y);
  for (let i = 0; i < 30; i++) tick();
  assert.equal(climb.climbOffered, 'down');
  assert.ok(climb.use());
  for (let i = 0; i < 20 * 60 && climb.busy; i++) tick();
  assert.ok(!climb.busy);
  let l = toShip(swell(t), P.walker.pos.x, P.walker.pos.y, P.walker.pos.z);
  assert.ok(Math.abs(l.h - h.y) < 0.12, `feet at ${l.h.toFixed(2)}, the lower deck at ${h.y.toFixed(2)}`);
  // Over to the passage (to port, +b), then forward along it (+a) for a few seconds: on the lower deck all the way.
  const s0 = swell(0), toPort = Math.atan2(s0.uz, -s0.ux), forward = Math.atan2(-s0.ux, -s0.uz);
  for (let i = 0; i < 3 * 60 && l.b < 0; i++) {
    t += dt; decks.move('s', plan, swell(t));
    P.walker.step({ forward: 1, strafe: 0, heading: toPort, walk: true, up: false, down: false }, dt);
    decks.boarded();
    l = toShip(swell(t), P.walker.pos.x, P.walker.pos.y, P.walker.pos.z);
  }
  for (let i = 0; i < 4 * 60; i++) {
    t += dt; decks.move('s', plan, swell(t));
    P.walker.step({ forward: 1, strafe: 0, heading: forward, walk: true, up: false, down: false }, dt);
    decks.boarded();
    l = toShip(swell(t), P.walker.pos.x, P.walker.pos.y, P.walker.pos.z);
    assert.ok(Math.abs(l.h - h.y) < 0.15 && P.walker.mode !== 'swim', `off the lower deck at a ${l.a.toFixed(2)} b ${l.b.toFixed(2)} h ${l.h.toFixed(2)}`);
  }
  assert.equal(decks.ship, 's');
  assert.ok(l.a > way.a + 3, `walked on to a ${l.a.toFixed(2)}`);
  // A camera point up on deck, or out in the sea beside the hull, is hidden from the hero below.
  const up = toWorld(swell(t), l.a, plan.deckY + 1.5, l.b), out = toWorld(swell(t), l.a, h.y + 1.5, plan.beam / 2 + 1);
  assert.equal(decks.sight(up.x, up.y, up.z), 0);
  assert.equal(decks.sight(out.x, out.y, out.z), 0);
  const near = toWorld(swell(t), l.a - 1.0, h.y + 1.5, l.b);
  assert.equal(decks.sight(near.x, near.y, near.z), null);
});

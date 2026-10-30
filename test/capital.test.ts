import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { regionDecisions, settlementsOf, walkFrontier } from '../src/vgm/frontier';
import { settlementOf, type RoadDecision } from '../src/world/decisions';
import { townsfolk } from '../src/sim/people';
import { guildHouses } from '../src/game/guilds';
import { tooSteep } from '@futuremagic/settlement';
import { TownGround } from '../src/world/town';
import { grassMask } from '../src/world/grass';
import { bridgesOn, deckAt, townBridges, type Bridge } from '../src/world/bridges';
import { emptyWater, inChannel } from '../src/world/hydro';
import { RoadNet } from '../src/world/roads';
import { EAST, frontierLand } from './frontierLand';

const land = frontierLand(), { first, home, seed, terrain } = land;
// The land as it was opened before harbour towns (S2): the capital's west gate road then ends in a brook (the bridge
// tests below need that brook; a harbour town by the river mouth north of the start shifts the walk's rolls).
const regions = { ...land.regions, fills: land.regions.fills.filter((f) => !f.harbour) };

/** The capital (C15, D41): the VGM founds one a few km out as the hero walks, and it replays from the log. */
test('capital: one, a few km out, a decision in the log; walled, with its ruler, guild halls and shops', () => {
  // Walking east until it is founded (the walk stops there).
  const log = [...first, ...walkFrontier({ seed, log: first, terrain, regions, home }, EAST, 9, (d) => settlementOf(d, regions.fills)?.size === 'capital')];
  const caps = regionDecisions(log).filter((d) => settlementOf(d, regions.fills)?.size === 'capital');
  assert.equal(caps.length, 1, 'one capital');
  const d = caps[0], t = settlementOf(d, regions.fills)!;
  const km = Math.hypot(t.x - home.x, t.z - home.z) / 1000;
  assert.ok(km > 2.8 && km < 9, `${km.toFixed(1)} km out`);
  assert.ok(settlementsOf(log, regions).some((s) => s.id === d.id), 'roads link it like any settlement');
  // From the log (a save) it is the same decision.
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
  terrain.settleMore([d]);
  const town = terrain.town(d.id)!, plan = town.plan, w = plan.wall!;
  assert.ok(w && w.gates.length >= 4, 'a wall with its gates');
  // Through a gate, not through the wall.
  const g = w.gates[0];
  assert.ok(!town.solid(g.x, g.z, 0.4), 'the gate is open');
  const R = w.ring, k = R.length >> 2;
  assert.ok(town.solid(R[k * 2], R[k * 2 + 1], 0.4) || w.gates.some((o) => Math.hypot(o.x - R[k * 2], o.z - R[k * 2 + 1]) < 10), 'the wall is solid');
  // No house up a mesa wall or a hillside (one cottage once spanned 68 m of rise): the planner leaves such plots empty.
  const steep = plan.buildings.filter((b) => tooSteep(b.poly, terrain.height.bind(terrain)));
  assert.deepEqual(steep.map((b) => `${b.kind}@${b.cx.toFixed(0)},${b.cz.toFixed(0)}`), [], 'no building on steep ground');
  // Wall, towers and gates stand dry: a brook between two of the outline's rays once ran under a gate tower (Arnd).
  const brookIn = (x: number, z: number, r: number) => { const q = terrain.hydro.query(x, z); return q.river && q.dist < q.half + r; };
  for (let i = 0; i < R.length; i += 2) assert.ok(!brookIn(R[i], R[i + 1], w.thick / 2), `the wall in water at ${R[i].toFixed(0)},${R[i + 1].toFixed(0)}`);
  for (const tw of w.towers) assert.ok(!brookIn(tw.x, tw.z, w.towerHalf), `a tower in water at ${tw.x.toFixed(0)},${tw.z.toFixed(0)}`);
  for (const f of plan.fixtures) assert.ok(!brookIn(f.x, f.z, 1), `a ${f.kind} in water`);
  // Its seat of rule has its ruler; the guilds keep big halls; its armourer and jeweller keep shop.
  const folk = townsfolk(plan, d.seed);
  const seat = plan.buildings.find((b) => b.trade === 'ruler')!;
  assert.ok(folk.some((p) => p.work === seat.id && p.role === 'trade' && p.trade === 'ruler'), 'a ruler');
  const halls = guildHouses(plan, 'capital', classic);
  assert.equal(halls.length, classic.guilds!.filter((x) => x.sizes.includes('capital') && x.near !== 'out').length);
  for (const h of halls) assert.ok(h.b.floors >= 2, `${h.guild.keeper} keeps a hall`);
  for (const s of ['armourer', 'jeweller']) assert.ok(plan.buildings.some((b) => b.trade === s) && classic.shops.some((x) => x.keeper === s), s);
  // About 2700 people: the simulation keeps its budget only by drawing few of them (D41).
  assert.ok(folk.length > 1500, `${folk.length} people`);
  // Within its wall the yards are trodden, not a meadow: little grass and short (Arnd: "too much grass everywhere").
  assert.ok(town.walled(seat.cx, seat.cz) && !town.walled(w.gates[0].x + Math.cos(w.gates[0].angle) * 60, w.gates[0].z + Math.sin(w.gates[0].angle) * 60), 'the seat within the wall, the land before a gate outside it');
  // Every yard cell within 60 m of the seat of rule.
  const x0 = seat.cx - 60, z0 = seat.cz - 60, mask = grassMask(terrain, { seed, setting: classic.id, x0, z0, size: 120, res: 60 });
  let dens = 0, tall = 0, yards = 0;
  for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) {
    const x = x0 + i * 2 + 1, z = z0 + j * 2 + 1, k = (j * 60 + i) * 4;
    if (terrain.townGround(x, z) !== TownGround.Yard || !town.walled(x, z)) continue;
    yards++; dens = Math.max(dens, mask[k + 1]); if (mask[k + 1] > 0) tall = Math.max(tall, mask[k + 2]);
  }
  assert.ok(yards > 50, `${yards} yard cells`);
  assert.ok(dens <= 0.15 && tall < 0.3, `yards within the wall: grass ${dens.toFixed(2)}, ${tall.toFixed(2)} m`);
});

// Bridges on a town's own streets (world/bridges.ts townBridges): the capital's road out of its west gate ends in a
// brook a stone's throw past the wall (Arnd, seed masterworld near -19148, 37084). On the capital the first test
// founded and settled (the tests of a file run in order).
const capital = () => terrain.towns.find((t) => t.decision.size === 'capital')!;
const height = (x: number, z: number) => terrain.height(x, z);
const all = () => true;
const w = emptyWater();
const wet = (x: number, z: number) => inChannel(terrain.hydro.brookAt(x, z, w)) && w.brook;
const onDeck = (bs: readonly Bridge[], x: number, z: number) => bs.some((b) => deckAt(b, x, z) !== null);
// The road out that ends in the brook.
const gateRoad = () => capital().plan.streets.find((s) => s.kind === 'road' && wet(s.pts[s.pts.length - 2], s.pts[s.pts.length - 1]))!;

/** Points every metre along a street's centre line. */
function along(pts: readonly number[], closed = false): [number, number][] {
  const p = closed ? [...pts, pts[0], pts[1]] : pts, out: [number, number][] = [];
  for (let k = 0; k + 3 < p.length; k += 2) {
    const L = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
    for (let t = 0; t < L; t += 1) out.push([p[k] + (p[k + 2] - p[k]) * t / L, p[k + 1] + (p[k + 3] - p[k + 1]) * t / L]);
  }
  return out;
}

test('town bridges: every street of the capital that crosses a brook crosses it on a bridge, the road out of its gate too', () => {
  const town = capital(), gate = gateRoad();
  assert.ok(town && gate, 'the capital, its road out ending in a brook');
  const bs = townBridges(town, new RoadNet(), terrain.hydro, height, all)!;
  assert.ok(bs.length >= 1);
  for (const s of town.plan.streets) for (const [x, z] of along(s.pts, s.closed)) {
    if (wet(x, z)) assert.ok(onDeck(bs, x, z), `the ${s.kind} in a brook at ${x.toFixed(0)}, ${z.toFixed(0)} without a bridge`);
  }
  // The gate road's runs on over the brook it ends in, its ends on the land (no step up onto it, none off).
  const n = gate.pts.length, end = bs.find((b) => Math.hypot(b.x - gate.pts[n - 2], b.z - gate.pts[n - 1]) < 15);
  assert.ok(end, 'a bridge where the gate road ends in the brook');
  for (const [x, z, y] of [[end.x0, end.z0, end.y0], [end.x1, end.z1, end.y1]]) {
    assert.ok(!wet(x, z), 'its ends on dry land');
    assert.ok(Math.abs(y - height(x, z)) < 0.05, 'at the land\'s height');
  }
  // Not before its brooks are known.
  assert.equal(townBridges(town, new RoadNet(), terrain.hydro, height, () => false), null);
});

test('town bridges: a road laid on from the gate road has the bridge over the brook between them, once', () => {
  // A track on from the gate road's end, straight on 60 m.
  const town = capital(), p = gateRoad().pts, n = p.length, L = Math.hypot(p[n - 2] - p[n - 4], p[n - 1] - p[n - 3]);
  const ux = (p[n - 2] - p[n - 4]) / L, uz = (p[n - 1] - p[n - 3]) / L, pts: number[] = [];
  for (let k = 0; k <= 10; k++) { const x = p[n - 2] + ux * k * 6, z = p[n - 1] + uz * k * 6; pts.push(x, height(x, z), z); }
  const road: RoadDecision = { kind: 'road', id: 'road-on', way: 'track', from: 'out', to: town.decision.id, pts };
  const net = new RoadNet();
  net.insert(road);
  const inTown = townBridges(town, net, terrain.hydro, height, all)!, onRoad = bridgesOn(road, terrain.hydro, p[n - 2], p[n - 1], 1e4, all, terrain);
  assert.equal(onRoad.length, 1, 'the road has the bridge at the join');
  const b = onRoad[0];
  assert.ok(!inTown.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 20), 'and the town none there as well');
  for (const [x, z] of along(p).slice(-40)) if (wet(x, z)) assert.ok(deckAt(b, x, z) !== null, 'the gate road\'s end in the brook is under it');
  for (let k = 0; k < pts.length; k += 3) if (wet(pts[k], pts[k + 2])) assert.ok(deckAt(b, pts[k], pts[k + 2]) !== null, 'the road\'s start in the brook is under it');
  // Without the town to join the road starts in the water: no bridge (as before).
  assert.equal(bridgesOn(road, terrain.hydro, p[n - 2], p[n - 1], 1e4, all).length, 0);
});

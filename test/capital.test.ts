import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { regionDecisions, settlementsOf, walkFrontier } from '../src/vgm/frontier';
import { settlementOf } from '../src/world/decisions';
import { townsfolk } from '../src/sim/people';
import { guildHouses } from '../src/game/guilds';
import { tooSteep } from '@futuremagic/settlement';
import { TownGround } from '../src/world/town';
import { grassMask } from '../src/world/grass';
import { EAST, frontierLand } from './frontierLand';

const { first, home, regions, seed, terrain } = frontierLand();

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

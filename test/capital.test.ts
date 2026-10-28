import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { regionDecisions, settlementsOf, walkFrontier } from '../src/vgm/frontier';
import { settlementOf } from '../src/world/decisions';
import { townsfolk } from '../src/sim/people';
import { guildHouses } from '../src/game/guilds';
import { EAST, first, home, regions, seed, terrain } from './frontierLand';

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
});

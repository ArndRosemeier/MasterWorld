import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { planInterior } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { Township } from '../src/game/township';
import { postTrades, postsOf } from '../src/game/posts';
import { roomCast } from '../src/sim/roomCast';
import { frontierLand } from './frontierLand';

const { terrain, first, seed } = frontierLand();
const trades = postTrades(classic);
const towns = terrain.towns.slice(0, 3);

/** The town as the game opens it at `hour` and lets its day run a few minutes first. */
function live(town: (typeof towns)[number], hour: number): Township {
  const t = new Township(town, { seed: town.decision.seed ?? seed, setting: classic, log: () => first, hours: () => hour });
  t.keepMarked(t.life, []);
  for (let s = 0; s < 300; s++) t.life.step(1, hour + s / 9000);
  return t;
}

test('posts: every master of a service trade (shops, guilds, upkeep, passage) is kept to their building, and so is the bard', () => {
  for (const town of towns) {
    const t = live(town, 12), want = postsOf(town.plan, t.residents, trades);
    const found = new Set(t.residents.filter((p) => p.role === 'trade' && trades.has(p.trade)).map((p) => p.trade));
    assert.ok(want.size >= found.size, 'a post for each master');
    for (const [id, b] of want) {
      const p = t.residents[id];
      assert.ok(t.life.isKept(id), `${p.trade} (${id}) is kept`);
      assert.equal(p.home, b, `${p.trade} lives in the building they keep, so they sleep in it`);
    }
  }
  // The classic setting's roles that must exist somewhere in the test towns, or this test checks nothing.
  const all = new Set(towns.flatMap((tn) => [...postsOf(tn.plan, live(tn, 12).residents, trades).keys()].map((id) => live(tn, 12).residents[id].trade)));
  for (const need of ['innkeeper', 'smith', 'harbourmaster', 'hedge-witch']) assert.ok(all.has(need), `${need} in a test town`);
});

test('posts: by day and by night every post-holder is in their building (never out in the town) and, asleep, abed there to be woken and talked to', () => {
  for (const town of towns) {
    for (const hour of [2, 6.5, 10, 15, 19, 22.5]) {
      const t = live(town, hour), life = t.life;
      for (const [id, b] of postsOf(town.plan, t.residents, trades)) {
        const a = life.agentOf(id)!, label = `${a.person.trade} of ${town.decision.id} at ${hour}h`;
        if (a.post) continue;
        assert.ok(a.act !== 'walk' && a.spot >= 0 && life.spots[a.spot].building === b, `${label} is in building ${b} (act ${a.act}, spot ${a.spot})`);
        if (a.act !== 'sleep') continue;
        // Laid out as the game opens it (interiorVisit): a guild's hall for fighting, a plain home otherwise.
        const g = t.guildAt(b), room = planInterior(town.plan.buildings[b], { hatch: false, hall: !!g?.guild.hall && !g.out });
        const c = roomCast(life.agents, life.spots, b, room).find((x) => x.agent === a);
        assert.equal(c?.act, 'sleep', `${label} is cast abed`);
      }
    }
  }
});

test('posts: a market seller is at their own stall through the working day, a market day and at meals', () => {
  const town = towns[0], t = live(town, 10);
  const sellers = t.life.agents.filter((a) => a.person.role === 'trader');
  assert.ok(sellers.length > 0, 'the start town has market sellers');
  for (const hour of [10, 11.5, 13, 14.5]) {
    const life = live(town, hour).life;
    for (const a of life.agents.filter((x) => x.person.role === 'trader')) {
      if (a.task !== 'work' && a.task !== 'meal') continue;
      assert.ok(a.act !== 'walk' && a.spot >= 0 && life.spots[a.spot].use === 'trade', `seller ${a.person.id} at a stall at ${hour}h (task ${a.task}, act ${a.act})`);
    }
  }
});

test('posts: no service is answered for a trade this list does not hold (a new role cannot slip past)', () => {
  const dirs = ['app', 'talk', 'game'];
  const found: string[] = [];
  for (const d of dirs) for (const f of readdirSync(new URL(`../src/${d}/`, import.meta.url))) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(new URL(`../src/${d}/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\b(?:person|p)\.trade === '([a-z-]+)'/g)) found.push(`${d}/${f}: ${m[1]}`);
  }
  assert.ok(found.length >= 3, 'the scan sees the services');
  for (const hit of found) assert.ok(trades.has(hit.split(': ')[1]), `${hit} is not a post trade (add it to SERVICE_TRADES in game/posts.ts)`);
});

test('posts: every shop keeper and guild keeper of the setting is a post trade', () => {
  for (const s of classic.shops) assert.ok(s.keeper === 'trader' || trades.has(s.keeper), `shop keeper ${s.keeper}`);
  for (const g of classic.guilds ?? []) assert.ok(trades.has(g.keeper), `guild keeper ${g.keeper}`);
});

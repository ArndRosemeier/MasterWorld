import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { planInterior, planTown, type TownPlan } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { Township } from '../src/game/township';
import { postTrades, postsOf } from '../src/game/posts';
import { guildHouses, staffGuilds, type GuildHouse } from '../src/game/guilds';
import { townsfolk, type Person } from '../src/sim/people';
import { TownLife } from '../src/sim/townLife';
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
    for (const id of want.keys()) {
      const p = t.residents[id];
      assert.ok(t.life.isKept(id), `${p.trade} (${id}) is kept`);
    }
  }
  // The classic setting's roles that must exist somewhere in the test towns, or this test checks nothing.
  const all = new Set(towns.flatMap((tn) => [...postsOf(tn.plan, live(tn, 12).residents, trades).keys()].map((id) => live(tn, 12).residents[id].trade)));
  for (const need of ['innkeeper', 'smith', 'harbourmaster', 'hedge-witch']) assert.ok(all.has(need), `${need} in a test town`);
});

/** What a post-holder is held to at `hour`: in their building, never walking about, and asleep abed there (cast into a bed of it). */
function holdsPosts(life: TownLife, plan: TownPlan, people: readonly Person[], hall: (b: number) => boolean, hour: number, label: string, seen: Set<string>): void {
  for (const [id, b] of postsOf(plan, people, trades)) {
    const a = life.agentOf(id)!, what = `${a.person.trade} (${a.person.role}) of ${label} at ${hour}h`;
    seen.add(a.person.role === 'keeper' ? 'temple-keeper' : a.person.trade);
    assert.ok(life.isKept(id), `${what} is kept`);
    if (a.post) continue;
    assert.ok(a.act !== 'walk' && a.spot >= 0 && life.spots[a.spot].building === b, `${what} is in building ${b} (act ${a.act}, spot ${a.spot})`);
    if (a.act !== 'sleep') continue;
    const room = planInterior(plan.buildings[b], { hatch: false, hall: hall(b) });
    const c = roomCast(life.agents, life.spots, b, room).find((x) => x.agent === a);
    assert.equal(c?.act, 'sleep', `${what} is cast abed`);
  }
}

const HOURS = [2, 6.5, 10, 15, 19, 22.5];
/** Every post trade seen held to its post, with the temple's keeper: filled by the two tests below, checked by the third. */
const held = new Set<string>();

test('posts: by day and by night every post-holder of the game\'s towns is in their building (never out in the town) and, asleep, abed there to be woken and talked to', () => {
  for (const town of towns) {
    for (const hour of HOURS) {
      const t = live(town, hour);
      holdsPosts(t.life, town.plan, t.residents, (b) => { const g = t.guildAt(b); return !!g?.guild.hall && !g.out; }, hour, town.decision.id, held);
    }
  }
});

/** A coast along z = 0 (the sea to the south), the land rising gently inland (as AssetGenerator's harbour test). */
const coast = (x: number, z: number): number => -z * 0.06 + 1.2 * Math.sin(x / 70);

test('posts: the same in towns of every size, harbour towns too, planned and staffed as the game does (shops and guilds the game towns lack are held too)', () => {
  const kinds = [...(['hamlet', 'village', 'town', 'capital'] as const).map((size) => ({ size, sea: false })), { size: 'village' as const, sea: true }, { size: 'town' as const, sea: true }];
  for (const { size, sea } of kinds) {
    for (const seed of [3, 4]) {
      const site = { seed, x: 0, z: sea ? -60 : 0, size, radius: size === 'capital' ? 160 : size === 'town' ? 100 : 70, farmland: false, height: sea ? coast : () => 10, ...(sea ? { water: (x: number, z: number) => Math.max(0, -coast(x, z)), harbour: { x: 0, z: 0, dx: 0, dz: 1 } } : {}) };
      const plan = planTown(site), label = `${size}${sea ? ' by the sea' : ''} ${seed}`;
      const people = townsfolk(plan, seed), houses: GuildHouse[] = guildHouses(plan, size, classic);
      staffGuilds(people, houses);
      const hall = (b: number) => houses.some((h) => h.b.id === b && !!h.guild.hall && !h.out);
      for (const hour of [2, 10, 22.5]) {
        const life = new TownLife(plan, seed, hour, classic.routines, people);
        life.keep(postsOf(plan, people, trades));
        for (let s = 0; s < 120; s++) life.step(1, hour + s / 9000);
        holdsPosts(life, plan, people, hall, hour, label, held);
      }
    }
  }
});

test('posts: every trade on the list was held to its post by the two tests above, so none is only assumed', () => {
  // The harbour master and the harbour's herbalist come with the game\'s harbour town; a guild with a place out on the land (the Undercroft keeper, the tower warden) with the start town.
  const want = [...trades, 'temple-keeper'];
  const missing = want.filter((t) => !held.has(t));
  assert.deepEqual(missing, [], `trades never held to a post in the test towns: ${missing.join(', ')}`);
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

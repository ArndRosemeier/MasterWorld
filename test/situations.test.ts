import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { polyCentroid } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { SEEN_MOST, validateSetting } from '../src/setting/contract';
import { Township } from '../src/game/township';
import type { NeedContext } from '../src/vgm/answers';
import { criesDue, paddockWolvesFor, smokesAt, strayBeastFor, type PaddockContext } from '../src/vgm/situations';
import { pointInPoly } from '@futuremagic/settlement';
import { answerNeed } from '../src/vgm/toolbox';
import type { Decision } from '../src/world/decisions';
import { SOUTH, frontierLand } from './frontierLand';

const { home, seed, terrain, walk } = frontierLand();

const log = walk(2, SOUTH);
const town = terrain.towns[0];
// Out inland south of the sea town, on open land.
const out = { x: home.x, z: home.z + home.radius + 700 };
const sure = { ...classic, situations: classic.situations!.map((t) => (t.kind === 'hurt-traveller' ? { ...t, chance: 1 } : t)) };
const need = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: sure, hero: out, toward: { x: out.x, z: out.z + 600 }, ...over });
const dusk = (over: Partial<PaddockContext> = {}): PaddockContext => ({ seed, log, hours: 24 * 2 + 19, near: town, setting: classic, ...over });

test('situations: the setting\'s situations are sound; each cries only a short line, and only from where it is seen', () => {
  assert.deepEqual(validateSetting(classic), []);
  for (const t of classic.situations!) assert.ok(t.seen <= SEEN_MOST && (t.cry ?? '').length <= 60, t.id);
});

test('situations: a hurt traveller sits by the way (People, now and then), crouched, and cries once the hero sees them', () => {
  const m = answerNeed('people', need());
  assert.ok(m && m.tool === 'hurt-traveller' && m.decision.kind === 'traveller' && m.decision.situation === 'hurt-traveller');
  if (m?.decision.kind !== 'traveller') return;
  const d = m.decision, withIt = [...log, d];
  // Mostly not: with the setting's own share some travellers rest unhurt.
  const plain = [1, 2, 3, 4, 5, 6].map((k) => answerNeed('people', need({ seed: seed + k, setting: classic }))?.tool);
  assert.ok(plain.includes('traveller') && plain.includes('hurt-traveller'), plain.join());
  const t = new Township(terrain.towns.find((w) => w.decision.id === d.town)!, { seed, setting: classic, log: () => withIt, hours: () => d.at + 0.2 });
  const a = t.life.agents.find((x) => x.person.role === 'traveller')!;
  assert.equal(a.act, 'hurt');
  // Seen before told: no cry from farther than its `seen`; one within; never twice.
  const def = classic.situations!.find((s) => s.id === 'hurt-traveller')!;
  const far = { x: d.x + def.seen + 5, z: d.z }, near = { x: d.x + def.seen - 5, z: d.z };
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: far, hours: d.at + 0.2, cried: new Set() }).length, 0);
  const cries = criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.at + 0.2, cried: new Set() });
  assert.deepEqual(cries.map((c) => [c.id, c.text]), [[d.id, def.cry]]);
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.at + 0.2, cried: new Set([d.id]) }).length, 0, 'once');
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.until + 0.1, cried: new Set() }).length, 0, 'gone on');
});

test('situations: at dusk wolves prowl outside a paddock of the town the hero is in, once a town every few days', () => {
  assert.ok(town.plan.paddocks.length > 0);
  assert.equal(paddockWolvesFor(dusk({ hours: 24 * 2 + 12 })), null, 'not at noon');
  assert.equal(paddockWolvesFor(dusk({ near: null })), null, 'not out on the land');
  const d = paddockWolvesFor(dusk());
  assert.ok(d && d.group === 'paddock' && d.situation === 'paddock-wolves' && d.encounter === 'wolves' && d.members.length >= 1);
  if (!d) return;
  // Outside a fence: farther from every paddock's middle than its corners.
  const outside = town.plan.paddocks.every((pd) => {
    const [cx, cz] = polyCentroid(pd.poly);
    let reach = 0;
    for (let i = 0; i < pd.poly.length; i += 2) reach = Math.max(reach, Math.hypot(pd.poly[i] - cx, pd.poly[i + 1] - cz));
    return Math.hypot(d.x - cx, d.z - cz) > reach;
  });
  assert.ok(outside, 'outside the paddocks');
  const withIt: Decision[] = [...log, d];
  assert.equal(paddockWolvesFor(dusk({ log: withIt, hours: d.at + 24 })), null, 'not the next dusk');
  assert.ok(paddockWolvesFor(dusk({ log: withIt, hours: d.at + 24 * 5 })), 'again some days on');
  const near = { x: d.x + 20, z: d.z };
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.at + 0.5, cried: new Set() }).length, 1);
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.at + 0.5, cried: new Set(), living: () => false }).length, 0, 'not once they are dead');
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: near, hours: d.at + 6, cried: new Set() }).length, 0, 'not the next morning');
});

test('situations: a raided farm\'s barn smokes for hours, thinning, seen from afar; close by its people cry out', () => {
  const pd = town.plan.paddocks.find((p) => p.farm >= 0)!;
  const barn = town.plan.buildings[town.plan.farms[pd.farm].barn];
  const raid: Decision = { kind: 'event', id: 'event-1', event: 'farm-raid', town: town.decision.id, from: 'wild-1', x: 0, z: 0, r: 30, members: ['bandit'], seed: 2, at: 40, paddock: pd.id, taken: 2 };
  const withIt = [...log, raid], lasts = classic.situations!.find((t) => t.kind === 'raid-smoke')!.lasts!;
  const now = smokesAt(withIt, terrain.towns, classic, 41), later = smokesAt(withIt, terrain.towns, classic, 40 + lasts - 1);
  assert.equal(now.length, 1);
  assert.ok(now[0].x === barn.cx && now[0].z === barn.cz, 'over the barn');
  assert.ok(later[0].thick < now[0].thick, 'thinning');
  assert.equal(smokesAt(withIt, terrain.towns, classic, 40 + lasts + 0.1).length, 0, 'burnt out');
  assert.equal(smokesAt([...withIt, { kind: 'kept', id: 'kept-1', promise: 'event-1', at: 42 }], terrain.towns, classic, 43).length, 0, 'not once dealt with');
  const at = (d: number) => ({ x: barn.cx + d, z: barn.cz });
  assert.equal(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: at(200), hours: 41, cried: new Set() }).length, 0, 'seen from afar, not told');
  assert.deepEqual(criesDue({ log: withIt, setting: classic, towns: terrain.towns, hero: at(30), hours: 41, cried: new Set() }).map((c) => c.kind), ['raid-smoke']);
});

test('situations: by day a beast gets out of its paddock, someone of its farm goes after it, and it goes back in', () => {
  assert.equal(strayBeastFor({ ...dusk({ hours: 24 * 2 + 3 }), terrain }), null, 'not at night');
  const d = strayBeastFor({ ...dusk({ hours: 24 * 2 + 10 }), terrain });
  assert.ok(d && d.kind === 'stray');
  if (!d) return;
  assert.equal(strayBeastFor({ ...dusk({ log: [...log, d], hours: d.at + 1 }), terrain }), null, 'once a town every few days');
  const withIt: Decision[] = [...log, d];
  const pd = town.plan.paddocks[d.paddock], house = town.plan.farms[pd.farm].house;
  let hours = d.at + 0.01;
  const t = new Township(town, { seed, setting: classic, log: () => withIt, hours: () => hours });
  const herds = t.herds!;
  void t.life;
  const beast = herds.straying!;
  assert.ok(beast && beast.paddock === d.paddock, 'one of that paddock is out');
  let out = false, caught = false, home = false, far = 0;
  for (let i = 0; i < 2400 && !home; i++) {
    hours += 0.25 * 24 / 3600;
    herds.step(0.25);
    t.life.step(0.25, hours);
    if (!pointInPoly(pd.poly, beast.x, beast.z)) out = true;
    far = Math.max(far, Math.hypot(beast.x - pd.gate[0], beast.z - pd.gate[1]));
    if (out && !beast.loose) caught = true;
    if (caught && pointInPoly(pd.poly, beast.x, beast.z)) home = true;
  }
  const farmer = t.life.agents.find((a) => a.person.home === house && a.person.role !== 'child');
  assert.ok(farmer, 'its farm has someone to go after it');
  assert.ok(out && far > 20, `it got out and away (${far.toFixed(0)} m from the gate)`);
  assert.ok(caught, 'they caught it');
  assert.ok(home, 'back in its paddock');
});

test('situations: speech bubbles carry only the cries, a story event shouted in town and a household come to thank the hero (D52: rare lines)', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const says = [...main.matchAll(/speech\.say\(([^,]+),/g)].map((m) => m[1].trim());
  // (`text`: a cellar's household come down once it is quiet, app/ownerComes.ts: their thanks show the task is done.)
  assert.deepEqual(says.sort(), ['c.text', 'text', 'told.cry'], 'the game says nothing else in a bubble');
});

test('situations: no narrator tells a story event, a lead or a feast (D52, rule 11)', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const told = [...main.matchAll(/notes\.say\(([^,]+),/g)].map((m) => m[1].trim()).filter((s) => /told\.(cry|news|note)|lead\.note|Journal:/.test(s));
  assert.deepEqual(told, [], 'word of these comes through people, sights and talk');
});

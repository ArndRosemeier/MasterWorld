import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { polyCentroid } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { SEEN_MOST, validateSetting } from '../src/setting/contract';
import { Township } from '../src/game/township';
import type { NeedContext } from '../src/vgm/answers';
import { criesDue, paddockWolvesFor, type PaddockContext } from '../src/vgm/situations';
import { answerNeed } from '../src/vgm/toolbox';
import type { Decision } from '../src/world/decisions';
import { home, seed, terrain, walk, EAST } from './frontierLand';

const log = walk(2, EAST);
const town = terrain.towns[0];
const out = { x: home.x + home.radius + 250, z: home.z };
const sure = { ...classic, situations: classic.situations!.map((t) => (t.kind === 'hurt-traveller' ? { ...t, chance: 1 } : t)) };
const need = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: sure, hero: out, toward: { x: out.x + 600, z: out.z }, ...over });
const dusk = (over: Partial<PaddockContext> = {}): PaddockContext => ({ seed, log, hours: 24 * 2 + 19, near: town, setting: classic, ...over });

test('situations: the setting\'s situations are sound; each cries only a short line, and only from where it is seen', () => {
  assert.deepEqual(validateSetting(classic), []);
  for (const t of classic.situations!) assert.ok(t.seen <= SEEN_MOST && t.cry.length <= 60, t.id);
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
  assert.equal(criesDue(withIt, classic, far, d.at + 0.2, new Set()).length, 0);
  const cries = criesDue(withIt, classic, near, d.at + 0.2, new Set());
  assert.deepEqual(cries.map((c) => [c.id, c.text]), [[d.id, def.cry]]);
  assert.equal(criesDue(withIt, classic, near, d.at + 0.2, new Set([d.id])).length, 0, 'once');
  assert.equal(criesDue(withIt, classic, near, d.until + 0.1, new Set()).length, 0, 'gone on');
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
  assert.equal(criesDue(withIt, classic, near, d.at + 0.5, new Set()).length, 1);
  assert.equal(criesDue(withIt, classic, near, d.at + 0.5, new Set(), () => false).length, 0, 'not once they are dead');
  assert.equal(criesDue(withIt, classic, near, d.at + 6, new Set()).length, 0, 'not the next morning');
});

test('situations: speech bubbles carry only the cries (D52: rare, urgent lines)', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const says = [...main.matchAll(/speech\.say\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(says, ['c.text'], 'the game says nothing else in a bubble');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import type { EncounterWhere } from '../src/setting/contract';
import { encounterFor, encounterOf, membersOf, typicalDanger } from '../src/vgm/encounters';

const WHERE: readonly EncounterWhere[] = ['below', 'wood', 'open', 'road', 'shore'];
const DANGERS = [8, 14, 20, 28];

test('encounters: a sweep over every place and danger: no repeats while another fits, no misfits while a fitting one exists', () => {
  for (const where of WHERE) for (const danger of DANGERS) {
    const fits = classic.encounters.filter((e) => e.where.includes(where) && e.need === 'challenge');
    if (!fits.length) continue;
    const close = fits.filter((e) => Math.abs(typicalDanger(classic, e) - danger) <= danger * 0.6);
    const recent: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const met = encounterFor({ setting: classic, seed, need: 'challenge', where, danger, recent })!;
      assert.ok(met, `${where} ${danger}`);
      const e = encounterOf(classic, met.encounter)!;
      if (close.length) assert.ok(close.includes(e), `${where} at danger ${danger}: ${e.id} (${typicalDanger(classic, e).toFixed(1)}) misfits`);
      if (close.length > 1) assert.notEqual(met.encounter, recent.at(-1), `${where} at danger ${danger}: ${e.id} twice running`);
      recent.push(met.encounter);
    }
  }
});

test('encounters: filled from the seed, within the count asked, the leader first; `of` and `where` narrow it', () => {
  const wolves = encounterOf(classic, 'wolves')!;
  assert.deepEqual(membersOf(wolves, 7), membersOf(wolves, 7));
  for (let s = 0; s < 20; s++) {
    const m = membersOf(wolves, s, [3, 3]);
    assert.equal(m.length, 3);
    assert.equal(m[0], 'wolf');
  }
  assert.equal(encounterFor({ setting: classic, seed: 1, of: ['deer'] })!.encounter, 'deer');
  assert.equal(encounterFor({ setting: classic, seed: 1, of: ['deer'], where: 'below' }), null);
  assert.equal(encounterFor({ setting: classic, seed: 1, need: 'discovery', where: 'open' })!.encounter, 'deer');
});

test('encounters: every dweller below, every wild group and every raid names an encounter of the setting', () => {
  const ids = new Set(classic.encounters.map((e) => e.id)), used = new Set<string>();
  for (const lore of Object.values(classic.dungeons)) for (const d of lore!.dwellers) { assert.ok(ids.has(d.encounter), d.id); used.add(d.encounter); }
  for (const w of classic.wild) { assert.ok(ids.has(w.encounter), w.id); used.add(w.encounter); }
  for (const e of classic.encounters) assert.ok(used.has(e.id), `encounter "${e.id}" is never met`);
});

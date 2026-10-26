import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePack } from '@futuremagic/props';
import { MEDIEVAL_NAMES, generateFacadeLayer, generateMedievalLayer } from '@futuremagic/texgen';
import { classic } from '../src/setting/classic/index';
import { CELL, STOREY, outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { cellarMeshes } from '../src/world/dungeon/cellarMesh';
import { BuildingMat as M } from '../src/world/dungeon/meshKit';
import { LAYER_MEAN, slotLayer } from '../src/world/dungeon/propModels';
import { torchSpots } from '../src/world/dungeon/torches';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { TOWN_LAYERS } from '../src/render/terrain/groundTextures';

const models = decodePack(readFileSync(new URL('../public/props/cellar.fmpk', import.meta.url)));
const spec = JSON.parse(readFileSync(new URL('../tools/props/models.json', import.meta.url), 'utf8')) as { specs: string[] };
const cellars: Cellar[] = Array.from({ length: 10 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));

test('cellar props: the pack holds every listed model, with material slots', () => {
  assert.deepEqual([...models.keys()].sort(), [...spec.specs].sort());
  for (const m of models.values()) {
    assert.ok(m.slotNames.length > 0 && m.slots.every((s) => s < m.slotNames.length), m.name);
    assert.ok(m.min[1] > -0.02, `${m.name} stands on the ground`);
  }
  assert.equal(slotLayer('staves'), M.Oak);
  assert.equal(slotLayer('furn_chest_accent_iron'), M.Plaster);
  assert.equal(slotLayer('rope'), M.Thatch);
});

test('cellar props: meshes with the models are sound and use only the town array\'s layers', () => {
  for (const c of cellars) {
    const m = cellarMeshes(c, models), bare = cellarMeshes(c);
    for (const b of [m.shell, m.props, ...m.doors.map((d) => d.mesh)]) {
      const n = b.position.length / 3;
      assert.ok(n > 0 && b.normal.length === n * 3 && b.uv.length === n * 2 && b.mat.length === n && b.tint.length === n * 3);
      for (const i of b.index) assert.ok(i < n);
      assert.ok(b.position.every(Number.isFinite) && b.normal.every(Number.isFinite) && b.uv.every(Number.isFinite));
      assert.ok(b.mat.every((k) => k < TOWN_LAYERS.length));
    }
    assert.ok(m.props.index.length > bare.props.index.length, 'models are finer than the kit');
  }
});

test('cellar props: layer means match the textures they divide by', () => {
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  const layers = { [M.Plaster]: generateFacadeLayer(6, 64), [M.Oak]: generateMedievalLayer(MEDIEVAL_NAMES.indexOf('oak'), 64), [M.Thatch]: generateMedievalLayer(MEDIEVAL_NAMES.indexOf('thatch'), 64) };
  for (const [k, l] of Object.entries(layers)) {
    const n = l.albedo.length / 4, sum = [0, 0, 0];
    let ao = 0;
    for (let i = 0; i < n; i++) { for (let ch = 0; ch < 3; ch++) sum[ch] += lin(l.albedo[i * 4 + ch]); ao += (l.normal[i * 4 + 3] / 255) * 0.6 + 0.4; }
    for (let ch = 0; ch < 3; ch++) {
      const want = (sum[ch] / n) * (ao / n), have = LAYER_MEAN[Number(k)][ch];
      assert.ok(Math.abs(want - have) / have < 0.15, `layer ${k} channel ${ch}: ${want.toFixed(4)} vs ${have}`);
    }
  }
});

test('cellar torches: most rooms have one, on a wall of their own room, at shoulder height', () => {
  for (const c of cellars) {
    const t = torchSpots(c);
    const lit = new Set(t.map((s) => s.room));
    assert.ok(lit.size >= c.layout.rooms.length * 0.6, `${lit.size} of ${c.layout.rooms.length} rooms lit`);
    for (const s of t) {
      const r = c.layout.rooms[s.room];
      assert.ok(s.x > r.x * CELL && s.x < (r.x + r.w) * CELL && s.z > r.z * CELL && s.z < (r.z + r.d) * CELL, 'inside its room');
      assert.ok(Math.abs(s.y - r.level * STOREY - 1.85) < 0.01);
      assert.equal(Math.abs(s.nx) + Math.abs(s.nz), 1);
    }
  }
});

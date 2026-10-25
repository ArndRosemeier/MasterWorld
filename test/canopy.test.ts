import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeModel, type TreeSpecies } from '@futuremagic/vegetation';
import { TREES } from '../src/setting/contract';
import { TREE_SHAPE, canopySampler, meanTree } from '../src/world/canopy';
import { Terrain } from '../src/world/terrain';
import { settingById } from '../src/setting/index';
import { parseSeed } from '@futuremagic/core';

test('canopy: tree shapes match the vegetation models', () => {
  for (const s of TREES) {
    const ms = [0, 1].map((v) => treeModel(s as TreeSpecies, v));
    const h = (ms[0].height + ms[1].height) / 2, r = (ms[0].crownRadius! + ms[1].crownRadius!) / 2;
    assert.ok(Math.abs(TREE_SHAPE[s].height - h) < 0.15 * h, `${s} height ${TREE_SHAPE[s].height} vs ${h.toFixed(1)}`);
    assert.ok(Math.abs(TREE_SHAPE[s].crown - r) < 0.15 * r + 0.3, `${s} crown ${TREE_SHAPE[s].crown} vs ${r.toFixed(1)}`);
  }
});

test('canopy: a forest is covered, the sea is not; a pine wood is all conifer', () => {
  const setting = settingById('classic');
  const t = new Terrain(parseSeed('masterworld'), setting);
  const at = canopySampler(t), c = { cover: 0, height: 0, spacing: 0, conifer: 0 };
  // The start is in broadleaf forest; the sea lies north-east of it.
  let most = 0;
  for (let k = 0; k < 40; k++) most = Math.max(most, at(-32000 + k * 25, 32000 - k * 7, c).cover);
  assert.ok(most > 0.4, `forest cover ${most}`);
  assert.equal(at(-31060, 31060, c).cover, 0);
  const taiga = setting.world.biomes.find((b) => b.id === 'taiga')!;
  assert.ok(meanTree(taiga.flora!).conifer > 0.8);
});

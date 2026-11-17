/**
 * The camps' memorable structures (D69, Z4): the fortified bridge and the great ruin. Each seed builds the same mesh,
 * stands on its land (nothing floats), shows no z-fighting, rises over the land as a landmark, and two of a kind are
 * far apart in what a player tells them by (Arnd 2026-11-17: "2 fortified bridges look very distinct").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { floating } from '../src/world/dungeon/meshKit';
import { seenFights, zFights, zFightSpots } from '../src/world/zFight';
import { bridgeLand, ruinLand } from '../src/world/structures/land';
import { BRIDGE_WEIGHTS, fortifiedBridgeMesh, bridgeSignature, deckAt, planBridge } from '../src/world/structures/bridge';
import { RUIN_WEIGHTS, greatRuinMesh, planGreatRuin, ruinSignature } from '../src/world/structures/ruin';
import { DISTINCT, apart, shared, silhouette } from '../src/world/structures/style';

const D = classic.structures!;
const bridge = (seed: number) => { const land = bridgeLand(seed), plan = planBridge(D, seed, land.ground); return { land, plan }; };
const ruin = (seed: number) => { const land = ruinLand(seed), plan = planGreatRuin(D, seed, land.ground); return { land, plan }; };

function noFights(m: Parameters<typeof zFights>[0], ground: (x: number, z: number) => number, what: string): void {
  const f = seenFights(zFights(m, { ground }));
  assert.deepEqual(zFightSpots(f).slice(0, 5).map((s) => `${s.pairs} pairs, ${(s.area * 1e4).toFixed(0)} cm² at ${s.at.map((v) => v.toFixed(2))}`), [], `${what}: no z-fighting`);
}

test('structures: the setting names the builders, holders and kinds, and every kind\'s weights name real ones', () => {
  const builders = new Set(D.builders.map((b) => b.id)), holders = new Set(D.holders.map((h) => h.id));
  assert.deepEqual(D.kinds.map((k) => k.id).sort(), ['fortified-bridge', 'great-ruin']);
  for (const k of D.kinds) {
    for (const id of Object.keys(k.builders)) assert.ok(builders.has(id), `${k.id}: builder ${id}`);
    for (const id of Object.keys(k.holders)) assert.ok(holders.has(id), `${k.id}: holder ${id}`);
  }
});

test('structures: a fortified bridge is the same for its seed, spans from bank to bank, has a tower and stands on its land', () => {
  for (const seed of [1, 4, 7]) {
    const { land, plan } = bridge(seed), m = fortifiedBridgeMesh(plan, land.ground), again = fortifiedBridgeMesh(bridge(seed).plan, land.ground);
    assert.deepEqual([m.index.length, m.position.slice(0, 30)], [again.index.length, again.position.slice(0, 30)], `bridge ${seed} the same twice`);
    assert.ok(plan.xs < plan.lipA && plan.lipA < plan.lipB && plan.lipB < plan.xe, `bridge ${seed}: the deck reaches over both lips`);
    assert.ok(plan.spans.length >= 1 && plan.towers.length >= 1, `bridge ${seed}: ${plan.spans.length} spans, ${plan.towers.length} towers`);
    // Its deck runs no steeper than a road, and it rises over the water or the gorge's floor below it.
    for (let x = plan.xs; x < plan.xe - 1; x += 1) assert.ok(Math.abs(deckAt(plan, x + 1) - deckAt(plan, x)) <= 0.12, `bridge ${seed}: deck slope at ${x}`);
    assert.ok(plan.high - plan.low > 6, `bridge ${seed}: ${(plan.high - plan.low).toFixed(1)} m from its foot to its top`);
    assert.deepEqual(floating(m, land.ground), [], `bridge ${seed}: nothing floats`);
  }
});

test('structures: a great ruin is the same for its seed, has halls, rises over the land and stands on it', () => {
  for (const seed of [1, 5]) {
    const { land, plan } = ruin(seed), m = greatRuinMesh(plan, land.ground), again = greatRuinMesh(ruin(seed).plan, land.ground);
    assert.deepEqual([m.index.length, m.position.slice(0, 30)], [again.index.length, again.position.slice(0, 30)], `ruin ${seed} the same twice`);
    assert.ok(plan.blocks.length >= 1, `ruin ${seed}: ${plan.blocks.length} blocks`);
    // A landmark: its highest point well over the land round it.
    assert.ok(plan.high - plan.low > 15, `ruin ${seed}: ${(plan.high - plan.low).toFixed(1)} m high`);
    assert.deepEqual(floating(m, land.ground), [], `ruin ${seed}: nothing floats`);
  }
});

test('structures: fortified bridges show no z-fighting', () => {
  for (const seed of [1, 4]) {
    const { land, plan } = bridge(seed);
    noFights(fortifiedBridgeMesh(plan, land.ground), land.ground, `bridge ${seed}`);
  }
});

test('structures: a great ruin shows no z-fighting', () => {
  const { land, plan } = ruin(1);
  noFights(greatRuinMesh(plan, land.ground), land.ground, 'ruin 1');
});

test('structures: two of a kind are seldom alike: under 3 % of pairs of 60 seeds closer than DISTINCT, the gallery\'s 12 mostly apart', () => {
  for (const [what, sig, weights] of [['bridge', (s: number) => bridgeSignature(bridge(s).plan), BRIDGE_WEIGHTS], ['ruin', (s: number) => ruinSignature(ruin(s).plan), RUIN_WEIGHTS]] as const) {
    const sigs = Array.from({ length: 60 }, (_, i) => sig(i + 1));
    let close = 0, pairs = 0, galleryClose = 0;
    for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) {
      const d = apart(sigs[i], sigs[j], weights);
      pairs++;
      if (d < DISTINCT) { close++; if (j < 12) galleryClose++; }
    }
    assert.ok(close / pairs < 0.03, `${what}: ${close} of ${pairs} pairs alike`);
    assert.ok(galleryClose <= 2, `${what}: ${galleryClose} pairs of the gallery's 12 alike`);
  }
});

test('structures: from far off no two bridges of the gallery share most of their silhouette', () => {
  const sil = Array.from({ length: 8 }, (_, i) => { const { land, plan } = bridge(i + 1), m = fortifiedBridgeMesh(plan, land.ground); return silhouette(m.position, m.index, 0, 1, 1); });
  let worst = 0;
  for (let i = 0; i < sil.length; i++) for (let j = i + 1; j < sil.length; j++) worst = Math.max(worst, shared(sil[i], sil[j]));
  assert.ok(worst < 0.8, `the closest two share ${(worst * 100).toFixed(0)} %`);
});

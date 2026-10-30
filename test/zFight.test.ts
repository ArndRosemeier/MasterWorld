import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ground } from '@futuremagic/core';
import { MeshKit, LEVEL } from '../src/world/dungeon/meshKit';
import { towerMesh, towerSize } from '../src/world/dungeon/towerMesh';
import { barrowMesh, sealedBarrowMesh } from '../src/world/dungeon/barrowMesh';
import { warden } from '../src/world/holdRock';
import { layOutSight, layOutSite, type Place } from '../src/world/sites';
import type { RegionDecision, SightDecision } from '../src/world/decisions';
import type { SightShape } from '../src/setting/contract';
import { seenFights, zFights, zFightSpots, type ZMesh } from '../src/world/zFight';
import { buildingMesh } from '@futuremagic/settlement';
import { startWorld } from './frontierLand';

// The start's land, shared by the test files of a process (test/frontierLand.ts).
const { terrain } = startWorld();

const STONE = [170, 160, 150] as const, DARK = [90, 80, 70] as const;

test('z-fighting: two faces in one plane facing the same way and overlapping are found; side by side, apart or back to back they are not', () => {
  const k = new MeshKit();
  k.flat(0, 0, 2, 2, 1, true, 2, STONE);
  k.flat(1, 1, 3, 3, 1, true, 2, DARK);
  const f = zFights(k.mesh());
  assert.equal(f.length > 0, true);
  const s = zFightSpots(f);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].area - 1) < 1e-6, `the shared square metre: ${s[0].area}`);
  assert.deepEqual(s[0].normal, [0, 1, 0]);
  // Side by side (an edge shared), 2 mm apart, back to back: none.
  for (const [x0, y, up] of [[2, 1, true], [1, 1.002, true], [1, 1, false]] as const) {
    const m = new MeshKit();
    m.flat(0, 0, 2, 2, 1, true, 2, STONE);
    m.flat(x0, 0, x0 + 2, 2, y, up, 2, DARK);
    assert.deepEqual(zFights(m.mesh()), [], `${x0} ${y} ${up}`);
  }
});

test('z-fighting: a face drawn twice alike, one inside a solid, or one facing down onto the ground does not show', () => {
  // The same face twice, same tint and texture: nothing to choose, nothing flickers.
  const twice = new MeshKit();
  twice.flat(0, 0, 2, 2, 1, true, 2, STONE);
  twice.flat(0, 0, 2, 2, 1, true, 2, STONE);
  const f = zFights(twice.mesh());
  assert.ok(f.length > 0 && f.every((x) => x.same) && seenFights(f).length === 0);
  // Two boxes run into each other's end inside a third that holds them: their faces meet inside it.
  const inner = new MeshKit();
  inner.box(0, 0, 0, 4, 4, 4, 0, 2, STONE);
  inner.box(-0.5, 1, 0, 1, 1, 1, 0, 2, STONE);
  inner.box(0.4, 1, 0, 1, 1, 1, 0, 2, DARK);
  const g = zFights(inner.mesh());
  assert.ok(g.length > 0 && seenFights(g).length === 0, `${g.length} inside, ${seenFights(g).length} seen`);
  // Two crates side by side on the floor: their feet fight only where nothing looks.
  const feet = new MeshKit();
  feet.box(0, 0, 0, 1, 1, 1, 0, 2, STONE);
  feet.box(0.5, 0, 0.3, 1, 0.5, 1, 0, 2, DARK);
  const h = zFights(feet.mesh(), { ground: () => 0 });
  assert.ok(h.length > 0 && seenFights(h).length === 0);
  // Out in the open the same two faces show.
  const open = new MeshKit();
  open.box(0, 0, 0, 1, 1, 1, 0, 2, STONE);
  open.box(0.5, 0.25, 0.3, 1, 0.75, 1, 0, 2, DARK);
  assert.ok(seenFights(zFights(open.mesh())).length > 0, 'a box run halfway into another shows its fight');
});

/** None of the mesh's faces fight where they can be seen. */
function noFights(m: ZMesh, what: string, ground?: Ground): void {
  const f = seenFights(zFights(m, { ground }));
  assert.deepEqual(zFightSpots(f).slice(0, 5).map((s) => `${s.pairs} pairs, ${(s.area * 1e4).toFixed(0)} cm² at ${s.at.map((v) => v.toFixed(2))}`), [], `${what}: no z-fighting`);
}

test('z-fighting: the ruined towers and the warden\'s keep have none (their corners and string courses fought)', () => {
  const slope: Ground = (x, z) => -x * 0.2 + Math.sin(z * 0.6) * 0.3;
  for (const seed of [1, 2, 3]) {
    noFights(towerMesh(towerSize(14, 16, 4), seed), `tower ${seed}`, LEVEL);
    noFights(towerMesh({ half: 5, depth: 10, storeys: 3 }, seed, slope), `warden's keep ${seed}`, slope);
  }
});

test('z-fighting: the barrows, the hold\'s warden and every place and sight the VGM lays out on the land have none', () => {
  const slope: Ground = (x, z) => -x * 0.2 + Math.sin(z * 0.6) * 0.3;
  noFights(barrowMesh(1, slope), 'barrow', slope);
  noFights(sealedBarrowMesh(1, slope), 'sealed barrow', slope);
  noFights(warden(), 'hold warden', LEVEL);
  const places: Place[] = ['camp', 'ruin', 'barrows'];
  for (const [i, place] of places.entries()) {
    const d = { kind: 'region', id: `r${i}`, seed: 40 + i, site: { x: 3, z: -2, yaw: 0.7, r: 16 } } as unknown as RegionDecision;
    const l = layOutSite(d, place, slope)!, [ox, oy, oz] = l.origin;
    noFights(l.mesh, place, (x, z) => slope(x + ox, z + oz) - oy);
  }
  const shapes: SightShape[] = ['stones', 'waystone', 'cairn', 'stash'];
  for (const [i, shape] of shapes.entries()) {
    const d: SightDecision = { kind: 'sight', id: `s${i}`, sight: shape, x: -4, z: 5, yaw: 1.1, seed: 70 + i, at: 0 };
    const l = layOutSight(d, shape, slope), [ox, oy, oz] = l.origin;
    noFights(l.mesh, shape, (x, z) => slope(x + ox, z + oz) - oy);
  }
});

test('z-fighting: the start town\'s houses, seen from outside, have none (their timber frames\' braces and joists fought)', () => {
  const town = terrain.towns[0];
  // One of each kind and wall, a few of each: the same few dozen shapes make up every town.
  const seen = new Map<string, number>();
  for (const b of town.plan.buildings) {
    const key = `${b.kind} ${b.wall}`, n = seen.get(key) ?? 0;
    if (n >= 3) continue;
    seen.set(key, n + 1);
    noFights(buildingMesh(b, [b.cx, 0, b.cz], true), `${key} #${b.id}`, (x, z) => terrain.height(x + b.cx, z + b.cz));
  }
  assert.ok(seen.size >= 5, `${seen.size} kinds looked at`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ground } from '@futuremagic/core';
import { towerMesh, towerSize } from '../src/world/dungeon/towerMesh';
import { barrowMesh } from '../src/world/dungeon/barrowMesh';
import { floating, type PlacedMesh } from '../src/world/dungeon/meshKit';
import { layOutSight, layOutSite, type Place } from '../src/world/sites';
import type { RegionDecision, SightDecision } from '../src/world/decisions';
import type { SightShape } from '../src/setting/contract';

/**
 * Land that is hard to stand on: a slope of one in four (turned per case), bumps, and a brook's cut 2 m deep
 * across it, as terrain.height gives near a brook or a road's shoulder.
 */
const lands = (): { name: string; ground: Ground }[] => [0, 1.3, 2.6, 4.1].map((turn, i) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  return {
    name: `slope ${i}`,
    ground: (x: number, z: number) => {
      const u = x * c + z * s, v = -x * s + z * c;
      const cut = Math.max(0, 1 - Math.abs(v - 6) / 2.5);
      return -u * 0.25 + Math.sin(x * 0.7) * 0.15 + Math.cos(z * 0.9) * 0.12 - 2 * cut * cut;
    },
  };
});

/** Every piece the mesh marks as standing on the ground is in it, none floats over it. */
function onTheGround(m: PlacedMesh, ground: Ground, what: string): void {
  assert.ok(m.grounded.length > 0, `${what}: its pieces are marked`);
  const up = floating(m, ground);
  assert.deepEqual(up.map((f) => `piece ${f.piece} by ${f.by.toFixed(2)} m`), [], `${what}: nothing floats`);
}

test('on the ground: a ruined tower (its fallen stones and its walls) and a barrow stand on a slope, none of it floating', () => {
  for (const { name, ground } of lands()) {
    // The ground at the doorway is y 0 of the piece's frame.
    const g: Ground = (x, z) => ground(x, z) - ground(0, 0);
    for (const seed of [1, 2, 3]) {
      onTheGround(towerMesh(towerSize(14, 16, 4), seed, g), g, `tower ${seed} on ${name}`);
      onTheGround(barrowMesh(seed, g), g, `barrow ${seed} on ${name}`);
    }
    onTheGround(towerMesh({ half: 5, depth: 10, storeys: 3 }, 9, g), g, `warden's keep on ${name}`);
  }
});

test('on the ground: on level land the tower is as before (its stones half in the grass)', () => {
  const m = towerMesh(towerSize(14, 16, 4), 1);
  assert.deepEqual(floating(m, () => 0), []);
  // The stones sink a little, never more than they stand tall.
  for (let i = 0; i + 1 < m.grounded.length; i += 2) {
    let lo = Infinity;
    for (let j = m.grounded[i] + 1; j < m.grounded[i + 1]; j += 3) lo = Math.min(lo, m.position[j]);
    assert.ok(lo > -2.21 - 1e-6, `piece ${i / 2} at ${lo}`);
  }
});

test('on the ground: every place the VGM lays out in a region and every sight sits on the land, nothing floating', () => {
  const places: Place[] = ['camp', 'ruin', 'barrows'];
  const shapes: SightShape[] = ['stones', 'waystone', 'cairn', 'stash'];
  for (const { name, ground } of lands()) {
    for (const [i, place] of places.entries()) {
      const d = { kind: 'region', id: `r${i}`, seed: 40 + i, site: { x: 3, z: -2, yaw: 0.7, r: 16 } } as unknown as RegionDecision;
      const l = layOutSite(d, place, ground)!;
      const [ox, oy, oz] = l.origin;
      onTheGround(l.mesh, (x, z) => ground(x + ox, z + oz) - oy, `${place} on ${name}`);
    }
    for (const [i, shape] of shapes.entries()) {
      const d: SightDecision = { kind: 'sight', id: `s${i}`, sight: shape, x: -4, z: 5, yaw: 1.1, seed: 70 + i, at: 0 };
      const l = layOutSight(d, shape, ground);
      const [ox, oy, oz] = l.origin;
      onTheGround(l.mesh, (x, z) => ground(x + ox, z + oz) - oy, `${shape} on ${name}`);
    }
  }
});

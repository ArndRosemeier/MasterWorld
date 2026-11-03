/**
 * Pits as ways in (K, sinkholes): the search walks downhill into a hollow ringed by higher land and picks a gently rising wall foot,
 * its mouth turned into the wall; a slope that runs on, or flat land, is no pit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pitWall } from '../src/world/pit';

const bowl = (cx: number, cz: number) => (x: number, z: number): number => 18 * (1 - Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / 900)));

test('a bowl in the land gives a wall foot facing into the wall', () => {
  const h = bowl(100, 100), p = pitWall(h, 124, 96);
  assert.ok(p, 'a pit was found');
  assert.ok(p.depth >= 3, `depth ${p.depth}`);
  // The mouth faces uphill: forward (−sin yaw, −cos yaw) points away from the middle of the pit.
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), ox = p.x - 100, oz = p.z - 100, len = Math.hypot(ox, oz);
  assert.ok((fx * ox + fz * oz) / len > 0.9, 'turned into the wall');
  assert.ok(len > 3 && len < 14, `foot ${len.toFixed(1)} m from the middle`);
});

test('flat land and a plain slope are no pit', () => {
  assert.equal(pitWall(() => 5, 10, 10), null);
  assert.equal(pitWall((x) => 0.3 * x, 10, 10), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inWindow, maskWindow, townMaskData } from '../src/world/townMask';
import { TOWN_RASTER, TownGround, type Town } from '../src/world/town';

/** A town of market ground everywhere, `nx` × `nz` cells from (0, 0). */
const paved = (nx: number, nz: number) => ({ x0: 0, z0: 0, nx, nz, groundAt: () => TownGround.Market, fieldAt: () => null }) as unknown as Town;

test('town masks: a town bigger than the masks shows a window of its ground round the camera, empty at its edge', () => {
  const small = paved(30, 20);
  assert.deepEqual(maskWindow(small, 40, 40, 15, 10), [0, 0], 'a town that fits starts at its corner');
  const whole = townMaskData(small, 40, 40);
  assert.equal(whole[1], 255, 'its corner is drawn');
  const big = paved(300, 200), [i0, j0] = maskWindow(big, 64, 64, 150 * TOWN_RASTER, 100 * TOWN_RASTER);
  assert.ok(Math.abs(i0 + 32 - 150) <= 8 && Math.abs(j0 + 32 - 100) <= 8, `centred on the camera: ${i0}, ${j0}`);
  const data = townMaskData(big, 64, 64, i0, j0), g = (i: number, j: number) => data[(i + j * 128) * 4 + 1];
  assert.equal(g(10, 10), 255, 'its ground inside');
  for (const [i, j] of [[0, 10], [63, 10], [10, 0], [10, 63]]) assert.equal(g(i, j), 0, 'nothing at its edge (the shader repeats it beyond)');
  assert.ok(inWindow(big, [i0, j0], 64, 64, 150, 100) === (64 * TOWN_RASTER > 300), 'moves on near an edge with more town beyond');
  assert.ok(inWindow(paved(30, 20), [0, 0], 40, 40, 1, 1), 'a town that fits never moves');
});

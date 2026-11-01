import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three/webgpu';
import { AuraMarks, projectAuras } from '../src/render/aura/marks';
import { OUTLINE } from '../src/render/materials/outline';

const camera = () => {
  const c = new PerspectiveCamera(60, 16 / 9, 0.2, 2000);
  c.position.set(1000, 2, -500);
  c.updateMatrixWorld();
  return c;
};

test('outline: a creature straight ahead is an ellipse in the middle of the screen, at its distance', () => {
  const m = new AuraMarks();
  m.mark(1000, 2, -510, 1, 0.5, 1, 0, 0.2, 1, 0.3, 1);
  projectAuras(camera(), m);
  const a = OUTLINE.slots.area[0]!, r = OUTLINE.slots.range[0]!, t = OUTLINE.slots.tint[0]!;
  assert.ok(Math.abs(a.x - 0.5) < 1e-6 && Math.abs(a.y - 0.5) < 1e-6, 'in the middle');
  assert.ok(Math.abs(r.x - 10) < 1e-6, 'ten metres off');
  assert.ok(a.w > a.z * 1.3, 'taller than wide on a wide screen for a body twice as high as wide');
  assert.equal(r.z, 1);
  assert.ok(t.w > 2, 'the strong one has a thick line');
  assert.equal(m.count, 0, 'the marks are taken');
  assert.equal(OUTLINE.slots.range[1]!.z, 0, 'the rest of the table is empty');
});

test('outline: behind the eye nothing is outlined; the strongest come first and only so many fit', () => {
  const m = new AuraMarks();
  m.mark(1000, 2, -490, 1, 0.5, 1, 0, 1, 1, 1, 1); // behind (the camera looks to -z)
  for (let i = 0; i < 30; i++) m.mark(1000 + (i - 15) * 0.2, 2, -510 - i, i === 29 ? 1 : 0.5, 0.5, 1, i, 1, 1, 1, 1);
  projectAuras(camera(), m);
  assert.equal(OUTLINE.slots.range[0]!.z, 1, 'the strong one first');
  assert.ok(Math.abs(OUTLINE.slots.range[0]!.x - 39) < 1e-6, 'it is the farthest (the 30th)');
  for (let k = 0; k < OUTLINE.cap; k++) assert.ok(OUTLINE.slots.range[k]!.x > 5, 'none from behind');
});

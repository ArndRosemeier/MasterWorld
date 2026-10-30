import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/render/typedMatrices';
import { Matrix4, Object3D } from 'three/webgpu';

test('typedMatrices: a matrix keeps its numbers in a Float64Array and works as before', () => {
  const m = new Matrix4().makeRotationY(0.3);
  assert.ok(m.elements instanceof Float64Array);
  const o = new Object3D();
  o.position.set(1, 2, 3);
  o.rotation.y = 0.3;
  o.updateMatrixWorld();
  assert.ok(o.matrixWorld.elements instanceof Float64Array);
  assert.deepEqual([...o.matrixWorld.elements.slice(12, 15)], [1, 2, 3]);
  const r = new Matrix4().multiplyMatrices(m, new Matrix4().copy(m).invert());
  assert.ok(r.equals(new Matrix4()) || r.elements.every((v, i) => Math.abs(v - new Matrix4().elements[i]) < 1e-12));
  // three writes shader constants as `elements.map(...).join(', ')`: map gives plain values.
  assert.equal(new Matrix4().elements.map((v) => `${v}.0`).join(','), '1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0');
  assert.deepEqual(m.clone().toArray(), [...m.elements]);
});

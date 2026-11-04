import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicNodeMaterial, PerspectiveCamera } from 'three/webgpu';
// @ts-expect-error: three's own source, not in its typings
import RenderObject from 'three/src/renderers/common/RenderObject.js';
import { freeMesh } from '../src/render/materials';

/** How many listeners a material holds for its `dispose` event (each render object drawn with it adds one). */
const held = (m: object): number => ((m as { _listeners?: Record<string, unknown[]> })._listeners?.dispose ?? []).length;

test('freeMesh: the renderer lets go of a mesh drawn with a shared material (the memory leak of every terrain chunk)', () => {
  const shared = new MeshBasicNodeMaterial();
  const nodes = { getCacheKey: () => 0, getForRenderCacheKey: () => '' };
  const renderer = { _currentSourceMaterial: null, contextNode: { id: 0 }, getOutputRenderTarget: () => null };
  const meshes = Array.from({ length: 3 }, () => new Mesh(new BoxGeometry(), shared));
  for (const m of meshes) {
    const ro = new RenderObject(nodes, null, renderer, m, shared, null, new PerspectiveCamera(), null, { id: 0 }, null);
    ro.onDispose = () => {};
  }
  assert.equal(held(shared), 3);
  for (const m of meshes) freeMesh(m);
  assert.equal(held(shared), 0, 'no render object left holding a freed mesh through the material');
});

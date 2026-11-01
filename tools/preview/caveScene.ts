/**
 * The scene of a formed cave for the preview pages (inside.ts, walk.ts): its walls, formations, crystals, loose stones and
 * water drawn with the game's own node shaders (src/render/materials/formedCave.ts, formedWater.ts), a little ambient light
 * and the dark with fog. The lantern is the page's own.
 */
import * as T from 'three/webgpu';
import { FORMED_CALCITE, FORMED_ROCK } from '../../src/render/materials/formedCave';
import { FORMED_WATER } from '../../src/render/materials/formedWater';
import { kindMesh } from '../../src/render/materials';
import type { CaveResult } from '../../src/workers/cave.worker';

/** A geometry from a mesh of arrays: position, normal, tint (sRGB bytes to 0..1) and the material per vertex. */
function geometryOf(m: { position: Float32Array; normal: Float32Array; tint: Uint8Array; mat: Uint8Array; index: Uint32Array }): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new T.BufferAttribute(m.normal, 3));
  g.setAttribute('tint', new T.BufferAttribute(Float32Array.from(m.tint, (v) => v / 255), 3));
  g.setAttribute('mat', new T.BufferAttribute(Float32Array.from(m.mat), 1));
  g.setIndex(new T.BufferAttribute(m.index, 1));
  return g;
}

/** The scene of a cave result (meshed, dressed): the walls' mesh is also returned, for rays against the rock. */
export function caveScene(res: CaveResult): { scene: T.Scene; walls: T.Mesh } {
  const scene = new T.Scene();
  const walls = kindMesh(geometryOf(res.mesh as never), FORMED_ROCK);
  scene.add(walls);
  // Formations and crystals (waxy calcite), stones (the wall's own stone).
  if (res.parts) {
    scene.add(kindMesh(geometryOf(res.parts.formations), FORMED_CALCITE));
    scene.add(kindMesh(geometryOf(res.parts.crystals), FORMED_CALCITE));
    scene.add(kindMesh(geometryOf(res.parts.stones), FORMED_ROCK));
  }
  if (res.parts) {
    const w = res.parts.water, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(w.position, 3));
    g.setAttribute('normal', new T.BufferAttribute(w.normal, 3));
    g.setAttribute('uv', new T.BufferAttribute(w.uv, 2));
    g.setAttribute('tint', new T.BufferAttribute(w.flow, 3));
    g.setIndex(new T.BufferAttribute(w.index, 1));
    const sheet = new URLSearchParams(location.search).get('waterdebug') ? new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xff00ff })) : kindMesh(g, FORMED_WATER); sheet.renderOrder = 2;
    scene.add(sheet);
  }
  scene.add(new T.AmbientLight(0x8494b0, 0.55));
  scene.background = new T.Color(0x07080a);
  scene.fog = new T.FogExp2(0x07080a, 0.03);
  return { scene, walls };
}

/**
 * The scene of a formed cave for the preview pages (inside.ts, walk.ts): its walls, formations, crystals, loose stones and
 * water drawn with the game's own node shaders (src/render/materials/formedCave.ts, formedWater.ts), a little ambient light
 * and the dark with fog. The lantern is the page's own.
 */
import * as T from 'three/webgpu';
import { formedMeshes } from '../../src/render/cave/formedMeshes';
import type { CaveResult } from '../../src/workers/cave.worker';

/** The scene of a cave result (meshed, dressed): the walls' mesh is also returned, for rays against the rock. */
export function caveScene(res: CaveResult): { scene: T.Scene; walls: T.Mesh } {
  const scene = new T.Scene();
  const { group, walls } = formedMeshes(res);
  scene.add(group);
  // `&waterdebug=1` draws the water flat magenta (to check its geometry).
  if (res.parts && new URLSearchParams(location.search).get('waterdebug')) {
    const sheet = group.children[group.children.length - 1] as T.Mesh;
    sheet.material = new T.MeshBasicMaterial({ color: 0xff00ff });
  }
  scene.add(new T.AmbientLight(0x8494b0, 0.55));
  scene.background = new T.Color(0x07080a);
  scene.fog = new T.FogExp2(0x07080a, 0.03);
  return { scene, walls };
}

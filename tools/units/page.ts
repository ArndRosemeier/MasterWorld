/**
 * The texture-unit check's page (check.mjs): the game's view on WebGL 2 with every material kind warmed up,
 * as the game does before play. The check reads the fragment shaders the page compiles.
 */
import { DataArrayTexture } from 'three/webgpu';
import { createView } from '../../src/render/view';
import { useGroundTextures } from '../../src/render/materials';
import { NATURAL_NAMES } from '@futuremagic/texgen';
import '../../src/render/materials/building';
import '../../src/render/materials/creatures';
import '../../src/render/materials/flame';
import '../../src/render/materials/folk';
import { useWaterEnvironment } from '../../src/render/materials/water';

declare global { interface Window { __unitsDone?: string } }

const blank = (layers: number): DataArrayTexture => {
  const t = new DataArrayTexture(new Uint8Array(layers * 4).fill(128), 1, 1, layers);
  t.needsUpdate = true;
  return t;
};

try {
  // The ground's arrays are made in workers in the game; their size does not change the shader.
  useGroundTextures({ albedo: blank(NATURAL_NAMES.length), normal: blank(NATURAL_NAMES.length) });
  const view = await createView(document.getElementById('c') as HTMLCanvasElement, { forceWebGL: true, hour: 12, dayMinutes: 60 });
  // As main.ts does before the warm-up.
  view.sky.update(0, view.camera);
  useWaterEnvironment(view.sky.envTexture);
  await view.stage.warmUp();
  window.__unitsDone = 'ok';
} catch (e) {
  window.__unitsDone = `failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`;
}

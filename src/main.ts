import { GraphicsUnavailable } from '@futuremagic/stage';
import { parseSeed } from '@futuremagic/core';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { FlyCamera } from './app/flyCamera';
import { createView } from './render/view';
import { TerrainView } from './render/terrain/TerrainView';
import { createTerrainPool, createTexturePool } from './workers/pool';
import { loadGroundTextures } from './render/terrain/groundTextures';
import { useGroundTextures } from './render/materials';
import { settingById } from './setting/index';
import { validateSetting } from './setting/contract';
import { Terrain } from './world/terrain';
import { findStart } from './world/start';

declare global {
  interface Window {
    /** Set when the first frame after loading is drawn (the screenshot tool waits for it). */
    __mwReady?: boolean;
  }
}

async function start(): Promise<void> {
  const loading = new LoadingScreen();
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  try {
    const setting = settingById(params.setting);
    const errors = validateSetting(setting);
    if (errors.length) throw new Error(errors.join('; '));
    const seed = parseSeed(params.seed);
    const terrain = new Terrain(seed, setting);
    loading.set('Finding the start');
    const home = findStart(terrain.skeleton, setting);

    loading.set('Starting the renderer');
    const view = await createView(canvas, { forceWebGL: params.gl, hour: params.hour, dayMinutes: params.dayMinutes });
    const fly = new FlyCamera(view.camera, canvas, (x, z) => terrain.height(x, z));
    const [px, py, pz] = params.pos ?? [home.x, 1.7, home.z];
    if (params.pos?.length === 2) fly.place(px, py, terrain.height(px, py) + 1.7);
    else if (params.pos) fly.place(px, pz, py, true);
    else fly.place(px, pz, terrain.height(px, pz) + py);
    if (params.look) fly.setLook(params.look[0], params.look[1] ?? 0);

    loading.set('Painting the ground');
    const texPool = createTexturePool();
    useGroundTextures(await loadGroundTextures(texPool));
    texPool.dispose();

    view.sky.update(0, view.camera);
    loading.set('Preparing shaders');
    await view.stage.warmUp();
    loading.set('Raising the land');
    const ground = new TerrainView(view.stage, createTerrainPool(), seed, setting.id, (x, z) => terrain.height(x, z));
    await ground.ready(view.camera);

    const hud = document.getElementById('hud');
    let last = performance.now();
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      fly.update(dt);
      view.sky.update(dt, view.camera);
      ground.update(view.camera);
      view.stage.frame();
      view.renderer.render(view.scene, view.camera);
      if (hud && params.hud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})\n${view.stage.hudLine()}`;
      }
      last = now;
      if (!window.__mwReady) {
        window.__mwReady = true;
        loading.done();
      }
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    loading.fail(err instanceof GraphicsUnavailable ? 'No graphics' : 'Could not start', detail);
    throw err;
  }
}

void start();

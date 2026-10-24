import { GraphicsUnavailable } from '@futuremagic/stage';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { createView } from './render/view';

declare global {
  interface Window {
    /** Set when the first frame after warm-up is drawn (the screenshot tool waits for it). */
    __mwReady?: boolean;
  }
}

async function start(): Promise<void> {
  const loading = new LoadingScreen();
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  try {
    loading.set('Starting the renderer');
    const view = await createView(canvas, { forceWebGL: params.gl });
    loading.set('Preparing shaders');
    await view.stage.warmUp();
    const hud = document.getElementById('hud');
    let last = performance.now();
    view.renderer.setAnimationLoop(() => {
      const now = performance.now();
      view.stage.frame();
      view.renderer.render(view.scene, view.camera);
      if (hud && params.hud) hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms\n${view.stage.hudLine()}`;
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

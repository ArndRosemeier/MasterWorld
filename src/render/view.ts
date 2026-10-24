/**
 * The view: the one renderer, scene, camera and Stage. Everything visible enters through `view.stage.add`.
 */
import { PerspectiveCamera, Scene, Color, Fog, type WebGPURenderer } from 'three/webgpu';
import { Stage, createRenderer } from '@futuremagic/stage';
import { allKinds } from './materials';

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
}

export async function createView(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean }): Promise<View> {
  // Reversed depth: precision from a metre to the far horizon in one view.
  const { renderer, backend } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL: opts.forceWebGL, depth: 'reversed' });
  const scene = new Scene();
  scene.background = new Color(0x8fb4d8);
  scene.fog = new Fog(0x8fb4d8, 2000, 9000);
  const camera = new PerspectiveCamera(55, 1, 0.1, 20000);
  camera.position.set(0, 2, 0);
  const stage = new Stage(renderer, scene, camera, { kinds: allKinds });
  const fit = (): void => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  fit();
  addEventListener('resize', fit);
  return { renderer, backend, scene, camera, stage };
}

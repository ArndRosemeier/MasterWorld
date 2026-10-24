/**
 * The view: the one renderer, scene, camera and Stage. Everything visible enters through `view.stage.add`.
 */
import { PerspectiveCamera, Scene, Color, Fog, DirectionalLight, HemisphereLight, type WebGPURenderer } from 'three/webgpu';
import { Stage, createRenderer } from '@futuremagic/stage';
import { allKinds } from './materials';

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  readonly sun: DirectionalLight;
}

export async function createView(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean }): Promise<View> {
  // Reversed depth: precision from a metre to the far horizon in one view.
  const { renderer, backend } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL: opts.forceWebGL, depth: 'reversed', exposure: 1.3 });
  const scene = new Scene();
  scene.background = new Color(0x8fb4d8);
  scene.fog = new Fog(0x9fbfdc, 6000, 60000);
  const camera = new PerspectiveCamera(55, 1, 0.2, 120000);
  camera.position.set(0, 2, 0);
  // Lights are fixed before the warm-up: their number and order are part of every shader's key.
  const sun = new DirectionalLight(0xfff0d8, 4.2);
  // Low afternoon sun from the south-west: long shadows and warm light on the slopes.
  sun.position.set(-0.6, 0.38, 0.7).multiplyScalar(1000);
  scene.add(sun, sun.target);
  scene.add(new HemisphereLight(0xbcd6f0, 0x5a5040, 1.4));
  const stage = new Stage(renderer, scene, camera, { kinds: allKinds });
  const fit = (): void => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener('resize', fit);
  return { renderer, backend, scene, camera, stage, sun };
}

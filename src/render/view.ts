/**
 * The view: the one renderer, scene, camera and Stage. Everything visible enters through `view.stage.add`.
 */
import { PerspectiveCamera, PCFSoftShadowMap, Scene, DirectionalLight, HemisphereLight, type WebGPURenderer } from 'three/webgpu';
import { SkyView } from './sky';
import { Stage, createRenderer } from '@futuremagic/stage';
import { Float32BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { allKinds } from './materials';

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  readonly sun: DirectionalLight;
  readonly sky: SkyView;
}

export async function createView(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean; hour: number; dayMinutes: number }): Promise<View> {
  // Reversed depth: precision from a metre to the far horizon in one view.
  const { renderer, backend } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL: opts.forceWebGL, depth: 'reversed', exposure: 1.9 });
  // Shadows are part of every lit shader's key: on before anything is built.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.2, 120000);
  camera.position.set(0, 2, 0);
  // Lights are fixed before the warm-up: their number and order are part of every shader's key.
  const sun = new DirectionalLight(0xfff0d8, 4.2);
  const hemi = new HemisphereLight(0xbcd6f0, 0x5a5040, 1.4);
  scene.add(sun, sun.target, hemi);
  // Sky, fog, environment map and the sun's shadow (all part of shader keys) before the Stage warms up.
  const sky = new SkyView(renderer, scene, sun, hemi, opts);
  const stage = new Stage(renderer, scene, camera, { kinds: allKinds, attribute: standInAttribute });
  const fit = (): void => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener('resize', fit);
  stage.shadowCamera = sun.shadow.camera;
  return { renderer, backend, scene, camera, stage, sun, sky };
}

/** Our own vertex attributes on the Stage's warm-up stand-ins (same size as on real meshes). */
function standInAttribute(g: BufferGeometry, name: string): boolean {
  if (name === 'surface' || name === 'canopy') g.setAttribute(name, new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  else if (name === 'level' || name === 'mat') g.setAttribute(name, new Float32BufferAttribute([1, 1, 1], 1));
  else if (name === 'tint') g.setAttribute('tint', new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  else return false;
  return true;
}

/**
 * The view: the one renderer, scene, camera and Stage. Everything visible enters through `view.stage.add`.
 */
import { PerspectiveCamera, PCFSoftShadowMap, Scene, DirectionalLight, HemisphereLight, PointLight, type WebGPURenderer } from 'three/webgpu';
import { SkyView } from './sky';
import { GRADE, Stage, createRenderer } from '@futuremagic/stage';
import { Float32BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { allKinds } from './materials';
import { DoorLights } from './town/doorLights';

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  readonly sun: DirectionalLight;
  /** The hero's lantern: dark below ground (off, intensity 0, above it). */
  readonly lantern: PointLight;
  /** Warm light from the town's doorways at night. */
  readonly doors: DoorLights;
  readonly sky: SkyView;
}

export async function createView(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean; hour: number; dayMinutes: number; tone?: 'aces' | 'agx' | 'graded' }): Promise<View> {
  // Reversed depth: precision from a metre to the far horizon in one view.
  const { renderer, backend } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL: opts.forceWebGL, depth: 'reversed', exposure: 1.9, tone: opts.tone ?? 'graded' });
  // Our look on AgX: close to its Punchy look (AgX alone reads washed out on the greens).
  GRADE.power.value.setScalar(1.3);
  GRADE.saturation.value = 1.3;
  // Shadows are part of every lit shader's key: on before anything is built.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.2, 120000);
  camera.position.set(0, 2, 0);
  // Lights are fixed before the warm-up: their number and order are part of every shader's key.
  const sun = new DirectionalLight(0xfff0d8, 4.2);
  const hemi = new HemisphereLight(0xbcd6f0, 0x5a5040, 1.4);
  // The lantern is always in the scene (lights are part of every shader's key), dark until needed.
  const lantern = new PointLight(0xffc27a, 0, 14, 1.6);
  lantern.castShadow = false;
  scene.add(sun, sun.target, hemi, lantern);
  const doors = new DoorLights(scene);
  // Sky, fog, environment map and the sun's shadow (all part of shader keys) before the Stage warms up.
  // AgX (with or without our look) needs more exposure than ACES for the same mid-grey (ACES divides by 0.6).
  const sky = new SkyView(renderer, scene, sun, hemi, { ...opts, exposure: (opts.tone ?? 'graded') === 'aces' ? 1 : (opts.tone ?? 'graded') === 'agx' ? 1.5 : 1.6 });
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
  return { renderer, backend, scene, camera, stage, sun, lantern, doors, sky };
}

/** Our own vertex attributes on the Stage's warm-up stand-ins (same size as on real meshes). */
function standInAttribute(g: BufferGeometry, name: string): boolean {
  if (name === 'surface' || name === 'canopy') g.setAttribute(name, new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  else if (name === 'level' || name === 'mat') g.setAttribute(name, new Float32BufferAttribute([1, 1, 1], 1));
  else if (name === 'tint') g.setAttribute('tint', new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  else return false;
  return true;
}

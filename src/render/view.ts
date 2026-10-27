/**
 * The view: the one renderer, scene, camera and Stage. Everything visible enters through `view.stage.add`.
 */
import { PerspectiveCamera, PCFSoftShadowMap, Scene, DirectionalLight, HemisphereLight, PointLight, type WebGPURenderer } from 'three/webgpu';
import { SkyView } from './sky';
import { GRADE, Stage, createPost, createRenderer, type Post } from '@futuremagic/stage';
import { Float32BufferAttribute, type BufferGeometry } from 'three/webgpu';
import { allKinds } from './materials';
import { WarmLights } from './warmLights';
import './materials/flame';
import { ORIGIN } from './origin';

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  /** The game's camera, in world coordinates (never drawn itself: `drawn` is). */
  readonly camera: PerspectiveCamera;
  /** The camera as the renderer sees it: `camera` relative to the floating origin (origin.ts), set by `draw`. */
  readonly drawn: PerspectiveCamera;
  readonly stage: Stage;
  readonly sun: DirectionalLight;
  /** The hero's lantern: dark below ground (off, intensity 0, above it). */
  readonly lantern: PointLight;
  /** Firelight: the town's doorways at night, a cellar's torches. */
  readonly warm: WarmLights;
  readonly sky: SkyView;
  /** The post chain (bloom), or null when drawing straight to the screen (`post=0`). */
  readonly post: Post | null;
  /** Draws one frame. */
  draw(): void;
}

/** What glows: brighter than this on screen (after exposure, before the tone curve). */
const BLOOM_AT = 4;
/** After dark (and below ground) a lower one: lit windows, doorways and torches glow softly. */
const BLOOM_AT_NIGHT = 1.6;
/** How strong and how wide the glow is (wide and strong veils the whole sunlit frame). */
const BLOOM_STRENGTH = 0.16, BLOOM_RADIUS = 0.3;
/** At night the glow round lights is a little stronger and wider (as it was before the day was tuned). */
const BLOOM_STRENGTH_NIGHT = 0.22, BLOOM_RADIUS_NIGHT = 0.45;

export async function createView(canvas: HTMLCanvasElement, opts: { forceWebGL: boolean; hour: number; dayMinutes: number; tone?: 'aces' | 'agx' | 'graded'; post?: boolean; postSamples?: number; postFloatDepth?: boolean; ao?: { radius: number; strength: number } | null; bloom?: number[]; envGround?: number }): Promise<View> {
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
  // Drawn relative to the floating origin: the scene's root stands at minus it, the renderer's camera is a copy of
  // the game's placed relative to it (each frame, in `draw`).
  ORIGIN.attach(scene);
  const drawn = ORIGIN.view(camera, new PerspectiveCamera());
  // Lights are fixed before the warm-up: their number and order are part of every shader's key.
  const sun = new DirectionalLight(0xfff0d8, 4.2);
  const hemi = new HemisphereLight(0xbcd6f0, 0x5a5040, 1.4);
  // The lantern is always in the scene (lights are part of every shader's key), dark until needed.
  const lantern = new PointLight(0xffc27a, 0, 14, 1.6);
  lantern.castShadow = false;
  scene.add(sun, sun.target, hemi, lantern);
  const warm = new WarmLights(scene);
  // Sky, fog, environment map and the sun's shadow (all part of shader keys) before the Stage warms up.
  // AgX (with or without our look) needs more exposure than ACES for the same mid-grey (ACES divides by 0.6).
  const sky = new SkyView(renderer, scene, sun, hemi, { ...opts, exposure: (opts.tone ?? 'graded') === 'aces' ? 1 : (opts.tone ?? 'graded') === 'agx' ? 1.5 : 1.6 });
  // Bloom: a soft glow round the sun, lit windows and fire. Its threshold follows the exposure (frame()).
  // Ambient occlusion: contact shade in corners, under eaves, round feet and stones.
  const post = opts.post === false ? null : createPost(renderer, scene, drawn, { bloom: { strength: opts.bloom?.[1] ?? BLOOM_STRENGTH, radius: opts.bloom?.[2] ?? BLOOM_RADIUS, threshold: 1 }, ...(opts.ao === null ? {} : { ao: opts.ao ?? { radius: 1, strength: 0.6 } }), samples: opts.postSamples, floatDepth: opts.postFloatDepth });
  const draw = (): void => {
    ORIGIN.view(camera, drawn);
    if (!post) { renderer.render(scene, drawn); return; }
    const day = sky.indoors ? 0 : sky.light.day;
    post.bloom!.threshold.value = (opts.bloom?.[0] ?? BLOOM_AT_NIGHT + (BLOOM_AT - BLOOM_AT_NIGHT) * day) / Math.max(1e-3, renderer.toneMappingExposure);
    if (!opts.bloom) {
      post.bloom!.strength.value = BLOOM_STRENGTH_NIGHT + (BLOOM_STRENGTH - BLOOM_STRENGTH_NIGHT) * day;
      post.bloom!.radius.value = BLOOM_RADIUS_NIGHT + (BLOOM_RADIUS - BLOOM_RADIUS_NIGHT) * day;
    }
    post.draw();
  };
  const stage = new Stage(renderer, scene, drawn, { kinds: allKinds, attribute: standInAttribute, target: post ? post.target : undefined, draw });
  const fit = (): void => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener('resize', fit);
  stage.shadowCamera = sun.shadow.camera;
  return { renderer, backend, scene, camera, drawn, stage, sun, lantern, warm, sky, post, draw };
}

/** Our own vertex attributes on the Stage's warm-up stand-ins (same size as on real meshes). */
function standInAttribute(g: BufferGeometry, name: string): boolean {
  if (name === 'surface' || name === 'canopy') g.setAttribute(name, new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  else if (name === 'level' || name === 'mat') g.setAttribute(name, new Float32BufferAttribute([1, 1, 1], 1));
  else if (name === 'tint') g.setAttribute('tint', new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  else if (name === 'spell') g.setAttribute('spell', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 4));
  else return false;
  return true;
}

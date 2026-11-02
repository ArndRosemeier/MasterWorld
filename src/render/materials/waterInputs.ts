// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * What the water shader and the terrain's underwater shading read: uniforms the WaterView and SkyView
 * write each frame, and the water masks. No material here (materials live in the registry).
 */
import { Color, Vector2, Vector3, Vector4, type Node } from 'three/webgpu';
import { mix, smoothstep, uniform, uniformArray, vec4 } from 'three/tsl';
import { DRY } from '../../world/water';
import { FloatMask, inside, sampleMask } from './masks';

/** A water mask (world/water.ts): surface level, depth, flow. Empty: far below, dry. */
export const emptyWaterMask = (side: number, res: number): FloatMask => new FloatMask(side, res, [-1e4, DRY, 0, 0]);

/**
 * The water at world xz: vec4(surface level, depth, flow x, flow z). The near mask where it reaches, the
 * mid and far ones around it, and beyond both open sea at level 0 (land out there hides it).
 */
export function waterAt(p: Node<'vec2'>): Node<'vec4'> {
  const far = mix(vec4(0, 60, 0, 0), sampleMask(WATER.far, p), smoothstep(0.0, 0.01, inside(WATER.far, p)));
  const mid = mix(far, sampleMask(WATER.mid, p), smoothstep(0.0, 0.03, inside(WATER.mid, p)));
  return mix(mid, sampleMask(WATER.near, p), smoothstep(0.0, 0.05, inside(WATER.near, p)));
}

/** The ships' hulls near the camera with no water drawn inside them (S3), and the stations along each where its width is known. */
export const HULL_STATIONS = 17;
/** Each hull's middle and heading (world x, z, and its unit ux, uz): written by the ships' view. */
export const HULL_POSES: readonly Vector4[] = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
export const HULLS = HULL_POSES.length;

export const WATER = {
  /** Each hull's half length (0: none), and its half width at the waterline at each station from stern to bow (m). */
  hullPose: uniformArray(HULL_POSES as Vector4[], 'vec4'),
  hullLength: uniformArray(new Array<number>(HULLS).fill(0), 'float'),
  hullWidth: uniformArray(new Array<number>(HULLS * HULL_STATIONS).fill(0), 'float'),
  time: uniform(0),
  /** The water mesh's centre (it follows the camera). */
  center: uniform(new Vector3()),
  wind: uniform(new Vector2(1, 0)),
  /** Wave height scale (calm 0.3 .. stormy 2). */
  amp: uniform(1),
  sunDir: uniform(new Vector3(0, 1, 0)),
  sunColor: uniform(new Color(1, 1, 1)),
  /** Light falling into the water from the sky (ambient). */
  ambient: uniform(new Color(0.5, 0.6, 0.7)),
  /** Scattering colour of the water body (deep sea), and the absorption per metre (red goes first). */
  deep: uniform(new Color(0.006, 0.03, 0.045)),
  shallow: uniform(new Color(0.03, 0.14, 0.16)),
  absorb: uniform(new Vector3(0.45, 0.14, 0.09)),
  /** Environment light strength (for the sky reflection). */
  env: uniform(1),
  near: emptyWaterMask(1024, 512),
  mid: emptyWaterMask(4096, 512),
  far: emptyWaterMask(16384, 256),
};

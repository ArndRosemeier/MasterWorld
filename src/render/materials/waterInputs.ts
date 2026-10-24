// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * What the water shader and the terrain's underwater shading read: uniforms the WaterView and SkyView
 * write each frame, and the water masks. No material here (materials live in the registry).
 */
import { Color, DataTexture, NearestFilter, ClampToEdgeWrapping, FloatType, RGBAFormat, Vector2, Vector3, type Node } from 'three/webgpu';
import { float, floor, fract, mix, smoothstep, texture, uniform, vec2, vec4 } from 'three/tsl';
import { DRY } from '../../world/water';

/** A water mask (world/water.ts) as a float texture, with where it lies. */
export class WaterMask {
  readonly data: Float32Array;
  readonly tex: DataTexture;
  readonly origin = uniform(new Vector2(1e9, 1e9));
  readonly size;
  constructor(readonly side: number, readonly res: number) {
    this.size = uniform(side);
    this.data = new Float32Array(res * res * 4);
    for (let p = 0; p < res * res; p++) { this.data[p * 4] = -1e4; this.data[p * 4 + 1] = DRY; }
    // Float textures filter only with an extension on WebGL 2: nearest, blended by hand (`sampleMask`).
    this.tex = new DataTexture(this.data, res, res, RGBAFormat, FloatType);
    this.tex.magFilter = this.tex.minFilter = NearestFilter;
    this.tex.wrapS = this.tex.wrapT = ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }
}

/** Bilinear read of a mask at world xz (four nearest taps). */
function sampleMask(m: WaterMask, p: Node): Node {
  const f = p.sub(m.origin).div(m.size).mul(m.res).sub(0.5);
  const i = floor(f), t = fract(f);
  const at = (dx: number, dy: number) => texture(m.tex, i.add(vec2(dx + 0.5, dy + 0.5)).div(m.res));
  return mix(mix(at(0, 0), at(1, 0), t.x), mix(at(0, 1), at(1, 1), t.x), t.y);
}

/** Inside-ness of a world point in a mask: 0 at its edge, rising inwards. */
function inside(m: WaterMask, p: Node): Node {
  const u = p.sub(m.origin).div(m.size);
  return u.x.min(u.y).min(float(1).sub(u.x).min(float(1).sub(u.y)));
}

/**
 * The water at world xz: vec4(surface level, depth, flow x, flow z). The near mask where it reaches, the
 * mid and far ones around it, and beyond both open sea at level 0 (land out there hides it).
 */
export function waterAt(p: Node<'vec2'>): Node<'vec4'> {
  const far = mix(vec4(0, 60, 0, 0), sampleMask(WATER.far, p), smoothstep(0.0, 0.01, inside(WATER.far, p)));
  const mid = mix(far, sampleMask(WATER.mid, p), smoothstep(0.0, 0.03, inside(WATER.mid, p)));
  return mix(mid, sampleMask(WATER.near, p), smoothstep(0.0, 0.05, inside(WATER.near, p)));
}

export const WATER = {
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
  shallow: uniform(new Color(0.04, 0.16, 0.17)),
  absorb: uniform(new Vector3(0.42, 0.11, 0.07)),
  /** Environment light strength (for the sky reflection). */
  env: uniform(1),
  near: new WaterMask(1024, 512),
  mid: new WaterMask(4096, 512),
  far: new WaterMask(16384, 256),
};

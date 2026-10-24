/**
 * What the water shader and the terrain's underwater shading read: uniforms the WaterView and SkyView
 * write each frame, and the depth mask textures. No material here (materials live in the registry).
 */
import { Color, DataTexture, LinearFilter, ClampToEdgeWrapping, RGBAFormat, UnsignedByteType, Vector2, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { MASK_RES, SEA_LEVEL } from '../../world/water';

export class DepthMask {
  readonly data = new Uint8Array(MASK_RES * MASK_RES * 4);
  readonly tex: DataTexture;
  readonly origin = uniform(new Vector2(1e9, 1e9));
  readonly size;
  constructor(readonly side: number) {
    this.size = uniform(side);
    this.tex = new DataTexture(this.data, MASK_RES, MASK_RES, RGBAFormat, UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = LinearFilter;
    this.tex.wrapS = this.tex.wrapT = ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }
}

export const WATER = {
  time: uniform(0),
  level: uniform(SEA_LEVEL),
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
  near: new DepthMask(1024),
  far: new DepthMask(16384),
};

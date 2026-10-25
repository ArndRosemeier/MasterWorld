// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Float masks baked in workers around the camera (water, grass) as textures the shaders read, with where
 * they lie, and how a shader reads them.
 */
import { DataTexture, NearestFilter, ClampToEdgeWrapping, FloatType, RGBAFormat, Vector2, type Node } from 'three/webgpu';
import { float, floor, fract, mix, texture, uniform, vec2 } from 'three/tsl';

/** An RGBA float mask `side` metres across, `res` samples a side; `fill` is what it holds before any data. */
export class FloatMask {
  readonly data: Float32Array;
  readonly tex: DataTexture;
  readonly origin = uniform(new Vector2(1e9, 1e9));
  readonly size;
  constructor(readonly side: number, readonly res: number, fill: readonly [number, number, number, number]) {
    this.size = uniform(side);
    this.data = new Float32Array(res * res * 4);
    for (let p = 0; p < res * res; p++) this.data.set(fill, p * 4);
    // Float textures filter only with an extension on WebGL 2: nearest, blended by hand (`sampleMask`).
    this.tex = new DataTexture(this.data, res, res, RGBAFormat, FloatType);
    this.tex.magFilter = this.tex.minFilter = NearestFilter;
    this.tex.wrapS = this.tex.wrapT = ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }
}

/** Bilinear read of a mask at world xz (four nearest taps). */
export function sampleMask(m: FloatMask, p: Node): Node {
  const f = p.sub(m.origin).div(m.size).mul(m.res).sub(0.5);
  const i = floor(f), t = fract(f);
  const at = (dx: number, dy: number) => texture(m.tex, i.add(vec2(dx + 0.5, dy + 0.5)).div(m.res));
  return mix(mix(at(0, 0), at(1, 0), t.x), mix(at(0, 1), at(1, 1), t.x), t.y);
}

/** Inside-ness of a world point in a mask: 0 at its edge, rising inwards (negative outside). */
export function inside(m: FloatMask, p: Node): Node {
  const u = p.sub(m.origin).div(m.size);
  return u.x.min(u.y).min(float(1).sub(u.x).min(float(1).sub(u.y)));
}

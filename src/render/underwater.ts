// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The water a camera is in (D25, S1): a veil over the drawn scene in the post chain. Under the sea the light dies
 * with distance, red first, into a blue-green murk; with the camera in the waterline itself the frame is split
 * where the surface crosses the lens, the scene above it, the murk below, a dark thin line between. The split
 * follows the waves at the camera. One shader, built with the post chain at the start (never in play).
 */
import { Color, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { exp, float, max, mix, screenUV, sin, smoothstep, uniform, vec3, vec4, clamp } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Light lost per metre seen through sea water (red first), and the murk's own thickness per metre. */
const ABSORB = new Vector3(0.16, 0.045, 0.03);
const MURK = 0.035;
/** The scene is drawn as from under the water once the camera is this far below the surface (m, the frame all under at LENS); nearer, the veil splits the frame. */
export const UNDER_LENS = 0.5;
/** How far in front of the camera the waterline is taken across the frame (m). */
const LENS = 0.8;

export const VEIL = {
  /** The camera's height over the water's surface at it, waves included (m; negative under it). */
  h: uniform(10),
  /** 1 while the scene is drawn as from under the water (fog, no sky), 0 above. */
  below: uniform(0),
  /** The camera's right, up and forward axes' world y, its half view's tangents (x, y) and its near plane. */
  axesY: uniform(new Vector3(0, 1, 0)),
  tan: uniform(new Vector2(1, 1)),
  near: uniform(0.2),
  murk: uniform(new Color(0.03, 0.17, 0.19)),
  time: uniform(0),
};

/** The veil (PostOptions.veil): the drawn colour and its reversed depth value in, the colour out. */
export function waterVeil(color: Node<'vec4'>, depth: Node<'float'>): Node<'vec4'> {
  const V = VEIL;
  const sx = screenUV.x.mul(2).sub(1), sy = float(1).sub(screenUV.y.mul(2));
  // How high over the water this pixel's ray is a little in front of the lens (LENS m: at the near plane, 0.2 m, a
  // swell a few dm high would flick the whole frame from one side to the other).
  const lift = V.axesY.z.add(sx.mul(V.tan.x).mul(V.axesY.x)).add(sy.mul(V.tan.y).mul(V.axesY.y)).mul(LENS);
  const ripple = sin(screenUV.x.mul(23).add(V.time.mul(2.1))).mul(0.02).add(sin(screenUV.x.mul(57).sub(V.time.mul(3.3))).mul(0.01));
  const y = V.h.add(lift).add(ripple);
  const under = smoothstep(0.01, -0.01, y);
  // Metres to what the pixel shows (reversed depth: near over depth; the sky, at depth 0, far off).
  const dist = V.near.div(max(depth, 1e-7)).min(4000);
  const c = color.rgb;
  // Seen from under the water: dimmed and turned blue-green by the way through it, then into the murk.
  const through = c.mul(exp(vec3(ABSORB.x, ABSORB.y, ABSORB.z).mul(dist).negate()));
  const seen = mix(through, V.murk, float(1).sub(exp(dist.mul(-MURK))));
  // In the waterline with the scene drawn from above: the lower part is all murk, lighter just under the surface.
  const deeper = clamp(y.negate().div(0.3), 0, 1);
  const murk = V.murk.mul(mix(float(1.6), float(0.8), deeper));
  const below = mix(murk, seen, V.below);
  // The surface's edge on the lens: a thin dark line.
  const line = float(1).sub(exp(y.div(0.01).mul(y.div(0.01)).negate()).mul(0.55).mul(float(1).sub(V.below)));
  return vec4(mix(c, below, under).mul(line), color.a);
}

/** Sets the veil for this frame from the game's camera, its height over the water `h` and how the scene is drawn. */
export function updateVeil(cam: PerspectiveCamera, h: number, below: boolean, murk: Color, dt: number): void {
  const e = cam.matrixWorld.elements;
  // Columns: right (x), up (y), back (z); forward is minus back.
  VEIL.axesY.value.set(e[1], e[5], -e[9]);
  // The half view's tangents, from the projection itself (its diagonal is their inverse).
  const p = cam.projectionMatrix.elements;
  VEIL.tan.value.set(1 / p[0], 1 / p[5]);
  VEIL.near.value = cam.near;
  VEIL.h.value = h;
  VEIL.below.value = below ? 1 : 0;
  VEIL.murk.value.copy(murk);
  VEIL.time.value += dt;
}

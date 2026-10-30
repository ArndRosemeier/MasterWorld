// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot:portal).
/**
 * A portal's opening (render/portal/PortalView.ts): it shows the view through it, drawn the frame before into
 * a twin of the scene target, at the same place on the screen. Unlit, no fog, no shadows: the light of the
 * place beyond is already in that view. It writes its own depth, so what stands in front of the opening on
 * this side hides it.
 */
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicNodeMaterial, Texture, Vector4 } from 'three/webgpu';
import { abs, attribute, float, length, max, mix, mx_noise_float, mx_noise_vec3, mx_worley_noise_float, screenUV, smoothstep, texture, uniformArray, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';

/** The view through the openings: the twin target's texture once the view is made (view.ts sets it before the warm-up). */
export const PORTAL_VIEW = texture(new Texture());

export const PORTAL = defineKind('portal', ['position'], () => {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide, fog: false });
  m.colorNode = vec4(PORTAL_VIEW.sample(screenUV).rgb, 1);
  return m;
}, { cast: false, receive: false });

/** The rifts' state, one slot each (a stone's home side 0, its far side 1): how open (0..1), their ripples' clock (s). */
export const RIFT_SLOTS = 2;
export const RIFT_STATE = uniformArray(Array.from({ length: RIFT_SLOTS }, () => new Vector4()), 'vec4');

/** The rifts' rim colours: home's green (a way up, as Dunfinity's veins), the far side's blue. */
const RIFT_HOME = [0.35, 0.95, 0.6] as const;
const RIFT_FAR = [0.3, 0.62, 1.1] as const;

/**
 * A rift (the portal stone's portals; after Dunfinity's thin places): an upright window whose edge is a ragged
 * ellipse that ripples, rimmed with a thin line of light, opening from its middle outwards. Seen through as the
 * view beyond (`PORTAL_VIEW`, shimmering a little, its edge fading into the rim's haze, motes drifting in it);
 * where that view is not drawn (another opening is looked through this frame) a swirling haze of the rim's colour
 * stands in, half seen through. `uv` is the window's own coordinates (the ellipse is radius 1); the vertex
 * colour's red is its slot in `RIFT_STATE`, green 1 for the view (drawn by PortalView) and 0 for the haze.
 */
export const PORTAL_RIFT = defineKind('portal-rift', ['position', 'uv', 'color'], () => {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide, fog: false, transparent: true, depthWrite: false });
  const q = attribute('uv', 'vec2'), c = attribute('color', 'vec3');
  const st = RIFT_STATE.element(c.x.add(0.5).floor().toInt());
  const open = st.x, age = st.y, view = c.y;
  const rimC = mix(vec3(...RIFT_HOME), vec3(...RIFT_FAR), c.x);
  // The edge: a ragged ellipse that ripples, only as wide as it is open.
  const r = length(q), ragged = mx_noise_float(vec3(q.mul(3.0), age.mul(0.5))).mul(0.12);
  const edge = r.add(ragged).add(float(1.0).sub(open).mul(1.1));
  const mask = smoothstep(1.0, 0.8, edge);
  const rim = smoothstep(0.08, 0.0, abs(edge.sub(0.95))).mul(open.mul(0.6).add(0.4)).mul(smoothstep(0.0, 0.3, open));
  // The view beyond, shimmering (more while it opens).
  const shimmer = mx_noise_vec3(vec3(q.mul(2.5), age.mul(0.7))).xy.mul(float(1.0).sub(open).mul(0.25).add(0.02)).mul(0.06);
  const seen = PORTAL_VIEW.sample(screenUV.add(shimmer)).rgb;
  // The haze that stands in: slow swirls of the rim's colour in the dark.
  const swirl = mx_noise_float(vec3(q.mul(1.6).add(vec3(age.mul(0.05), age.mul(-0.08), 0.0)), age.mul(0.25))).mul(0.5).add(0.5);
  const haze = mix(vec3(0.02, 0.015, 0.04), rimC.mul(0.35), swirl);
  const inside = mix(haze, seen, view);
  // Towards the edge it fades into the rim's haze; motes drift in it.
  const toward = smoothstep(0.55, 0.95, edge).mul(0.55);
  const motes = smoothstep(0.07, 0.0, mx_worley_noise_float(vec3(q.mul(3.5).add(vec3(0.0, age.mul(-0.15), 0.0)), age.mul(0.2))));
  m.colorNode = mix(inside, rimC.mul(0.7), toward).mul(mask).add(rimC.mul(motes.mul(mask).mul(0.9))).add(rimC.mul(rim.mul(1.8)));
  m.opacityNode = max(mask.mul(mix(float(0.55), float(0.95), view)), rim).mul(open.greaterThan(0.001).select(float(1.0), float(0.0)));
  return m;
}, { cast: false, receive: false });

/** The ellipse inside a portal's shape (in its plane): its middle's height over the floor and its half sizes. */
export function riftEllipse(shape: { readonly halfWidth: number; readonly height: number }): { cy: number; rx: number; ry: number } {
  const lift = 0.12, ry = (shape.height - lift) / 2;
  return { cy: lift + ry, rx: shape.halfWidth, ry };
}

/** A rift's window (a fan round its middle, as PortalView's openings are): `slot` in RIFT_STATE, the view (1) or the haze (0). */
export function riftGeometry(shape: { readonly halfWidth: number; readonly height: number }, slot: number, view: 0 | 1): BufferGeometry {
  const { cy, rx, ry } = riftEllipse(shape), M = 1.12;
  const corners: [number, number][] = [[M, -M], [M, M], [-M, M], [-M, -M]];
  const pos = [0, cy, 0], uv = [0, 0], col = [slot, view, 0];
  for (const [u, v] of corners) { pos.push(u * rx, cy + v * ry, 0); uv.push(u, v); col.push(slot, view, 0); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  g.computeBoundingSphere();
  return g;
}

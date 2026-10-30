// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot -- "?gl&hud&stone").
/**
 * The portal stone held up before the hero (app/portalStoneUse.ts): a dark, flattened stone with a polished face
 * that bears two glyphs. Light that is not of this world runs through it: veins that drift and shift between
 * violet and sea green, a rim of the same light where it turns from the eye, and the glyphs glow (the one under
 * the pointer brighter). It comes and goes by dissolving: its stuff is eaten away (or filled in) along a burning
 * edge (`STONE_LOOK.x`, 0 gone .. 1 whole).
 *
 * Patterns read the stone's own (local) positions, so the floating origin does not touch them. The vertex colour's
 * red channel marks the glyphs' strokes: 0.5 the first, 1 the second, 0 the stone.
 */
import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, MeshStandardNodeMaterial, Vector4 } from 'three/webgpu';
import { abs, attribute, dot, float, mix, mx_noise_float, normalView, normalize, positionGeometry, positionView, pow, sin, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { Noise } from '@futuremagic/core';
import { defineKind } from '../materials';
import { WEATHER } from './weather';

/** x: how much of it is there (0..1); y: the glyph under the pointer (0 none, 1, 2); z: a flash after a press (0..1). */
export const STONE_LOOK = uniform(new Vector4(0, 0, 0, 0));

/** The light through it: violet and sea green (linear). */
const VIOLET = [0.55, 0.18, 1.6] as const;
const TEAL = [0.15, 1.25, 1.2] as const;

export const PORTAL_STONE = defineKind('portal-stone', ['position', 'normal', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.15, alphaTest: 0.5 });
  const p = positionGeometry, t = WEATHER.time, look = STONE_LOOK;
  const violet = vec3(...VIOLET), teal = vec3(...TEAL);
  // The stone: near black, a little mottled.
  const mottle = mx_noise_float(p.mul(9.0)).mul(0.5).add(0.5);
  m.colorNode = mix(vec3(0.025, 0.02, 0.04), vec3(0.075, 0.065, 0.1), mottle);
  // Its light shifts between the two colours, in bands that climb through it.
  const hue = sin(t.mul(0.9).add(p.y.mul(7.0)).add(p.x.mul(3.0))).mul(0.5).add(0.5);
  const light = mix(violet, teal, hue);
  // Veins: where a slowly drifting noise crosses nought.
  const vein = float(1.0).sub(smoothstep(0.0, 0.07, abs(mx_noise_float(p.mul(4.5).add(vec3(0.0, t.mul(0.12), t.mul(0.05)))))));
  const pulse = sin(t.mul(2.3).add(p.y.mul(11.0))).mul(0.3).add(0.8);
  // A rim where the stone turns from the eye.
  const rim = pow(float(1.0).sub(abs(dot(normalize(positionView.negate()), normalView))), 2.5);
  // The glyphs: the one under the pointer brighter, the pressed one flashing.
  const mark = attribute('color', 'vec3').x;
  const stroke = step(0.25, mark);
  const which = step(0.75, mark).add(1.0);
  const under = float(1.0).sub(step(0.1, abs(which.sub(look.y))));
  const glyph = stroke.mul(float(2.4).add(under.mul(3.5)).add(look.z.mul(under).mul(6.0)));
  // Coming and going: eaten away along a burning edge.
  const eat = mx_noise_float(p.mul(6.5)).mul(0.5).add(0.5);
  const there = look.x.mul(1.12).sub(0.06);
  m.opacityNode = step(eat, there);
  const edge = smoothstep(there.sub(0.07), there, eat);
  m.emissiveNode = light.mul(vein.mul(1.3).mul(pulse).add(rim.mul(1.6))).mul(float(1.0).sub(stroke))
    .add(mix(light, vec3(1.0, 1.0, 1.0), 0.35).mul(glyph))
    .add(mix(teal, vec3(1.2, 1.1, 1.6), 0.5).mul(edge).mul(4.0));
  return m;
}, { cast: false, receive: false }, true);

/** The stone's half sizes (m): across, up and through, and how far out its polished face stands. */
export const STONE_SIZE = { x: 0.24, y: 0.32, z: 0.12, face: 0.075 } as const;
/** The glyphs' middles on the face (m, x across and y up from the stone's middle) and their reach. */
export const GLYPHS: readonly { readonly x: number; readonly y: number }[] = [{ x: 0, y: 0.12 }, { x: 0, y: -0.12 }];
export const GLYPH_REACH = 0.095;

/** The stone with its glyphs, its face towards +z (seeded: every stone is this stone). */
export function stoneGeometry(seed = 0x5707e): BufferGeometry {
  const noise = new Noise(seed);
  const ico = new IcosahedronGeometry(1, 4);
  const src = ico.getAttribute('position');
  const pos: number[] = [], col: number[] = [];
  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i), y = src.getY(i), z = src.getZ(i);
    const r = 1 + 0.09 * noise.n3(x * 1.7, y * 1.7, z * 1.7) + 0.035 * noise.n3(x * 4.3 + 7, y * 4.3, z * 4.3);
    // The face is ground flat; the back stays rough.
    pos.push(x * r * STONE_SIZE.x, y * r * STONE_SIZE.y, Math.min(STONE_SIZE.face, z * r * STONE_SIZE.z));
    col.push(0, 0, 0);
  }
  ico.dispose();
  // The glyphs' strokes, cut a hair proud of the face.
  const zf = STONE_SIZE.face + 0.002, W = 0.011;
  const seg = (mark: number, ax: number, ay: number, bx: number, by: number): void => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * W, ny = (dx / l) * W;
    const quad = [[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax - nx, ay - ny], [bx + nx, by + ny], [ax + nx, ay + ny]];
    for (const [qx, qy] of quad) { pos.push(qx!, qy!, zf); col.push(mark, 0, 0); }
  };
  const arc = (mark: number, cx: number, cy: number, r: number, a0: number, a1: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const s = a0 + ((a1 - a0) * i) / n, e = a0 + ((a1 - a0) * (i + 1)) / n;
      seg(mark, cx + Math.cos(s) * r, cy + Math.sin(s) * r, cx + Math.cos(e) * r, cy + Math.sin(e) * r);
    }
  };
  // The first: a light over the floor (a circle, its beam down to a line).
  const [g1, g2] = GLYPHS as [{ x: number; y: number }, { x: number; y: number }];
  arc(0.5, g1.x, g1.y + 0.035, 0.03, 0, Math.PI * 2, 14);
  seg(0.5, g1.x, g1.y + 0.005, g1.x, g1.y - 0.05);
  seg(0.5, g1.x - 0.055, g1.y - 0.06, g1.x + 0.055, g1.y - 0.06);
  for (const s of [-1, 1]) seg(0.5, g1.x + s * 0.02, g1.y - 0.02, g1.x + s * 0.04, g1.y - 0.045);
  // The second: an arch with a way through it.
  const hw = 0.04, top = g2.y + 0.02, foot = g2.y - 0.065;
  seg(1, g2.x - hw, foot, g2.x - hw, top);
  seg(1, g2.x + hw, foot, g2.x + hw, top);
  arc(1, g2.x, top, hw, 0, Math.PI, 8);
  seg(1, g2.x - 0.065, foot, g2.x + 0.065, foot);
  seg(1, g2.x, g2.y + 0.035, g2.x, foot + 0.02);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

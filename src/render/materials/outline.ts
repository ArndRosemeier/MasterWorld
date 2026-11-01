// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot:auras).
/**
 * The outline round a creature in a fight (sim/aura.ts), a thin line hugging its silhouette in its health colour: a
 * veil in the post chain (PostOptions.veil, like the water's), so it is part of the one post shader built at the
 * start and no creature's own material changes. Each marked creature is a screen ellipse (render/aura/marks.ts)
 * with the distance of its body. Inside the ellipse a pixel whose depth is near that distance is the creature's;
 * if the depth buffer shows something far behind it within the line's width, the pixel is on the silhouette and
 * is painted. What stands in front of the creature, and the ground at its feet, leave the line open there.
 */
import { Vector4 } from 'three/webgpu';
import { Fn, If, Loop, abs, dot, float, max, mix, screenSize, screenUV, sin, step, time, toneMappingExposure, uniform, uniformArray, vec2, vec3, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Creatures outlined at once, at most (the shader loops over this many). */
const CAP = 16;
const zeros = (): Vector4[] => {
  const v: Vector4[] = [];
  for (let i = 0; i < CAP; i++) v.push(new Vector4());
  return v;
};

/** The values behind the three uniform arrays (rewritten each frame, render/aura/marks.ts). */
const slots = { area: zeros(), range: zeros(), tint: zeros() };

export const OUTLINE = {
  cap: CAP,
  slots,
  /** The ellipse on the screen: middle (uv), half width, half height (uv). */
  area: uniformArray(slots.area, 'vec4'),
  /** The creature's distance along the view (m), how far from it its pixels may lie (m), strength (0..1; 0: none), how strong a target (0..1). */
  range: uniformArray(slots.range, 'vec4'),
  /** The line's colour (linear) and thickness (px). */
  tint: uniformArray(slots.tint, 'vec4'),
  near: uniform(0.2),
};

/** The line's two widths (px): the others' and the target's. */
const LINE_PX = [1.4, 2.8];

/** Four steps round a pixel (each with its opposite): the depth seen on either side of it. */
const AROUND = [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]];

/** The veil (PostOptions.veil): the colour with the outlines painted on it. `depth`: the reversed depth value of the pixel. */
export function outlineVeil(color: Node<'vec4'>, depth: Node<'float'>): Node<'vec4'> {
  // `depth` is the red channel of the scene's depth texture: sample the same texture round the pixel.
  const tex = depth.node;
  if (!tex?.sample) throw new Error('outline: the veil\'s depth is not a texture node');
  const metres = (d) => OUTLINE.near.div(max(d, 1e-7)).min(4000);
  // A Fn, so the loop and its variables are one stack in the order written (outside one the loop is never run).
  return Fn(() => {
    const z0 = metres(depth);
    const texel = vec2(1, 1).div(screenSize);
    // The depth round the pixel at both line widths, read for every pixel (a texture read inside a branch that
    // pixels take differently is not allowed on WebGPU); the marks then only compare.
    const ringTap = (dx, dy, px) => metres(tex.sample(screenUV.add(vec2(dx, dy).mul(texel).mul(px))).r).toVar();
    const rings = LINE_PX.map((px) => AROUND.map(([dx, dy]) => [ringTap(dx, dy, px), ringTap(-dx, -dy, px)]));
    const paint = vec3(0).toVar('outlinePaint');
    const cover = float(0).toVar('outlineCover');
    Loop(CAP, ({ i }) => {
      const a = OUTLINE.area.element(i), r = OUTLINE.range.element(i), t = OUTLINE.tint.element(i);
      const q = screenUV.sub(a.xy).div(a.zw);
      // Inside the ellipse (a little over), a pixel of this creature's: about its distance.
      If(dot(q, q).lessThan(1.25).and(r.z.greaterThan(0.003)).and(abs(z0.sub(r.x)).lessThan(r.y)), () => {
        // Something far behind it within the line's width (the target's is thick, the others' thin): a pixel of the edge.
        const behind = r.x.add(r.y);
        const far = [float(0).toVar(), float(0).toVar()];
        // A jump, not a slope: the ground running away over the screen changes depth the same on both sides of a pixel,
        // the silhouette far on one side only (the second difference).
        const jump = max(r.y.mul(0.7), 0.25);
        rings.forEach((ring, w) => ring.forEach(([zn, zo]) => far[w].assign(max(far[w], max(step(behind, zn).mul(step(jump, zn.add(zo).sub(z0.mul(2)))), step(behind, zo).mul(step(jump, zn.add(zo).sub(z0.mul(2)))))))));
        const edge = mix(far[0], far[1], step(0.5, r.w));
        // The target's line breathes.
        const k = r.z.mul(float(1).add(sin(time.mul(3.2).add(r.x)).mul(0.12).mul(r.w)));
        const c = edge.mul(k);
        paint.addAssign(t.xyz.mul(c));
        cover.assign(max(cover, c));
      });
    });
    // The line replaces the colour under it (a solid line), and glows: it is light, over 1 for the bloom to take.
    const lit = paint.mul(2.0).div(toneMappingExposure);
    return vec4(color.rgb.mul(float(1).sub(cover.min(1))).add(lit), color.a);
  })();
}

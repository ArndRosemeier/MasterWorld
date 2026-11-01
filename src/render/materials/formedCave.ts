// @ts-nocheck -- TSL node math; checked by rendering it (npm run preview:caves, and npm run shot on the GPU).
/**
 * What a formed cave's stone looks like (D63, phase K3; docs/design/caves.md 3.3, 3.4). Procedural, no textures: the
 * rock is the beds' own colour (the mesh's tint) with, in the shader,
 *  - beds: courses of rock, each its own tone, thin dark partings between them, bent by a slow wave;
 *  - smooth and rough: patches of water-polished wall (soft bump, a sheen) next to rough, scalloped, ridged wall;
 *  - 3D bump: the surface's relief from layered noise, lit by the lantern, so it reads as stone up close;
 *  - veins of white calcite along cracks, rust streaks down the walls, dark crevices;
 *  - ore (the mesh marks it with ORE_MAT): the ore's own colour, speckled, with glints.
 * `FORMED_CALCITE` is the waxy, banded stone of the formations (stalactites, columns, flowstone) and the clear
 * crystals; the loose rocks use the wall's stone. Late kinds: built under the shader cap when the first formed cave
 * is built, not in the warm-up. Patterns read WORLD (the floating origin, docs/SHADERS.md).
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, attribute, cameraViewMatrix, clamp, dot, float, floor, fract, max, mix, mx_noise_float, mx_worley_noise_float, normalize, normalWorld, pow, sin, smoothstep, step, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';
import { WORLD } from '../origin';
import { CRYSTAL_MAT, ORE_MAT } from '../../world/cave/parts';


const n3 = (q) => mx_noise_float(q);
const hash1 = (x) => fract(sin(x.mul(12.9898)).mul(43758.5453));

export const FORMED_ROCK = defineKind('formed rock', ['position', 'normal', 'tint', 'mat'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const p = WORLD, n = normalWorld;
  const tintRaw = pow(attribute('tint', 'vec3'), vec3(2.2));
  const tintLin = mix(tintRaw, vec3(dot(tintRaw, vec3(0.2126, 0.7152, 0.0722))), 0.15);
  const isOre = step(ORE_MAT - 0.5, attribute('mat', 'float'));

  // Smooth against rough: ~7 m patches. Rough is scalloped and ridged, smooth is polished and gently swollen.
  const rugged = smoothstep(-0.25, 0.3, n3(p.mul(0.14).add(vec3(3.1, 1.7, 5.9))).add(n3(p.mul(0.37)).mul(0.25)));
  // Relief: swells, ridges and pits at three scales and a fine grain. Rough wall carries all of it, polished wall only the swells.
  const height = (q) => {
    const a = n3(q.mul(0.8)), b = n3(q.mul(2.9).add(7.3)), c = n3(q.mul(8.7).add(13.1)), d = n3(q.mul(26.0).add(3.9));
    const ridge = float(1).sub(abs(b)).mul(2).sub(1);
    const pits = mx_worley_noise_float(q.mul(1.5).add(2.3)).mul(2).sub(1);
    return a.mul(0.5).add(mix(b.mul(0.5), ridge.mul(0.7), rugged).mul(0.3)).add(c.mul(0.12).mul(rugged.mul(0.9).add(0.15))).add(d.mul(0.06).mul(rugged.mul(0.6).add(0.6))).add(pits.mul(0.25).mul(rugged));
  };
  const e = 0.035, h0 = height(p);
  const g = vec3(height(p.add(vec3(e, 0, 0))).sub(h0), height(p.add(vec3(0, e, 0))).sub(h0), height(p.add(vec3(0, 0, e))).sub(h0)).div(e);
  const bump = mix(float(0.1), float(0.32), rugged);
  const nn = normalize(n.sub(g.sub(n.mul(dot(g, n))).mul(bump)));
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nn, 0)).xyz);

  // Beds: courses a little under a metre, thicker and thinner along a wall, each its own tone, a dark parting between.
  const warp = n3(vec3(p.x.mul(0.11), p.y.mul(0.4), p.z.mul(0.11))).mul(0.9).add(p.x.mul(0.03));
  const thick = float(0.55).add(n3(p.mul(vec3(0.05, 0.02, 0.05))).mul(0.25).add(0.25));
  const yb = p.y.add(warp).div(thick), bed = floor(yb);
  const tone = float(0.82).add(hash1(bed).mul(0.36));
  const parting = float(1).sub(smoothstep(0.43, 0.5, abs(fract(yb).sub(0.5))).mul(0.35));
  // A weathered bed stands out a little: the harder beds are paler.
  const harder = hash1(bed.add(7.0));

  // Dark crevices where the relief is low; paler on its ridges.
  const cavity = float(0.62).add(smoothstep(-0.5, 0.45, h0).mul(0.5));

  // Calcite veins along cracks: thin zero sets of warped noise whose width swells and pinches and which break off,
  // so they read as seams in the rock, not drawn lines. Two families, only in some places. Plus pale crusts (deposits).
  const vq = p.mul(0.4).add(vec3(n3(p.mul(0.17)), n3(p.mul(0.17).add(5.1)), n3(p.mul(0.17).add(9.7))).mul(1.7));
  const vq2 = p.mul(1.15).add(vec3(n3(p.mul(0.5).add(3.3)), n3(p.mul(0.5).add(1.2)), n3(p.mul(0.5).add(8.8))).mul(0.8));
  const where = smoothstep(0.05, 0.5, n3(p.mul(0.09).add(vec3(1.3, 4.1, 2.7))));
  const swell = n3(p.mul(2.4).add(vec3(6.6, 1.1, 3.3))), broken = smoothstep(-0.15, 0.25, swell);
  const w1 = float(0.012).add(smoothstep(0.0, 0.7, swell).mul(0.05)), w2 = float(0.01).add(smoothstep(0.1, 0.8, n3(p.mul(3.1).add(2.2))).mul(0.03));
  const vein = max(smoothstep(w1, w1.mul(0.25), abs(n3(vq))).mul(where).mul(broken), smoothstep(w2, w2.mul(0.25), abs(n3(vq2))).mul(where).mul(0.7).mul(smoothstep(0.0, 0.35, n3(p.mul(1.7).add(9.1)))));
  // A crust: a blotchy pale mineral skin on some wall, lumpy underneath the light.
  const crust = smoothstep(0.32, 0.6, n3(p.mul(0.33).add(vec3(7.7, 2.2, 5.5))).add(n3(p.mul(1.9)).mul(0.28))).mul(smoothstep(-0.2, 0.3, n3(p.mul(0.06).add(1.0))));

  // Rust streaks run down the walls.
  const streak = smoothstep(0.3, 0.7, n3(vec3(p.x.mul(1.3), p.y.mul(0.13), p.z.mul(1.3))).add(n3(p.mul(0.2)).mul(0.5)));
  const rustW = streak.mul(smoothstep(0.7, 0.1, n.y)).mul(0.3);

  // Ore: its colour (the tint), speckled and glinting, over the stone.
  const speck = smoothstep(0.55, 0.85, n3(p.mul(7.0)));
  const glint = smoothstep(0.72, 0.9, n3(p.mul(21.0).add(4.4)));
  const oreBody = isOre.mul(smoothstep(-0.35, 0.05, n3(p.mul(1.6).add(2.0))));

  // Mottled tone over metres, and grain: stone is never one colour.
  const mottle = float(0.78).add(n3(p.mul(0.9).add(vec3(2.2, 8.1, 4.4))).mul(0.28)).add(n3(p.mul(3.3)).mul(0.18)).add(n3(p.mul(34.0)).mul(0.14));
  // Each bed leans its own way: some grey, some ochre, some rust, so a wall is not one tan.
  const lum = dot(tintLin, vec3(0.2126, 0.7152, 0.0722)), hue = hash1(bed.add(3.0));
  const cool = vec3(0.8, 0.88, 1.05).mul(lum), warm = vec3(1.18, 0.95, 0.7).mul(lum), rusty = vec3(1.25, 0.8, 0.6).mul(lum);
  const bedTint = mix(mix(mix(tintLin, cool, smoothstep(0.5, 0.8, hue).mul(0.8)), warm, smoothstep(0.2, 0.03, hue).mul(0.4)), rusty, smoothstep(0.44, 0.5, hue).mul(smoothstep(0.56, 0.5, hue)).mul(0.3));
  const stone = bedTint.mul(0.8).mul(mottle).mul(tone).mul(parting).mul(cavity).mul(float(0.85).add(harder.mul(0.3)));
  let col = mix(stone, vec3(0.44, 0.22, 0.09).mul(tone), rustW);
  // (Pale deposits take the light the rock has: in a dark throat they go dark with it, not stand out as cream cracks.)
  const pale = clamp(lum.div(0.25), 0.25, 1);
  col = mix(col, vec3(0.74, 0.7, 0.62).mul(float(0.75).add(n3(p.mul(5.0)).mul(0.25))).mul(pale), crust.mul(0.8));
  col = mix(col, vec3(0.86, 0.83, 0.76).mul(pale), vein.mul(0.92));
  const oreCol = tintRaw.mul(2.2).mul(float(0.55).add(speck.mul(0.9))).add(vec3(1.0, 0.92, 0.7).mul(glint).mul(0.6));
  col = mix(col, oreCol, oreBody);
  m.colorNode = col;
  // Polished patches shine a little, veins and ore more; rough wall is matt.
  m.roughnessNode = clamp(mix(float(0.52), float(0.93), rugged).sub(vein.mul(0.3)).add(crust.mul(0.1)).sub(oreBody.mul(0.4)).sub(glint.mul(oreBody).mul(0.2)), 0.1, 1);
  m.metalnessNode = oreBody.mul(speck.mul(0.5).add(glint.mul(0.4)));
  m.aoNode = cavity.mul(0.5).add(0.5);
  return m;
}, { cast: true, receive: true }, true);

export const FORMED_CALCITE = defineKind('formed calcite', ['position', 'normal', 'tint', 'mat'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
  const p = WORLD, n = normalWorld;
  const tintLin = pow(attribute('tint', 'vec3'), vec3(2.2));
  const crystal = step(CRYSTAL_MAT - 0.5, attribute('mat', 'float'));
  // Fine ripples on the formation's skin (the layers themselves are in the geometry), cloudy in the stone.
  const fine = (q) => n3(q.mul(13.0)).mul(0.5).add(n3(q.mul(31.0).add(3.7)).mul(0.25));
  const e = 0.03, f0 = fine(p);
  const g = vec3(fine(p.add(vec3(e, 0, 0))).sub(f0), fine(p.add(vec3(0, e, 0))).sub(f0), fine(p.add(vec3(0, 0, e))).sub(f0)).div(e);
  const nn = normalize(n.sub(g.sub(n.mul(dot(g, n))).mul(mix(float(0.05), float(0.012), crystal))));
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nn, 0)).xyz);
  const cloud = float(0.82).add(n3(p.mul(2.3)).mul(0.18)).add(f0.mul(0.15));
  const col = tintLin.mul(cloud);
  m.colorNode = col;
  // The stone glows a little from within (waxy, translucent); crystals are bright and clear.
  m.emissiveNode = col.mul(mix(float(0.06), float(0.22), crystal));
  m.roughnessNode = mix(float(0.5), float(0.1), crystal);
  m.metalnessNode = float(0);
  return m;
}, { cast: true, receive: true }, true);

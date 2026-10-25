/**
 * The material registry (docs/SHADERS.md): every material in the game is made here, from a closed list of
 * kinds, so the set of shaders is known up front and compiled during warm-up. Guarded: nothing outside
 * this file (or src/render/materials/) may construct a material.
 *
 * Every mesh of a kind shares the kind's one material, so a kind is one shader; variation goes into
 * vertex attributes or uniforms, never into a new material.
 */
import { DoubleSide, MeshPhysicalNodeMaterial, Vector2, type Material, type Mesh } from 'three/webgpu';
import { Fn, If, vec2, abs, attribute, cameraPosition, cameraViewMatrix, modelWorldMatrix, positionLocal, uniform, varying, length, clamp, dot, exp, float, mx_worley_noise_vec2, int, max, mix, mx_fractal_noise_float, mx_noise_float, normalize, normalWorldGeometry, positionWorld, pow, smoothstep, texture, vec3, vec4, vertexColor } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { NATURAL_NAMES, NATURAL_TILE_METERS } from '@futuremagic/texgen';
import type { GroundTextures } from './terrain/groundTextures';
import type { Surface } from '../setting/contract';
import { WATER, waterAt } from './materials/waterInputs';
import type { StageKind } from '@futuremagic/stage';
import { makeSkyNode } from '@futuremagic/sky/node';
import { woodsFromAfar } from '@futuremagic/vegetation/node';

export type Attribute = 'position' | 'normal' | 'color' | 'uv' | 'surface' | 'canopy';

export interface MaterialKind extends StageKind {
  readonly attributes: readonly Attribute[];
}

const kinds = new Map<string, MaterialKind>();

export function defineKind(name: string, attributes: readonly Attribute[], build: () => Material, shadow = { cast: true, receive: true }): MaterialKind {
  if (kinds.has(name)) throw new Error(`material kind "${name}" defined twice`);
  let made: Material | null = null;
  const kind: MaterialKind = {
    name,
    attributes,
    shadow,
    make() {
      made ??= Object.assign(build(), { name });
      return made;
    },
  };
  kinds.set(name, kind);
  return kind;
}

/** Every kind, for the warm-up. */
export function allKinds(): readonly MaterialKind[] {
  return [...kinds.values()];
}

/** The ground's texture arrays; set once at load, before the warm-up builds the terrain material. */
let ground: GroundTextures | null = null;
export function useGroundTextures(t: GroundTextures): void { ground = t; }

const LAYER = (name: string): number => {
  const i = NATURAL_NAMES.indexOf(name);
  if (i < 0) throw new Error(`texgen has no natural layer "${name}"`);
  return i;
};

/**
 * The ground: one shader for every terrain chunk, built from texgen's natural layers. Open ground blends
 * the biome surfaces (vertex attribute `surface`, SURFACES order) tinted by the biome colour; steep ground
 * is rock, projected from three sides with strata on the faces; snow lies up high, sand at the shore.
 * Height from the layers sharpens every transition so it follows stones and tufts, not straight lines.
 */
/**
 * The woods from afar (docs/far-view.md): past the trees drawn one by one (FloraView), the ground rises into the
 * canopy (vertex attribute `canopy`: crown cover, tree height, spacing, conifer share; world/canopy.ts) and draws
 * crowns, gaps and glades per pixel. `band`: from where to where (m from the eye) the canopy takes over.
 */
export const WOODS = { band: uniform(new Vector2(800, 1000)) };
/** The highest the canopy raises the ground (m; bounds of terrain meshes make room for it). */
export const CANOPY_RISE = 22;
/** The crowns' colour from afar (linear): broadleaf and conifer, matched to the near trees' hulls. */
const CROWN_BROAD = vec3(0.02, 0.048, 0.012), CROWN_CONIFER = vec3(0.012, 0.03, 0.014);
/** Past the sun's shadow box (sky.ts), the floor under the woods keeps this share of its light (the crowns' shade on average). */
const UNDER_CROWNS = 0.15;

export const TERRAIN = defineKind('terrain', ['position', 'normal', 'color', 'surface', 'canopy'], () => {
  if (!ground) throw new Error('terrain material built before the ground textures were loaded');
  const { albedo: A, normal: N } = ground;
  // Double-sided so chunk skirts close cracks seen from either side.
  // Physical, for its specular strength: soil and grass reflect little of the bright sky, even at a low angle.
  // Not `vertexColors`: three would multiply the whole result by the biome colour (rock and snow too); the
  // biome colour tints only the open ground, below.
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide, specularIntensity: 0.25 });
  // Far away, the woods raise the ground to their crowns: a closed wood by most of its trees' height.
  const cn = attribute('canopy', 'vec4');
  const placed = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const far0 = smoothstep(WOODS.band.x, WOODS.band.y, length(placed.xz.sub(cameraPosition.xz)));
  m.positionNode = positionLocal.add(vec3(0, cn.y.mul(smoothstep(0.05, 0.7, cn.x)).mul(0.8).mul(far0), 0));
  const p = positionWorld, n = normalWorldGeometry, up = n.y;
  const layer = (name: string, uv: Node<'vec2'>) => {
    const i = LAYER(name), k = 1 / NATURAL_TILE_METERS[i];
    const st = uv.mul(k);
    return { a: texture(A).sample(st).depth(int(i)), n: texture(N).sample(st).depth(int(i)) };
  };
  // Tangent normal (0..1 encoded) to a world-space offset, for a projection whose u, v run along the axes.
  const tn = (s: Node<'vec4'>) => s.xy.mul(2).sub(1);
  // Height blend: inside a transition the higher material wins, so edges follow stones and tufts; outside
  // it (t = 0 or 1) height has no say.
  const hblend = (t: Node<'float'>, dh: Node<'float'>, k: number) => smoothstep(0.3, 0.7, t.add(dh.mul(k).mul(t).mul(float(1).sub(t)).mul(4)));

  const broad = mx_fractal_noise_float(p.xz.mul(0.004), 3, 2.0, 0.5);
  const fine = mx_noise_float(p.xz.mul(0.35));

  // Open ground: the four biome surfaces, projected from above.
  const w = attribute('surface', 'vec4');
  const sl = [{ w: w.x, s: 'grass' }, { w: w.y, s: 'forest' }, { w: w.z, s: 'sand' }, { w: w.w, s: 'scree' }].map((e) => ({ w: e.w, l: layer(SURFACE_LAYER[e.s as Surface], p.xz) }));
  let soilA: Node<'vec4'> = vec4(0), soilN: Node<'vec4'> = vec4(0);
  for (const s of sl) { soilA = soilA.add(s.l.a.mul(s.w)); soilN = soilN.add(s.l.n.mul(s.w)); }
  const vc = vertexColor().rgb;
  const hue = vc.div(max(dot(vc, vec3(0.2126, 0.7152, 0.0722)), 0.02));
  // Mid-scale variation (tens of metres) hides the tiling and breaks up big fields.
  const mid = mx_fractal_noise_float(p.xz.mul(0.045), 3, 2.0, 0.5);
  const tint = mix(vec3(1), hue, float(0.5).add(mid.mul(0.15))).mul(float(1).add(broad.mul(0.3)).add(mid.mul(0.22)));
  let col: Node<'vec3'> = soilA.rgb.mul(tint), rough: Node<'float'> = soilA.a, ao: Node<'float'> = soilN.a, h: Node<'float'> = soilN.b;
  let pert: Node<'vec3'> = vec3(tn(soilN).x, 0, tn(soilN).y);

  // Shore sand.
  const sand = layer('sand', p.xz);
  const sandT = smoothstep(float(4).add(fine.mul(1.5)), float(1), p.y).mul(smoothstep(0.7, 0.9, up));
  const sandB = hblend(sandT, sand.n.b.sub(h), 2);
  col = mix(col, sand.a.rgb, sandB); rough = mix(rough, sand.a.a, sandB); ao = mix(ao, sand.n.a, sandB);
  pert = mix(pert, vec3(tn(sand.n).x, 0, tn(sand.n).y), sandB); h = mix(h, sand.n.b, sandB);

  // Rock: triplanar, strata on the side faces, weathered rock on top.
  const bw0 = pow(abs(n), vec3(4));
  const bw = bw0.div(bw0.x.add(bw0.y).add(bw0.z));
  const rx = layer('cliffStrata', p.zy), rz = layer('cliffStrata', p.xy), ry = layer('rockFace', p.xz);
  // The same strata, nine times larger, so cliffs keep their structure from far away.
  const big = 1 / 9;
  const mx = layer('cliffStrata', p.zy.mul(big)), mz = layer('cliffStrata', p.xy.mul(big));
  const macro = mx.a.rgb.mul(bw.x).add(mz.a.rgb.mul(bw.z)).add(vec3(0.45).mul(bw.y)).div(0.45);
  const rockA = rx.a.mul(bw.x).add(rz.a.mul(bw.z)).add(ry.a.mul(bw.y));
  const rockN = rx.n.mul(bw.x).add(rz.n.mul(bw.z)).add(ry.n.mul(bw.y));
  const rockP = vec3(0, tn(rx.n).y, tn(rx.n).x).mul(bw.x).add(vec3(tn(rz.n).x, tn(rz.n).y, 0).mul(bw.z)).add(vec3(tn(ry.n).x, 0, tn(ry.n).y).mul(bw.y));
  const rockT = smoothstep(0.82, 0.64, up.add(fine.mul(0.04)));
  const rockB = hblend(rockT, rockN.b.sub(h), 2);
  const rockTone = float(1).add(broad.mul(0.25));
  col = mix(col, rockA.rgb.mul(rockTone).mul(macro), rockB); rough = mix(rough, rockA.a, rockB); ao = mix(ao, rockN.a, rockB);
  pert = mix(pert, rockP, rockB); h = mix(h, rockN.b, rockB);

  // The woods from afar: crowns and the shaded floor between them (@futuremagic/vegetation woodsFromAfar).
  const far = varying(far0, 'vWoodsFar');
  const cover = varying(cn.x, 'vWoodsCover'), crown = mix(CROWN_BROAD, CROWN_CONIFER, varying(cn.w, 'vWoodsConifer'));
  const woods = far.mul(smoothstep(0.0, 0.05, cover)).mul(float(1).sub(rockB));
  // Past the shadow box no tree shades the floor: the crowns' shade on average instead.
  const unshaded = smoothstep(110, 150, length(p.sub(cameraPosition))).mul(cover).mul(float(1).sub(woods));
  col = col.mul(mix(float(1), float(UNDER_CROWNS), unshaded));
  const afar = woodsFromAfar(col, crown, cover, varying(cn.z, 'vWoodsSpacing'), p);
  col = mix(col, afar.color, woods);
  // Crowns are matt: no sheen of the sky on the woods from afar.
  m.specularIntensityNode = mix(float(0.25), float(0.05), woods);
  rough = mix(rough, float(0.9), woods);
  pert = mix(pert, afar.bump.mul(1.6), woods);

  // Snow above a ragged line, only where it can lie.
  const snow = layer('snow', p.xz);
  const snowLine = float(1900).add(broad.mul(350));
  const snowT = smoothstep(snowLine, snowLine.add(250), p.y).mul(smoothstep(0.5, 0.72, up));
  const snowB = hblend(snowT, h.sub(snow.n.b), 1.5);
  col = mix(col, snow.a.rgb, snowB); rough = mix(rough, snow.a.a, snowB); ao = mix(ao, snow.n.a, snowB);
  pert = mix(pert, vec3(tn(snow.n).x, 0, tn(snow.n).y), snowB);

  // Open ground is matt (the layers' glossier spots read as a frosty sheen against the sky at a low angle).
  rough = max(rough, float(0.85).mul(float(1).sub(rockB)));

  // At the water: wet, dark and glossy along the waterline; under it, caustics from the waves above.
  const below = waterAt(p.xz).x.sub(p.y);
  const wet = smoothstep(-1.2, -0.2, below).mul(float(1).sub(snowB));
  col = col.mul(mix(float(1), float(0.55), wet));
  rough = mix(rough, float(0.25), wet.mul(smoothstep(0.6, 0.95, up)));
  // Caustics only where there is water above (a branch: the land above the sea pays nothing).
  m.emissiveNode = Fn(() => {
    const e = vec3(0).toVar();
    If(below.greaterThan(0.05), () => {
      const t = WATER.time;
      // Warped, so the cells wobble like light through waves instead of tiling like paving stones.
      const q = p.xz.add(vec2(mx_noise_float(vec3(p.xz.mul(0.35), t.mul(0.3))), mx_noise_float(vec3(p.xz.mul(0.35).add(9.1), t.mul(0.3)))).mul(0.9));
      const a = mx_worley_noise_vec2(q.mul(1.3).add(vec2(t.mul(0.25), t.mul(0.16))));
      const b = mx_worley_noise_vec2(q.mul(1.85).add(vec2(t.mul(-0.19), t.mul(0.27))).add(5.1));
      const lines = float(1).sub(smoothstep(0.0, 0.16, a.y.sub(a.x))).mul(float(1).sub(smoothstep(0.0, 0.2, b.y.sub(b.x))).mul(0.6).add(0.4));
      const k = lines.mul(smoothstep(0.05, 0.7, below)).mul(exp(below.mul(-0.12))).mul(clamp(WATER.sunDir.y.mul(3), 0, 1));
      e.assign(col.mul(WATER.sunColor).mul(k).mul(0.15));
    });
    return e;
  })();

  const nw = normalize(n.add(pert.mul(0.9)));
  // texgen albedos are physical (grass ~0.08 linear); a slight trim keeps open land from glaring under our light rig.
  m.colorNode = col.mul(0.85);
  m.roughnessNode = rough;
  m.aoNode = ao;
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nw, 0)).xyz);
  return m;
});

/** Which texgen layer draws each biome surface. */
const SURFACE_LAYER: Record<Surface, string> = { grass: 'wildGrass', forest: 'forestFloor', sand: 'sand', scree: 'scree' };

/** The sky dome (a unit box on the camera, drawn at the far plane). Its uniforms: `skyUniforms`. */
export const SKY = defineKind('sky', ['position', 'normal', 'uv'], () => makeSkyNode({ reversed: true }).material as Material, { cast: false, receive: false });

/** The sky as the environment map sees it (rendered only into the PMREM, never into the view). */
export function makeEnvSky(): Mesh {
  return makeSkyNode({ reversed: false, env: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SkyUniforms = Record<string, { value: any }>;
export const skyUniforms = (m: Material): SkyUniforms => (m as unknown as { uniforms: SkyUniforms }).uniforms;

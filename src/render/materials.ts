/**
 * The material registry (docs/SHADERS.md): every material in the game is made here, from a closed list of
 * kinds, so the set of shaders is known up front and compiled during warm-up. Guarded: nothing outside
 * this file (or src/render/materials/) may construct a material.
 *
 * Every mesh of a kind shares the kind's one material, so a kind is one shader; variation goes into
 * vertex attributes or uniforms, never into a new material.
 */
import { DoubleSide, Mesh, MeshPhysicalNodeMaterial, Vector2, type BufferGeometry, type Material } from 'three/webgpu';
import { Fn, If, vec2, abs, attribute, cameraPosition, cameraViewMatrix, modelWorldMatrix, positionLocal, uniform, varying, length, clamp, dot, exp, float, mx_worley_noise_vec2, int, max, mix, mx_fractal_noise_float, mx_noise_float, normalize, normalWorldGeometry, positionWorld, pow, sin, cos, smoothstep, texture, vec3, vec4, vertexColor } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { NATURAL_NAMES, NATURAL_TILE_METERS } from '@futuremagic/texgen';
import { TOWN_GROUND_LAYER, TOWN_TILE_METERS, type GroundTextures } from './terrain/groundTextures';
import { CROP_LOOK, CROP_STEP, FIELD_GROUND, TOWN_GROUND, townTextures } from './materials/townGround';
import type { Surface } from '../setting/contract';
import { WATER, waterAt } from './materials/waterInputs';
import { ROAD } from './materials/roads';
import { inside, sampleMask } from './materials/masks';
import { WEATHER, rainRings } from './materials/weather';
import type { StageKind } from '@futuremagic/stage';
import { makeSkyNode } from '@futuremagic/sky/node';
import { woodsFromAfar } from '@futuremagic/vegetation/node';
import { ORIGIN, WORLD } from './origin';

export type Attribute = 'position' | 'normal' | 'color' | 'uv' | 'surface' | 'level' | 'canopy' | 'mat' | 'tint' | 'look';

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

/** A mesh drawn with a kind's material and its shadow flags, placed once (matrix not updated per frame). */
export function kindMesh(g: BufferGeometry, kind: MaterialKind, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(g, kind.make());
  mesh.castShadow = kind.shadow.cast;
  mesh.receiveShadow = kind.shadow.receive;
  mesh.position.set(x, y, z);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
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

export const TERRAIN = defineKind('terrain', ['position', 'normal', 'color', 'surface', 'level', 'canopy'], () => {
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
  // The world point (patterns, masks); distances to the camera from the origin-relative positionWorld.
  const p = WORLD, n = normalWorldGeometry, up = n.y;
  // How level the ground is, smoothed over a few metres per vertex: what rock and sand follow, so their
  // edges run smoothly instead of along the triangles where a cliff's normal flips between vertices.
  const level = attribute('level', 'float');
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

  // Shore sand, up to where rock takes over (no strip of grass between a beach and its cliff).
  const sand = layer('sand', p.xz);
  const sandT = smoothstep(float(4.5).add(fine.mul(1.5)), float(2.2), p.y).mul(smoothstep(0.6, 0.8, level));
  const sandB = hblend(sandT, sand.n.b.sub(h), 2);
  col = mix(col, sand.a.rgb, sandB); rough = mix(rough, sand.a.a, sandB); ao = mix(ao, sand.n.a, sandB);
  pert = mix(pert, vec3(tn(sand.n).x, 0, tn(sand.n).y), sandB); h = mix(h, sand.n.b, sandB);

  // The town's ground (materials/townGround.ts): cobbled streets, a paved market, trodden yards.
  const town = townTextures();
  const tl = (k: number, scale: number) => {
    const st = p.xz.mul(1 / (TOWN_TILE_METERS[k] * scale));
    return { a: texture(town.albedo).sample(st).depth(int(k)), n: texture(town.normal).sample(st).depth(int(k)) };
  };
  const tg = texture(TOWN_GROUND.mask).sample(p.xz.sub(TOWN_GROUND.origin).div(TOWN_GROUND.size));
  const ragged = fine.mul(0.18).add(mid.mul(0.1));
  const paths = smoothstep(0.1, 0.45, mx_fractal_noise_float(p.xz.mul(0.18), 2, 2.0, 0.5).add(tg.a.mul(0.5)));
  // A village's stones are laid where the traffic is, not wall to wall: toward their edges the street and
  // the market break up into earth and grass, mud stands in patches, and worn lanes run across the
  // square (where the noise crosses zero), trodden into earth between the stones.
  const patchy = mx_fractal_noise_float(p.xz.mul(0.09), 2, 2.0, 0.5);
  const laid = (t: Node<'float'>) => smoothstep(0.3, 0.7, t.add(patchy.mul(0.45)).sub(float(1).sub(t).mul(0.25)));
  const lane = float(1).sub(smoothstep(0.02, 0.07, abs(mx_noise_float(p.xz.mul(0.035)).add(mid.mul(0.2)))));
  const mud = smoothstep(0.16, 0.36, mx_fractal_noise_float(p.xz.mul(0.07).add(17.3), 2, 2.0, 0.5)).mul(0.75);
  const stones = tg.r.max(tg.g);
  // Yards: trodden earth in patches; streets and the market: small cobbles (fist-sized), the market's a
  // shade darker; on top, the earth of the worn lanes and mud patches among the stones.
  const grounds: [Node<'float'>, number, number, number][] = [
    [tg.b.max(tg.a).mul(paths).mul(0.85), TOWN_GROUND_LAYER.dirt, 1, 1],
    [laid(tg.r), TOWN_GROUND_LAYER.cobble, 0.4, 0.85],
    [laid(tg.g), TOWN_GROUND_LAYER.cobble, 0.45, 0.75],
    [stones.mul(lane.mul(0.75)), TOWN_GROUND_LAYER.dirt, 0.8, 0.85],
    [stones.mul(mud), TOWN_GROUND_LAYER.dirt, 0.7, 0.6],
  ];
  for (const [t, k, scale, tone] of grounds) {
    const g = tl(k, scale);
    const b = hblend(clamp(t.add(ragged.mul(t.mul(float(1).sub(t)).mul(4))), 0, 1), g.n.b.sub(h), 2);
    col = mix(col, g.a.rgb.mul(float(tone).add(mid.mul(0.12)).add(patchy.mul(0.15))), b); rough = mix(rough, g.a.a, b); ao = mix(ao, g.n.a, b);
    pert = mix(pert, vec3(tn(g.n).x, 0, tn(g.n).y), b); h = mix(h, g.n.b, b);
  }

  // The farmland (materials/townGround.ts FIELD_GROUND): earth tracks, then each field's crop from above,
  // in rows along its run: corn closes over the soil, cabbages and beans stand in lines on ridges,
  // ploughed land is all furrows. The rows fade out with distance (they would only shimmer).
  const fg = texture(FIELD_GROUND.mask).sample(p.xz.sub(FIELD_GROUND.origin).div(FIELD_GROUND.size));
  const earth = tl(TOWN_GROUND_LAYER.dirt, 1);
  {
    const tb = hblend(clamp(fg.r.add(ragged.mul(fg.r.mul(float(1).sub(fg.r)).mul(4))), 0, 1), earth.n.b.sub(h), 2).mul(0.9);
    col = mix(col, earth.a.rgb.mul(float(0.95).add(mid.mul(0.12))), tb); rough = mix(rough, earth.a.a, tb); ao = mix(ao, earth.n.a, tb);
    pert = mix(pert, vec3(tn(earth.n).x, 0, tn(earth.n).y), tb);
  }
  const cropU = fg.b.mul(255 / CROP_STEP).round().add(0.5).div(CROP_LOOK.count);
  const look = texture(CROP_LOOK.texture).sample(vec2(cropU, 0.25)), shape = texture(CROP_LOOK.texture).sample(vec2(cropU, 0.75));
  const ang = fg.a.mul(Math.PI), across = vec2(sin(ang).negate(), cos(ang));
  const spacing = max(shape.r.mul(2), 0.1);
  const cAcross = dot(p.xz, across).div(spacing), cAlong = dot(p.xz, vec2(cos(ang), sin(ang))).div(spacing);
  const camD = length(cameraPosition.sub(positionWorld));
  const rowsSeen = shape.a.mul(float(1).sub(smoothstep(25, 110, camD)));
  const wave = sin(cAcross.mul(Math.PI * 2));
  // Plants on the ridges: a line, or clumps along it.
  const ridge = smoothstep(0.1, 0.8, wave);
  const clump = mix(float(1), smoothstep(0.2, 0.7, sin(cAlong.mul(Math.PI * 2).add(fine.mul(1.5)))), shape.g);
  const plants = mix(look.a, ridge.mul(clump).mul(look.a.mul(1.6).min(1)), rowsSeen).add(look.a.mul(float(1).sub(look.a)).mul(fine.mul(0.5))).clamp(0, 1);
  const cropCol = pow(look.rgb, vec3(2.2)).mul(float(0.9).add(mid.mul(0.25)).add(fine.mul(0.08)));
  const soilCol = earth.a.rgb.mul(mix(float(1), float(0.7).add(wave.mul(0.3)), shape.b.mul(rowsSeen.max(0.3)))).mul(0.8);
  const fieldT = hblend(clamp(fg.g.add(ragged.mul(fg.g.mul(float(1).sub(fg.g)).mul(4))), 0, 1), earth.n.b.sub(h), 2);
  col = mix(col, mix(soilCol, cropCol, plants), fieldT);
  rough = mix(rough, float(0.95), fieldT);
  // Furrows: the ground's normal tilts across the rows.
  pert = mix(pert, vec3(across.x, 0, across.y).mul(cos(cAcross.mul(Math.PI * 2)).mul(shape.b).mul(rowsSeen).mul(0.5)).add(vec3(tn(earth.n).x, 0, tn(earth.n).y).mul(float(1).sub(plants))), fieldT);

  // Roads between the places (materials/roads.ts): trodden earth with a ragged edge that frays into the
  // verge; a cart track has two dark ruts with grass between them, a road is wider and more worn.
  {
    const rd = sampleMask(ROAD.mask, p.xz) as Node<'vec4'>;
    const across = abs(rd.x), track = float(1).sub(abs(rd.y.sub(1))).clamp(0, 1);
    const shown = smoothstep(0, 0.02, inside(ROAD.mask, p.xz) as Node<'float'>);
    const fray = fine.mul(0.35).add(mid.mul(0.25)).add(patchy.mul(0.2));
    let rt: Node<'float'> = smoothstep(0.45, -0.45, rd.z.add(fray)).mul(shown);
    // The grass strip down a track's middle (the grass mask grows its blades).
    rt = rt.mul(float(1).sub(track.mul(0.75).mul(smoothstep(0.42, 0.22, across.add(fine.mul(0.08))))));
    const rb = hblend(clamp(rt, 0, 1), earth.n.b.sub(h), 2);
    const tone = float(0.9).add(mid.mul(0.12)).add(patchy.mul(0.1));
    col = mix(col, earth.a.rgb.mul(tone), rb); rough = mix(rough, earth.a.a, rb); ao = mix(ao, earth.n.a, rb);
    pert = mix(pert, vec3(tn(earth.n).x, 0, tn(earth.n).y), rb); h = mix(h, earth.n.b, rb);
    // The ruts: two grooves a wheel's gauge apart, darker and damper.
    const rut = float(1).sub(smoothstep(0.08, 0.24, abs(across.sub(0.78)).add(fine.mul(0.04)))).mul(track).mul(rb);
    col = col.mul(mix(float(1), float(0.68), rut)); rough = mix(rough, float(0.7), rut.mul(0.5));
  }

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
  const rockT = smoothstep(0.82, 0.64, level.add(fine.mul(0.04)).add(mid.mul(0.12)));
  const rockB = hblend(rockT, rockN.b.sub(h), 2);
  const rockTone = float(1).add(broad.mul(0.25));
  col = mix(col, rockA.rgb.mul(rockTone).mul(macro), rockB); rough = mix(rough, rockA.a, rockB); ao = mix(ao, rockN.a, rockB);
  pert = mix(pert, rockP, rockB); h = mix(h, rockN.b, rockB);

  // The woods from afar: crowns and the shaded floor between them (@futuremagic/vegetation woodsFromAfar).
  const far = varying(far0, 'vWoodsFar');
  const cover = varying(cn.x, 'vWoodsCover'), crown = mix(CROWN_BROAD, CROWN_CONIFER, varying(cn.w, 'vWoodsConifer'));
  const woods = far.mul(smoothstep(0.0, 0.05, cover)).mul(float(1).sub(rockB));
  // Past the shadow box no tree shades the floor: the crowns' shade on average instead.
  const unshaded = smoothstep(110, 150, length(positionWorld.sub(cameraPosition))).mul(cover).mul(float(1).sub(woods));
  col = col.mul(mix(float(1), float(UNDER_CROWNS), unshaded));
  const afar = woodsFromAfar(col, crown, cover, varying(cn.z, 'vWoodsSpacing'), p);
  col = mix(col, afar.color, woods);
  // Crowns are matt: no sheen of the sky on the woods from afar.
  m.specularIntensityNode = mix(float(0.25), float(0.05), woods);
  rough = mix(rough, float(0.9), woods);
  pert = mix(pert, afar.bump.mul(0.9), woods);

  // Snow above a ragged line, only where it can lie.
  const snow = layer('snow', p.xz);
  const snowLine = float(1900).add(broad.mul(350));
  // Fresh snow (the weather's) lies on level ground at any height, patchy where it is thin.
  const fresh = smoothstep(0.25, 0.6, WEATHER.lying.add(broad.mul(0.25)).add(fine.mul(0.08))).mul(WEATHER.lying.mul(4).min(1));
  const snowT = smoothstep(snowLine, snowLine.add(250), p.y).max(fresh).mul(smoothstep(0.5, 0.72, up));
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

  // Rain: the ground darkens and turns glossy; flat hollows hold puddles that mirror the sky, ringed by
  // the drops while it rains. They dry from the edges in (the hollow's depth against the wetness).
  const rain = WEATHER.wet.mul(snowB.oneMinus());
  const hollow = mx_fractal_noise_float(p.xz.mul(0.16), 2, 2.0, 0.5).add(fine.mul(0.06)).add(mid.mul(0.15));
  // Fewer in meadows (the grass stands in them), most on bare soil, cobbles and the forest floor.
  const where = w.x.mul(0.6).oneMinus().mul(smoothstep(0.95, 0.99, up)).mul(smoothstep(0.85, 0.95, level))
    .mul(rockB.oneMinus()).mul(sandB.oneMinus()).mul(smoothstep(0.3, 0.6, rain));
  const depth = hollow.sub(float(0.62).sub(rain.mul(0.3)));
  const puddle = smoothstep(0.0, 0.1, depth).mul(where);
  // A soaked rim round each, darker than the wet ground, so the edge reads as water, not a pale sheet.
  const rim = smoothstep(-0.08, 0.0, depth).mul(puddle.oneMinus()).mul(where);
  // Water is dark where it does not mirror: the stone under it shows deep and the sky only at a slant.
  col = col.mul(mix(float(1), float(0.6), rain)).mul(mix(float(1), float(0.72), rim)).mul(mix(float(1), float(0.22), puddle));
  rough = mix(mix(mix(rough, float(0.42), rain.mul(0.85)), float(0.3), rim), float(0.14), puddle);
  const rings = rainRings(p.xz).mul(smoothstep(6.0, 25.0, length(cameraPosition.sub(positionWorld))).oneMinus());
  pert = mix(pert, vec3(rings.x, 0, rings.y), puddle); ao = mix(ao, float(1), puddle);
  // A puddle under a grey sky mirrors it at a slant: kept faint, or it reads as a pale sheet of ice.
  m.specularIntensityNode = mix(mix(float(0.25), float(0.5), rain), float(0.22), puddle);
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
export const SKY = defineKind('sky', ['position', 'normal', 'uv'], () => makeSkyNode({ reversed: true, origin: ORIGIN.node }).material as Material, { cast: false, receive: false });

/** The sky as the environment map sees it (rendered only into the PMREM, never into the view). */
export function makeEnvSky(): Mesh {
  return makeSkyNode({ reversed: false, env: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SkyUniforms = Record<string, { value: any }>;
export const skyUniforms = (m: Material): SkyUniforms => (m as unknown as { uniforms: SkyUniforms }).uniforms;

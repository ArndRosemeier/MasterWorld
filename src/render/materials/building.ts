// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The town's buildings: one shader for every building mesh (TownView). Each vertex names its material
 * (`mat`, @futuremagic/settlement's BuildingMat: plaster, rubble, oak, thatch, tile ...), which picks the
 * layer of the town texture array; `tint` (sRGB) colours it: lime washes, timber stains, glass. Texture
 * coordinates are in metres and scaled per layer. Rain darkens and wets the walls and roofs.
 */
import { BufferAttribute, BufferGeometry, Color, MeshPhysicalNodeMaterial, Sphere, Vector3, type Mesh } from 'three/webgpu';
import { attribute, dot, float, floor, fract, int, mix, normalMap, pow, round, sin, step, texture, uniform, uniformArray, varying, vec3 } from 'three/tsl';
import { WORLD } from '../origin';
import { BuildingMat, INSIDE_LEVELS, INSIDE_LIGHT, type BuildingMesh } from '@futuremagic/settlement';
import { CAVE_ROCK, defineKind, kindMesh } from '../materials';
import { TOWN_TILE_METERS } from '../terrain/groundTextures';
import { townTextures } from './townGround';
import { WEATHER } from './weather';

/**
 * Lit windows after dusk (sky.ts sets them): `glow` 0 by day .. 1 at night, `share` of the rooms with a
 * light on (most in the evening, few after midnight).
 */
export const WINDOWS = { glow: uniform(0), share: uniform(0.7) };

/**
 * The sky's light inside an open building (@futuremagic/settlement INSIDE_LIGHT): its inside faces get the
 * share their windows and door let in, times `gain`, plus `fill` (light thrown about by the room and its
 * lamps). The sun's comes in through the openings by itself (the walls cast shadows); `bounce` is what
 * it throws about the room one is in (game/roomLight.ts: irradiance, coloured as the sun; black at night
 * and outdoors), lighting every inside face a little.
 */
export const ROOM_LIGHT = { gain: uniform(1), fill: uniform(0.05), bounce: uniform(new Color(0, 0, 0)) };

export const BUILDING = defineKind('building', ['position', 'normal', 'uv', 'mat', 'tint'], () => {
  const { albedo: A, normal: N } = townTextures();
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.9, metalness: 0, specularIntensity: 0.35 });
  // `mat` holds the material and, on inside faces, a daylight level (INSIDE_LIGHT): split per vertex, so the
  // material comes through unblended and the daylight smoothly.
  const mat = attribute('mat', 'float');
  const layer = int(round(varying(mat.mod(INSIDE_LIGHT))));
  const level = varying(floor(mat.div(INSIDE_LIGHT)).div(INSIDE_LEVELS));
  const inside = step(0.5 / INSIDE_LEVELS, level);
  const scale = uniformArray(TOWN_TILE_METERS.map((w) => 1 / w), 'float');
  const st = attribute('uv', 'vec2').mul(scale.element(layer));
  const a = texture(A).sample(st).depth(layer), n = texture(N).sample(st).depth(layer);
  // Tint is sRGB (0..1 after normalising); the texture is already linear.
  const tint = pow(attribute('tint', 'vec3'), vec3(2.2));
  // Dry indoors.
  const wet = WEATHER.wet.mul(float(1).sub(inside));
  m.colorNode = a.rgb.mul(tint).mul(mix(float(1), float(0.65), wet)).mul(n.a.mul(0.6).add(0.4));
  m.roughnessNode = mix(a.a, a.a.mul(0.75), wet);
  m.aoNode = n.a.mul(mix(float(1), level.mul(level).mul(ROOM_LIGHT.gain).add(ROOM_LIGHT.fill).min(1), inside));
  const xy = n.xy.mul(2).sub(1);
  const z = float(1).sub(xy.dot(xy)).max(0).sqrt();
  m.normalNode = normalMap(vec3(n.xy, z.mul(0.5).add(0.5)));
  // Candle and hearth light behind the glass: room by room (cells of about a room), some rooms dark. Dim:
  // the night exposure is high, and brighter glows go white under AgX.
  const room = floor(WORLD.div(vec3(3.5, 3, 3.5)));
  const roll = fract(sin(dot(room, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const glass = float(1).sub(step(0.5, layer.sub(BuildingMat.Glass).abs().toFloat()));
  const warm = mix(vec3(1.0, 0.42, 0.13), vec3(1.0, 0.55, 0.22), fract(roll.mul(7.3)));
  // The sun thrown about the room, on its inside faces (Lambert: albedo x irradiance / pi).
  const bounce = m.colorNode.mul(ROOM_LIGHT.bounce).mul(n.a).mul(inside).mul(1 / Math.PI);
  m.emissiveNode = warm.mul(glass).mul(step(roll, WINDOWS.share)).mul(WINDOWS.glow).mul(0.12).add(bounce);
  return m;
});

/** A building-format mesh's geometry: position, normal and tint, and its uv and material if `full`. */
function buildingGeometry(m: BuildingMesh, full: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('normal', new BufferAttribute(m.normal, 3));
  if (full) {
    g.setAttribute('uv', new BufferAttribute(m.uv, 2));
    // Floats: WebGPU has no 1- or 3-byte vertex formats.
    g.setAttribute('mat', new BufferAttribute(floats(m.mat, 1), 1));
  }
  g.setAttribute('tint', new BufferAttribute(floats(m.tint, 1 / 255), 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.boundingSphere = sphereOf(m.position);
  return g;
}

/**
 * The sphere round flat x, y, z positions, as three's `computeBoundingSphere` makes it (the box's middle, out to the
 * farthest point), in plain loops: three's goes through a vector per vertex, garbage by the megabyte per town.
 */
function sphereOf(p: ArrayLike<number>): Sphere {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x0 > x1) return new Sphere(new Vector3(), -1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r2 = 0;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const dx = p[i] - cx, dy = p[i + 1] - cy, dz = p[i + 2] - cz, d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return new Sphere(new Vector3(cx, cy, cz), Math.sqrt(r2));
}

/** Bytes as floats times `k`, in a plain loop (`Float32Array.from` with a map boxed every value: garbage by the megabyte per town). */
function floats(src: ArrayLike<number>, k: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] * k;
  return out;
}

/** A natural cave's rock (world/dungeon/caveRock.ts, building format) with the cave rock shader, at (x, y, z). */
export function caveRockMeshAt(m: BuildingMesh, x: number, y: number, z: number): Mesh {
  const mesh = kindMesh(buildingGeometry(m, false), CAVE_ROCK, x, y, z);
  mesh.name = 'rock';
  return mesh;
}

/** A mesh in the building format (@futuremagic/settlement) as a three mesh with the building shader, at (x, y, z). */
export function buildingMeshAt(m: BuildingMesh, x: number, y: number, z: number, name: string, yaw = 0): Mesh {
  const mesh = kindMesh(buildingGeometry(m, true), BUILDING, x, y, z);
  // Turned about +y (a barrow, a hold's gate); its matrix is fixed, so it is set here, once.
  mesh.rotation.y = yaw;
  mesh.updateMatrix();
  mesh.name = name;
  return mesh;
}

// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * The town's buildings: one shader for every building mesh (TownView). Each vertex names its material
 * (`mat`, @futuremagic/settlement's BuildingMat: plaster, rubble, oak, thatch, tile ...), which picks the
 * layer of the town texture array; `tint` (sRGB) colours it: lime washes, timber stains, glass. Texture
 * coordinates are in metres and scaled per layer. Rain darkens and wets the walls and roofs.
 */
import { BufferAttribute, BufferGeometry, MeshPhysicalNodeMaterial, type Mesh } from 'three/webgpu';
import { attribute, dot, float, floor, fract, int, mix, normalMap, positionWorld, pow, round, sin, step, texture, uniform, uniformArray, vec3 } from 'three/tsl';
import { BuildingMat, type BuildingMesh } from '@futuremagic/settlement';
import { defineKind, kindMesh } from '../materials';
import { TOWN_TILE_METERS } from '../terrain/groundTextures';
import { townTextures } from './townGround';
import { WEATHER } from './weather';

/**
 * Lit windows after dusk (sky.ts sets them): `glow` 0 by day .. 1 at night, `share` of the rooms with a
 * light on (most in the evening, few after midnight).
 */
export const WINDOWS = { glow: uniform(0), share: uniform(0.7) };

export const BUILDING = defineKind('building', ['position', 'normal', 'uv', 'mat', 'tint'], () => {
  const { albedo: A, normal: N } = townTextures();
  const m = new MeshPhysicalNodeMaterial({ roughness: 0.9, metalness: 0, specularIntensity: 0.35 });
  const layer = int(round(attribute('mat', 'float')));
  const scale = uniformArray(TOWN_TILE_METERS.map((w) => 1 / w), 'float');
  const st = attribute('uv', 'vec2').mul(scale.element(layer));
  const a = texture(A).sample(st).depth(layer), n = texture(N).sample(st).depth(layer);
  // Tint is sRGB (0..1 after normalising); the texture is already linear.
  const tint = pow(attribute('tint', 'vec3'), vec3(2.2));
  const wet = WEATHER.wet;
  m.colorNode = a.rgb.mul(tint).mul(mix(float(1), float(0.65), wet)).mul(n.a.mul(0.6).add(0.4));
  m.roughnessNode = mix(a.a, a.a.mul(0.45), wet);
  m.aoNode = n.a;
  const xy = n.xy.mul(2).sub(1);
  const z = float(1).sub(xy.dot(xy)).max(0).sqrt();
  m.normalNode = normalMap(vec3(n.xy, z.mul(0.5).add(0.5)));
  // Candle and hearth light behind the glass: room by room (cells of about a room), some rooms dark. Dim:
  // the night exposure is high, and brighter glows go white under AgX.
  const room = floor(positionWorld.div(vec3(3.5, 3, 3.5)));
  const roll = fract(sin(dot(room, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const glass = float(1).sub(step(0.5, layer.sub(BuildingMat.Glass).abs().toFloat()));
  const warm = mix(vec3(1.0, 0.42, 0.13), vec3(1.0, 0.55, 0.22), fract(roll.mul(7.3)));
  m.emissiveNode = warm.mul(glass).mul(step(roll, WINDOWS.share)).mul(WINDOWS.glow).mul(0.12);
  return m;
});

/** A mesh in the building format (@futuremagic/settlement) as a three mesh with the building shader, at (x, y, z). */
export function buildingMeshAt(m: BuildingMesh, x: number, y: number, z: number, name: string): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('normal', new BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new BufferAttribute(m.uv, 2));
  // Floats: WebGPU has no 1- or 3-byte vertex formats.
  g.setAttribute('mat', new BufferAttribute(Float32Array.from(m.mat), 1));
  g.setAttribute('tint', new BufferAttribute(Float32Array.from(m.tint, (v) => v / 255), 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  const mesh = kindMesh(g, BUILDING, x, y, z);
  mesh.name = name;
  return mesh;
}

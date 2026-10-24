/**
 * The material registry (docs/SHADERS.md): every material in the game is made here, from a closed list of
 * kinds, so the set of shaders is known up front and compiled during warm-up. Guarded: nothing outside
 * this file (or src/render/materials/) may construct a material.
 *
 * Every mesh of a kind shares the kind's one material, so a kind is one shader; variation goes into
 * vertex attributes or uniforms, never into a new material.
 */
import { MeshStandardNodeMaterial, type Material } from 'three/webgpu';
import { float, mix, mx_fractal_noise_float, mx_noise_float, normalWorld, positionWorld, smoothstep, vec3, vertexColor } from 'three/tsl';
import type { StageKind } from '@futuremagic/stage';

export type Attribute = 'position' | 'normal' | 'color' | 'uv';

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

/**
 * The ground: one shader for every terrain chunk. Biome colour comes per vertex; rock on steep ground,
 * snow up high, sand at the shore, and noise breaks up every band so nothing reads as a straight line.
 */
export const TERRAIN = defineKind('terrain', ['position', 'normal', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const p = positionWorld;
  const up = normalWorld.y;
  const broad = mx_fractal_noise_float(p.xz.mul(0.004), 3, 2.0, 0.5);
  const fine = mx_noise_float(p.xz.mul(0.35));
  const ground = vertexColor().mul(float(1).add(broad.mul(0.35)).add(fine.mul(0.06)));
  const rock = mix(vec3(0.20, 0.19, 0.18), vec3(0.34, 0.31, 0.27), smoothstep(-0.4, 0.6, broad.add(fine.mul(0.3))));
  const rockT = smoothstep(0.82, 0.64, up.add(fine.mul(0.04)));
  const snowLine = float(1900).add(broad.mul(350));
  const snowT = smoothstep(snowLine, snowLine.add(250), p.y).mul(smoothstep(0.5, 0.72, up));
  const sandT = smoothstep(float(4).add(fine.mul(1.5)), float(1), p.y).mul(smoothstep(0.7, 0.9, up));
  let c = mix(ground, vec3(0.62, 0.55, 0.40), sandT);
  c = mix(c, rock, rockT);
  c = mix(c, vec3(0.86, 0.88, 0.92), snowT);
  m.colorNode = c;
  m.roughnessNode = mix(float(0.95), float(0.6), snowT);
  return m;
});

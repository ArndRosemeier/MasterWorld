/**
 * The material registry (docs/SHADERS.md): every material in the game is made here, from a closed list of
 * kinds, so the set of shaders is known up front and compiled during warm-up. Guarded: nothing outside
 * this file (or src/render/materials/) may construct a material.
 *
 * Every mesh of a kind shares the kind's one material, so a kind is one shader; variation goes into
 * vertex attributes or uniforms, never into a new material.
 */
import type { Material } from 'three/webgpu';
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

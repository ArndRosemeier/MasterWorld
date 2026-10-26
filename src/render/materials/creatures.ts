/**
 * The creatures' kinds. The procedural ones (@futuremagic/creatures): one flesh for every species, so a
 * new beast is never a new shader, and one for their eyes; skinned (every skeleton is padded to the same
 * bone count); their rims catch a little of the lantern's warm light, so a beast in the dark still reads.
 * The modelled rat (public/creatures/quarry_rat.glb): its coat from the glb's own two maps (filled in when
 * it loads; a new image is not a new shader), dark wet eyes, and its teeth in vertex colours.
 */
import { MeshStandardNodeMaterial, NoColorSpace, SRGBColorSpace, Texture, type Material } from 'three/webgpu';
import { normalMap, texture, vec3, vertexColor } from 'three/tsl';
import { birdMaterial, critterEye, critterFlesh } from '@futuremagic/creatures/node';
import type { CritterMaterials } from '@futuremagic/creatures/three';
import { defineKind } from '../materials';

export const CRITTER = defineKind('critter', ['position', 'normal', 'color', 'look'], () => critterFlesh({ outline: vec3(0.05, 0.035, 0.02) }));
export const CRITTER_EYE = defineKind('critter eye', ['position', 'normal', 'color'], () => critterEye(), { cast: false, receive: true });

/** The materials the creature package's figures are drawn with. */
export function critterMaterials(): CritterMaterials {
  return { flesh: CRITTER.make(), eye: CRITTER_EYE.make() };
}

const coatMaps = { colour: new Texture(), normal: new Texture() };
coatMaps.colour.colorSpace = SRGBColorSpace;
coatMaps.normal.colorSpace = NoColorSpace;
for (const t of [coatMaps.colour, coatMaps.normal]) t.flipY = false; // glTF's uvs

export const RAT_COAT = defineKind('rat coat', ['position', 'normal', 'uv', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  m.colorNode = texture(coatMaps.colour).rgb;
  m.normalNode = normalMap(texture(coatMaps.normal));
  return m;
});

export const ANIMAL_EYE = defineKind('animal eye', ['position', 'normal', 'uv', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0 });
  m.colorNode = vec3(0.02, 0.016, 0.012);
  m.emissiveNode = vec3(0.03, 0.025, 0.02);
  return m;
}, { cast: false, receive: true });

export const TEETH = defineKind('teeth', ['position', 'normal', 'uv', 'color'], () => {
  const m = new MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0 });
  m.colorNode = vertexColor();
  return m;
});

/** The material for a part of the modelled rat, by its name; its coat's maps go into the coat kind. */
export function ratMaterial(name: string, loaded: Material): Material | null {
  if (name === 'coat') {
    const l = loaded as Material & { map?: Texture | null; normalMap?: Texture | null };
    for (const [into, from] of [[coatMaps.colour, l.map], [coatMaps.normal, l.normalMap]] as const) {
      if (!from) throw new Error('rat coat: a map is missing from the glb');
      into.image = from.image;
      into.needsUpdate = true;
    }
    return RAT_COAT.make();
  }
  return name === 'eye' ? ANIMAL_EYE.make() : name === 'teeth' ? TEETH.make() : null;
}

/**
 * The small birds (sim/smallLife.ts), all in one draw (@futuremagic/creatures BirdBatch): not a kind, since
 * its instance attributes are no stand-in's; the batch's mesh is warmed with the warm-up's extras, like the grass.
 */
export function createBirdMaterial(): Material {
  return birdMaterial();
}

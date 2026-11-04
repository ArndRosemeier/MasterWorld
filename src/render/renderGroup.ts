/**
 * Uniforms every material reads alike (time, weather, the sun, the windows' glow) go into three's render group: one
 * buffer, written once per render call. In three's default (each object's own group) a value that changes every
 * frame made every object that reads it upload its own buffer every frame (on WebGPU about 3 µs of main thread per
 * object). Only for values that stay the same for every object drawn in one render call.
 */
import { renderGroup } from 'three/tsl';

interface Groupable { isUniformNode?: boolean; setGroup?: (g: unknown) => unknown }

/** Puts the uniform nodes among `u`'s own values (or `u` itself, one node) into the render group; returns `u`. */
export function inRenderGroup<T extends object>(u: T): T {
  const one = u as Groupable;
  if (one.isUniformNode) { one.setGroup!(renderGroup); return u; }
  for (const v of Object.values(u) as Groupable[]) if (v?.isUniformNode) v.setGroup!(renderGroup);
  return u;
}

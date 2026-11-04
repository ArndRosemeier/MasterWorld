/**
 * Static parts drawn as WebGPU render bundles (StaticBundle, @futuremagic/stage): the terrain and the towns'
 * buildings. On by default; `bundles=0` in the URL draws them one by one (for comparing). Set once at the start,
 * before the views are made. On the WebGL 2 backend a bundle is an ordinary group.
 */
import { Group } from 'three/webgpu';
import { StaticBundle } from '@futuremagic/stage';

export const BUNDLES = { on: true };

/** A group for static parts: a StaticBundle while bundles are on. */
export function staticGroup(name: string): Group {
  const g = BUNDLES.on ? new StaticBundle(name) : new Group();
  g.name = name;
  return g;
}

/** Once a frame for a group made by `staticGroup`: records again if its visible children changed. */
export function keepRecorded(g: Group): void {
  if (g instanceof StaticBundle) g.recordIfChanged();
}

/// <reference lib="webworker" />
/**
 * Formed caves (D63, phase K): a cave of one rock and size formed, carved and meshed off the main thread. The preview
 * gallery asks for them (tools/preview/formed.ts); the game will (K5).
 */
import type { BuildingMesh } from '@futuremagic/settlement';
import { settingById } from '../setting/index';
import { coarsen, formedMesh } from '../world/cave/carve';
import type { Dressing } from '../world/cave/dress';
import { dressFormed, formCave, type FormedCave } from '../world/cave/form';
import type { Skeleton } from '../world/cave/skeleton';
import { serve } from './serve';

/** A cave to form: `coarse` meshes only every n-th sample (a quick look), 0 skips the mesh. */
export interface CaveJob {
  readonly kind: 'form';
  readonly setting: string;
  readonly seed: number;
  readonly rock: string;
  readonly size?: string;
  readonly coarse?: number;
  /** Dress it (silt, stream, rocks, drips, formations) before meshing. */
  readonly dress?: boolean;
}

export interface CaveResult {
  readonly skeleton: Skeleton;
  readonly dressing: Dressing | null;
  readonly mesh: BuildingMesh | null;
  readonly ms: FormedCave['ms'] & { readonly mesh: number; readonly dress: number };
  readonly rock: string;
  readonly size: { readonly id: string; readonly across: number; readonly deep: number };
  /** Bricks of the field that hold anything, and triangles meshed. */
  readonly bricks: number;
  readonly tris: number;
  /** The valley side. */
  readonly face: string;
  /** Beds' dip, degrees. */
  readonly dip: number;
}

const buffers = (m: BuildingMesh): ArrayBuffer[] => Object.values(m).flatMap((v) => (ArrayBuffer.isView(v) ? [v.buffer as ArrayBuffer] : []));

serve<CaveJob, CaveResult>((job) => {
  const caves = settingById(job.setting).caves;
  if (!caves) throw new Error(`setting "${job.setting}" has no formed caves`);
  const c = formCave(caves, job.seed, job.rock, job.size);
  let mesh: BuildingMesh | null = null;
  const td = Date.now(), dressing = job.dress ? dressFormed(c, caves) : null, dressMs = Date.now() - td;
  const t = Date.now();
  if (job.coarse !== 0) mesh = formedMesh(job.coarse && job.coarse > 1 ? coarsen(c.field, job.coarse) : c.field, c.block);
  const meshMs = Date.now() - t;
  const size = caves.sizes.find((s) => s.across === c.block.across && s.deep === c.block.deep)!;
  return {
    result: {
      skeleton: c.skeleton, dressing, mesh, ms: { ...c.ms, mesh: meshMs, dress: dressMs }, rock: job.rock, size: { id: size.id, across: size.across, deep: size.deep },
      bricks: c.field.bricks.filter(Boolean).length, tris: mesh ? mesh.index.length / 3 : 0, face: c.block.water.face, dip: Math.atan(c.block.beds.slope) * 180 / Math.PI,
    },
    transfer: mesh ? buffers(mesh) : [],
  };
});

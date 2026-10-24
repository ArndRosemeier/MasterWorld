/// <reference lib="webworker" />
import { generateNaturalLayer, type TexLayer } from '@futuremagic/texgen';

export interface TextureJob {
  /** Natural layer index (NATURAL_NAMES). */
  layer: number;
  size: number;
}

self.onmessage = (e: MessageEvent<{ id: number; job: TextureJob }>) => {
  const { id, job } = e.data;
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  try {
    const t: TexLayer = generateNaturalLayer(job.layer, job.size);
    scope.postMessage({ id, result: t }, [t.albedo.buffer, t.normal.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

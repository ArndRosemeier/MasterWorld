/// <reference lib="webworker" />
import { generateNaturalLayer, type TexLayer } from '@futuremagic/texgen';
import { serve } from './serve';

export interface TextureJob {
  /** Natural layer index (NATURAL_NAMES). */
  layer: number;
  size: number;
}

serve<TextureJob, TexLayer>((job) => {
  const t = generateNaturalLayer(job.layer, job.size);
  return { result: t, transfer: [t.albedo.buffer, t.normal.buffer] };
});

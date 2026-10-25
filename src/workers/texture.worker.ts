/// <reference lib="webworker" />
import { generateFacadeLayer, generateGroundLayer, generateMedievalLayer, generateNaturalLayer, type TexLayer } from '@futuremagic/texgen';
import { serve } from './serve';

/** Which texgen set a layer comes from. */
export type TextureSet = 'natural' | 'medieval' | 'facade' | 'ground';

export interface TextureJob {
  /** Layer index within its set (default: the natural layers, NATURAL_NAMES). */
  layer: number;
  set?: TextureSet;
  size: number;
}

const GEN: Record<TextureSet, (index: number, size: number) => TexLayer> = {
  natural: generateNaturalLayer, medieval: generateMedievalLayer, facade: generateFacadeLayer, ground: generateGroundLayer,
};

serve<TextureJob, TexLayer>((job) => {
  const t = GEN[job.set ?? 'natural'](job.layer, job.size);
  return { result: t, transfer: [t.albedo.buffer, t.normal.buffer] };
});

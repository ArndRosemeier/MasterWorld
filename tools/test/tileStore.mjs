/**
 * Preloaded in the processes of `npm test` (tools/test/run.mjs, MW_TILE_STORE the folder): the rivers' and brooks' tiles
 * one process traces (0.3-3 s each) are kept in a folder of this run, and the others take them from it instead of tracing
 * them again, as a worker takes what the main thread traced. The folder is made for one run and removed after it, so a
 * tile never outlives the code that traced it.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { useTileStore } from '../../src/world/hydro.ts';

const dir = process.env.MW_TILE_STORE;
if (dir) {
  const file = (key) => `${dir}/${createHash('sha1').update(key).digest('hex')}`;
  useTileStore({
    get(key) {
      try {
        const b = readFileSync(file(key));
        // (A copy: a Buffer's bytes may not start on a multiple of 8.)
        return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      } catch { return null; }
    },
    put(key, packed) {
      // Written whole, then renamed: another process never reads half of it.
      const f = file(key), tmp = `${f}.${process.pid}`;
      writeFileSync(tmp, new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength));
      renameSync(tmp, f);
    },
  });
}

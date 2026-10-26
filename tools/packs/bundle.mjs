/**
 * The start's pack files as one bundle (plan A7): `npm run packs` runs this after copying the packs. It joins the
 * files listed in tools/packs/start.json (paths under public/packs, recorded by `npm run load -- --record`) into
 * public/packs/start-<hash>.bin and writes public/packs/bundles.json (where each file sits). The game fetches the
 * bundle once and keeps its files in the browser's cache (src/workers/packStore.ts); files not in it come one by one.
 * Listed files that no longer exist are left out (with a note), so a stale list only costs speed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const packs = join(root, 'public/packs');
const list = JSON.parse(readFileSync(join(root, 'tools/packs/start.json'), 'utf8'));

for (const f of readdirSync(packs)) if (/^start-[0-9a-f]+\.bin$/.test(f) || f === 'bundles.json') rmSync(join(packs, f));

const parts = [], files = {}, gone = [];
let at = 0;
for (const p of [...new Set(list.files)].sort()) {
  const path = join(packs, p);
  if (!existsSync(path)) { gone.push(p); continue; }
  const b = readFileSync(path);
  files[p] = [at, b.length];
  parts.push(b);
  at += b.length;
}
const bytes = Buffer.concat(parts);
const file = `start-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.bin`;
writeFileSync(join(packs, file), bytes);
writeFileSync(join(packs, 'bundles.json'), JSON.stringify({ bundles: [{ file, files }] }));
console.log(`public/packs/${file}: ${Object.keys(files).length} files, ${(at / 1e6).toFixed(1)} MB${gone.length ? ` (${gone.length} listed files are gone: run \`npm run load -- --record\`)` : ''}`);

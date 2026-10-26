/**
 * The start's pack files as one bundle (plan A7): `npm run packs` runs this after copying the packs. It joins the
 * files listed in tools/packs/start.json (paths under public/packs, recorded by `npm run load -- --record`) into
 * public/packs/start-<n>-<hash>.bin (a few, side by side) and writes public/packs/bundles.json (where each file sits). The game fetches the
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

for (const f of readdirSync(packs)) if (/^start-[0-9]+-[0-9a-f]+\.bin$/.test(f) || /^start-[0-9a-f]+\.bin$/.test(f) || f === 'bundles.json') rmSync(join(packs, f));

// Several bundles of at most PART bytes: they download side by side, and no file nears a static host's size limit.
const PART = 16e6;
const bundles = [], gone = [];
let cur = null, total = 0, count = 0;
const close = () => {
  if (!cur?.parts.length) return;
  const bytes = Buffer.concat(cur.parts);
  const file = `start-${bundles.length}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.bin`;
  writeFileSync(join(packs, file), bytes);
  bundles.push({ file, files: cur.files });
};
for (const p of [...new Set(list.files)].sort()) {
  const path = join(packs, p);
  if (!existsSync(path)) { gone.push(p); continue; }
  const b = readFileSync(path);
  if (!cur || (cur.at > 0 && cur.at + b.length > PART)) { close(); cur = { parts: [], files: {}, at: 0 }; }
  cur.files[p] = [cur.at, b.length];
  cur.parts.push(b);
  cur.at += b.length;
  total += b.length;
  count++;
}
close();
writeFileSync(join(packs, 'bundles.json'), JSON.stringify({ bundles }));
console.log(`public/packs: ${count} start files in ${bundles.length} bundles, ${(total / 1e6).toFixed(1)} MB${gone.length ? ` (${gone.length} listed files are gone: run \`npm run load -- --record\`)` : ''}`);

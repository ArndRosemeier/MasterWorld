/**
 * The people's and the horses' asset packs (`npm run packs`): downloads the Actors release's packs once
 * (cached in node_modules/.cache) and copies what the town needs into public/packs/human: the body, its
 * morph targets and skins, the medieval wardrobe, a few hairstyles and the clips in src/render/folk/looks.ts;
 * and the horse pack (about 10 MB, with its tack and clips) whole into public/packs/horse.
 * The full pack is about 530 MB (the CMU motion library, 90 garments, 64 hairstyles); this is a tenth.
 * Runs again only when the Actors version or the selection changes. `--force` copies anew.
 */
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(readFileSync(join(root, 'node_modules/@actors/generator/package.json'), 'utf8')).version;
// What the game wears and plays: read from the source, so the selection lives in one place.
const looks = readFileSync(join(root, 'src/render/folk/looks.ts'), 'utf8');
const list = (name) => {
  const m = looks.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`looks.ts has no ${name} list`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const keep = { garment: new Set(list('PACK_GARMENTS')), hair: new Set(list('PACK_HAIR')), clips: new Set(list('PACK_CLIPS')) };

const dest = join(root, 'public/packs/human');
const stamp = join(dest, '.selection');
const want = JSON.stringify({ version, keep: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, [...v].sort()])) });
const horses = join(root, 'public/packs/horse');
if (!process.argv.includes('--force') && existsSync(stamp) && readFileSync(stamp, 'utf8') === want && existsSync(join(horses, 'manifest.json'))) {
  console.log(`public/packs/human already has the Actors ${version} selection`);
  process.exit(0);
}

const cache = join(root, 'node_modules/.cache/actors', version);
const archive = join(cache, 'packs.tar.gz');
if (!existsSync(join(cache, 'packs/human/manifest.json')) || !existsSync(join(cache, 'packs/horse/manifest.json'))) {
  mkdirSync(cache, { recursive: true });
  const url = `https://github.com/ArndRosemeier/Actors/releases/download/v${version}/actors-packs-${version}.tar.gz`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
  // Without the CMU library (most of the archive).
  execFileSync('tar', ['xzf', archive, '-C', cache, '--exclude=packs/human/clips/cmu', 'packs/human', 'packs/horse'], { stdio: 'inherit' });
  rmSync(archive);
}

const src = join(cache, 'packs/human');
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
// Every file the manifest names, but for garments, hair and clips only the ones kept.
const files = new Set(['base.bin']);
const refs = (o) => JSON.stringify(o).match(/"[a-z]+\/[^"]+\.(?:bin|png|jpg)"/g)?.map((s) => s.slice(1, -1)) ?? [];
const role = new Map(manifest.meshes.map((m) => [m.name, m.role]));
// A garment or hairstyle not kept (its mesh and its fitting proxy, which share the name).
const dropped = (name) => {
  const r = role.get(name);
  return (r === 'garment' || r === 'hair') && !name.startsWith('brows-') && name !== 'eyelashes' && !keep[r].has(name);
};
for (const m of [...manifest.meshes, ...manifest.proxies]) if (!dropped(m.name)) for (const f of refs(m)) files.add(f);
for (const c of manifest.clips) if (keep.clips.has(c.name)) files.add(c.file);
for (const t of manifest.targets) files.add(t.file);
const { meshes, proxies, clips, targets, clipLibraries, ...rest } = manifest;
for (const f of refs(rest)) files.add(f);
const missing = [...keep.garment, ...keep.hair].filter((n) => !meshes.some((m) => m.name === n))
  .concat([...keep.clips].filter((n) => !clips.some((c) => c.name === n)));
if (missing.length) throw new Error(`not in the Actors ${version} pack: ${missing.join(', ')}`);

rmSync(dest, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  mkdirSync(dirname(join(dest, f)), { recursive: true });
  copyFileSync(join(src, f), join(dest, f));
  bytes += readFileSync(join(dest, f)).length;
}
// The manifest as shipped, but without the CMU library (not copied).
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ ...manifest, clipLibraries: [] }));
writeFileSync(stamp, want);
console.log(`public/packs/human: ${files.size} files, ${(bytes / 1e6).toFixed(0)} MB (Actors ${version})`);

// The horse: the whole pack (body, tack, morph targets, 13 clips).
rmSync(horses, { recursive: true, force: true });
cpSync(join(cache, 'packs/horse'), horses, { recursive: true });
console.log(`public/packs/horse: the Actors ${version} horse`);

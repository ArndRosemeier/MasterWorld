/**
 * The library animals (`npm run packs`): copies the WildMesh3D animals the game draws (src/render/libraryAnimals.ts,
 * its `ids: [...]` lists) from Arnd's private PrivateAssets repository into public/wildmesh3d, and writes
 * public/wildmesh3d/index.json with the ids copied. The game draws those and Actors' own animals for the rest.
 *
 * The files are licensed for Arnd's games only: shipping them inside the built game is fine, committing them to
 * this public repository is not (public/wildmesh3d is ignored). PrivateAssets is looked for in $PRIVATE_ASSETS,
 * vendor/private-assets (a clone, ignored; the Pages build checks it out there) and ../PrivateAssets. Without it
 * the index lists nothing and the game draws Actors' animals.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The library ids libraryAnimals.ts uses (every `ids: [...]` list in it). */
export function libraryIds(source = readFileSync(join(root, 'src/render/libraryAnimals.ts'), 'utf8')) {
  const ids = new Set();
  for (const m of source.matchAll(/\bids:\s*\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([^']+)'/g)) ids.add(x[1]);
  return [...ids].sort();
}

/** The first PrivateAssets checkout found (its wildmesh3d folder), or null. */
export function findLibrary(env = process.env) {
  const tries = [env.PRIVATE_ASSETS, join(root, 'vendor/private-assets'), join(root, '../PrivateAssets')].filter(Boolean);
  for (const t of tries) if (existsSync(join(resolve(t), 'wildmesh3d'))) return join(resolve(t), 'wildmesh3d');
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = join(root, 'public/wildmesh3d');
  const lib = findLibrary();
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const copied = [];
  if (!lib) {
    console.log('library animals: no PrivateAssets checkout (PRIVATE_ASSETS, vendor/private-assets, ../PrivateAssets); the game draws Actors\' animals');
  } else {
    for (const id of libraryIds()) {
      const from = join(lib, id);
      if (!existsSync(join(from, `${id}.glb`))) { console.log(`library animals: ${id} is not in ${lib}`); continue; }
      cpSync(join(from, `${id}.glb`), join(dest, id, `${id}.glb`));
      copied.push(id);
    }
    console.log(`library animals: ${copied.join(', ') || 'none'} from ${lib}`);
  }
  writeFileSync(join(dest, 'index.json'), JSON.stringify({ ids: copied }));
}

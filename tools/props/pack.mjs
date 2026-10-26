// Builds the AssetGenerator props listed in models.json (`ag.py pack --slots`: Blender, AO baked into
// vertex colours, each vertex's material slot) into public/props/cellar.fmpk, read by
// src/render/dungeon/props.ts (decoded by @futuremagic/props).
//
//   npm run props        (needs Blender: BLENDER_BIN, or BLENDER_PYTHON with pip's bpy==4.5.*)
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { specs } = JSON.parse(readFileSync(join(root, 'tools/props/models.json'), 'utf8'));
const out = join(root, 'public/props/cellar.fmpk');
execFileSync('python3', [join(root, 'vendor/assetgenerator/tools/ag.py'), 'pack', ...specs, '--slots', '--out', out], { stdio: 'inherit' });
console.log(`public/props/cellar.fmpk: ${specs.length} props, ${(statSync(out).size / 1024).toFixed(0)} KB`);

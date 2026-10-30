/**
 * The people's and the horses' asset packs (`npm run packs`): downloads the Actors release's packs once
 * (cached in node_modules/.cache) and copies what the town needs into public/packs/human: the body, its
 * morph targets and skins, the medieval wardrobe, a few hairstyles and the clips in src/render/folk/looks.ts;
 * and the animal packs whole: the horse (about 10 MB, with its tack and clips), the dog (the wild's wolves)
 * the deer, the cow (the farms' cattle) and the squirrel (the woods' small life), each into public/packs/<kind>.
 * The full pack is about 530 MB (the CMU motion library, 90 garments, 64 hairstyles); this is a tenth.
 * Runs again only when the Actors version or the selection changes. `--force` copies anew.
 */
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import * as core from '@actors/core';
import { cutLoop, findLoop, framesOf } from './cutLoop.mjs';

/** A cut whose ends differ more than this (cutLoop's measure) is refused: it would hitch at the seam. */
const MAX_SEAM = 0.06;

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(readFileSync(join(root, 'node_modules/@actors/generator/package.json'), 'utf8')).version;
// What the game wears and plays: read from the source, so the selection lives in one place.
const looks = readFileSync(join(root, 'src/render/folk/looks.ts'), 'utf8');
// The hero's clips, and what the setting lets a hero wear (the creator offers every garment and
// hairstyle that fits its themes: src/setting/classic/hero.ts).
const heroClips = readFileSync(join(root, 'src/render/hero/clips.ts'), 'utf8');
// The cellar's people's own clips (the dead shamble, the meek kneel).
const foeClips = readFileSync(join(root, 'src/render/dungeon/foes.ts'), 'utf8');
const heroLooks = readFileSync(join(root, 'src/setting/classic/hero.ts'), 'utf8');
// Walks cut out of the CMU takes (src/render/folk/gaits.ts), one `{ clip: '...', take: '...', pace: n }` a line.
const gaitText = readFileSync(join(root, 'src/render/folk/gaits.ts'), 'utf8');
const cuts = [...gaitText.matchAll(/\{ clip: '([^']+)', take: '([^']+)', pace: ([\d.]+) \}/g)].map((m) => ({ clip: m[1], take: m[2], pace: Number(m[3]) }));
if (!cuts.length) throw new Error('no GAIT_CUTS in src/render/folk/gaits.ts');
// The pack's walk at its own speed (m/s): the cuts' paces are measured against it.
const walkPace = Number(heroClips.match(/PACE[^=]*=\s*\{[^}]*\bwalk: ([\d.]+)/)?.[1]);
if (!walkPace) throw new Error('no PACE.walk in src/render/hero/clips.ts');
const list = (name, text = looks, pattern = `export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`) => {
  const m = text.match(new RegExp(pattern));
  if (!m) throw new Error(`no ${name} list`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const field = (name) => list(name, heroLooks, `\\b${name}:\\s*\\[([^\\]]*)\\]`);
const themes = { themes: field('themes'), without: field('without') };
const keep = { garment: new Set(list('PACK_GARMENTS')), hair: new Set(list('PACK_HAIR')), clips: new Set([...list('PACK_CLIPS'), ...list('HERO_CLIPS', heroClips), ...list('FOE_CLIPS', foeClips)]) };

const dest = join(root, 'public/packs/human');
const stamp = join(dest, '.selection');
const ANIMALS = ['horse', 'dog', 'deer', 'cow', 'squirrel'];
const want = JSON.stringify({ version, themes, animals: ANIMALS, cuts: cuts.map((c) => [c.clip, c.take]), cutter: readFileSync(join(root, 'tools/packs/cutLoop.mjs'), 'utf8').length, keep: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, [...v].sort()])) });
if (!process.argv.includes('--force') && existsSync(stamp) && readFileSync(stamp, 'utf8') === want && ANIMALS.every((k) => existsSync(join(root, 'public/packs', k, 'manifest.json')))) {
  console.log(`public/packs/human already has the Actors ${version} selection`);
  process.exit(0);
}

const cache = join(root, 'node_modules/.cache/actors', version);
const archive = join(cache, 'packs.tar.gz');
// The CMU takes the cuts come from (`cmu 17_05` is clips/cmu/17_05.bin), and the library's index.
const CMU = 'packs/human/clips/cmu';
const takes = [`${CMU}/index.json`, ...cuts.map((c) => `${CMU}/${c.take.replace(/^cmu /, '')}.bin`)];
if (!existsSync(join(cache, 'packs/human/manifest.json')) || ANIMALS.some((k) => !existsSync(join(cache, 'packs', k, 'manifest.json'))) || takes.some((t) => !existsSync(join(cache, t)))) {
  mkdirSync(cache, { recursive: true });
  const url = `https://github.com/ArndRosemeier/Actors/releases/download/v${version}/actors-packs-${version}.tar.gz`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
  // Without the CMU library (most of the archive).
  // Run inside the cache with a relative archive name: GNU tar reads `C:\...` as a remote host, and Windows' own
  // tar (bsdtar) has no --force-local, so no absolute path is handed to tar at all.
  execFileSync('tar', ['xzf', 'packs.tar.gz', '--exclude=packs/human/clips/cmu', 'packs/human', ...ANIMALS.map((k) => `packs/${k}`)], { stdio: 'inherit', cwd: cache });
  // Only the takes the cuts need.
  execFileSync('tar', ['xzf', 'packs.tar.gz', ...takes], { stdio: 'inherit', cwd: cache });
  rmSync(archive);
}

const src = join(cache, 'packs/human');
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
// Every file the manifest names, but for garments, hair and clips only the ones kept.
const files = new Set(['base.bin']);
const refs = (o) => JSON.stringify(o).match(/"[a-z]+\/[^"]+\.(?:bin|png|jpg)"/g)?.map((s) => s.slice(1, -1)) ?? [];
// Every garment and hairstyle the hero's creator offers (the setting's themes, Actors' tags).
const { fitsThemes, GARMENT_THEMES, HAIR_THEMES } = await import('@actors/generator');
for (const m of manifest.meshes) {
  if (m.role === 'garment' && !m.internal && fitsThemes(GARMENT_THEMES[m.name], themes)) keep.garment.add(m.name);
  if (m.role === 'hair' && fitsThemes(HAIR_THEMES[m.name], themes)) keep.hair.add(m.name);
}
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
// The walks cut from the CMU takes, each its own clip in the pack.
const cutDefs = cutWalks(src, manifest);
// The manifest as shipped, but without the CMU library (not copied), with the cuts.
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ ...manifest, clips: [...manifest.clips, ...cutDefs], clipLibraries: [] }));
writeFileSync(stamp, want);
console.log(`public/packs/human: ${files.size} files, ${(bytes / 1e6).toFixed(0)} MB (Actors ${version})`);

/**
 * Cuts each of `cuts` out of its take (tools/packs/cutLoop.mjs) into dest/clips/cut: a loop facing +z on the spot,
 * its feet as low as the pack's walk's, and its pace measured from the planted feet against the pack's walk.
 */
function cutWalks(src, manifest) {
  const { decodeClip, encodeClipI16, fitSkeleton, measureGait, Retargeter, createPose, poseWorld } = core;
  const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const skeleton = fitSkeleton(manifest.skeleton, new Float32Array(buf(join(src, manifest.basePositions.file ?? manifest.blob ?? 'base.bin')), manifest.basePositions.offset ?? 0, manifest.basePositions.count));
  const lib = JSON.parse(readFileSync(join(src, 'clips/cmu/index.json'), 'utf8'));
  // The lowest a foot comes over a clip (m), with the skeleton's hip height.
  const lowest = (clip) => {
    const r = new Retargeter(skeleton, { def: { ...clip.def, loop: false }, data: clip.data });
    const n = skeleton.names.length, pose = createPose(n), rot = new Float64Array(n * 4), heads = new Float64Array(n * 3);
    const feet = ['foot_l', 'foot_r', 'ball_l', 'ball_r'].map((b) => skeleton.names.indexOf(b));
    let lo = Infinity;
    for (let f = 0; f < clip.def.frameCount; f++) {
      r.sampleInto(f / clip.def.fps, pose);
      poseWorld(skeleton, pose, rot, heads);
      for (const i of feet) lo = Math.min(lo, heads[i * 3 + 1]);
    }
    return { lo, hip: r.hipHeight };
  };
  const walkDef = manifest.clips.find((c) => c.name === 'walk');
  const walk = { def: walkDef, data: decodeClip(walkDef, buf(join(src, walkDef.file))) };
  const ground = lowest(walk), walkFeet = measureGait(skeleton, walk).speed;
  mkdirSync(join(dest, 'clips/cut'), { recursive: true });
  return cuts.map((c) => {
    const entry = lib.clips.find((x) => x.name === c.take);
    if (!entry) throw new Error(`no ${c.take} in the CMU library`);
    const def = { ...lib.rigs[entry.rig], ...entry };
    const frames = framesOf(def, decodeClip(def, buf(join(src, 'clips/cmu', entry.file))));
    const loop = findLoop(def, frames);
    if (!loop || loop.score > MAX_SEAM) throw new Error(`${c.take}: no clean walking loop (${loop ? `seam ${loop.score.toFixed(3)}` : 'no straight stretch'})`);
    const out = { ...def, loop: true, frameCount: loop.len + 1 };
    let data = cutLoop(def, frames, loop);
    data = cutLoop(def, frames, loop, (ground.lo - lowest({ def: out, data }).lo) / ground.hip);
    const pace = (walkPace * measureGait(skeleton, { def: out, data }).speed) / walkFeet;
    if (Math.abs(pace - c.pace) > 0.05 * c.pace) console.warn(`${c.clip}: paces ${pace.toFixed(2)} m/s, src/render/folk/gaits.ts says ${c.pace}`);
    const file = `clips/cut/${c.clip.replace(/[^a-z0-9]+/g, '-')}.bin`;
    writeFileSync(join(dest, file), new Uint8Array(encodeClipI16(def.bones.length, out.frameCount, data)));
    console.log(`  ${c.clip}: ${c.take} frames ${loop.start}-${loop.start + loop.len} (${(loop.len / def.fps).toFixed(2)} s), seam ${loop.score.toFixed(3)}, ${pace.toFixed(2)} m/s`);
    return { name: c.clip, file, fps: def.fps, frameCount: out.frameCount, loop: true, bones: def.bones, refDirs: def.refDirs, rootBone: def.rootBone,
      source: `${def.source}, frames ${loop.start}-${loop.start + loop.len} cut into a loop`, category: 'Locomotion', description: def.description, encoding: 'i16' };
  });
}

// The animals: each whole pack (body, morph targets, clips; the horse's tack).
for (const k of ANIMALS) {
  const to = join(root, 'public/packs', k);
  rmSync(to, { recursive: true, force: true });
  cpSync(join(cache, 'packs', k), to, { recursive: true });
  console.log(`public/packs/${k}: the Actors ${version} ${k}`);
}

/**
 * Tool pages, not the game (`?bake=…`, driven by tools/assets/peoples.mjs). `bake=peoples` draws one hero
 * of each people of the title card (Actors, the setting's looks, a fixed seed each) turning once while
 * it idles, FRAMES pictures in a row on a clear background, and hands each row out as a WebP data URL in
 * `window.__bake`. The card shows them as a flip book, so the title costs no shaders (docs/SHADERS.md).
 */
import { AmbientLight, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from 'three/webgpu';
import { createRenderer } from '@futuremagic/stage';
import { Character, type CharacterCatalog, type CharacterConfig } from '@actors/generator';
import HumanWorker from '../workers/human.worker?worker';
import { settingById } from '../setting/index';
import { loadOptions, newHero } from '../render/hero/HeroView';
import { PEOPLE_RACE } from './creatorUi';
import { PEOPLES } from './title/lines';
import { params } from './params';

/** Pictures per turn, and each one's size (twice the card's CSS pixels). */
export const FRAMES = 24;
export const FRAME_W = 220;
export const FRAME_H = 330;
/** Each people's figure: a man or a woman (the first seed that draws one), a bearded dwarf among them. */
const MAN: Record<string, boolean> = { humans: true, dwarves: true, halflings: false, elves: false };
/** Each people's colours, given to its garments in turn (woad, rust and leather, meadow green, forest and silver). */
const DRESS: Record<string, readonly string[]> = {
  humans: ['#3d5a80', '#6a5c44', '#4a3020', '#7a3a1e'],
  dwarves: ['#8a3a22', '#4a3020', '#5a4a32', '#2a1d14'],
  halflings: ['#5d7a3a', '#c8a868', '#6a4a2a', '#8a6a3a'],
  elves: ['#2f4a3a', '#b0aca4', '#3f5238', '#55604f'],
};

/** The drawn hero in its people's colours, without a hat or hood; a dwarf with a braided beard. */
function dressed(c: CharacterConfig, people: string, catalog: CharacterCatalog): CharacterConfig {
  const hat = new Set(catalog.garments.filter((g) => g.hidesHair || g.occupies.includes('hat')).map((g) => g.id));
  const outfit = c.outfit.filter((g) => !hat.has(g));
  const colors = DRESS[people] ?? [];
  const worn = outfit.filter((g) => g !== 'briefs' && g !== 'bra');
  return { ...c, ...(people === 'dwarves' ? { beard: 'braided' as const, stubble: 0.6 } : {}), outfit, garmentColors: Object.fromEntries(worn.map((g, i) => [g, colors[i % colors.length]])) };
}

declare global { interface Window { __bake?: Record<string, string>; __mwReady?: boolean } }

export async function bake(what: string): Promise<void> {
  if (what !== 'peoples') throw new Error(`nothing to bake called ${what}`);
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const { renderer } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL: params.gl, maxPixelRatio: 1 });
  renderer.setSize(FRAME_W, FRAME_H);
  renderer.setClearColor(0x000000, 0); // clear: the card shows through
  const scene = new Scene();
  // Warm lamp light from the front left, a cool rim from behind, a soft fill.
  const key = new DirectionalLight(0xffe2b8, 2.6); key.position.set(-2, 3, 3);
  const rim = new DirectionalLight(0x9fc4ff, 1.8); rim.position.set(2, 2.5, -3);
  const camera = new PerspectiveCamera(22, FRAME_W / FRAME_H, 0.1, 50);
  // The camera goes round the figure and takes the lights along: the figure seems to turn under them.
  camera.add(key, rim);
  scene.add(camera, new HemisphereLight(0xfff2dc, 0x3a2a1c, 0.9), new AmbientLight(0xffffff, 0.15));
  const looks = settingById(params.setting).hero;
  const opts = loadOptions(looks);
  const out: Record<string, string> = {};
  let lead: Character | null = null;
  for (const p of PEOPLES) {
    const race = PEOPLE_RACE[p.id];
    const ch: Character = await Character.load({ ...opts, renderer, ...(lead ? { shareWith: lead } : { worker: new HumanWorker() }) });
    lead ??= ch;
    let seed = 1;
    const heroOf = (n: number) => newHero(ch.catalog, looks, ch.config, n, race);
    while (seed < 50 && (heroOf(seed).body.gender >= 0.5) !== MAN[p.id]) seed++;
    await ch.set(dressed(heroOf(seed), p.id, ch.catalog));
    ch.setLod(0);
    await ch.play('idle');
    scene.add(ch.object);
    // Framed to fill the picture: each people at its own size.
    const h = ch.height || 1.75;
    const dist = (h * 1.12) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const sheet = document.createElement('canvas');
    sheet.width = FRAME_W * FRAMES;
    sheet.height = FRAME_H;
    const ctx = sheet.getContext('2d')!;
    for (let i = 0; i < FRAMES; i++) {
      const a = (i / FRAMES) * Math.PI * 2;
      camera.position.set(-Math.sin(a) * dist, h * 0.55, Math.cos(a) * dist);
      camera.lookAt(0, h * 0.5, 0);
      ch.update(i === 0 ? 0.5 : 4 / FRAMES);
      await renderer.renderAsync(scene, camera);
      ctx.drawImage(renderer.domElement, i * FRAME_W, 0);
    }
    out[p.id] = sheet.toDataURL('image/webp', 0.85);
    scene.remove(ch.object);
  }
  window.__bake = out;
  window.__mwReady = true;
  await new Promise(() => undefined); // the game does not start
}

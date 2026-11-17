/**
 * Does a glow show: how much a region of a screenshot brightened between two shots taken from the same place (tools/shot/stone.mjs: the floor's glow after the first glyph). The check reads pixels,
 * not the game: a glow drawn under the ground (render bundles once painted terrain over it) is in the game's state
 * and not on the screen. `node tools/shot/glow.mjs <before.jpg> <after.jpg>` prints the numbers for two shots.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/** The region of the screen where the floor's glow shows: the lower middle, as fractions of the shot's width and height. */
export const GLOW_REGION = { x0: 0.25, x1: 0.75, y0: 0.5, y1: 1 };

/**
 * How much a region brightened from `before` to `after` (bytes of two shots of one size, taken from the same place):
 * `share`, the part of its pixels that rose by more than 12 levels in the sum of red, green and blue over three
 * (0..1), and `gain`, its mean brightness change (levels). Decoded by a canvas in `page`.
 */
export async function glowGain(page, before, after, region = GLOW_REGION) {
  const urls = [before, after].map((b) => `data:image/jpeg;base64,${Buffer.from(b).toString('base64')}`);
  return page.evaluate(async ([urls, r]) => {
    const px = [];
    for (const url of urls) {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      px.push(g.getImageData(Math.floor(r.x0 * c.width), Math.floor(r.y0 * c.height), Math.floor((r.x1 - r.x0) * c.width), Math.floor((r.y1 - r.y0) * c.height)).data);
    }
    const [a, b] = px;
    if (a.length !== b.length) throw new Error('the two shots differ in size');
    let rose = 0, sum = 0;
    const n = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
      const d = (b[i] + b[i + 1] + b[i + 2] - a[i] - a[i + 1] - a[i + 2]) / 3;
      sum += d;
      if (d > 12) rose++;
    }
    return { share: rose / n, gain: sum / n };
  }, [urls, region]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [x, y] = process.argv.slice(2);
  if (!x || !y) { console.log('usage: node tools/shot/glow.mjs <before.jpg> <after.jpg>'); process.exit(2); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const r = await glowGain(page, readFileSync(x), readFileSync(y));
  console.log(`brightened share ${r.share.toFixed(4)}, mean gain ${r.gain.toFixed(2)}`);
  await browser.close();
}

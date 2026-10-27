/**
 * WebGL 2 promises a fragment shader 16 texture units (MAX_TEXTURE_IMAGE_UNITS); a shader that reads more
 * does not link, and what it draws is left white (the land after the roads, MW #155). This check warms up
 * every material kind on WebGL 2 in headless Chromium (SwiftShader) and fails when any fragment shader
 * declares more than 16 samplers, or any shader fails. Runs in CI after `npm test`; about a minute.
 *
 *   node tools/units/check.mjs        (CHROMIUM_PATH in the cloud container)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { MUTE } from '../shot/launch.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
/** What WebGL 2 guarantees, whatever the machine at hand offers. */
export const UNITS = 16;

/** Samplers a GLSL shader declares (arrays count their length). */
export function samplersIn(src) {
  let n = 0;
  for (const m of src.matchAll(/^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?[iu]?sampler\w*\s+\w+\s*(?:\[\s*(\d+)\s*\])?\s*;/gm)) n += m[1] ? Number(m[1]) : 1;
  return n;
}

/** A shader for the report (three's node GLSL carries no material name): its size and its samplers' names. */
function nameOf(src) {
  const names = [...src.matchAll(/^\s*uniform\s+(?:\w+\s+)?[iu]?sampler\w*\s+(\w+)/gm)].map((m) => m[1]);
  return `a shader of ${src.length} chars (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', ...' : ''})`;
}

async function main() {
  const server = await createServer({ root, logLevel: 'silent', server: { port: 5203, strictPort: false } });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}tools/units/units.html`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', ...MUTE] });
  let failed = false;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    // Every fragment shader's source, as it goes to the driver.
    await page.addInitScript(() => {
      const seen = (window.__fragments = []);
      const proto = WebGL2RenderingContext.prototype, source = proto.shaderSource;
      const kind = new WeakMap();
      const create = proto.createShader;
      proto.createShader = function (t) { const s = create.call(this, t); kind.set(s, t); return s; };
      proto.shaderSource = function (s, src) { if (kind.get(s) === this.FRAGMENT_SHADER) seen.push(src); return source.call(this, s, src); };
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__unitsDone, null, { timeout: 240000 });
    const done = await page.evaluate(() => window.__unitsDone);
    const fragments = await page.evaluate(() => window.__fragments);
    if (done !== 'ok') { console.error(`units: the page ${done}`); failed = true; }
    const counts = fragments.map((src) => ({ n: samplersIn(src), name: nameOf(src) })).sort((a, b) => b.n - a.n);
    const worst = counts[0];
    console.log(`units: ${counts.length} fragment shaders; most samplers ${worst?.n ?? 0} of ${UNITS} (${worst?.name ?? '-'})`);
    for (const c of counts.filter((c) => c.n > UNITS)) { console.error(`units: ${c.name} reads ${c.n} textures, WebGL 2 allows ${UNITS}`); failed = true; }
    const shaderErrors = errors.filter((e) => /Shader Error|texture image units|link/i.test(e));
    for (const e of shaderErrors) { console.error(`units: ${e.slice(0, 400)}`); failed = true; }
    if (!counts.length) { console.error('units: no fragment shader was compiled'); failed = true; }
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

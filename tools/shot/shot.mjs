/**
 * Headless screenshots: `npm run shot -- "<url query>" out.png [more pairs...]` (run `npm run build` first).
 * Serves the production build and renders in Chromium with SwiftShader (no GPU needed), so it works in a
 * cloud container; there use `?gl` (headless WebGPU is not reliable) and set CHROMIUM_PATH if Playwright's
 * own browser is not installed. Prints the HUD line, the shader report and the page's console errors.
 * SHOT_WAIT=<ms> waits that long after ready; SHOT_TIMEOUT=<ms> gives SwiftShader longer (default 5 min,
 * the slow-check limit in docs/CHECKS.md). SHOT_HOLD=<key codes, comma separated> holds those keys down
 * during the wait (KeyW: the hero runs). SHOT_LOG=1 prints all of the page's console, not only errors. SHOT_GPU=1 renders on the machine's own GPU instead (new headless
 * mode, no SwiftShader): for a desktop with a graphics card, where frames take milliseconds, not seconds.
 */
import { chromium } from 'playwright';
import { preview } from 'vite';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 300000);
const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error('usage: npm run shot -- "<query>" out.png [...]');
  process.exit(2);
}

const server = await preview({ preview: { port: 5202, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const gpu = !!process.env.SHOT_GPU;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: gpu ? 'chromium' : undefined,
  args: gpu
    ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
    : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
});
let failed = false;
for (let i = 0; i < args.length; i += 2) {
  const query = args[i], out = args[i + 1];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  await page.goto(base + (query.startsWith('?') ? query : '?' + query));
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT }).catch(() => { failed = true; console.error('page did not report ready'); });
  // The loading overlay can linger while it fades out: keep it out of the picture.
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  const hold = process.env.SHOT_HOLD ? process.env.SHOT_HOLD.split(',') : [];
  for (const k of hold) await page.keyboard.down(k);
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 0));
  await page.screenshot({ path: out, timeout: TIMEOUT });
  const hud = (await page.textContent('#hud', { timeout: TIMEOUT }))?.split('\n')[0] ?? '';
  const shaders = await page.evaluate(() => window.shaders?.report?.() ?? 'shaders: no monitor');
  console.log(`${out}: ${hud}\n${shaders}`);
  await page.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);

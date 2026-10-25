/**
 * The title over time (a slow check, run after `npm run build`): `node tools/shot/title.mjs "?gl" shots/t`.
 * After a first key press (the title waits for one; GATE=1 shoots it first), screenshots at the page times in AT (ms, comma separated, default 1000,2600,4300,9000); with LIVE=1 also
 * once the world is built, then CLICK='[[x,y],...]' clicks the world (toys), DRAGON=<ms> types the secret
 * code and waits, DIVE=<ms> presses New game and shoots mid-dive and in the game. SwiftShader like shot.mjs, or SHOT_GPU=1 on a machine with a graphics card.
 */
import { chromium } from 'playwright';
import { preview } from 'vite';
const [query, prefix] = process.argv.slice(2);
const server = await preview({ root: process.cwd(), preview: { port: 5212, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
// SHOT_GPU=1: the machine's own graphics card (as in shot.mjs), else SwiftShader.
const gpu = !!process.env.SHOT_GPU;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: gpu ? 'chromium' : undefined,
  args: gpu
    ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[')) console.log(`[page ${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
const t0 = Date.now();
await page.goto(base + query);
// The title waits for a first press (sound needs one); GATE=1 shoots the gate first.
if (process.env.GATE) { await page.waitForSelector('.t-gate'); await page.screenshot({ path: `${prefix}-gate.png`, timeout: 600000 }); }
await page.waitForSelector('.t-gate');
await page.keyboard.press('Space');
for (const at of (process.env.AT ?? '1000,2600,4300,9000').split(',').map(Number)) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  await page.screenshot({ path: `${prefix}-${at}.png`, timeout: 600000 });
  console.log('shot', at);
}
if (process.env.LIVE) {
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 600000 });
  console.log('ready', (Date.now() - t0) / 1000);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${prefix}-live.png`, timeout: 600000 });
  if (process.env.CLICK) {
    for (const [x, y] of JSON.parse(process.env.CLICK)) { await page.mouse.click(x, y); await page.waitForTimeout(1500); }
    await page.screenshot({ path: `${prefix}-toys.png`, timeout: 600000 });
  }
  if (process.env.DRAGON) {
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']) await page.keyboard.press(k);
    await page.waitForTimeout(Number(process.env.DRAGON));
    await page.screenshot({ path: `${prefix}-dragon.png`, timeout: 600000 });
  }
  if (process.env.DIVE) {
    await page.evaluate(() => document.querySelector('.t-btn.primary:not([hidden])').click());
    await page.waitForTimeout(Number(process.env.DIVE));
    await page.screenshot({ path: `${prefix}-dive.png`, timeout: 600000 });
    await page.waitForTimeout(15000);
    await page.screenshot({ path: `${prefix}-game.png`, timeout: 600000 });
  }
}
await browser.close();
await server.close();
process.exit(0);

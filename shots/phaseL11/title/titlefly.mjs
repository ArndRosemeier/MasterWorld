// Title fly-over: open with the title on, take shots every 10 s for 60 s, log frame times and console errors.
import { launch } from 'file:///C:/Projekte/MasterWorld-shotwt-phaseL/tools/shot/launch.mjs';
const out = process.argv[2];
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + '?seed=masterworld&title');
await page.waitForSelector('.t-gate', { timeout: 120000 }); await page.keyboard.press('Space');
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '#loading{display:none!important}' });
// frame-time sampler
await page.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const t0 = Date.now();
for (let i = 0; i <= 6; i++) {
  const target = i * 10000;
  const wait = target - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  await page.screenshot({ path: `${out}/title-${String(s).padStart(2, '0')}s.png` });
  const ft = await page.evaluate(() => { const a = window.__ft.splice(0).sort((x, y) => x - y); return a.length ? { n: a.length, p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] } : null; });
  console.log(`t=${s}s`, JSON.stringify(ft && { n: ft.n, p50: +ft.p50.toFixed(1), p95: +ft.p95.toFixed(1), max: +ft.max.toFixed(1) }));
}
await browser.close(); await server.close();

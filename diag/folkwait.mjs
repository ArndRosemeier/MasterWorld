// Diagnostic (not committed to main): why does a townsperson stay a plain figure? Run from the repo root after
// `npm run build`: `$env:SHOT_GPU=1; node tools/shot/folkwait.mjs`. Prints the folk slots over 25 s at noon.
import { launch } from './launch.mjs';
const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[folk]')) console.log('[page]', m.text()); });
await page.goto(`${base}?title=0&day=0&gl&hour=12&weather=clear`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 120000 });
console.log('ready');
await page.evaluate(() => {
  const f = window.game.folk, t0 = performance.now();
  window.__busy = new Map();
  window.__log = [];
  window.__tick = setInterval(() => {
    const now = performance.now() - t0, cam = window.game.view.camera.position;
    const slots = f.slots.map((s, i) => {
      if (s.busy && !window.__busy.has(i)) window.__busy.set(i, now);
      if (!s.busy && window.__busy.has(i)) { window.__log.push(`slot ${i} dressed agent ${s.agent} in ${((now - window.__busy.get(i)) / 1000).toFixed(1)} s`); window.__busy.delete(i); }
      return s;
    });
    const notReady = [...f.shown.entries()].filter(([, s]) => !s.ready).map(([id, s]) => {
      const a = window.game.life.agents[id];
      return `${id}${s.busy ? ' busy' : ' IDLE'} ${a ? Math.hypot(a.x - cam.x, a.z - cam.z).toFixed(0) + 'm' + (a.hidden ? ' hidden' : '') : '?'}`;
    });
    const sh = window.shaders.summary();
    window.__log.push(`${(now / 1000).toFixed(1)}s undressed ${f.undressed} · dressing ${f.dressing} · shown ${f.shown.size}/${slots.length} · free ${slots.filter((s) => s.agent < 0).length} · busy ${slots.filter((s) => s.busy).length} · not ready [${notReady.join(', ')}] · shaders run ${sh.run}`);
  }, 1000);
});
await page.waitForTimeout(25000);
const out = await page.evaluate(() => { clearInterval(window.__tick); return { log: window.__log, repeats: window.shaders.repeats().slice(0, 12).map((r) => `${r.times}x (${r.after} after, ${r.ms.toFixed(0)} ms) ${r.what}`) }; });
console.log(out.log.join('\n'));
console.log('--- repeats ---\n' + out.repeats.join('\n'));
await browser.close(); await server.close(); process.exit(0);

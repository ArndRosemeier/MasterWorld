/**
 * A fight with a people's hold's wardens, for the hitch log (src/app/hitchLog.ts): `node tools/shot/holdfight.mjs
 * [seconds]` after `npm run packs` and `npm run build`, SHOT_GPU=1 on the reference machine (SHOT_SEED=<seed>,
 * SET_GL=1 for WebGL). Starts in the hold's court as one the dwarves hate (they attack on sight), then runs about
 * the court for `seconds` (default 40): forward, turning now one way now the other, targeting and striking, health
 * kept up. Prints the hitch log, the heap every 2 s and the stage's line. HITCH_PROFILE=1: CPU profile of the fight,
 * by function (inclusive and self, the whole fight and its busiest stretch). HITCH_ALLOC=1: where the garbage is
 * made (sampled allocations by function). Build with `npx vite build --minify=false` for names. A slow check
 * (docs/CHECKS.md), about two minutes.
 */
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const secs = Number(process.argv[2] ?? 40), over = Number(process.env.HITCH_OVER ?? 50);
const { server, base, browser } = await launch({ args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&hold=hated${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
// The wardens built and drawn.
await page.waitForFunction(() => { const h = window.game.hold; return !!h && h.encounters.length > 0 && !h.warming; }, null, { timeout: TIMEOUT });
await page.waitForTimeout(3000);
await page.evaluate((o) => { window.game.hitches.over = o; window.game.hitches.clear(); }, over);

const cdp = await page.context().newCDPSession(page);
const profiling = process.env.HITCH_PROFILE === '1', alloc = process.env.HITCH_ALLOC === '1';
if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
if (alloc) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }

const heap = [], lines = [];
const t0 = Date.now();
await page.mouse.click(800, 450);
await page.keyboard.down('KeyW');
let turn = 'KeyD', k = 0;
while (Date.now() - t0 < secs * 1000) {
  if (k % 6 === 0) { await page.keyboard.up(turn); turn = turn === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(turn); }
  if (k % 3 === 1) await page.keyboard.up(turn);
  await page.keyboard.press('Tab');
  await page.keyboard.press(['Digit1', 'Digit2', 'Digit3'][k % 3]);
  await page.evaluate(() => { const c = window.game.character; c.health = c.maxHealth; });
  if (k % 8 === 0) {
    heap.push(await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 2 ** 20)));
    lines.push(await page.evaluate(() => `${window.game.hold?.encounters[0]?.pressure?.fighting ?? '?'} fighting · ${window.game.view.stage.hudLine().replace(/\n/g, ' | ')}`));
  }
  await page.waitForTimeout(250);
  k++;
}
await page.keyboard.up('KeyW');
await page.keyboard.up(turn);
console.log(`--- hold fight, ${secs} s\n${await page.evaluate(() => window.game.hitches.report())}`);
console.log(`heap MB every 2 s: ${heap.join(' ')}`);
console.log(`stage every 2 s:\n  ${lines.join('\n  ')}`);
if (profiling) report((await cdp.send('Profiler.stop')).profile);
if (alloc) allocs((await cdp.send('HeapProfiler.stopSampling')).profile);
await browser.close();
await server.close();

function frameName(f) { return `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; }

/** A CPU profile summed by function: inclusive and self, over the whole fight. */
function report(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const incl = new Map(), self = new Map();
  let busy = 0;
  for (const s of p.samples) {
    const top = byId.get(s).callFrame.functionName;
    if (top === '(idle)' || top === '(program)') continue;
    busy++;
    const k = frameName(byId.get(s).callFrame);
    self.set(k, (self.get(k) ?? 0) + 1);
    const seen = new Set();
    for (let id = s; id !== undefined; id = parent.get(id)) { const n = frameName(byId.get(id).callFrame); if (!seen.has(n)) { seen.add(n); incl.set(n, (incl.get(n) ?? 0) + 1); } }
  }
  const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => `  ${(100 * c / busy).toFixed(1)}% ${f}`).join('\n');
  console.log(`--- CPU profile: ${busy} busy samples of ${p.samples.length}\ninclusive:\n${top(incl, 60)}\nself:\n${top(self, 30)}`);
}

/** Sampled allocations summed by the function that made them (self) and with callers (inclusive), MB. */
function allocs(p) {
  const self = new Map(), incl = new Map();
  let total = 0;
  const walk = (n, stack) => {
    const k = frameName(n.callFrame), mine = n.selfSize ?? 0;
    total += mine;
    if (mine) {
      self.set(k, (self.get(k) ?? 0) + mine);
      for (const s of new Set([...stack, k])) incl.set(s, (incl.get(s) ?? 0) + mine);
    }
    for (const c of n.children ?? []) walk(c, [...stack, k]);
  };
  walk(p.head, []);
  const mb = (b) => (b / 2 ** 20).toFixed(1);
  const top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, b]) => `  ${mb(b)} MB ${f}`).join('\n');
  console.log(`--- allocations sampled: ${mb(total)} MB\nself:\n${top(self, 30)}\ninclusive:\n${top(incl, 50)}`);
}

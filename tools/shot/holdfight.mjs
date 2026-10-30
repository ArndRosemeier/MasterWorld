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
const elements = process.env.HITCH_ELEMENTS === '1';
const { server, base, browser } = await launch({ args: ['--enable-precise-memory-info', ...(elements ? ['--js-flags=--allow-natives-syntax'] : [])] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&hold=hated${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
// The wardens built and drawn.
await page.waitForFunction(() => { const h = window.game.hold; return !!h && h.encounters.length > 0 && !h.warming; }, null, { timeout: TIMEOUT });
await page.waitForTimeout(3000);
await page.evaluate((o) => { window.game.hitches.over = o; window.game.hitches.clear(); }, over);
// What is drawn before the fight: anything with a material made since is named after it (the shaders built late).
await page.evaluate(() => {
  const seen = new Set();
  window.game.view.scene.traverse((o) => { for (const m of [o.material].flat()) if (m) seen.add(m.uuid); });
  window.__seenMats = seen;
  window.__shadersBefore = window.shaders?.events.length ?? 0;
});

const cdp = await page.context().newCDPSession(page);
const profiling = process.env.HITCH_PROFILE === '1', alloc = process.env.HITCH_ALLOC === '1';
if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
if (alloc) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }

// HITCH_KEYS=1: who has three work out their material's cache key again (a material's version bumped, the lights changed),
// counted by object and material during the fight.
if (process.env.HITCH_KEYS === '1') await page.evaluate(() => {
  const objects = window.game.view.renderer._objects, get = objects.get.bind(objects), counts = (window.__keyCounts = new Map());
  let patched = false;
  objects.get = function (...a) {
    const ro = get(...a);
    if (!patched && ro) {
      patched = true;
      const proto = Object.getPrototypeOf(ro), key = proto.getMaterialCacheKey;
      proto.getMaterialCacheKey = function () {
        const names = [];
        for (let p = this.object; p && names.length < 4; p = p.parent) if (p.name) names.push(p.name);
        const k = `${this.material.type}${this.material.name ? ` "${this.material.name}"` : ''} on ${this.object.type} ${names.join('<')} (version ${this.material.version === this.version ? 'same' : 'bumped'})`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return key.call(this);
      };
    }
    return ro;
  };
});
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
console.log(`--- shaders built during the fight:\n${await page.evaluate(() => (window.shaders?.events ?? []).slice(window.__shadersBefore).filter((e) => e.kind === 'node-async' || e.kind === 'node-sync' || e.kind === 'node-late').map((e) => `  ${(e.t / 1000).toFixed(1)} s ${e.kind} ${e.ms.toFixed(1)} ms ${e.what}`).join('\n'))}`);
console.log(`--- materials new since the fight began (type, then the object's names up the tree):\n${await page.evaluate(() => {
  const out = new Map();
  window.game.view.scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m || window.__seenMats.has(m.uuid)) continue;
      const names = [];
      for (let p = o; p && names.length < 5; p = p.parent) names.push(p.name || p.type);
      const k = `${m.type}${m.name ? ` "${m.name}"` : ''} on ${names.join('<')}${o.visible ? '' : ' (hidden)'}`;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  });
  return [...out].map(([k, n]) => `  ${n}x ${k}`).join('\n') || '  none';
})}`);
// HITCH_ELEMENTS=1: how V8 holds the matrices' numbers. Doubles in place are free to write; boxed ("object"
// elements) allocate a number on every write, which three does for every object's matrices every frame.
if (elements) console.log(`--- matrix elements kinds (V8):\n${await page.evaluate(() => {
  const kind = new Function('a', 'return %HasDoubleElements(a) ? "double" : %HasSmiElements(a) ? "smi" : %HasObjectElements(a) ? "object" : "other"');
  const count = new Map(), add = (k) => count.set(k, (count.get(k) ?? 0) + 1);
  let M4 = null, M3 = null;
  window.game.view.scene.traverse((o) => {
    M4 ??= o.matrix.constructor; M3 ??= o.normalMatrix.constructor;
    add(`matrix ${kind(o.matrix.elements)}`); add(`matrixWorld ${kind(o.matrixWorld.elements)}`); add(`normalMatrix ${kind(o.normalMatrix.elements)}`);
    for (const b of o.skeleton?.bones ?? []) add(`bone matrixWorld ${kind(b.matrixWorld.elements)}`);
  });
  add(`a new Matrix4 ${kind(new M4().elements)}`); add(`a new Matrix3 ${kind(new M3().elements)}`);
  return [...count].map(([k, n]) => `  ${n}x ${k}`).join('\n');
})}`);
if (process.env.HITCH_KEYS === '1') console.log(`--- material cache keys worked out during the fight (calls, by what):\n${await page.evaluate(() => [...window.__keyCounts].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `  ${n} ${k}`).join('\n'))}`);
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
